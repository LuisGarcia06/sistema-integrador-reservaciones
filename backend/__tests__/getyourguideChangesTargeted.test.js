jest.mock('../config/database', () => ({ query: jest.fn(() => { throw Error('POOL_REAL_PROHIBIDO'); }) }));
jest.mock('@google-cloud/local-auth', () => ({ authenticate: jest.fn(() => { throw Error('OAUTH_REAL_PROHIBIDO'); }) }));
jest.mock('googleapis', () => ({ google: { gmail: jest.fn(() => { throw Error('GMAIL_REAL_PROHIBIDO'); }) } }));
const { createDatabase, identity, message, gmail } = require('./helpers/integrationReceiversFake.cjs');
const { createTargetedGetYourGuideChangesReceiver } = require('../../scripts/integrations/getyourguide.cjs');
const { validateBaseline } = require('../../scripts/integrations/backupMain017.cjs');
const { obtenerResumenNotificaciones } = require('../services/notificacionesIntegracion.service');
const reference = 'GYGN6BVGGRXB', fingerprint = 'a'.repeat(32);
const selected = [
    { id: '1a153dab8307eb69', type: 'modification', date: '2026-10-19T11:10:04.000Z' },
    { id: '1a154a528c16875c', type: 'cancellation', date: '2026-10-19T14:51:11.000Z' }
];
function messages() {
    return selected.map(s => {
        const fixture = require('../integrations/getyourguide/__fixtures__/' + s.type + '.json');
        return { ...message({ id: s.id, subject: fixture.subject.replaceAll('GYG123456789', reference),
            text: fixture.text.replaceAll('GYG123456789', reference) }), internalDate: String(Date.parse(s.date)) };
    });
}
function setup(options = {}) {
    const db = createDatabase(options.verification), client = gmail(options.messages || messages());
    db.state.sync = { last_history_id: 'intacto' };
    db.state.parent = { id_evento_integracion: 137, provider: 'getyourguide', external_booking_id: reference,
        external_event_id: '1a1536bdda1d1c2a', event_type: 'new_booking', review_status: 'pending_review',
        application_status: 'not_applied', fingerprint, ...options.parent };
    db.state.links = options.links || [];
    db.state.locked = true;
    const connect = db.connect.getMockImplementation(); let insertAttempts = 0;
    db.connect.mockImplementation(async () => {
        const connection = await connect(), original = connection.query;
        connection.query = async (sql, values) => {
            if (sql.includes('pg_try_advisory_xact_lock')) return { rows: [{ locked: db.state.locked }] };
            if (sql.includes('FOR SHARE')) return { rows: [db.state.parent] };
            if (sql.includes('FROM reservas_integracion_link')) return { rows: db.state.links };
            if (sql.includes('external_event_id = ANY')) return { rows: db.state.events.filter(e =>
                selected.some(s => s.id === e.external_event_id) || e.external_booking_id === reference) };
            if (sql.includes('INSERT INTO eventos_integracion') && ++insertAttempts === options.failInsertNumber) throw Error('SQL_PRIVATE_SYNTHETIC');
            return original(sql, values);
        };
        return connection;
    });
    const getGmailClient = jest.fn(async () => client);
    const receiver = createTargetedGetYourGuideChangesReceiver({ db, identity, enabled: options.enabled ?? true,
        getGmailClient, expectedParentFingerprint: fingerprint });
    return { db, client, getGmailClient, receiver };
}
beforeEach(() => {
    jest.spyOn(require('node:net').Socket.prototype, 'connect').mockImplementation(() => { throw Error('RED_REAL_PROHIBIDA'); });
    jest.spyOn(require('node:fs/promises'), 'readFile').mockImplementation(() => { throw Error('ARCHIVOS_PRIVADOS_PROHIBIDOS'); });
});
afterEach(() => jest.restoreAllMocks());
function unchanged(h) {
    expect(h.db.state.sync).toEqual({ last_history_id: 'intacto' });
    expect(h.db.state.calls.some(sql => /integracion_sync_estado|(?:UPDATE|DELETE|INSERT INTO) reservaciones\b|UPDATE eventos_integracion/i.test(sql))).toBe(false);
    expect(h.client.users.messages.list).not.toHaveBeenCalled();
    expect(h.client.users.history.list).not.toHaveBeenCalled(); expect(h.client.users.getProfile).not.toHaveBeenCalled();
}
test('valida ambos IDs, registra modificación antes de cancelación y deduplica sin tocar alta, vínculos o cursores', async () => {
    const h = setup(), parentBefore = JSON.stringify(h.db.state.parent);
    const first = await h.receiver.receiveSelectedChanges();
    expect(first.eventsRegistered).toBe(2);
    expect(first.events.map(e => e.eventType)).toEqual(['modification', 'cancellation']);
    expect(first.events.every(e => e.reviewStatus === 'pending_review' && e.applicationStatus === 'not_applied')).toBe(true);
    expect(h.db.state.events.map(e => [e.external_event_id, e.external_booking_id])).toEqual(selected.map(s => [s.id, reference]));
    expect(await h.receiver.receiveSelectedChanges()).toMatchObject({ eventsRegistered: 0 });
    expect(h.db.state.events).toHaveLength(2);
    expect(h.client.users.messages.get.mock.calls.map(c => c[0])).toEqual([...selected, ...selected].map(s => ({ userId: 'me', id: s.id, format: 'full' })));
    expect(JSON.stringify(h.db.state.parent)).toBe(parentBefore); unchanged(h);
    const summary = await obtenerResumenNotificaciones(h.db, new Date('2026-10-19T15:00:00Z'));
    expect(summary.events.map(e => e.event_type).sort()).toEqual(['cancellation', 'modification']);
    expect(JSON.stringify(summary)).not.toMatch(/Cliente|Sanitizado|normalized_data/);
});
test.each([
    ['modification', { from: 'other@example.test' }],
    ['modification', { text: 'Referencia: GYGOTHER\nParticipantes: 4' }],
    ['modification', { text: 'Referencia: ' + reference }],
    ['modification', { subject: 'Reserva - ' + reference }],
    ['cancellation', { subject: 'Cambio en los detalles de la reserva: ' + reference }],
    ['cancellation', { from: 'do-not-reply@notification.getyourguide.com.evil.test' }],
    ['cancellation', { text: 'Referencia: ' + reference + '\nReferencia adicional: GYGOTHER' }]
])('validación fallida de %s revierte el conjunto antes de insertar: %j', async (type, overrides) => {
    const data = messages(), index = selected.findIndex(s => s.type === type);
    const original = require('../integrations/getyourguide/__fixtures__/' + type + '.json');
    data[index] = { ...message({ id: selected[index].id, subject: original.subject.replaceAll('GYG123456789', reference),
        text: original.text.replaceAll('GYG123456789', reference), ...overrides }), internalDate: data[index].internalDate };
    const h = setup({ messages: data });
    await expect(h.receiver.receiveSelectedChanges()).rejects.toHaveProperty('code', 'INGRESS_GYG_TARGET_INVALID');
    expect(h.db.state.events).toHaveLength(0); unchanged(h);
});
test.each(['wrong-id', 'wrong-date', 'duplicate-header'])('identidad de mensaje inválida: %s', async fault => {
    const data = messages();
    if (fault === 'wrong-id') data[1].id = 'different';
    if (fault === 'wrong-date') data[1].internalDate = data[0].internalDate;
    if (fault === 'duplicate-header') data[1].payload.headers.push({ name: 'From', value: 'other@example.test' });
    const h = setup({ messages: data });
    await expect(h.receiver.receiveSelectedChanges()).rejects.toHaveProperty('code', 'INGRESS_GYG_TARGET_INVALID');
    expect(h.db.state.events).toHaveLength(0); unchanged(h);
});
test.each([
    { review_status: 'approved' }, { application_status: 'applied' }, { fingerprint: 'b'.repeat(32) },
    { external_booking_id: 'GYGOTHER' }, { archived_at: '2026-10-19' }, { external_event_id: 'different' }
])('alta original incompatible detiene sin modificarla: %j', async parent => {
    const h = setup({ parent }), before = JSON.stringify(h.db.state.parent);
    await expect(h.receiver.receiveSelectedChanges()).rejects.toHaveProperty('code', 'INGRESS_GYG_TARGET_NOT_PENDING');
    expect(h.db.state.events).toHaveLength(0); expect(JSON.stringify(h.db.state.parent)).toBe(before); unchanged(h);
});
test('vínculo con reservación interna detiene el conjunto', async () => {
    const h = setup({ links: [{ id_reservacion: 1 }] });
    await expect(h.receiver.receiveSelectedChanges()).rejects.toHaveProperty('code', 'INGRESS_GYG_TARGET_NOT_PENDING');
    expect(h.db.state.events).toHaveLength(0); unchanged(h);
});
test('fallo en segunda inserción revierte también la primera sin filtrar datos', async () => {
    const h = setup({ failInsertNumber: 2 });
    await expect(h.receiver.receiveSelectedChanges()).rejects.toMatchObject({ code: 'INGRESS_GYG_TARGET_FAILED', message: 'INGRESS_GYG_TARGET_FAILED' });
    expect(h.db.state.events).toHaveLength(0); unchanged(h);
});
test('mismo ID con otro tipo no se reutiliza como duplicado válido', async () => {
    const h = setup(); await h.receiver.receiveSelectedChanges(); h.db.state.events[0].event_type = 'new_booking';
    await expect(h.receiver.receiveSelectedChanges()).rejects.toHaveProperty('code', 'INGRESS_GYG_TARGET_ALREADY_REGISTERED');
    expect(h.db.state.events).toHaveLength(2); unchanged(h);
});
test('otra modificación para la referencia no se sustituye por la seleccionada', async () => {
    const h = setup(); await h.receiver.receiveSelectedChanges(); h.db.state.events[0].external_event_id = 'another-message';
    await expect(h.receiver.receiveSelectedChanges()).rejects.toHaveProperty('code', 'INGRESS_GYG_TARGET_ALREADY_REGISTERED');
    expect(h.db.state.events).toHaveLength(2); unchanged(h);
});
test.each([{ enabled: false }, { verification: { cluster: 'wrong' } }, { verification: { unsafe: true } }])('admisión fallida impide Gmail: %j', async options => {
    const h = setup(options);
    await expect(h.receiver.receiveSelectedChanges()).rejects.toBeDefined();
    expect(h.getGmailClient).not.toHaveBeenCalled(); expect(h.db.state.events).toHaveLength(0);
});
test('bloqueo ocupado no inserta', async () => {
    const h = setup(); h.db.state.locked = false;
    await expect(h.receiver.receiveSelectedChanges()).rejects.toHaveProperty('code', 'INGRESS_GYG_TARGET_LOCKED');
    expect(h.db.state.events).toHaveLength(0); unchanged(h);
});
test('respaldo admite conteos actuales verificados y rechaza inventario ausente o alterado', () => {
    const baseline = { counts: { reservaciones: 1150, eventos_integracion: 137 }, rowHashes: { eventos_integracion: 'snapshot-hash' },
        protectedEvents: [{ id: 124 }, { id: 126 }], aclHash: 'acl-hash' };
    expect(() => validateBaseline(baseline, baseline)).not.toThrow();
    expect(() => validateBaseline(baseline)).toThrow('BACKUP_BASELINE_CHANGED');
    expect(() => validateBaseline({ ...baseline, counts: { ...baseline.counts, eventos_integracion: 138 } }, baseline)).toThrow('BACKUP_BASELINE_CHANGED');
    expect(() => validateBaseline({ ...baseline, rowHashes: { eventos_integracion: 'changed' } }, baseline)).toThrow('BACKUP_BASELINE_CHANGED');
});
