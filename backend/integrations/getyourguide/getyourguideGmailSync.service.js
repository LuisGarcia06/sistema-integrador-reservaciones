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
const GMAIL_HISTORY_EXPIRED_STATUS = 404;

let workerTimer = null;
let workerRunning = false;
let workerStopped = true;

function logSeguro(logger, message) {
    logger.log(message);
}

function obtenerIntervaloMs(env = process.env) {
    const interval = Number(env.GYG_GMAIL_SYNC_INTERVAL_MS);

    return Number.isInteger(interval) && interval > 0
        ? interval
        : DEFAULT_INTERVAL_MS;
}

function obtenerRecoveryMaxMessages(env = process.env) {
    const maxMessages = Number(env.GYG_GMAIL_RECOVERY_MAX_MESSAGES);

    if (!Number.isInteger(maxMessages) || maxMessages <= 0) {
        return DEFAULT_RECOVERY_MAX_MESSAGES;
    }

    return Math.min(maxMessages, DEFAULT_RECOVERY_MAX_MESSAGES);
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

function esHistoryIdExpirado(error) {
    const status = error?.response?.status ?? error?.code;
    const reason = String(error?.errors?.[0]?.reason || error?.response?.data?.error?.status || '').toLowerCase();

    return Number(status) === GMAIL_HISTORY_EXPIRED_STATUS && (
        reason === ''
        || reason.includes('notfound')
        || reason.includes('not_found')
        || reason.includes('failedprecondition')
        || reason.includes('invalidargument')
    );
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
        };
    }

    logSeguro(logger, '[GYG Gmail Sync] evento registrado');
    return {
        tipo: 'registered',
        registered: 1,
        duplicate: 0,
        unknown: 0,
    };
}

function sumarResultadoProcesamiento(total, parcial) {
    total.messagesProcessed += 1;
    total.eventsRegistered += parcial.registered || 0;
    total.duplicates += parcial.duplicate || 0;
    total.unknownIgnored += parcial.unknown || 0;

    return total;
}

async function procesarMessageIds(gmail, messageIds, opciones = {}) {
    const resultado = {
        messagesDetected: messageIds.length,
        messagesProcessed: 0,
        eventsRegistered: 0,
        duplicates: 0,
        unknownIgnored: 0,
    };

    for (const messageId of messageIds) {
        const parcial = await procesarMensajeGetYourGuide(gmail, messageId, opciones);
        sumarResultadoProcesamiento(resultado, parcial);
    }

    return resultado;
}

async function ejecutarRecovery(gmail, {
    db,
    logger = console,
    env = process.env,
    syncEstado = syncEstadoService,
    registrarEvento = registrarEventoIntegracion,
} = {}) {
    logSeguro(logger, '[GYG Gmail Sync] recovery iniciado');
    const maxResults = obtenerRecoveryMaxMessages(env);
    const response = await gmail.users.messages.list({
        userId: 'me',
        q: GYG_FROM_QUERY,
        maxResults,
    });
    const messages = response.data?.messages || [];
    const messageIds = messages.slice(0, maxResults).map((message) => message.id).filter(Boolean);
    const resultado = await procesarMessageIds(gmail, messageIds, { logger, registrarEvento });
    const historyId = await obtenerProfileHistoryId(gmail);

    await syncEstado.actualizarSyncExitoso({
        provider: PROVIDER,
        source: SOURCE,
        lastHistoryId: historyId,
    }, db);

    return {
        ...resultado,
        recovery: true,
        historyId,
    };
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
            historyId: inicializacion.historyId,
        };
    }

    try {
        const history = await obtenerHistoryMessages(gmailClient, estado.last_history_id);
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
        if (esHistoryIdExpirado(error)) {
            const resultadoRecovery = await ejecutarRecovery(gmailClient, {
                db,
                logger,
                env,
                syncEstado,
                registrarEvento,
            });

            logSeguro(logger, '[GYG Gmail Sync] ciclo completado');
            return {
                initialized: false,
                ...resultadoRecovery,
            };
        }

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
    DEFAULT_RECOVERY_MAX_MESSAGES,
    GYG_FROM_EMAIL,
    PROVIDER,
    SOURCE,
    detenerWorkerSincronizacion,
    ejecutarCicloSincronizacion,
    esHistoryIdExpirado,
    extraerMessageIdsDeHistory,
    inicializarSincronizacion,
    iniciarWorkerSincronizacion,
    obtenerIntervaloMs,
    obtenerRecoveryMaxMessages,
    procesarMensajeGetYourGuide,
    syncHabilitado,
};

