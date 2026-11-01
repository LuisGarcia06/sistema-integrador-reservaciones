const path = require('node:path');
const { createAdmission, fail } = require('./admission.cjs');
const sync = require('../../backend/integrations/getyourguide/getyourguideGmailSync.service');
const events = require('../../backend/services/eventosIntegracion.service');

// Solo tras autorización futura: sin rutas predeterminadas, popup OAuth ni tokens heredados.
async function loadExistingGmailClient({ credentialsPath, tokenPath } = {}) {
    const { checkAcl } = require('../../backend/config/windowsConfigAcl');
    const gmail = require('../../backend/integrations/getyourguide/getyourguideGmail.service');
    try {
        if (!path.isAbsolute(credentialsPath || '') || !path.isAbsolute(tokenPath || '')) fail('INGRESS_OAUTH_PATHS_REQUIRED');
        checkAcl(credentialsPath); checkAcl(tokenPath);
        const saved = await gmail.readSavedOAuthCredentials(tokenPath);
        if (!saved?.refresh_token || saved.scope !== gmail.GMAIL_READONLY_SCOPE) fail('INGRESS_OAUTH_AUTHORIZATION_REQUIRED');
        const auth = await gmail.obtenerClienteGmailAutorizado({
            credentialsPath, tokenPath, scopes: [gmail.GMAIL_READONLY_SCOPE], diagnosticLogger: { log() {} },
            authenticateFn: async () => fail('INGRESS_OAUTH_AUTHORIZATION_REQUIRED')
        });
        return gmail.createGmailClient(auth);
    } catch {
        fail('INGRESS_OAUTH_AUTHORIZATION_REQUIRED');
    }
}

function validateEvent(event) {
    if (event.provider !== 'getyourguide' || !event.external_event_id
        || !/^GYG[A-Z0-9-]+$/i.test(event.external_booking_id || '')
        || !['new_booking', 'modification', 'cancellation'].includes(event.event_type)) fail('INGRESS_GYG_INVALID_EVENT');
    // Los formatos parciales se conservan para revisión; no inventar datos ausentes.
    if (event.normalized_data.pax !== undefined
        && (!Number.isInteger(event.normalized_data.pax) || event.normalized_data.pax < 1)) fail('INGRESS_GYG_INVALID_EVENT');
}

function createGetYourGuideReceiver({ db, identity, enabled = false, getGmailClient, retryDelayMs = 60000 } = {}) {
    const admit = createAdmission({ db, identity, enabled });
    if (typeof getGmailClient !== 'function') fail('INGRESS_GMAIL_CLIENT_REQUIRED');
    if (!Number.isInteger(retryDelayMs) || retryDelayMs < 1000) fail('INGRESS_RETRY_DELAY_INVALID');
    let running = false, retryAt = 0, gmail;
    return Object.freeze({
        // Un ciclo explícito. Sin worker, temporizadores, OAuth ni conexiones al importar.
        async runOnce() {
            if (running) fail('INGRESS_BUSY');
            if (Date.now() < retryAt) fail('INGRESS_RETRY_LATER');
            running = true;
            try {
                await admit();
                gmail ||= await getGmailClient();
                // Nunca permitir que el sincronizador use su OAuth/rutas predeterminadas
                // si el proveedor explícito devuelve un cliente ausente o incompleto.
                if (![gmail?.users?.getProfile, gmail?.users?.history?.list,
                    gmail?.users?.messages?.get, gmail?.users?.messages?.list].every(fn => typeof fn === 'function')) {
                    fail('INGRESS_GMAIL_CLIENT_REQUIRED');
                }
                return await sync.ejecutarCicloSincronizacion({
                    gmail, db, logger: { log() {} }, env: {},
                    registrarEvento: event => {
                        validateEvent(event);
                        return events.registrarEventoIntegracion({ ...event, review_status: 'pending_review' }, db);
                    }
                });
            } catch (error) {
                // Cursor sin avanzar ante errores: reintentar es seguro por la identidad externa única.
                if (sync.esErrorCuotaGmail(error) || Number(error?.response?.status ?? error?.code) >= 500) retryAt = Date.now() + retryDelayMs;
                // Nunca propagar respuestas OAuth, correos o errores SQL con datos personales.
                fail('INGRESS_GYG_CYCLE_FAILED');
            } finally { running = false; }
        }
    });
}

const AUTHORIZED_GYG_TEST_REFERENCE = 'GYGN6BVGGRXB';
const TARGET_ERRORS = new Set(['INGRESS_DISABLED', 'INGRESS_BUSY', 'INGRESS_GYG_TARGET_NOT_FOUND',
    'INGRESS_GYG_TARGET_AMBIGUOUS', 'INGRESS_GYG_TARGET_INVALID', 'INGRESS_GYG_TARGET_LOCKED',
    'INGRESS_GYG_TARGET_ALREADY_REGISTERED', 'INGRESS_GYG_TARGET_NOT_PENDING']);

function validateTargetedMessage(message, messageId, reference, expectedType = 'new_booking') {
    const service = require('../../backend/integrations/getyourguide/getyourguideGmail.service');
    const mapper = require('../../backend/integrations/getyourguide/getyourguide.mapper');
    if (message?.id !== messageId) fail('INGRESS_GYG_TARGET_INVALID');
    const headers = message.payload?.headers || [];
    if (headers.filter(h => h.name?.toLowerCase() === 'from').length !== 1
        || headers.filter(h => h.name?.toLowerCase() === 'subject').length !== 1) fail('INGRESS_GYG_TARGET_INVALID');
    const email = service.extractEmailFromGmailMessage(message);
    const sender = /^(?:[^<>\r\n]*<([^<>\s,]+)>|([^<>\s,]+))$/.exec(String(email.from || '').trim());
    if (!sender || (sender[1] || sender[2]).toLowerCase() !== sync.GYG_FROM_EMAIL) fail('INGRESS_GYG_TARGET_INVALID');
    // Comprobar el cuerpo además del filtro y del asunto. Rechazar referencias contradictorias.
    const bodyReferences = [...new Set((email.text.match(/\bGYG[A-Z0-9-]+\b/gi) || []).map(r => r.toUpperCase()))];
    const subjectReferences = (email.subject.match(/\bGYG[A-Z0-9-]+\b/gi) || []).map(r => r.toUpperCase());
    if (bodyReferences.length !== 1 || bodyReferences[0] !== reference
        || subjectReferences.some(r => r !== reference)) fail('INGRESS_GYG_TARGET_INVALID');
    const parsed = service.parseGetYourGuideGmailMessage(message);
    const sourceReceivedAt = mapper.getGmailMessageSourceReceivedAt(message);
    if (parsed.event_type !== expectedType || parsed.external_booking_id !== reference || !sourceReceivedAt) fail('INGRESS_GYG_TARGET_INVALID');
    const event = mapper.toGetYourGuideIntegrationEvent(parsed, { source_subject: email.subject, source_received_at: sourceReceivedAt });
    try { validateEvent(event); } catch { fail('INGRESS_GYG_TARGET_INVALID'); }
    if (expectedType === 'new_booking' && (!Number.isInteger(event.normalized_data.pax) || event.normalized_data.pax < 1
        || !(event.normalized_data.tour || event.normalized_data.activity_title) || !event.normalized_data.date)) fail('INGRESS_GYG_TARGET_INVALID');
    // Los cambios son parciales: no completar sus datos con los del alta original.
    if (expectedType === 'modification' && !Object.keys(event.normalized_data).length) fail('INGRESS_GYG_TARGET_INVALID');
    return { ...event, review_status: 'pending_review' };
}

function createTargetedGetYourGuideReceiver({ db, identity, enabled = false, getGmailClient,
    reference = AUTHORIZED_GYG_TEST_REFERENCE, messageId } = {}) {
    // Una referencia adicional requerirá una autorización y revisión distintas.
    if (reference !== AUTHORIZED_GYG_TEST_REFERENCE) fail('INGRESS_GYG_REFERENCE_NOT_AUTHORIZED');
    if (messageId !== undefined && (typeof messageId !== 'string'
        || !/^[A-Za-z0-9_-]{1,256}$/.test(messageId))) fail('INGRESS_GYG_TARGET_INVALID');
    const admit = createAdmission({ db, identity, enabled });
    if (typeof getGmailClient !== 'function') fail('INGRESS_GMAIL_CLIENT_REQUIRED');
    let running = false;
    return Object.freeze({
        async receiveOnce() {
            if (running) fail('INGRESS_BUSY');
            running = true;
            let client, transaction = false;
            try {
                await admit();
                const gmail = await getGmailClient();
                if (typeof gmail?.users?.messages?.get !== 'function'
                    || (messageId === undefined && typeof gmail?.users?.messages?.list !== 'function')) fail('INGRESS_GYG_TARGET_INVALID');
                let id = messageId;
                // Un ID elegido explícitamente nunca amplía la búsqueda a otros correos.
                if (id === undefined) {
                    const search = await gmail.users.messages.list({ userId: 'me',
                        q: `from:${sync.GYG_FROM_EMAIL} "${reference}"`, maxResults: 2, includeSpamTrash: false,
                        fields: 'messages(id),nextPageToken,resultSizeEstimate' });
                    const messages = search?.data?.messages || [];
                    if (!Array.isArray(messages)) fail('INGRESS_GYG_TARGET_INVALID');
                    if (search?.data?.nextPageToken || messages.length > 1 || Number(search?.data?.resultSizeEstimate) > 1) fail('INGRESS_GYG_TARGET_AMBIGUOUS');
                    if (!messages.length) fail('INGRESS_GYG_TARGET_NOT_FOUND');
                    id = messages[0]?.id;
                }
                if (typeof id !== 'string' || !id || id.length > 256) fail('INGRESS_GYG_TARGET_INVALID');
                const response = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
                const event = validateTargetedMessage(response?.data, id, reference);
                client = await db.connect();
                await client.query('BEGIN'); transaction = true;
                // Serializar únicamente esta referencia. No modificar cursores o estado de Gmail.
                const lockKey = require('node:crypto').createHash('sha256').update(reference).digest().readInt32BE(0);
                const lock = (await client.query('SELECT pg_try_advisory_xact_lock($1::int,$2::int) AS locked', [0x475947, lockKey])).rows[0];
                if (lock?.locked !== true) fail('INGRESS_GYG_TARGET_LOCKED');
                const existing = (await client.query(`SELECT id_evento_integracion,external_event_id,review_status,application_status
                    FROM eventos_integracion WHERE provider = $1 AND external_booking_id = $2 AND event_type = 'new_booking'
                    ORDER BY id_evento_integracion LIMIT 2`, ['getyourguide', reference])).rows;
                if (existing.length > 1) fail('INGRESS_GYG_TARGET_AMBIGUOUS');
                if (existing.length && existing[0].external_event_id !== id) fail('INGRESS_GYG_TARGET_ALREADY_REGISTERED');
                if (existing.length && (existing[0].review_status !== 'pending_review' || existing[0].application_status !== 'not_applied')) fail('INGRESS_GYG_TARGET_NOT_PENDING');
                const result = await events.registrarEventoIntegracion(event, client);
                if (!result.event || result.event.external_booking_id !== reference || result.event.event_type !== 'new_booking'
                    || result.event.review_status !== 'pending_review' || result.event.application_status !== 'not_applied') fail('INGRESS_GYG_TARGET_NOT_PENDING');
                await client.query('COMMIT'); transaction = false;
                return { reference, eventId: result.event.id_evento_integracion, duplicate: result.duplicate,
                    eventsRegistered: result.duplicate ? 0 : 1, reviewStatus: 'pending_review', applicationStatus: 'not_applied' };
            } catch (error) {
                if (transaction) await client.query('ROLLBACK').catch(() => {});
                fail(TARGET_ERRORS.has(error.code) ? error.code : 'INGRESS_GYG_TARGET_FAILED');
            } finally { client?.release(); running = false; }
        }
    });
}

const AUTHORIZED_GYG_CHANGES = Object.freeze([
    Object.freeze({ id: '1a153dab8307eb69', type: 'modification', receivedAt: '2026-10-19T11:10:04.000Z' }),
    Object.freeze({ id: '1a154a528c16875c', type: 'cancellation', receivedAt: '2026-10-19T14:51:11.000Z' })
]);

function createTargetedGetYourGuideChangesReceiver({ db, identity, enabled = false, getGmailClient,
    expectedParentFingerprint } = {}) {
    if (!/^[a-f0-9]{32}$/.test(expectedParentFingerprint || '')) fail('INGRESS_GYG_TARGET_INVALID');
    if (typeof getGmailClient !== 'function') fail('INGRESS_GMAIL_CLIENT_REQUIRED');
    const admit = createAdmission({ db, identity, enabled }), reference = AUTHORIZED_GYG_TEST_REFERENCE;
    let running = false;
    return Object.freeze({
        async receiveSelectedChanges() {
            if (running) fail('INGRESS_BUSY');
            running = true;
            let client, transaction = false;
            try {
                await admit();
                const gmail = await getGmailClient();
                if (typeof gmail?.users?.messages?.get !== 'function') fail('INGRESS_GYG_TARGET_INVALID');
                const validated = [];
                // Validar AMBOS cuerpos antes de abrir la transacción de escritura.
                for (const selected of AUTHORIZED_GYG_CHANGES) {
                    const response = await gmail.users.messages.get({ userId: 'me', id: selected.id, format: 'full' });
                    const event = validateTargetedMessage(response?.data, selected.id, reference, selected.type);
                    if (event.source_received_at.toISOString() !== selected.receivedAt) fail('INGRESS_GYG_TARGET_INVALID');
                    validated.push(event);
                }
                if (!(validated[0].source_received_at < validated[1].source_received_at)) fail('INGRESS_GYG_TARGET_INVALID');
                client = await db.connect();
                await client.query('BEGIN'); transaction = true;
                const lockKey = require('node:crypto').createHash('sha256').update(reference).digest().readInt32BE(0);
                const lock = (await client.query('SELECT pg_try_advisory_xact_lock($1::int,$2::int) AS locked', [0x475947, lockKey])).rows[0];
                if (lock?.locked !== true) fail('INGRESS_GYG_TARGET_LOCKED');
                // Bloquear actualizaciones concurrentes del alta sin modificar su estado.
                const parent = (await client.query(`SELECT id_evento_integracion,provider,external_booking_id,external_event_id,
                    event_type,review_status,application_status,archived_at,applied_at,applied_by,
                    md5(row_to_json(t)::text) AS fingerprint FROM eventos_integracion t
                    WHERE id_evento_integracion = $1 FOR SHARE`, [137])).rows[0];
                if (!parent || parent.fingerprint !== expectedParentFingerprint || parent.provider !== 'getyourguide'
                    || parent.external_booking_id !== reference || parent.external_event_id !== '1a1536bdda1d1c2a'
                    || parent.event_type !== 'new_booking' || parent.review_status !== 'pending_review'
                    || parent.application_status !== 'not_applied' || parent.archived_at || parent.applied_at || parent.applied_by) fail('INGRESS_GYG_TARGET_NOT_PENDING');
                const links = (await client.query(`SELECT id_reservacion FROM reservas_integracion_link
                    WHERE provider = $1 AND external_booking_id = $2`, ['getyourguide', reference])).rows;
                if (links.length) fail('INGRESS_GYG_TARGET_NOT_PENDING');
                const previous = (await client.query(`SELECT external_event_id,external_booking_id,event_type,review_status,application_status,archived_at
                    FROM eventos_integracion WHERE provider = $1 AND (external_event_id = ANY($2::text[])
                    OR (external_booking_id = $3 AND event_type = ANY($4::text[])))`,
                    ['getyourguide', AUTHORIZED_GYG_CHANGES.map(s => s.id), reference, AUTHORIZED_GYG_CHANGES.map(s => s.type)])).rows;
                for (const old of previous) {
                    const selected = AUTHORIZED_GYG_CHANGES.find(s => s.id === old.external_event_id && s.type === old.event_type);
                    if (!selected || old.external_booking_id !== reference) fail('INGRESS_GYG_TARGET_ALREADY_REGISTERED');
                    if (old.review_status !== 'pending_review' || old.application_status !== 'not_applied' || old.archived_at) fail('INGRESS_GYG_TARGET_NOT_PENDING');
                }
                const results = [];
                for (const event of validated) {
                    const result = await events.registrarEventoIntegracion(event, client), row = result.event;
                    if (!row || row.external_event_id !== event.external_event_id || row.external_booking_id !== reference
                        || row.event_type !== event.event_type || row.review_status !== 'pending_review'
                        || row.application_status !== 'not_applied' || row.archived_at) fail('INGRESS_GYG_TARGET_NOT_PENDING');
                    results.push({ eventId: row.id_evento_integracion, eventType: row.event_type, duplicate: result.duplicate,
                        reviewStatus: row.review_status, applicationStatus: row.application_status });
                }
                await client.query('COMMIT'); transaction = false;
                return { reference, eventsRegistered: results.filter(r => !r.duplicate).length, events: results };
            } catch (error) {
                if (transaction) await client.query('ROLLBACK').catch(() => {});
                fail(TARGET_ERRORS.has(error.code) ? error.code : 'INGRESS_GYG_TARGET_FAILED');
            } finally { client?.release(); running = false; }
        }
    });
}

module.exports = { createGetYourGuideReceiver, createTargetedGetYourGuideReceiver, createTargetedGetYourGuideChangesReceiver,
    AUTHORIZED_GYG_TEST_REFERENCE, loadExistingGmailClient, validateEvent };
