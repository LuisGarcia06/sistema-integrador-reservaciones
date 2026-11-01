jest.mock('../config/database', () => ({ query: jest.fn(() => { throw Error('POOL_REAL_PROHIBIDO'); }) }));
jest.mock('../config/windowsConfigAcl', () => ({ checkAcl: jest.fn() }));
const request = require('supertest'), express = require('express'), net = require('node:net');
const { createDatabase, identity } = require('./helpers/integrationReceiversFake.cjs');
const { crearPayloadWebhookFareHarborSanitizado } = require('./fixtures/fareharbor.booking.fixture');
const { createFareHarborTrialReceiver, createFareHarborTlsServer, buildFareHarborNgrokArgs, loadFareHarborTrialSettings } = require('../../scripts/integrations/fareharbor.cjs');
const secret = 'SYNTHETIC_NOT_A_REAL_WEBHOOK_SECRET_123456';
const bookingUuid = '11111111-2222-4333-8444-555555555555';
const route = '/fareharbor/webhook?key=' + secret;
const historicalRoute = '/api/integraciones/fareharbor/webhook?key=' + secret;
const { obtenerResumenNotificaciones } = require('../services/notificacionesIntegracion.service');
function encrypted(app) {
    const wrapper = express(); wrapper.use((req, _res, next) => { req.socket.encrypted = true; next(); }); wrapper.use(app); return wrapper;
}
function setup(options = {}) {
    const db = createDatabase(options.verification), connect = db.connect.getMockImplementation();
    db.state.links = options.links || []; db.state.locked = true;
    db.connect.mockImplementation(async () => {
        const connection = await connect(), original = connection.query;
        connection.query = async (sql, values) => {
            if (sql.includes('pg_try_advisory_xact_lock')) return { rows: [{ locked: db.state.locked }] };
            if (sql.includes('lower(external_booking_id)')) return { rows: sql.includes('reservas_integracion_link') ? db.state.links
                : db.state.events.filter(e => e.provider === values[0] && e.external_booking_id.toLowerCase() === values[1].toLowerCase()).slice(0, 2) };
            return original(sql, values);
        };
        return connection;
    });
    const build = () => createFareHarborTrialReceiver({ db, identity, secret, bookingUuid, enabled: true, creationsOnlyConfirmed: true, ...options });
    const app = build();
    return { db, app, secure: encrypted(app), build };
}
beforeEach(() => {
    const connect = net.Socket.prototype.connect;
    jest.spyOn(net.Socket.prototype, 'connect').mockImplementation(function (...args) {
        const options = Array.isArray(args[0]) ? args[0][0] : args[0];
        if (!options || typeof options !== 'object' || options.host !== '127.0.0.1' || Number(options.port) === 5432) throw Error('RED_REAL_PROHIBIDA');
        return connect.apply(this, args);
    });
    jest.spyOn(console, 'log').mockImplementation(() => {}); jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
function noInternalWrites(h) {
    expect(h.db.state.calls.some(sql => /integracion_sync_estado|(?:INSERT INTO|UPDATE|DELETE FROM) reservaciones\b|UPDATE eventos_integracion/i.test(sql))).toBe(false);
    expect(console.log).not.toHaveBeenCalled(); expect(console.error).not.toHaveBeenCalled();
}
test.each([undefined, null, '', 'not-a-uuid'])('requiere UUID seleccionado antes de habilitar la prueba: %j', value => {
    expect(() => setup({ bookingUuid: value })).toThrow('INGRESS_FH_TRIAL_UUID_REQUIRED');
});
test('sigue desactivado por defecto y no consulta la base', async () => {
    const h = setup(), app = createFareHarborTrialReceiver({ db: h.db, identity, secret, bookingUuid });
    await request(encrypted(app)).post(route).send(crearPayloadWebhookFareHarborSanitizado()).expect(503);
    expect(h.db.connect).not.toHaveBeenCalled();
});
test('habilitar exige confirmación explícita de la suscripción de solo altas', () => {
    expect(() => setup({ creationsOnlyConfirmed: false })).toThrow('INGRESS_FH_CREATIONS_ONLY_REQUIRED');
});
test('HTTPS local obligatorio aunque el proxy declare HTTPS', async () => {
    const h = setup(); await request(h.app).post(route).set('X-Forwarded-Proto', 'https').send(crearPayloadWebhookFareHarborSanitizado()).expect(400);
    expect(h.db.connect).not.toHaveBeenCalled();
});
test('otras reservaciones se descartan sin consultas ni persistencia', async () => {
    const h = setup();
    await request(h.secure).post(route).send(crearPayloadWebhookFareHarborSanitizado({ uuid: '22222222-2222-4333-8444-555555555555' }))
        .expect(200, { received: false, ignored: true });
    expect(h.db.connect).not.toHaveBeenCalled(); expect(h.db.state.events).toHaveLength(0); noInternalWrites(h);
});
test.each(['cancelled', 'rebooked', 'unknown', undefined])('no persiste un estado distinto del alta esperada: %j', async status => {
    const h = setup(); await request(h.secure).post(route).send(crearPayloadWebhookFareHarborSanitizado({ status })).expect(409);
    expect(h.db.connect).not.toHaveBeenCalled(); expect(h.db.state.events).toHaveLength(0);
});
test('un evento pendiente, deduplicación y límite persistente tras reconstruir receptor', async () => {
    const h = setup(), payload = crearPayloadWebhookFareHarborSanitizado();
    await request(h.secure).post(route).send(payload).expect(200, { received: true });
    await request(h.secure).post(route).send(payload).expect(200, { received: true, duplicate: true });
    await request(encrypted(h.build())).post(route).send(payload).expect(200, { received: true, duplicate: true });
    await request(h.secure).post(route).send(crearPayloadWebhookFareHarborSanitizado({ customer_count: 3 }))
        .expect(200, { received: false, ignored: true, code: 'TRIAL_ALREADY_RECEIVED' });
    expect(h.db.state.events).toHaveLength(1);
    expect(h.db.state.events[0]).toMatchObject({ provider: 'fareharbor', external_booking_id: bookingUuid,
        event_type: 'new_booking', review_status: 'pending_review', application_status: 'not_applied' });
    noInternalWrites(h);
});
test('no confirma antes del COMMIT y revierte errores sin filtrar payload ni SQL', async () => {
    const h = setup(); h.db.state.failInsert = true;
    const res = await request(h.secure).post(route).send(crearPayloadWebhookFareHarborSanitizado()).expect(503);
    expect(res.headers['retry-after']).toBe('60'); expect(res.text).not.toMatch(/Cliente|SELECT|DATOS_PRIVADOS/);
    expect(h.db.state.events).toHaveLength(0); noInternalWrites(h);
});
test('vínculo existente impide registrar el alta seleccionada', async () => {
    const h = setup({ links: [{ id_reservacion: 1 }] });
    await request(h.secure).post(route).send(crearPayloadWebhookFareHarborSanitizado()).expect(503);
    expect(h.db.state.events).toHaveLength(0); noInternalWrites(h);
});
test('evento previo aplicado no se reutiliza ni se altera', async () => {
    const h = setup(); await request(h.secure).post(route).send(crearPayloadWebhookFareHarborSanitizado()).expect(200);
    h.db.state.events[0].application_status = 'applied';
    await request(h.secure).post(route).send(crearPayloadWebhookFareHarborSanitizado()).expect(503);
    expect(h.db.state.events).toHaveLength(1); expect(h.db.state.events[0].application_status).toBe('applied'); noInternalWrites(h);
});
test('bloqueo ocupado detiene la entrega concurrente sin crear eventos', async () => {
    const h = setup(); h.db.state.locked = false;
    await request(h.secure).post(route).send(crearPayloadWebhookFareHarborSanitizado()).expect(503);
    expect(h.db.state.events).toHaveLength(0); noInternalWrites(h);
});
test.each([{ cluster: 'other' }, { unsafe: true }, { metadata: {} }])('identidad, rol y 017 se verifican antes de escribir: %j', async verification => {
    const h = setup({ verification });
    await request(h.secure).post(route).send(crearPayloadWebhookFareHarborSanitizado()).expect(503);
    expect(h.db.state.events).toHaveLength(0); noInternalWrites(h);
});
test('argumentos ngrok mantienen TLS verificado hacia 3443 y deshabilitan captura sin publicar', () => {
    const configPath = 'C:\\private\\fareharbor\\ngrok.yml', caCertPath = 'C:\\private\\fareharbor\\local-ca.pem';
    const args = buildFareHarborNgrokArgs({ configPath, caCertPath });
    expect(args).toEqual(['http', 'https://127.0.0.1:3443', '--config', configPath, '--upstream-tls-verify',
        '--upstream-tls-verify-cas', caCertPath, '--inspect=false', '--log=false']);
    expect(JSON.stringify(args)).not.toMatch(/3000|5432|secret|authtoken/);
    expect(() => buildFareHarborNgrokArgs({ configPath, caCertPath, port: 3000 })).toThrow('INGRESS_FH_TUNNEL_CONFIG');
    expect(() => buildFareHarborNgrokArgs({ configPath: 'relative.yml', caCertPath })).toThrow('INGRESS_FH_TUNNEL_CONFIG');
});
test('fábrica TLS no abre puertos ni crea certificados o procesos', () => {
    const https = require('node:https'), fake = { listen: jest.fn() };
    jest.spyOn(https, 'createServer').mockReturnValue(fake);
    expect(createFareHarborTlsServer({ tls: { key: 'SYNTHETIC', cert: 'SYNTHETIC' }, receiver: () => {} })).toBe(fake);
    expect(fake.listen).not.toHaveBeenCalled();
});

test.each([
    { enabled: true, bookingUuid: null },
    { enabled: true, bookingUuid, creationsOnlyConfirmed: true, freeNgrokPlanConfirmed: false, cloudFullCaptureConfirmedDisabled: true },
    { enabled: false, listen: { host: '0.0.0.0', port: 3443 } },
    { enabled: false, listen: { host: '127.0.0.1', port: 3000 } }
])('configuración no autorizada se rechaza sin leer secretos: %j', override => {
    const settings = { version: 1, enabled: false, listen: { host: '127.0.0.1', port: 3443 }, postgresConfigPath: 'C:\\private\\database.env', ...override };
    const read = jest.spyOn(require('node:fs'), 'readFileSync').mockReturnValue(JSON.stringify(settings));
    expect(() => loadFareHarborTrialSettings('C:\\private\\fareharbor\\trial.json')).toThrow(/INGRESS_FH_TRIAL_/);
    expect(read).toHaveBeenCalledTimes(1);
});

test('archivo de secretos fuera de la carpeta privada se rechaza', () => {
    const settings = { version: 1, enabled: false, listen: { host: '127.0.0.1', port: 3443 },
        postgresConfigPath: 'C:\\private\\database.env', webhookSecretFile: 'C:\\outside\\secret.txt' };
    jest.spyOn(require('node:fs'), 'readFileSync').mockReturnValue(JSON.stringify(settings));
    expect(() => loadFareHarborTrialSettings('C:\\private\\fareharbor\\trial.json')).toThrow('INGRESS_FH_TRIAL_CONFIG');
});

describe.each([route, historicalRoute])('mismas protecciones en %s', activeRoute => {
    test('recibe un alta pendiente y el servicio existente encuentra su notificación', async () => {
        const h = setup();
        await request(h.secure).post(activeRoute).send(crearPayloadWebhookFareHarborSanitizado()).expect(200, { received: true });
        expect(h.db.state.events).toHaveLength(1);
        expect(h.db.state.events[0]).toMatchObject({ external_booking_id: bookingUuid, event_type: 'new_booking',
            review_status: 'pending_review', application_status: 'not_applied' });
        const summary = await obtenerResumenNotificaciones(h.db, new Date('2026-10-10T15:00:00Z'));
        expect(summary.events).toContainEqual(expect.objectContaining({ id_evento_integracion: h.db.state.events[0].id_evento_integracion,
            provider: 'fareharbor', event_type: 'new_booking' }));
        noInternalWrites(h);
    });
    test.each(['missing', 'wrong', 'repeated'])('rechaza autenticación %s sin consultar PostgreSQL', async kind => {
        const h = setup(), pathname = activeRoute.split('?')[0];
        const url = kind === 'missing' ? pathname : kind === 'wrong' ? pathname + '?key=wrong' : activeRoute + '&key=second';
        await request(h.secure).post(url).send(crearPayloadWebhookFareHarborSanitizado()).expect(401);
        expect(h.db.connect).not.toHaveBeenCalled(); expect(h.db.state.events).toHaveLength(0);
    });
    test('HTTPS, payload y UUID autorizado se comprueban también en el alias', async () => {
        const h = setup();
        await request(h.app).post(activeRoute).set('X-Forwarded-Proto', 'https').send(crearPayloadWebhookFareHarborSanitizado()).expect(400);
        await request(h.secure).post(activeRoute).send({ booking: { uuid: 'invalid' } }).expect(400);
        await request(h.secure).post(activeRoute).send(crearPayloadWebhookFareHarborSanitizado({ uuid: '22222222-2222-4333-8444-555555555555' }))
            .expect(200, { received: false, ignored: true });
        expect(h.db.connect).not.toHaveBeenCalled(); expect(h.db.state.events).toHaveLength(0);
    });
    test('cancelación se rechaza y modificaciones posteriores no crean otro evento', async () => {
        const h = setup();
        await request(h.secure).post(activeRoute).send(crearPayloadWebhookFareHarborSanitizado({ status: 'cancelled' })).expect(409);
        expect(h.db.connect).not.toHaveBeenCalled();
        await request(h.secure).post(activeRoute).send(crearPayloadWebhookFareHarborSanitizado()).expect(200);
        const original = JSON.stringify(h.db.state.events);
        await request(h.secure).post(activeRoute).send(crearPayloadWebhookFareHarborSanitizado({ customer_count: 3 }))
            .expect(200, { received: false, ignored: true, code: 'TRIAL_ALREADY_RECEIVED' });
        expect(JSON.stringify(h.db.state.events)).toBe(original); noInternalWrites(h);
    });
});

test('las dos rutas comparten deduplicación y el límite de un evento', async () => {
    const h = setup(), payload = crearPayloadWebhookFareHarborSanitizado();
    await request(h.secure).post(historicalRoute).send(payload).expect(200, { received: true });
    await request(h.secure).post(route).send(payload).expect(200, { received: true, duplicate: true });
    await request(encrypted(h.build())).post(historicalRoute).send(payload).expect(200, { received: true, duplicate: true });
    expect(h.db.state.events).toHaveLength(1); noInternalWrites(h);
});
