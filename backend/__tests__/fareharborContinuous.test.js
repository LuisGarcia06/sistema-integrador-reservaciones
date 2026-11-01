jest.mock('../config/database', () => ({ query: jest.fn(() => { throw Error('REAL_DATABASE_FORBIDDEN'); }) }));
const http = require('node:http'), net = require('node:net');
const { EventEmitter } = require('node:events');
const { createDatabase, identity } = require('./helpers/integrationReceiversFake.cjs');
const { crearPayloadWebhookFareHarborSanitizado: payload } = require('./fixtures/fareharbor.booking.fixture');
const { createFareHarborContinuousReceiver } = require('../../scripts/integrations/fareharbor.cjs');
const { persistContinuousNewBooking, persistContinuousBookingEvent } = require('../integrations/fareharbor/fareharborContinuous.service');
const { obtenerResumenNotificaciones } = require('../services/notificacionesIntegracion.service');
const supervisor = require('../../scripts/integrations/fareharborContinuous.cjs');
const secret = 'SYNTHETIC_SECRET_NOT_REAL_123456789012345';
const uuid2 = '22222222-2222-4333-8444-555555555555';

beforeEach(() => {
    jest.spyOn(net.Server.prototype, 'listen').mockImplementation(() => { throw Error('SOCKET_FORBIDDEN'); });
    jest.spyOn(require('node:child_process'), 'spawn').mockImplementation(() => { throw Error('PROCESS_FORBIDDEN'); });
});
afterEach(() => jest.restoreAllMocks());

function setup(options = {}) {
    const db = createDatabase(), originalConnect = db.connect.getMockImplementation();
    db.state.locked = true; db.state.linked = false; db.state.actor = true;
    db.connect.mockImplementation(async () => {
        const client = await originalConnect(), original = client.query.bind(client), savepoints = new Map();
        client.query = async (sql, values = []) => {
            db.state.calls.push(sql);
            if (sql.startsWith('SAVEPOINT ')) { savepoints.set(sql.slice(10), structuredClone(db.state.events)); return { rows: [] }; }
            if (sql.startsWith('ROLLBACK TO SAVEPOINT ')) { db.state.events = structuredClone(savepoints.get(sql.slice(22))); return { rows: [] }; }
            if (sql.startsWith('RELEASE SAVEPOINT ')) { savepoints.delete(sql.slice(18)); return { rows: [] }; }
            if (sql.includes('pg_try_advisory_xact_lock')) return { rows: [{ locked: db.state.locked }] };
            if (sql.includes('SELECT u.id_usuario')) return { rows: db.state.actor ? [{ id_usuario: values[0] }] : [] };
            if (sql.includes('SELECT id_evento_integracion FROM eventos_integracion')) return { rows: db.state.events.filter(e =>
                e.provider === values[0] && e.external_booking_id.toLowerCase() === values[1].toLowerCase()).slice(0, 1) };
            if (sql.includes('FROM reservas_integracion_link')) return { rows: db.state.linked ? [{ id_reserva_integracion_link: 1, id_reservacion: 100 }] : [] };
            return original(sql, values);
        };
        return client;
    });
    const build = extra => createFareHarborContinuousReceiver({ db, identity, secret,
        enabled: true, creationsOnlyConfirmed: true, ...options, ...extra });
    return { db, app: build(), build };
}
function post(app, body, { key = secret, encrypted = true, route = '/api/integraciones/fareharbor/webhook' } = {}) {
    return new Promise((resolve, reject) => {
        const socket = new net.Socket(); socket.encrypted = encrypted;
        const req = new http.IncomingMessage(socket), bytes = Buffer.from(JSON.stringify(body));
        req.method = 'POST'; req.url = route + '?key=' + key;
        req.headers = { 'content-type': 'application/json', 'content-length': String(bytes.length) };
        const res = new http.ServerResponse(req);
        res.end = chunk => { socket.destroy(); resolve({ status: res.statusCode, body: chunk ? JSON.parse(chunk.toString()) : null }); };
        app(req, res, reject); req.push(bytes); req.push(null);
    });
}

test('continuo: acepta distintos UUID sin marcador ni límite de una reserva y notifica ambos', async () => {
    const h = setup();
    expect((await post(h.app, payload())).status).toBe(200);
    expect((await post(h.app, payload({ uuid: uuid2, contact: { name: 'SYNTHETIC_CONTACT_2' } })))).toMatchObject({ status: 200, body: { received: true } });
    expect(h.db.state.events).toHaveLength(2);
    for (const e of h.db.state.events) expect(e).toMatchObject({ event_type: 'new_booking', review_status: 'pending_review', application_status: 'not_applied' });
    expect((await obtenerResumenNotificaciones(h.db)).events).toHaveLength(2);
    expect(h.db.state.calls.some(sql => /(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:reservaciones|integracion_sync_estado)\b/i.test(sql))).toBe(false);
});
test('continuo: UUID persiste como deduplicador incluso con payload distinto y tras reiniciar', async () => {
    const h = setup(); await post(h.app, payload());
    expect((await post(h.build(), payload({ contact: { name: 'SYNTHETIC_CHANGED' } }))).body.duplicate).toBe(true);
    expect(h.db.state.events).toHaveLength(1);
    expect(h.db.state.events[0].normalized_data.contact.name).toBe('Cliente Demo');
});
test('continuo: normaliza la capitalización del UUID', async () => {
    const h = setup(), id = 'ABCDEFAB-2222-4333-8444-555555555555';
    await post(h.app, payload({ uuid: id }));
    expect((await post(h.app, payload({ uuid: id.toLowerCase() }))).body.duplicate).toBe(true);
    expect(h.db.state.events[0].external_booking_id).toBe(id.toLowerCase());
});
test.each(['cancelled', 'rebooked', undefined])('continuo: ignora estado ajeno a altas %j sin PostgreSQL', async status => {
    const h = setup(); expect((await post(h.app, payload({ status }))).body.ignored).toBe(true);
    expect(h.db.connect).not.toHaveBeenCalled();
});
test.each(['/fareharbor/webhook', '/api/integraciones/fareharbor/webhook'])('continuo: conserva la ruta %s', async route => {
    const h = setup(); expect((await post(h.app, payload(), { route })).status).toBe(200);
});
test.each([{ key: 'INVALID' }, { encrypted: false }])('continuo: rechaza autenticación/transporte inválido sin SQL %j', async request => {
    const h = setup(); expect((await post(h.app, payload(), request)).status).toBe(request.key ? 401 : 400);
    expect(h.db.connect).not.toHaveBeenCalled();
});
test('continuo: permanece deshabilitado sin autorización', async () => {
    const h = setup({ enabled: false }); expect((await post(h.app, payload())).status).toBe(503); expect(h.db.connect).not.toHaveBeenCalled();
});
test('continuo: requiere confirmar New bookings y actor válido si se configura', () => {
    expect(() => setup({ creationsOnlyConfirmed: false })).toThrow('INGRESS_FH_CREATIONS_ONLY_REQUIRED');
    expect(() => setup({ autoApplyUserId: '1' })).toThrow('INGRESS_FH_ACTOR_REQUIRED');
});
test('continuo: fallo de inserción revierte y permite el reintento real', async () => {
    const h = setup(); h.db.state.failInsert = true;
    expect(await post(h.app, payload())).toEqual({ status: 503, body: { code: 'INGRESS_UNAVAILABLE' } });
    expect(h.db.state.events).toHaveLength(0); h.db.state.failInsert = false;
    expect((await post(h.app, payload())).status).toBe(200); expect(h.db.state.events).toHaveLength(1);
});
test('continuo: configurar otro clúster impide construir el receptor', () => {
    expect(() => setup({ identity: { ...identity, DB_CLUSTER_ID: 'invalid' } })).toThrow('INGRESS_IDENTITY_REQUIRED');
});
test('continuo: bloqueo ocupado devuelve reintento y no duplica', async () => {
    const h = setup(); h.db.state.locked = false; expect((await post(h.app, payload())).status).toBe(503);
    expect(h.db.state.events).toHaveLength(0);
});
test('continuo: un UUID vinculado no modifica su reservación ni crea otro evento', async () => {
    const h = setup(); h.db.state.linked = true; expect((await post(h.app, payload())).body.duplicate).toBe(true);
    expect(h.db.state.events).toHaveLength(0);
});

const changes = { creationsOnlyConfirmed: false, bookingChangesAuthorized: true };
const internalWrites = sql => /(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:reservaciones|reservas_integracion_link|bitacora)\b/i.test(sql);

test('multievento: alta, varias modificaciones y cancelación del mismo UUID quedan pendientes; Avisos muestra el ultimo', async () => {
    const h = setup(changes);
    const deliveries = [payload(), payload({ customer_count: 3 }), payload({ customer_count: 4 }),
        payload({ customer_count: 4, status: 'cancelled' })];
    for (const body of deliveries) {
        expect(await post(h.app, body)).toMatchObject({ status: 200, body: { received: true, application: 'pending_review' } });
        const last = h.db.state.events.at(-1);
        expect((await obtenerResumenNotificaciones(h.db)).events).toEqual([expect.objectContaining({
            id_evento_integracion: last.id_evento_integracion, event_type: last.event_type })]);
    }
    expect(h.db.state.events.map(e => e.event_type)).toEqual(['new_booking', 'modification', 'modification', 'cancellation']);
    expect(new Set(h.db.state.events.map(e => e.external_event_id)).size).toBe(4);
    for (const event of h.db.state.events) expect(event).toMatchObject({ external_booking_id: deliveries[0].booking.uuid,
        review_status: 'pending_review', application_status: 'not_applied' });
    expect(h.db.state.calls.some(internalWrites)).toBe(false);
});

test.each(['booked', 'cancelled'])('multievento: UUID ya vinculado admite %s sin tocar la reservación interna', async status => {
    const h = setup(changes); h.db.state.linked = true;
    expect((await post(h.app, payload({ status }))).status).toBe(200);
    expect(h.db.state.events[0]).toMatchObject({ event_type: status === 'booked' ? 'modification' : 'cancellation',
        review_status: 'pending_review', application_status: 'not_applied' });
    expect(h.db.state.calls.some(internalWrites)).toBe(false);
    if (status === 'booked') expect(h.db.state.calls.find(sql => sql.includes('FROM reservas_integracion_link')) || '').toMatch(/lower\(external_booking_id\)/);
});

test('multievento: deduplica reintentos tras otros cambios y tras reinicio sin descartar modificaciones distintas', async () => {
    const h = setup(changes), a = payload(), b = payload({ pickup: { time: '09:00', name: 'Punto sintético' } });
    await post(h.app, a); await post(h.app, b);
    const stored = structuredClone(h.db.state.events);
    for (const body of [a, b]) expect((await post(h.build(), body)).body.duplicate).toBe(true);
    expect(h.db.state.events).toEqual(stored);
});

test('multievento: cancelación sin alta previa se registra y notifica sin inventar vínculo', async () => {
    const h = setup(changes);
    await post(h.app, payload({ status: 'cancelled' }));
    expect(h.db.state.events).toHaveLength(1);
    expect((await obtenerResumenNotificaciones(h.db)).events[0].event_type).toBe('cancellation');
    expect(h.db.state.calls.some(internalWrites)).toBe(false);
});

test('multievento: UUID conocido pendiente sin link se reconoce aunque no se haya creado la reserva interna', async () => {
    const h = setup(changes); await post(h.app, payload());
    expect(h.db.state.linked).toBe(false);
    await post(h.app, payload({ invoice_price: '150.00', receipt_total: '150.00' }));
    expect(h.db.state.events[1].event_type).toBe('modification');
    expect(h.db.state.events[0].review_status).toBe('pending_review');
});

test('multievento: mismo snapshot revisado no se reabre ni cambia de estado', async () => {
    const h = setup(changes); await post(h.app, payload());
    Object.assign(h.db.state.events[0], { review_status: 'dismissed', archived_at: 'synthetic' });
    const before = structuredClone(h.db.state.events);
    expect((await post(h.app, payload())).body.duplicate).toBe(true);
    expect(h.db.state.events).toEqual(before);
});

test('multievento: UUID en mayúsculas no genera una identidad diferente', async () => {
    const h = setup(changes), id = 'ABCDEFAB-2222-4333-8444-555555555555';
    await post(h.app, payload({ uuid: id }));
    expect((await post(h.app, payload({ uuid: id.toLowerCase() }))).body.duplicate).toBe(true);
    await post(h.app, payload({ uuid: id, customer_count: 3 }));
    expect(h.db.state.events.map(e => e.event_type)).toEqual(['new_booking', 'modification']);
    expect(h.db.state.events.every(e => e.external_booking_id === id.toLowerCase())).toBe(true);
});

test.each(['rebooked', 'canceled', 'void', undefined])('multievento: no inventa tipos para estados no soportados %j', async status => {
    const h = setup(changes);
    expect((await post(h.app, payload({ status }))).body.ignored).toBe(true);
    expect(h.db.connect).not.toHaveBeenCalled();
});

test.each(['/fareharbor/webhook', '/api/integraciones/fareharbor/webhook'])('multievento: preserva TLS, autenticación y ruta %s', async route => {
    const h = setup(changes), body = payload({ status: 'cancelled' });
    expect((await post(h.app, body, { route, key: 'INCORRECT' })).status).toBe(401);
    expect((await post(h.app, body, { route, encrypted: false })).status).toBe(400);
    expect(h.db.connect).not.toHaveBeenCalled();
    expect((await post(h.app, body, { route })).status).toBe(200);
});

test('multievento: error SQL revierte y devuelve 503; el reintento inserta una sola vez', async () => {
    const h = setup(changes); await post(h.app, payload()); h.db.state.failInsert = true;
    const change = payload({ customer_count: 3 });
    expect(await post(h.app, change)).toEqual({ status: 503, body: { code: 'INGRESS_UNAVAILABLE' } });
    expect(h.db.state.events).toHaveLength(1); h.db.state.failInsert = false;
    expect((await post(h.app, change)).status).toBe(200);
    expect((await post(h.app, change)).body.duplicate).toBe(true);
    expect(h.db.state.events).toHaveLength(2);
});

test('multievento: bloqueo ocupado solicita reintento y no escribe eventos', async () => {
    const h = setup(changes); h.db.state.locked = false;
    expect((await post(h.app, payload({ status: 'cancelled' }))).status).toBe(503);
    expect(h.db.state.events).toHaveLength(0);
});

test('multievento: rechaza altas automáticas y alcances contradictorios antes de conectar', async () => {
    expect(() => setup({ ...changes, autoApplyUserId: 25 })).toThrow('INGRESS_FH_CREATIONS_ONLY_REQUIRED');
    expect(() => setup({ ...changes, creationsOnlyConfirmed: true })).toThrow('INGRESS_FH_CREATIONS_ONLY_REQUIRED');
    const h = setup(changes);
    await expect(persistContinuousBookingEvent(payload(), h.db, { autoApplyUserId: 25 })).rejects.toThrow('FH_MANUAL_REVIEW_REQUIRED');
    expect(h.db.connect).not.toHaveBeenCalled();
});

test('multievento: no confía en un campo de disparador inventado por el cliente', async () => {
    const h = setup(changes);
    await post(h.app, { ...payload(), type: 'booking.cancelled' });
    expect(h.db.state.events[0].event_type).toBe('new_booking');
});

function autoServices(h, { prepared = true, outcome = 'aplicado', fail = false } = {}) {
    const application = {
        construirReservacionFareHarborParaAplicacion: jest.fn(async () => ({ tipo: prepared ? 'preparado' : 'faltan_datos' })),
        aplicarNuevaReservaFareHarbor: jest.fn(async (id, userId, fields, pool) => {
            const client = await pool.connect(); await client.query('BEGIN');
            if (fail) { await client.query('ROLLBACK'); throw Error('SYNTHETIC_PRIVATE_ERROR'); }
            if (outcome !== 'aplicado') { await client.query('ROLLBACK'); return { tipo: outcome }; }
            h.db.state.events.find(e => e.id_evento_integracion === id).application_status = 'applied';
            await client.query('COMMIT'); client.release(); return { tipo: 'aplicado' };
        })
    };
    const events = { revisarEventoIntegracion: jest.fn(async args => {
        h.db.state.events.find(e => e.id_evento_integracion === args.idEventoIntegracion).review_status = 'approved';
        return { tipo: 'revisado' };
    }) };
    return { application, events };
}
test('continuo: datos incompletos permanecen pendientes y no aprueba ni inventa campos', async () => {
    const h = setup(), services = autoServices(h, { prepared: false });
    expect(await persistContinuousNewBooking(payload(), h.db, { autoApplyUserId: 25, ...services })).toMatchObject({ application: 'pending_review' });
    expect(services.events.revisarEventoIntegracion).not.toHaveBeenCalled();
    expect(h.db.state.events[0].review_status).toBe('pending_review');
});
test('continuo: sin actor administrador válido conserva evento pendiente', async () => {
    const h = setup(), services = autoServices(h); h.db.state.actor = false;
    await persistContinuousNewBooking(payload(), h.db, { autoApplyUserId: 25, ...services });
    expect(services.application.aplicarNuevaReservaFareHarbor).not.toHaveBeenCalled(); expect(h.db.state.events[0].review_status).toBe('pending_review');
});
test('continuo: datos completos usan los servicios existentes y una transacción externa', async () => {
    const h = setup(), services = autoServices(h);
    expect(await persistContinuousNewBooking(payload(), h.db, { autoApplyUserId: 25, ...services })).toMatchObject({ application: 'applied' });
    expect(services.application.aplicarNuevaReservaFareHarbor).toHaveBeenCalledWith(127, 25, {}, expect.any(Object));
    expect(h.db.state.events[0]).toMatchObject({ review_status: 'approved', application_status: 'applied' });
    expect(h.db.state.calls).toContain('SAVEPOINT fh_application');
});
test.each([{ outcome: 'faltan_datos' }, { fail: true }])('continuo: error/conflicto en aplicación revierte aprobación pero conserva el evento %j', async options => {
    const h = setup(), services = autoServices(h, options);
    expect(await persistContinuousNewBooking(payload(), h.db, { autoApplyUserId: 25, ...services })).toMatchObject({ application: 'pending_review' });
    expect(h.db.state.events[0]).toMatchObject({ review_status: 'pending_review', application_status: 'not_applied' });
});

const confirmed = { enabled: true, executionAuthorized: true, creationsOnlyConfirmed: true, exclusiveWebhookConfirmed: true,
    webhookKeyConfirmedRegistered: true, cloudFullCaptureConfirmedDisabled: true,
    cloudCaptureEvidence: { status: 'confirmed_disabled', source: 'synthetic_support_confirmation' }, newIndependentTokenConfirmed: true };
test('multievento: supervisor exige autorización explícita y revisión manual en el alcance ampliado', () => {
    expect(supervisor.pending({ ...confirmed, ...changes, autoApplyUserId: null })).toEqual([]);
    expect(supervisor.pending({ ...confirmed, ...changes, autoApplyUserId: 25 })).toContain('NEW_BOOKINGS_ONLY');
    expect(supervisor.pending({ ...confirmed, creationsOnlyConfirmed: false })).toContain('NEW_BOOKINGS_ONLY');
});
test('continuo: Full Capture desconocido nunca se promueve a confirmado por la autorización temporal', () => {
    expect(supervisor.pending({ ...confirmed, cloudFullCaptureConfirmedDisabled: false, cloudCaptureUnknownAuthorized: true })).toContain('CLOUD_CAPTURE_NOT_CONFIRMED');
    expect(supervisor.pending({ ...confirmed, cloudCaptureEvidence: null })).toContain('CLOUD_CAPTURE_NOT_CONFIRMED');
    expect(supervisor.pending({ ...confirmed, cloudFullCaptureDetectedActive: true })).toContain('CLOUD_CAPTURE_ACTIVE');
    expect(supervisor.pending(confirmed)).toEqual([]);
});
test('continuo: reconexión usa espera exponencial acotada', () => {
    expect([0,1,2,6,20].map(supervisor.retryDelay)).toEqual([1000,2000,4000,64000,900000]);
});
function runtime() {
    const signal = new AbortController(), server = new EventEmitter(), children = [];
    const io = { files: jest.fn(), listen: jest.fn(async () => ({ server, close: jest.fn(async () => {}) })),
        spawn: jest.fn(() => {
            const child = new EventEmitter(); child.exitCode = null; child.signalCode = null;
            child.kill = jest.fn(() => { child.exitCode = 0; child.emit('exit'); }); children.push(child); return child;
        }), probe: jest.fn(async () => true), pause: jest.fn(async () => signal.abort()), emit: jest.fn(), end: jest.fn(async () => {}) };
    return { signal, io, children };
}
test('continuo: no aplica el antiguo plazo de 15 minutos y detiene solamente sus hijos al solicitarlo', async () => {
    const h = runtime(); let cycles = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => 1790000000000 + cycles++ * 3600000);
    h.io.pause.mockImplementation(async () => { if (cycles > 12) h.signal.abort(); });
    await supervisor.supervise({}, h.io, h.signal.signal);
    expect(h.io.probe.mock.calls.length).toBeGreaterThan(3); expect(h.children[0].kill).toHaveBeenCalledTimes(1);
    expect(h.io.end).toHaveBeenCalledTimes(1); expect(h.io.emit).toHaveBeenLastCalledWith('FH_CONTINUOUS_STOPPED');
});
test('continuo: recupera un túnel caído y conserva la misma escucha', async () => {
    const h = runtime(); let cycles = 0;
    h.io.pause.mockImplementation(async () => {
        if (cycles++ === 0) { h.children[0].exitCode = 1; h.children[0].emit('exit'); }
        if (cycles > 3) h.signal.abort();
    });
    await supervisor.supervise({}, h.io, h.signal.signal);
    expect(h.io.spawn).toHaveBeenCalledTimes(2); expect(h.io.listen).toHaveBeenCalledTimes(1);
    expect(h.io.emit).toHaveBeenCalledWith('FH_RECONNECTING');
});
test('continuo: un cambio de configuración cierra el túnel y el receptor', async () => {
    const h = runtime(); let reads = 0;
    h.io.files.mockImplementation(() => { if (++reads > 3) throw Object.assign(Error(), { code: 'FH_CONFIG_CHANGED' }); });
    h.io.pause.mockImplementation(async () => {});
    await expect(supervisor.supervise({}, h.io, h.signal.signal)).rejects.toMatchObject({ code: 'FH_CONFIG_CHANGED' });
    expect(h.children[0].kill).toHaveBeenCalled(); expect(h.io.end).toHaveBeenCalled();
});
