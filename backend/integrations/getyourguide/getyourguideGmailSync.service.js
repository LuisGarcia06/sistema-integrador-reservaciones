const {
    obtenerClienteGmailAutorizado,
    createGmailClient,
    extractEmailFromGmailMessage,
    getHeader,
    parseGetYourGuideGmailMessage,
    sanitizeDiagnosticText,
} = require('./getyourguideGmail.service');
const { classifyGetYourGuideEmailSubject } = require('./getyourguideEmailClassifier');
const {
    getGmailMessageSourceReceivedAt,
    toGetYourGuideIntegrationEvent,
} = require('./getyourguide.mapper');
const { registrarEventoIntegracion } = require('../../services/eventosIntegracion.service');
const syncEstadoService = require('../../services/integracionSyncEstado.service');

const PROVIDER = 'getyourguide';
const SOURCE = 'gmail';
const GYG_FROM_EMAIL = 'do-not-reply@notification.getyourguide.com';
const GYG_FROM_QUERY = `from:${GYG_FROM_EMAIL}`;
const KNOWN_EVENT_TYPES = ['new_booking', 'modification', 'cancellation'];
const DEFAULT_INTERVAL_MS = 120000;
const DEFAULT_RECOVERY_MAX_MESSAGES = 500;
const DEFAULT_RECOVERY_BATCH_SIZE = 25;
const DEFAULT_QUOTA_BACKOFF_MS = 900000;
const GMAIL_HISTORY_EXPIRED_STATUS = 404;

let workerTimer = null;
let workerRunning = false;
let workerStopped = true;

function logSeguro(logger, message) {
    logger.log(message);
}

function obtenerEnteroPositivo(envValue, fallback) {
    const value = Number(envValue);

    return Number.isInteger(value) && value > 0
        ? value
        : fallback;
}

function obtenerIntervaloMs(env = process.env) {
    return obtenerEnteroPositivo(env.GYG_GMAIL_SYNC_INTERVAL_MS, DEFAULT_INTERVAL_MS);
}

function obtenerRecoveryMaxMessages(env = process.env) {
    const maxMessages = obtenerEnteroPositivo(env.GYG_GMAIL_RECOVERY_MAX_MESSAGES, DEFAULT_RECOVERY_MAX_MESSAGES);

    return Math.min(maxMessages, DEFAULT_RECOVERY_MAX_MESSAGES);
}

function obtenerRecoveryBatchSize(env = process.env) {
    const batchSize = obtenerEnteroPositivo(env.GYG_GMAIL_RECOVERY_BATCH_SIZE, DEFAULT_RECOVERY_BATCH_SIZE);

    return Math.min(batchSize, obtenerRecoveryMaxMessages(env));
}

function obtenerQuotaBackoffMs(env = process.env) {
    return obtenerEnteroPositivo(env.GYG_GMAIL_QUOTA_BACKOFF_MS, DEFAULT_QUOTA_BACKOFF_MS);
}

function syncHabilitado(env = process.env) {
    return String(env.GYG_GMAIL_SYNC_ENABLED || '').toLowerCase() === 'true';
}

function obtenerCodigoErrorSeguro(error) {
    return String(
        error?.response?.data?.error?.status
        || error?.response?.data?.error?.code
        || error?.errors?.[0]?.reason
        || error?.code
        || error?.response?.status
        || error?.message
        || 'error'
    ).replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 100);
}

function obtenerStatusError(error) {
    return Number(error?.response?.status ?? error?.code);
}

function obtenerReasonError(error) {
    return String(
        error?.errors?.[0]?.reason
        || error?.response?.data?.error?.status
        || error?.response?.data?.error?.code
        || error?.response?.data?.error
        || ''
    ).toLowerCase();
}

function esHistoryIdExpirado(error) {
    const status = obtenerStatusError(error);
    const reason = obtenerReasonError(error);

    return status === GMAIL_HISTORY_EXPIRED_STATUS && (
        reason === ''
        || reason.includes('notfound')
        || reason.includes('not_found')
        || reason.includes('failedprecondition')
        || reason.includes('invalidargument')
    );
}

function esMensajeNoEncontrado(error) {
    const status = obtenerStatusError(error);
    const reason = obtenerReasonError(error);

    return status === 404 && (
        reason === ''
        || reason.includes('notfound')
        || reason.includes('not_found')
    );
}

function esErrorCuotaGmail(error) {
    const status = obtenerStatusError(error);
    const reason = obtenerReasonError(error);
    const message = String(error?.message || error?.response?.data?.error?.message || '').toLowerCase();

    return status === 429
        || reason.includes('ratelimit')
        || reason.includes('rate_limit')
        || reason.includes('quota')
        || message.includes('quota exceeded')
        || message.includes('rate limit');
}

function crearResultadoProcesamiento(messagesDetected = 0) {
    return {
        messagesDetected,
        messagesProcessed: 0,
        eventsRegistered: 0,
        duplicates: 0,
        unknownIgnored: 0,
        skipped: 0,
    };
}

function esRemitenteGetYourGuide(from) {
    return String(from || '').toLowerCase().includes(GYG_FROM_EMAIL);
}

function construirEventoPersistible(gmailMessage, event) {
    const headers = gmailMessage?.payload?.headers ?? [];

    return toGetYourGuideIntegrationEvent(event, {
        source_subject: getHeader(headers, 'Subject'),
        source_received_at: getGmailMessageSourceReceivedAt(gmailMessage),
    });
}

function extraerMessageIdsDeHistory(history = []) {
    const ids = [];
    const seen = new Set();

    history.forEach((entry) => {
        (entry.messagesAdded || []).forEach((messageAdded) => {
            const messageId = messageAdded?.message?.id;

            if (messageId && !seen.has(messageId)) {
                seen.add(messageId);
                ids.push(messageId);
            }
        });
    });

    return ids;
}

async function obtenerGmailClient({ gmail, auth, obtenerAuth = obtenerClienteGmailAutorizado } = {}) {
    if (gmail) {
        return gmail;
    }

    const authClient = auth || await obtenerAuth({ diagnosticLogger: { log() {} } });
    return createGmailClient(authClient);
}

async function obtenerProfileHistoryId(gmail) {
    const response = await gmail.users.getProfile({ userId: 'me' });
    return response.data?.historyId;
}

async function inicializarSincronizacion({
    gmail,
    db,
    logger = console,
    syncEstado = syncEstadoService,
} = {}) {
    const estado = await syncEstado.obtenerEstadoSync({ provider: PROVIDER, source: SOURCE }, db);

    if (estado) {
        return {
            initialized: false,
            estado,
            eventosImportados: 0,
        };
    }

    const gmailClient = await obtenerGmailClient({ gmail });
    const historyId = await obtenerProfileHistoryId(gmailClient);

    await syncEstado.guardarBaselineSync({
        provider: PROVIDER,
        source: SOURCE,
        lastHistoryId: historyId,
    }, db);

    return {
        initialized: true,
        historyId,
        eventosImportados: 0,
    };
}

async function obtenerHistoryMessages(gmail, startHistoryId) {
    const messageIds = [];
    let pageToken;
    let finalHistoryId = startHistoryId;

    do {
        const response = await gmail.users.history.list({
            userId: 'me',
            startHistoryId,
            historyTypes: ['messageAdded'],
            pageToken,
        });

        messageIds.push(...extraerMessageIdsDeHistory(response.data?.history || []));
        finalHistoryId = response.data?.historyId || finalHistoryId;
        pageToken = response.data?.nextPageToken;
    } while (pageToken);

    return {
        messageIds,
        historyId: finalHistoryId,
    };
}

async function obtenerMensajeFull(gmail, messageId) {
    const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
    });

    return response.data;
}

async function procesarMensajeGetYourGuide(gmail, messageId, {
    logger = console,
    registrarEvento = registrarEventoIntegracion,
} = {}) {
    const gmailMessage = await obtenerMensajeFull(gmail, messageId);
    const email = extractEmailFromGmailMessage(gmailMessage);

    if (!esRemitenteGetYourGuide(email.from)) {
        return {
            tipo: 'ignored_sender',
            registered: 0,
            duplicate: 0,
            unknown: 0,
            skipped: 0,
        };
    }

    const classification = classifyGetYourGuideEmailSubject(email.subject);

    if (!KNOWN_EVENT_TYPES.includes(classification.event_type)) {
        logSeguro(logger, `[GYG Gmail Sync] mensaje desconocido ignorado messageId: ${messageId}`);
        return {
            tipo: 'unknown',
            registered: 0,
            duplicate: 0,
            unknown: 1,
            skipped: 0,
        };
    }

    const event = parseGetYourGuideGmailMessage(gmailMessage);
    const eventoPersistible = construirEventoPersistible(gmailMessage, event);
    const resultado = await registrarEvento(eventoPersistible);

    if (resultado.duplicate) {
        logSeguro(logger, '[GYG Gmail Sync] evento duplicado ignorado');
        return {
            tipo: 'duplicate',
            registered: 0,
            duplicate: 1,
            unknown: 0,
            skipped: 0,
        };
    }

    logSeguro(logger, '[GYG Gmail Sync] evento registrado');
    return {
        tipo: 'registered',
        registered: 1,
        duplicate: 0,
        unknown: 0,
        skipped: 0,
    };
}

function sumarResultadoProcesamiento(total, parcial) {
    total.messagesProcessed += 1;
    total.eventsRegistered += parcial.registered || 0;
    total.duplicates += parcial.duplicate || 0;
    total.unknownIgnored += parcial.unknown || 0;
    total.skipped += parcial.skipped || 0;

    return total;
}

async function procesarMessageIds(gmail, messageIds, opciones = {}) {
    const resultado = crearResultadoProcesamiento(messageIds.length);
    const logger = opciones.logger || console;

    for (const messageId of messageIds) {
        try {
            const parcial = await procesarMensajeGetYourGuide(gmail, messageId, opciones);
            sumarResultadoProcesamiento(resultado, parcial);
        } catch (error) {
            if (esMensajeNoEncontrado(error)) {
                logSeguro(logger, `[GYG Gmail Sync] mensaje no encontrado omitido messageId: ${messageId}`);
                sumarResultadoProcesamiento(resultado, {
                    registered: 0,
                    duplicate: 0,
                    unknown: 0,
                    skipped: 1,
                });
                continue;
            }

            throw error;
        }
    }

    return resultado;
}

function tieneBackoffActivo(estado, now = new Date()) {
    if (!estado?.backoff_until) {
        return false;
    }

    return new Date(estado.backoff_until).getTime() > now.getTime();
}

function construirBackoffUntil(env = process.env, now = new Date()) {
    return new Date(now.getTime() + obtenerQuotaBackoffMs(env));
}

async function guardarBackoffRecovery(syncEstado, db, error, env) {
    const backoffUntil = construirBackoffUntil(env);
    await syncEstado.registrarBackoffRecoverySync({
        provider: PROVIDER,
        source: SOURCE,
        errorCode: obtenerCodigoErrorSeguro(error),
        backoffUntil,
    }, db);

    return backoffUntil;
}

async function ejecutarRecovery(gmail, estado, {
    db,
    logger = console,
    env = process.env,
    syncEstado = syncEstadoService,
    registrarEvento = registrarEventoIntegracion,
} = {}) {
    if (tieneBackoffActivo(estado)) {
        return {
            initialized: false,
            recovery: true,
            backoff: true,
            messagesDetected: 0,
            messagesProcessed: 0,
            eventsRegistered: 0,
            duplicates: 0,
            unknownIgnored: 0,
            skipped: 0,
            historyId: estado.last_history_id,
        };
    }

    logSeguro(logger, '[GYG Gmail Sync] recovery iniciado');
    const maxResults = obtenerRecoveryBatchSize(env);
    let response;

    try {
        response = await gmail.users.messages.list({
            userId: 'me',
            q: GYG_FROM_QUERY,
            maxResults,
            pageToken: estado.recovery_page_token || undefined,
        });
    } catch (error) {
        if (esErrorCuotaGmail(error)) {
            const backoffUntil = await guardarBackoffRecovery(syncEstado, db, error, env);
            return {
                initialized: false,
                recovery: true,
                quotaLimited: true,
                backoffUntil,
                messagesDetected: 0,
                messagesProcessed: 0,
                eventsRegistered: 0,
                duplicates: 0,
                unknownIgnored: 0,
                skipped: 0,
                historyId: estado.last_history_id,
            };
        }

        throw error;
    }

    const messages = response.data?.messages || [];
    const messageIds = messages.map((message) => message.id).filter(Boolean);
    let resultado;

    try {
        resultado = await procesarMessageIds(gmail, messageIds, { logger, registrarEvento });
    } catch (error) {
        if (esErrorCuotaGmail(error)) {
            const backoffUntil = await guardarBackoffRecovery(syncEstado, db, error, env);
            return {
                initialized: false,
                recovery: true,
                quotaLimited: true,
                backoffUntil,
                messagesDetected: messageIds.length,
                messagesProcessed: 0,
                eventsRegistered: 0,
                duplicates: 0,
                unknownIgnored: 0,
                skipped: 0,
                historyId: estado.last_history_id,
            };
        }

        throw error;
    }

    if (response.data?.nextPageToken) {
        await syncEstado.guardarCheckpointRecoverySync({
            provider: PROVIDER,
            source: SOURCE,
            recoveryPageToken: response.data.nextPageToken,
        }, db);

        return {
            initialized: false,
            recovery: true,
            recoveryCompleted: false,
            ...resultado,
            historyId: estado.last_history_id,
        };
    }

    if (!estado.recovery_target_history_id) {
        throw new Error('Recovery sin recovery_target_history_id');
    }

    await syncEstado.finalizarRecoverySync({
        provider: PROVIDER,
        source: SOURCE,
        lastHistoryId: estado.recovery_target_history_id,
    }, db);

    logSeguro(logger, '[GYG Gmail Sync] recovery completado');
    return {
        initialized: false,
        recovery: true,
        recoveryCompleted: true,
        ...resultado,
        historyId: estado.recovery_target_history_id,
    };
}

async function iniciarRecoveryDesdeHistoryExpirado(gmail, {
    db,
    logger = console,
    env = process.env,
    syncEstado = syncEstadoService,
    registrarEvento = registrarEventoIntegracion,
} = {}) {
    const targetHistoryId = await obtenerProfileHistoryId(gmail);
    const estadoRecovery = await syncEstado.iniciarRecoverySync({
        provider: PROVIDER,
        source: SOURCE,
        recoveryTargetHistoryId: targetHistoryId,
    }, db);

    return ejecutarRecovery(gmail, estadoRecovery, {
        db,
        logger,
        env,
        syncEstado,
        registrarEvento,
    });
}

async function ejecutarCicloSincronizacion({
    gmail,
    db,
    logger = console,
    env = process.env,
    syncEstado = syncEstadoService,
    registrarEvento = registrarEventoIntegracion,
} = {}) {
    logSeguro(logger, '[GYG Gmail Sync] ciclo iniciado');
    const gmailClient = await obtenerGmailClient({ gmail });
    const estado = await syncEstado.obtenerEstadoSync({ provider: PROVIDER, source: SOURCE }, db);

    if (!estado) {
        const inicializacion = await inicializarSincronizacion({
            gmail: gmailClient,
            db,
            logger,
            syncEstado,
        });

        return {
            initialized: true,
            recovery: false,
            messagesDetected: 0,
            messagesProcessed: 0,
            eventsRegistered: 0,
            duplicates: 0,
            unknownIgnored: 0,
            skipped: 0,
            historyId: inicializacion.historyId,
        };
    }

    if (estado.recovery_active) {
        return ejecutarRecovery(gmailClient, estado, {
            db,
            logger,
            env,
            syncEstado,
            registrarEvento,
        });
    }

    let history;
    try {
        history = await obtenerHistoryMessages(gmailClient, estado.last_history_id);
    } catch (error) {
        if (esHistoryIdExpirado(error)) {
            return iniciarRecoveryDesdeHistoryExpirado(gmailClient, {
                db,
                logger,
                env,
                syncEstado,
                registrarEvento,
            });
        }

        await syncEstado.registrarErrorSync({
            provider: PROVIDER,
            source: SOURCE,
            errorCode: obtenerCodigoErrorSeguro(error),
        }, db).catch(() => {});

        logSeguro(logger, `[GYG Gmail Sync] error de ciclo: ${sanitizeDiagnosticText(error?.message)}`);
        throw error;
    }

    try {
        logSeguro(logger, `[GYG Gmail Sync] nuevos mensajes detectados: ${history.messageIds.length}`);
        const resultado = await procesarMessageIds(gmailClient, history.messageIds, { logger, registrarEvento });

        await syncEstado.actualizarSyncExitoso({
            provider: PROVIDER,
            source: SOURCE,
            lastHistoryId: history.historyId,
        }, db);

        logSeguro(logger, '[GYG Gmail Sync] ciclo completado');

        return {
            initialized: false,
            recovery: false,
            ...resultado,
            historyId: history.historyId,
        };
    } catch (error) {
        await syncEstado.registrarErrorSync({
            provider: PROVIDER,
            source: SOURCE,
            errorCode: obtenerCodigoErrorSeguro(error),
        }, db).catch(() => {});

        logSeguro(logger, `[GYG Gmail Sync] error de ciclo: ${sanitizeDiagnosticText(error?.message)}`);
        throw error;
    }
}

function programarSiguienteCiclo(options, intervalMs) {
    if (workerStopped) {
        return;
    }

    workerTimer = setTimeout(async () => {
        if (workerRunning) {
            programarSiguienteCiclo(options, intervalMs);
            return;
        }

        workerRunning = true;

        try {
            await ejecutarCicloSincronizacion(options);
        } catch (error) {
            logSeguro(options.logger || console, `[GYG Gmail Sync] ciclo fallido: ${sanitizeDiagnosticText(error?.message)}`);
        } finally {
            workerRunning = false;
            programarSiguienteCiclo(options, intervalMs);
        }
    }, intervalMs);

    if (typeof workerTimer.unref === 'function') {
        workerTimer.unref();
    }
}

function iniciarWorkerSincronizacion(options = {}) {
    const env = options.env || process.env;
    const logger = options.logger || console;

    if (!syncHabilitado(env)) {
        return {
            started: false,
            reason: 'disabled',
        };
    }

    if (workerTimer || workerRunning) {
        return {
            started: false,
            reason: 'already_running',
        };
    }

    const intervalMs = obtenerIntervaloMs(env);
    workerStopped = false;
    logSeguro(logger, '[GYG Gmail Sync] iniciado');
    programarSiguienteCiclo({ ...options, env, logger }, intervalMs);

    return {
        started: true,
        intervalMs,
    };
}

function detenerWorkerSincronizacion() {
    workerStopped = true;

    if (workerTimer) {
        clearTimeout(workerTimer);
        workerTimer = null;
    }

    workerRunning = false;

    return {
        stopped: true,
    };
}

module.exports = {
    DEFAULT_INTERVAL_MS,
    DEFAULT_QUOTA_BACKOFF_MS,
    DEFAULT_RECOVERY_BATCH_SIZE,
    DEFAULT_RECOVERY_MAX_MESSAGES,
    GYG_FROM_EMAIL,
    PROVIDER,
    SOURCE,
    detenerWorkerSincronizacion,
    ejecutarCicloSincronizacion,
    esErrorCuotaGmail,
    esHistoryIdExpirado,
    esMensajeNoEncontrado,
    extraerMessageIdsDeHistory,
    inicializarSincronizacion,
    iniciarWorkerSincronizacion,
    obtenerIntervaloMs,
    obtenerQuotaBackoffMs,
    obtenerRecoveryBatchSize,
    obtenerRecoveryMaxMessages,
    procesarMensajeGetYourGuide,
    syncHabilitado,
};
