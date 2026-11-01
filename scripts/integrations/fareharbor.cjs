const crypto = require('node:crypto');
const https = require('node:https');
const express = require('express');
const path = require('node:path');
const { createAdmission, fail } = require('./admission.cjs');
const { persistirWebhookFareHarbor } = require('../../backend/integrations/fareharbor/fareharborWebhook.service');
const { normalizarPayloadWebhookFareHarbor } = require('../../backend/integrations/fareharbor/fareharbor.mapper');
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const TRIAL_MARKER = /^CTSK-FH-TEST-[A-F0-9]{32}$/;
const RETIRED_TRIAL_UUID = '9814289b-b601-4236-8feb-c9e29102e76d';

function validPayload(payload) {
    const b = payload?.booking;
    if (!b || Array.isArray(b) || typeof b !== 'object'
        || typeof b.uuid !== 'string' || !UUID.test(b.uuid)) return false;
    if (b.status !== undefined && typeof b.status !== 'string') return false;
    if (b.customer_count !== undefined && (!Number.isInteger(b.customer_count) || b.customer_count < 0)) return false;
    if (b.customers !== undefined && (!Array.isArray(b.customers)
        || b.customers.some(c => !c || typeof c !== 'object' || Array.isArray(c)))) return false;
    if (b.availability !== undefined && (!b.availability || typeof b.availability !== 'object' || Array.isArray(b.availability))) return false;
    for (const key of ['start_at', 'end_at']) {
        const value = b.availability?.[key];
        if (value != null && (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))) return false;
    }
    return true;
}

async function persistSingleTrial(payload, db) {
    const normalized = normalizarPayloadWebhookFareHarbor(payload);
    const client = await db.connect();
    let transaction = false;
    try {
        await client.query('BEGIN'); transaction = true;
        const lockKey = crypto.createHash('sha256').update(payload.booking.uuid.toLowerCase()).digest().readInt32BE(0);
        const lock = (await client.query('SELECT pg_try_advisory_xact_lock($1::int,$2::int) AS locked', [0x464852, lockKey])).rows[0];
        if (lock?.locked !== true) fail('INGRESS_FH_TRIAL_LOCKED');
        const previous = (await client.query(`SELECT external_event_id,event_type,review_status,application_status,archived_at
            FROM eventos_integracion WHERE provider = $1 AND lower(external_booking_id) = lower($2)
            ORDER BY id_evento_integracion LIMIT 2`, ['fareharbor', payload.booking.uuid])).rows;
        const links = (await client.query(`SELECT id_reservacion FROM reservas_integracion_link
            WHERE provider = $1 AND lower(external_booking_id) = lower($2)`, ['fareharbor', payload.booking.uuid])).rows;
        if (links.length || previous.length > 1 || previous.some(e => e.event_type !== 'new_booking'
            || e.review_status !== 'pending_review' || e.application_status !== 'not_applied' || e.archived_at)) fail('INGRESS_FH_TRIAL_STATE');
        if (previous.length) {
            await client.query('ROLLBACK'); transaction = false;
            return previous[0].external_event_id === normalized.external_event_id
                ? { received: true, duplicate: true }
                : { received: false, ignored: true, code: 'TRIAL_ALREADY_RECEIVED' };
        }
        // El servicio reutiliza esta transacción sin intentar conectar de nuevo el PoolClient.
        const result = await persistirWebhookFareHarbor(payload, { db: { query: (...args) => client.query(...args) } });
        if (!result.event || result.event.event_type !== 'new_booking' || result.event.review_status !== 'pending_review'
            || result.event.application_status !== 'not_applied') fail('INGRESS_FH_TRIAL_STATE');
        await client.query('COMMIT'); transaction = false;
        return { received: true };
    } catch (error) {
        if (transaction) await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally { client.release(); }
}

async function persistMarkedTrial(payload, db, marker) {
    const normalized = normalizarPayloadWebhookFareHarbor(payload), client = await db.connect();
    let transaction = false;
    try {
        await client.query('BEGIN'); transaction = true;
        // El bloqueo por marcador limita también UUID distintos y reinicios del proceso.
        for (const [namespace, value] of [[0x46484D, marker], [0x464852, payload.booking.uuid.toLowerCase()]]) {
            const key = crypto.createHash('sha256').update(value).digest().readInt32BE(0);
            if ((await client.query('SELECT pg_try_advisory_xact_lock($1::int,$2::int) AS locked', [namespace, key])).rows[0]?.locked !== true) fail('INGRESS_FH_TRIAL_LOCKED');
        }
        const previous = (await client.query(`SELECT external_booking_id,external_event_id,event_type,review_status,application_status,archived_at,
            normalized_data #>> '{contact,name}' AS trial_marker FROM eventos_integracion
            WHERE provider=$1 AND (normalized_data #>> '{contact,name}'=$2 OR lower(external_booking_id)=lower($3))
            ORDER BY id_evento_integracion LIMIT 2`, ['fareharbor', marker, payload.booking.uuid])).rows;
        if (previous.length > 1 || previous.some(e => e.trial_marker !== marker || e.event_type !== 'new_booking'
            || e.review_status !== 'pending_review' || e.application_status !== 'not_applied' || e.archived_at)) fail('INGRESS_FH_TRIAL_STATE');
        const links = (await client.query('SELECT id_reservacion FROM reservas_integracion_link WHERE provider=$1 AND lower(external_booking_id)=lower($2)', ['fareharbor', payload.booking.uuid])).rows;
        const internal = (await client.query('SELECT id_reservacion FROM reservaciones WHERE lower(codigo)=lower($1)', [payload.booking.uuid])).rows;
        if (links.length || internal.length) fail('INGRESS_FH_TRIAL_STATE');
        if (previous.length) {
            await client.query('ROLLBACK'); transaction = false;
            return previous[0].external_event_id === normalized.external_event_id
                ? { received: true, duplicate: true }
                : { received: false, ignored: true, code: 'TRIAL_ALREADY_RECEIVED' };
        }
        const result = await persistirWebhookFareHarbor(payload, { db: { query: (...args) => client.query(...args) } });
        if (result.event?.event_type !== 'new_booking' || result.event.review_status !== 'pending_review'
            || result.event.application_status !== 'not_applied' || result.event.normalized_data?.contact?.name !== marker) fail('INGRESS_FH_TRIAL_STATE');
        await client.query('COMMIT'); transaction = false;
        return { received: true };
    } catch (error) { if (transaction) await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
}

function createFareHarborReceiver({ db, identity, secret, enabled = false, trialBookingUuid, trialMarker, trialWindow,
    continuousNewBookings = false, continuousBookingEvents = false, autoApplyUserId = null, now = Date.now } = {}) {
    const admit = createAdmission({ db, identity, enabled });
    if (trialBookingUuid !== undefined && (typeof trialBookingUuid !== 'string' || !UUID.test(trialBookingUuid))) fail('INGRESS_FH_TRIAL_UUID_REQUIRED');
    if (typeof secret !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(secret)) fail('INGRESS_FH_SECRET_REQUIRED');
    const expected = crypto.createHash('sha256').update(secret).digest();
    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', false);
    app.use((req, res, next) => {
        res.set('Cache-Control', 'no-store');
        res.set('Referrer-Policy', 'no-referrer');
        res.set('X-Content-Type-Options', 'nosniff');
        if (enabled !== true) return res.status(503).json({ code: 'INGRESS_DISABLED' });
        // No confiar en X-Forwarded-Proto: el proceso debe terminar TLS directamente.
        if (req.socket.encrypted !== true) return res.status(400).json({ code: 'HTTPS_REQUIRED' });
        next();
    });
    app.post(['/fareharbor/webhook', '/api/integraciones/fareharbor/webhook'], (req, res, next) => {
        // FareHarbor documenta secreto en URL; no inventar firmas ni cabeceras propias.
        const key = req.query.key;
        if (typeof key !== 'string' || key.length > 256
            || !crypto.timingSafeEqual(expected, crypto.createHash('sha256').update(key).digest())) {
            return res.status(401).json({ code: 'UNAUTHORIZED' });
        }
        next();
    }, express.json({ limit: '256kb', strict: true }), async (req, res) => {
        if (!req.is('application/json')) return res.status(415).json({ code: 'JSON_REQUIRED' });
        if (!validPayload(req.body)) return res.status(400).json({ code: 'INVALID_BOOKING' });
        if (continuousNewBookings && req.body.booking.status !== 'booked') {
            return res.status(200).json({ received: false, ignored: true });
        }
        if (continuousBookingEvents && !['booked', 'cancelled'].includes(req.body.booking.status?.trim().toLowerCase())) {
            return res.status(200).json({ received: false, ignored: true });
        }
        if (trialMarker !== undefined) {
            const b = req.body.booking;
            if (b.uuid.toLowerCase() === RETIRED_TRIAL_UUID || b.contact?.name !== trialMarker) return res.status(200).json({ received: false, ignored: true });
            if (b.status !== 'booked') return res.status(409).json({ code: 'TRIAL_EXPECTS_BOOKED' });
            const created = typeof b.created_at === 'string' && /(?:Z|[+-]\d{2}:?\d{2})$/.test(b.created_at) ? Date.parse(b.created_at) : NaN;
            if (!Number.isFinite(created) || created < Math.floor(trialWindow.start / 1000) * 1000
                || created > now() || created > trialWindow.end || now() >= trialWindow.end) return res.status(400).json({ code: 'TRIAL_EXPECTS_NEW_CREATION' });
        }
        if (trialBookingUuid !== undefined) {
            if (req.body.booking.uuid.toLowerCase() !== trialBookingUuid.toLowerCase()) return res.status(200).json({ received: false, ignored: true });
            // El payload no acredita por sí solo el disparador: FareHarbor debe configurar «creations only».
            if (req.body.booking.status !== 'booked') return res.status(409).json({ code: 'TRIAL_EXPECTS_BOOKED' });
        }
        try {
            await admit();
            if (continuousBookingEvents) return res.status(200).json(await require('../../backend/integrations/fareharbor/fareharborContinuous.service')
                .persistContinuousBookingEvent(req.body, db, { autoApplyUserId }));
            if (continuousNewBookings) return res.status(200).json(await require('../../backend/integrations/fareharbor/fareharborContinuous.service')
                .persistContinuousNewBooking(req.body, db, { autoApplyUserId }));
            if (trialMarker !== undefined) return res.status(200).json(await persistMarkedTrial(req.body, db, trialMarker));
            if (trialBookingUuid !== undefined) return res.status(200).json(await persistSingleTrial(req.body, db));
            await persistirWebhookFareHarbor(req.body, { db });
            // Igual respuesta para primer envío y duplicado. No exponer datos internos.
            return res.status(200).json({ received: true });
        } catch {
            // No confirmar antes del COMMIT. FareHarbor puede reintentar sin duplicar eventos.
            res.set('Retry-After', '60');
            return res.status(503).json({ code: 'INGRESS_UNAVAILABLE' });
        }
    });
    app.use((_req, res) => res.status(404).json({ code: 'NOT_FOUND' }));
    app.use((error, _req, res, _next) => res.status(error.type === 'entity.too.large' ? 413 : 400).json({ code: 'INVALID_JSON' }));
    return app;
}

function createFareHarborTrialReceiver(options = {}) {
    if (typeof options.bookingUuid !== 'string' || !UUID.test(options.bookingUuid)) fail('INGRESS_FH_TRIAL_UUID_REQUIRED');
    if (options.enabled === true && options.creationsOnlyConfirmed !== true) fail('INGRESS_FH_CREATIONS_ONLY_REQUIRED');
    return createFareHarborReceiver({ ...options, trialBookingUuid: options.bookingUuid });
}

function createFareHarborMarkerTrialReceiver(options = {}) {
    if (typeof options.marker !== 'string' || !TRIAL_MARKER.test(options.marker)) fail('INGRESS_FH_TRIAL_MARKER_REQUIRED');
    const start = Date.parse(options.windowStart), end = Date.parse(options.windowEnd);
    if (options.enabled === true && (options.creationsOnlyConfirmed !== true || !Number.isFinite(start) || !Number.isFinite(end)
        || end <= start || end - start > 15 * 60000)) fail('INGRESS_FH_TRIAL_MARKER_WINDOW');
    return createFareHarborReceiver({ ...options, trialBookingUuid: undefined, trialMarker: options.marker, trialWindow: { start, end } });
}

function isContinuousBookingScopeAuthorized(options = {}) {
    return options.bookingChangesAuthorized === true
        ? options.creationsOnlyConfirmed === false && options.autoApplyUserId == null
        : options.creationsOnlyConfirmed === true;
}

function createFareHarborContinuousReceiver(options = {}) {
    if (options.enabled === true && !isContinuousBookingScopeAuthorized(options)) fail('INGRESS_FH_CREATIONS_ONLY_REQUIRED');
    if (options.autoApplyUserId != null && (!Number.isSafeInteger(options.autoApplyUserId) || options.autoApplyUserId <= 0)) fail('INGRESS_FH_ACTOR_REQUIRED');
    // No propagar selectores ni límites temporales del laboratorio a la recepción continua.
    return createFareHarborReceiver({ db: options.db, identity: options.identity, secret: options.secret,
        enabled: options.enabled, continuousNewBookings: options.bookingChangesAuthorized !== true,
        continuousBookingEvents: options.bookingChangesAuthorized === true, autoApplyUserId: options.autoApplyUserId ?? null });
}

function buildFareHarborNgrokArgs({ configPath, caCertPath, port = 3443 } = {}) {
    if (port !== 3443 || !path.isAbsolute(configPath || '') || !path.isAbsolute(caCertPath || '')) fail('INGRESS_FH_TUNNEL_CONFIG');
    // Solo prepara argumentos. No ejecuta ngrok, no publica URL ni pasa secretos por CLI.
    return ['http', 'https://127.0.0.1:3443', '--config', configPath,
        '--upstream-tls-verify', '--upstream-tls-verify-cas', caCertPath, '--inspect=false', '--log=false'];
}

function loadFareHarborTrialSettings(filename, { continuous = false } = {}) {
    const fs = require('node:fs'), { checkAcl } = require('../../backend/config/windowsConfigAcl');
    if (!path.isAbsolute(filename || '')) fail('INGRESS_FH_TRIAL_CONFIG');
    checkAcl(filename);
    const settings = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (settings.version !== 1 || typeof settings.enabled !== 'boolean' || settings.listen?.host !== '127.0.0.1'
        || settings.listen?.port !== 3443 || !path.isAbsolute(settings.postgresConfigPath || '')) fail('INGRESS_FH_TRIAL_CONFIG');
    if (continuous && (settings.mode !== 'continuous' || settings.bookingUuid != null || settings.trialMarker != null)) fail('INGRESS_FH_CONTINUOUS_CONFIG');
    if (settings.enabled && ((!continuous && !UUID.test(settings.bookingUuid || ''))
        || (continuous ? !isContinuousBookingScopeAuthorized(settings) : settings.creationsOnlyConfirmed !== true)
        || (continuous ? !require('./fareharborCapturePolicy.cjs').captureAllowed(settings)
            : settings.cloudFullCaptureConfirmedDisabled !== true) || settings.freeNgrokPlanConfirmed !== true)) fail('INGRESS_FH_TRIAL_NOT_AUTHORIZED');
    const directory = path.dirname(path.resolve(filename));
    const files = [settings.webhookSecretFile, settings.tls?.keyFile, settings.tls?.certFile,
        settings.tls?.caCertFile, settings.ngrokConfigPath];
    for (const file of files) {
        if (!path.isAbsolute(file || '')) fail('INGRESS_FH_TRIAL_CONFIG');
        const relative = path.relative(directory, path.resolve(file));
        if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) fail('INGRESS_FH_TRIAL_CONFIG');
        checkAcl(file);
    }
    checkAcl(settings.postgresConfigPath);
    const secret = fs.readFileSync(settings.webhookSecretFile, 'utf8').trim();
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret)) fail('INGRESS_FH_SECRET_REQUIRED');
    const key = fs.readFileSync(settings.tls.keyFile), cert = fs.readFileSync(settings.tls.certFile);
    const certificate = new crypto.X509Certificate(cert);
    if (!certificate.checkPrivateKey(crypto.createPrivateKey(key)) || certificate.checkIP('127.0.0.1') !== '127.0.0.1'
        || Date.parse(certificate.validTo) <= Date.now() || Date.parse(certificate.validFrom) > Date.now()) fail('INGRESS_TLS_REQUIRED');
    // Esta preparación usa el certificado autofirmado local como ancla explícita de confianza.
    if (!cert.equals(fs.readFileSync(settings.tls.caCertFile))) fail('INGRESS_TLS_REQUIRED');
    return { enabled: settings.enabled, bookingUuid: settings.bookingUuid, trialMarker: settings.trialMarker, selectionMode: settings.selectionMode, creationsOnlyConfirmed: settings.creationsOnlyConfirmed,
        postgresConfigPath: settings.postgresConfigPath, listen: settings.listen, secret, tls: { key, cert },
        ngrokArgs: buildFareHarborNgrokArgs({ configPath: settings.ngrokConfigPath, caCertPath: settings.tls.caCertFile }) };
}

function createFareHarborTlsServer({ tls, receiver } = {}) {
    if (!tls?.key || !tls?.cert || typeof receiver !== 'function') fail('INGRESS_TLS_REQUIRED');
    // No listen aquí: puerto, certificado público e infraestructura requieren autorización posterior.
    return https.createServer({ key: tls.key, cert: tls.cert, minVersion: 'TLSv1.2' }, receiver);
}

module.exports = { createFareHarborReceiver, createFareHarborTrialReceiver, createFareHarborMarkerTrialReceiver, createFareHarborTlsServer,
    createFareHarborContinuousReceiver, isContinuousBookingScopeAuthorized, buildFareHarborNgrokArgs, loadFareHarborTrialSettings };
