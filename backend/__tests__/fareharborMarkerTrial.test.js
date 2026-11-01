jest.mock('../config/database', () => ({ query: jest.fn(() => { throw Error('REAL_DATABASE_FORBIDDEN'); }) }));
const http = require('node:http'), net = require('node:net');
const { createDatabase, identity } = require('./helpers/integrationReceiversFake.cjs');
const { crearPayloadWebhookFareHarborSanitizado } = require('./fixtures/fareharbor.booking.fixture');
const { createFareHarborMarkerTrialReceiver } = require('../../scripts/integrations/fareharbor.cjs');
const { obtenerResumenNotificaciones } = require('../services/notificacionesIntegracion.service');
const marker = 'CTSK-FH-TEST-' + 'A'.repeat(32), secret = 'SYNTHETIC_SECRET_NOT_REAL_123456789012345';
const start = Date.parse('2026-10-20T20:00:00Z'), end = start + 15 * 60000;
const uuid = '11111111-2222-4333-8444-555555555555';
beforeEach(() => {
    jest.spyOn(net.Server.prototype, 'listen').mockImplementation(() => { throw Error('SOCKET_FORBIDDEN'); });
    jest.spyOn(require('node:child_process'), 'spawn').mockImplementation(() => { throw Error('PROCESS_FORBIDDEN'); });
});
afterEach(() => jest.restoreAllMocks());
function payload(overrides = {}) {
    return crearPayloadWebhookFareHarborSanitizado({ uuid, created_at: new Date(start + 500).toISOString(), contact: { name: marker }, ...overrides });
}
// HTTP en memoria: IncomingMessage/ServerResponse sin listen ni conexión de socket.
function post(app, body) {
    return new Promise((resolve, reject) => {
        const socket = new net.Socket(); socket.encrypted = true;
        const req = new http.IncomingMessage(socket), bytes = Buffer.from(JSON.stringify(body));
        req.method = 'POST'; req.url = '/api/integraciones/fareharbor/webhook?key=' + secret;
        req.headers = { 'content-type': 'application/json', 'content-length': String(bytes.length) };
        const res = new http.ServerResponse(req);
        res.end = chunk => { socket.destroy(); resolve({ status: res.statusCode, body: chunk ? JSON.parse(chunk.toString()) : null }); };
        app(req, res, reject); req.push(bytes); req.push(null);
    });
}
function setup(options = {}) {
    const db = createDatabase(), connect = db.connect.getMockImplementation();
    db.state.locked = true; db.state.locks = [];
    db.connect.mockImplementation(async () => {
        const client = await connect(), original = client.query;
        client.query = async (sql, values = []) => {
            if (sql.includes('pg_try_advisory_xact_lock')) { db.state.locks.push(values[0]); return { rows: [{ locked: db.state.locked }] }; }
            if (sql.includes('AS trial_marker')) return { rows: db.state.events.filter(e => e.provider === values[0]
                && (e.normalized_data.contact.name === values[1] || e.external_booking_id.toLowerCase() === values[2].toLowerCase()))
                .map(e => ({ ...e, trial_marker: e.normalized_data.contact.name })).slice(0, 2) };
            if (/SELECT id_reservacion FROM reservas_integracion_link/.test(sql)) return { rows: [] };
            if (/SELECT id_reservacion FROM reservaciones/.test(sql)) return { rows: options.internal ? [{ id_reservacion: 1 }] : [] };
            return original(sql, values);
        };
        return client;
    });
    const build = () => createFareHarborMarkerTrialReceiver({ db, identity, secret, marker, enabled: true,
        creationsOnlyConfirmed: true, windowStart: new Date(start).toISOString(), windowEnd: new Date(end).toISOString(), now: () => start + 1000, ...options });
    return { db, app: build(), build };
}
test('marcador: permanece desactivado por defecto', async () => {
    const h = setup({ enabled: false }); expect((await post(h.app, payload())).status).toBe(503); expect(h.db.connect).not.toHaveBeenCalled();
});
test.each([undefined, { name: 'SYNTHETIC_OTHER' }, { name: marker + ' ' }, { name: marker.toLowerCase() }, { name: 'prefix ' + marker }])(
    'marcador: otras reservas se descartan sin consultar PostgreSQL: %j', async contact => {
        const h = setup(); expect(await post(h.app, payload({ contact }))).toEqual({ status: 200, body: { received: false, ignored: true } });
        expect(h.db.connect).not.toHaveBeenCalled(); expect(h.db.state.events).toHaveLength(0);
    });
test('marcador: el UUID retirado se descarta aunque alguien copie el marcador', async () => {
    const h = setup(); const result = await post(h.app, payload({ uuid: '9814289b-b601-4236-8feb-c9e29102e76d' }));
    expect(result.body.ignored).toBe(true); expect(h.db.connect).not.toHaveBeenCalled();
});
test('marcador: alta nueva exacta, un evento pendiente y aviso existente compatible', async () => {
    const h = setup(); expect(await post(h.app, payload())).toEqual({ status: 200, body: { received: true } });
    expect(h.db.state.events).toHaveLength(1);
    expect(h.db.state.events[0]).toMatchObject({ external_booking_id: uuid, event_type: 'new_booking', review_status: 'pending_review',
        application_status: 'not_applied', normalized_data: { contact: { name: marker } } });
    expect(h.db.state.locks).toEqual([0x46484D, 0x464852]);
    const summary = await obtenerResumenNotificaciones(h.db, new Date(start));
    expect(summary.events).toContainEqual(expect.objectContaining({ id_evento_integracion: h.db.state.events[0].id_evento_integracion }));
    expect(h.db.state.calls.some(sql => /^(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:reservaciones|integracion_sync_estado)/i.test(sql.trim()))).toBe(false);
});
test('marcador: duplicados exactos y máximo uno incluso con otro UUID y tras reiniciar', async () => {
    const h = setup(); await post(h.app, payload());
    expect((await post(h.app, payload())).body.duplicate).toBe(true);
    expect((await post(h.build(), payload({ uuid: '22222222-2222-4333-8444-555555555555' }))).body)
        .toEqual({ received: false, ignored: true, code: 'TRIAL_ALREADY_RECEIVED' });
    expect(h.db.state.events).toHaveLength(1); expect(h.db.state.events[0].external_booking_id).toBe(uuid);
});
test.each(['cancelled', 'rebooked', undefined])('marcador: rechaza estados que no son alta booked: %j', async status => {
    const h = setup(); expect((await post(h.app, payload({ status }))).status).toBe(409); expect(h.db.connect).not.toHaveBeenCalled();
});
test.each([undefined, 'invalid', '2026-10-20T20:00:00', new Date(start - 1000).toISOString(), new Date(end + 1).toISOString()])(
    'marcador: exige creación fechada dentro de la ventana y con zona: %j', async created_at => {
        const h = setup(); expect((await post(h.app, payload({ created_at }))).status).toBe(400); expect(h.db.connect).not.toHaveBeenCalled();
    });
test('marcador: no admite escrituras después del límite temporal', async () => {
    const h = setup({ now: () => end }); expect((await post(h.app, payload())).status).toBe(400); expect(h.db.connect).not.toHaveBeenCalled();
});
test('marcador: bloqueo ocupado evita una entrega concurrente sin crear eventos', async () => {
    const h = setup(); h.db.state.locked = false;
    expect((await post(h.app, payload())).status).toBe(503); expect(h.db.state.events).toHaveLength(0);
});
test('marcador: impide asociar el alta a una reservación interna ya existente', async () => {
    const h = setup({ internal: true }); expect((await post(h.app, payload())).status).toBe(503); expect(h.db.state.events).toHaveLength(0);
});
test('marcador: fallo de inserción revierte sin mostrar datos privados', async () => {
    const h = setup(); h.db.state.failInsert = true;
    expect(await post(h.app, payload())).toEqual({ status: 503, body: { code: 'INGRESS_UNAVAILABLE' } }); expect(h.db.state.events).toHaveLength(0);
});
test.each(['', 'ANY', null])('marcador: selector ambiguo/incompleto nunca se habilita: %j', value => {
    expect(() => setup({ marker: value })).toThrow('INGRESS_FH_TRIAL_MARKER_REQUIRED');
});
test('marcador: no permite una ventana superior a 15 minutos', () => {
    expect(() => setup({ windowEnd: new Date(end + 1).toISOString() })).toThrow('INGRESS_FH_TRIAL_MARKER_WINDOW');
});
test('marcador: supervisor conecta la fábrica por marcador, sin reutilizar el UUID anterior', async () => {
    const { EventEmitter } = require('node:events'), S = require('../../scripts/integrations/fareharborSupervisor.cjs');
    const server = new EventEmitter(); server.listen = jest.fn((options, done) => done());
    const receiverModule = { createFareHarborMarkerTrialReceiver: jest.fn(() => () => {}),
        createFareHarborTrialReceiver: jest.fn(() => { throw Error('RETIRED_SELECTOR_FORBIDDEN'); }), createFareHarborTlsServer: jest.fn(() => server) };
    await S.runtimeAdapters({ trial: { selectionMode: 'contact_name_marker', trialMarker: marker, ngrokConfigPath: 'C:\\synthetic\\ngrok.yml' },
        supervisor: { awaitingAdminKey: false, authorizationRecordedAt: new Date(start).toISOString(), activationExpiresAt: new Date(end).toISOString() },
        config: {}, settings: { secret, tls: {} }, pool: {}, receiverModule }).listen();
    expect(receiverModule.createFareHarborMarkerTrialReceiver).toHaveBeenCalledWith(expect.objectContaining({ marker, enabled: true }));
    expect(receiverModule.createFareHarborTrialReceiver).not.toHaveBeenCalled();
    expect(server.listen).toHaveBeenCalledWith({ host: '127.0.0.1', port: 3443, exclusive: true }, expect.any(Function));
});
test('marcador: monitor busca por el nombre sintético y obtiene el UUID real del único evento', async () => {
    const S = require('../../scripts/integrations/fareharborSupervisor.cjs');
    const db = { query: jest.fn(async sql => ({ rows: sql.includes('ORDER BY id_evento_integracion')
        ? [{ id_evento_integracion: 9001, external_booking_id: uuid, event_type: 'new_booking', review_status: 'pending_review', application_status: 'not_applied' }] : [] })) };
    expect(await S.readTrialState(db, { selectionMode: 'contact_name_marker', trialMarker: marker })).toMatchObject({ external_booking_id: uuid });
    expect(db.query.mock.calls[0][1]).toEqual(['fareharbor', marker]);
    expect(db.query.mock.calls[1][1]).toEqual(['fareharbor', uuid]);
});
test('marcador: webhook que no confirma el campo exacto no se considera autorizado', () => {
    const S = require('../../scripts/integrations/fareharborSupervisor.cjs');
    expect(S.pendingAuthorizations({ selectionMode: 'contact_name_marker', markerPayloadCompatibleConfirmed: false }, {})).toContain('MARKER_FIELD_IN_WEBHOOK');
});
