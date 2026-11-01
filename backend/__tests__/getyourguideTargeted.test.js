jest.mock('../config/database', () => ({ query: jest.fn(() => { throw Error('POOL_REAL_PROHIBIDO'); }) }));
jest.mock('@google-cloud/local-auth', () => ({ authenticate: jest.fn(() => { throw Error('OAUTH_REAL_PROHIBIDO'); }) }));
jest.mock('googleapis', () => ({ google: { gmail: jest.fn(() => { throw Error('GMAIL_REAL_PROHIBIDO'); }) } }));
const { createDatabase, identity, message, gmail } = require('./helpers/integrationReceiversFake.cjs');
const { createTargetedGetYourGuideReceiver, AUTHORIZED_GYG_TEST_REFERENCE: reference } = require('../../scripts/integrations/getyourguide.cjs');
const { obtenerResumenNotificaciones } = require('../services/notificacionesIntegracion.service');
const { validateToc, environment } = require('../../scripts/integrations/backupMain017.cjs');
const fs = require('node:fs'), net = require('node:net');
const fixture = require('../integrations/getyourguide/__fixtures__/new-booking.json');
function targetMessage(overrides = {}) {
    return message({ subject: 'Reserva - ' + reference, text: fixture.text.replaceAll('GYG123456789', reference), ...overrides });
}
function setup({ messages = [targetMessage()], verification, messageId } = {}) {
    const db = createDatabase(verification), client = gmail(messages), connect = db.connect.getMockImplementation();
    db.state.sync = { last_history_id: 'cursor-intacto', recovery_active: false };
    db.state.lockAvailable = true;
    db.connect.mockImplementation(async () => {
        const connection = await connect(), original = connection.query;
        connection.query = async (sql, values) => {
            if (sql.includes('pg_try_advisory_xact_lock')) return { rows: [{ locked: db.state.lockAvailable }] };
            if (sql.includes('external_booking_id = $2') && sql.includes("event_type = 'new_booking'")) {
                return { rows: db.state.events.filter(e => e.provider === values[0] && e.external_booking_id === values[1] && e.event_type === 'new_booking').slice(0, 2) };
            }
            return original(sql, values);
        };
        return connection;
    });
    const getGmailClient = jest.fn(async () => client);
    const receiver = createTargetedGetYourGuideReceiver({ db, identity, enabled: true, getGmailClient, messageId });
    return { db, client, getGmailClient, receiver };
}
beforeEach(() => {
    jest.spyOn(net.Socket.prototype, 'connect').mockImplementation(() => { throw Error('RED_REAL_PROHIBIDA'); });
    jest.spyOn(require('node:fs/promises'), 'readFile').mockImplementation(() => { throw Error('ARCHIVOS_PRIVADOS_PROHIBIDOS'); });
});
afterEach(() => jest.restoreAllMocks());
function unchangedState(db) {
    expect(db.state.sync).toEqual({ last_history_id: 'cursor-intacto', recovery_active: false });
    expect(db.state.calls.some(sql => /integracion_sync_estado|(?:INSERT INTO|UPDATE|DELETE FROM) reservaciones\b/i.test(sql))).toBe(false);
}
test('desactivado por defecto; otra referencia se rechaza antes de consultar', async () => {
    const { db, getGmailClient } = setup();
    const disabled = createTargetedGetYourGuideReceiver({ db, identity, getGmailClient });
    await expect(disabled.receiveOnce()).rejects.toHaveProperty('code', 'INGRESS_DISABLED');
    expect(db.connect).not.toHaveBeenCalled(); expect(getGmailClient).not.toHaveBeenCalled();
    expect(() => createTargetedGetYourGuideReceiver({ db, identity, getGmailClient, reference: 'GYGOTHER' }))
        .toThrow('INGRESS_GYG_REFERENCE_NOT_AUTHORIZED');
});
test.each([{ cluster: 'wrong' }, { unsafe: true }, { metadata: {} }])('verifica identidad/rol/017 antes de Gmail: %j', async verification => {
    const h = setup({ verification }); await expect(h.receiver.receiveOnce()).rejects.toHaveProperty('code', 'INGRESS_GYG_TARGET_FAILED');
    expect(h.getGmailClient).not.toHaveBeenCalled(); expect(h.db.state.events).toHaveLength(0);
});
test('búsqueda exclusiva, un alta normalizada y deduplicación sin tocar estado ni perfil/historial', async () => {
    const h = setup();
    expect(await h.receiver.receiveOnce()).toMatchObject({ reference, eventId: 127, eventsRegistered: 1, duplicate: false });
    expect(await h.receiver.receiveOnce()).toMatchObject({ eventId: 127, eventsRegistered: 0, duplicate: true });
    expect(h.client.users.messages.list).toHaveBeenCalledWith({ userId: 'me', q: `from:do-not-reply@notification.getyourguide.com "${reference}"`,
        maxResults: 2, includeSpamTrash: false, fields: 'messages(id),nextPageToken,resultSizeEstimate' });
    expect(h.client.users.messages.get).toHaveBeenCalledWith({ userId: 'me', id: 'synthetic-message', format: 'full' });
    expect(h.client.users.history.list).not.toHaveBeenCalled(); expect(h.client.users.getProfile).not.toHaveBeenCalled();
    expect(h.db.state.events).toHaveLength(1);
    expect(h.db.state.events[0]).toMatchObject({ external_booking_id: reference, review_status: 'pending_review', application_status: 'not_applied', normalized_data: { pax: 4 } });
    unchangedState(h.db);
    const summary = await obtenerResumenNotificaciones(h.db, new Date('2026-10-19T12:00:00Z'));
    expect(summary.events).toEqual([expect.objectContaining({ id_evento_integracion: 127, provider: 'getyourguide' })]);
    expect(JSON.stringify(summary)).not.toMatch(/Cliente|example.test|normalized_data/);
});
test('ningún mensaje: no hay fetch de cuerpos ni inserción', async () => {
    const h = setup({ messages: [] });
    await expect(h.receiver.receiveOnce()).rejects.toHaveProperty('code', 'INGRESS_GYG_TARGET_NOT_FOUND');
    expect(h.client.users.messages.get).not.toHaveBeenCalled(); expect(h.db.state.events).toHaveLength(0); unchangedState(h.db);
});

test('ID explícito: solo descarga el elegido, deduplica y conserva notificaciones y cursores', async () => {
    const selectedId = '1a1536bdda1d1c2a';
    const h = setup({ messageId: selectedId, messages: [targetMessage({ id: selectedId }),
        targetMessage({ id: 'later-cancellation', subject: 'Se ha cancelado una reserva - ' + reference })] });
    expect(await h.receiver.receiveOnce()).toMatchObject({ eventId: 127, eventsRegistered: 1 });
    expect(await h.receiver.receiveOnce()).toMatchObject({ eventId: 127, duplicate: true, eventsRegistered: 0 });
    expect(h.client.users.messages.list).not.toHaveBeenCalled();
    expect(h.client.users.messages.get.mock.calls).toEqual([
        [{ userId: 'me', id: selectedId, format: 'full' }], [{ userId: 'me', id: selectedId, format: 'full' }]
    ]);
    expect(h.client.users.history.list).not.toHaveBeenCalled(); expect(h.client.users.getProfile).not.toHaveBeenCalled();
    expect(h.db.state.events).toHaveLength(1); unchangedState(h.db);
    const summary = await obtenerResumenNotificaciones(h.db, new Date('2026-10-19T12:00:00Z'));
    expect(summary.events).toEqual([expect.objectContaining({ id_evento_integracion: 127 })]);
});

test.each(['', null, 'wrong/id', 'id\nother', 'a'.repeat(257)])('rechaza ID explícito inválido antes de acceder a Gmail: %j', messageId => {
    expect(() => setup({ messageId })).toThrow('INGRESS_GYG_TARGET_INVALID');
});

test.each([
    { id: 'different' }, { text: fixture.text },
    { from: 'other@example.test' }, { subject: 'Se ha cancelado una reserva - ' + reference }
])('ID explícito conserva todas las validaciones de contenido: %j', overrides => {
    const h = setup({ messageId: 'synthetic-message' });
    h.client.users.messages.get.mockResolvedValue({ data: targetMessage(overrides) });
    return expect(h.receiver.receiveOnce()).rejects.toHaveProperty('code', 'INGRESS_GYG_TARGET_INVALID').then(() => {
        expect(h.client.users.messages.list).not.toHaveBeenCalled(); expect(h.db.state.events).toHaveLength(0); unchangedState(h.db);
    });
});

test('ID explícito ausente no busca sustitutos ni inserta', async () => {
    const h = setup({ messageId: 'missing-message' });
    h.client.users.messages.get.mockRejectedValue(Error('NOT_FOUND_PRIVATE_RESPONSE'));
    await expect(h.receiver.receiveOnce()).rejects.toMatchObject({ code: 'INGRESS_GYG_TARGET_FAILED', message: 'INGRESS_GYG_TARGET_FAILED' });
    expect(h.client.users.messages.list).not.toHaveBeenCalled(); expect(h.db.state.events).toHaveLength(0); unchangedState(h.db);
});
test.each([
    { messages: [{ id: 'one' }, { id: 'two' }] },
    { messages: [{ id: 'one' }], nextPageToken: 'another-page' },
    { messages: [{ id: 'one' }], resultSizeEstimate: 3 }
])('resultado ambiguo: detiene sin leer cuerpos %j', async data => {
    const h = setup(); h.client.users.messages.list.mockResolvedValue({ data });
    await expect(h.receiver.receiveOnce()).rejects.toHaveProperty('code', 'INGRESS_GYG_TARGET_AMBIGUOUS');
    expect(h.client.users.messages.get).not.toHaveBeenCalled(); expect(h.db.state.events).toHaveLength(0); unchangedState(h.db);
});
test.each([
    { from: 'do-not-reply@notification.getyourguide.com.evil.test' },
    { from: 'do-not-reply@notification.getyourguide.com <other@example.test>' },
    { text: fixture.text },
    { text: fixture.text.replace('GYG123456789', reference + 'EXTRA') },
    { text: fixture.text.replace('GYG123456789', reference + '\nReferencia adicional: GYGOTHER') },
    { text: 'Actividad: Tour\nParticipantes: 4\nFecha: 2026-11-12' },
    { subject: 'Reserva - GYGOTHER' },
    { subject: 'Se ha cancelado una reserva - ' + reference },
    { subject: 'Cambio en los detalles de la reserva: ' + reference },
    { subject: 'Mensaje desconocido - ' + reference },
    { text: 'Referencia: ' + reference + '\nActividad: Tour\nFecha: 2026-11-12\nParticipantes: 0' }
])('rechaza remitente/contenido/tipo inadecuado %j', async overrides => {
    const h = setup({ messages: [targetMessage(overrides)] });
    await expect(h.receiver.receiveOnce()).rejects.toHaveProperty('code', 'INGRESS_GYG_TARGET_INVALID');
    expect(h.db.state.events).toHaveLength(0); unchangedState(h.db);
});
test('ID de mensaje devuelto distinto: rechaza sin persistir', async () => {
    const h = setup(); h.client.users.messages.get.mockResolvedValue({ data: targetMessage({ id: 'different' }) });
    await expect(h.receiver.receiveOnce()).rejects.toHaveProperty('code', 'INGRESS_GYG_TARGET_INVALID');
    expect(h.db.state.events).toHaveLength(0); unchangedState(h.db);
});
test('cabeceras From duplicadas detienen la recepción antes de escribir', async () => {
    const m = targetMessage(); m.payload.headers.push({ name: 'From', value: 'other@example.test' });
    const h = setup({ messages: [m] });
    await expect(h.receiver.receiveOnce()).rejects.toHaveProperty('code', 'INGRESS_GYG_TARGET_INVALID');
    expect(h.db.state.events).toHaveLength(0); unchangedState(h.db);
});
test.each(['list', 'get'])('error Gmail %s no filtra datos y no modifica estado; reintento manual seguro', async method => {
    const h = setup(), original = h.client.users.messages[method].getMockImplementation();
    h.client.users.messages[method].mockRejectedValueOnce(Error('TOKEN_Y_DATOS_PERSONALES_SINTETICOS'));
    await expect(h.receiver.receiveOnce()).rejects.toMatchObject({ code: 'INGRESS_GYG_TARGET_FAILED', message: 'INGRESS_GYG_TARGET_FAILED' });
    expect(h.db.state.events).toHaveLength(0); unchangedState(h.db);
    h.client.users.messages[method].mockImplementation(original);
    expect(await h.receiver.receiveOnce()).toMatchObject({ eventsRegistered: 1 });
});
test('cliente Gmail inválido nunca intenta OAuth predeterminado', async () => {
    const h = setup(); h.getGmailClient.mockResolvedValue(undefined);
    await expect(h.receiver.receiveOnce()).rejects.toHaveProperty('code', 'INGRESS_GYG_TARGET_INVALID');
    expect(require('node:fs/promises').readFile).not.toHaveBeenCalled(); unchangedState(h.db);
});
test('fallo de persistencia revierte y permite reintento sin duplicar', async () => {
    const h = setup(); h.db.state.failInsert = true;
    await expect(h.receiver.receiveOnce()).rejects.toHaveProperty('code', 'INGRESS_GYG_TARGET_FAILED');
    expect(h.db.state.events).toHaveLength(0); unchangedState(h.db);
    h.db.state.failInsert = false;
    expect(await h.receiver.receiveOnce()).toMatchObject({ eventsRegistered: 1 });
    expect(await h.receiver.receiveOnce()).toMatchObject({ eventsRegistered: 0, duplicate: true });
});
test('bloqueo ocupado: sin inserción ni espera indefinida', async () => {
    const h = setup(); h.db.state.lockAvailable = false;
    await expect(h.receiver.receiveOnce()).rejects.toHaveProperty('code', 'INGRESS_GYG_TARGET_LOCKED');
    expect(h.db.state.events).toHaveLength(0); unchangedState(h.db);
});
test('otro message ID para la misma referencia no crea un segundo alta', async () => {
    const h = setup(); await h.receiver.receiveOnce();
    const another = targetMessage({ id: 'another-message' });
    h.client.users.messages.list.mockResolvedValue({ data: { messages: [{ id: another.id }] } });
    h.client.users.messages.get.mockResolvedValue({ data: another });
    await expect(h.receiver.receiveOnce()).rejects.toHaveProperty('code', 'INGRESS_GYG_TARGET_ALREADY_REGISTERED');
    expect(h.db.state.events).toHaveLength(1); unchangedState(h.db);
});
test('evento ya aplicado o múltiples altas previas: no altera sus estados', async () => {
    const h = setup(); await h.receiver.receiveOnce(); h.db.state.events[0].application_status = 'applied';
    await expect(h.receiver.receiveOnce()).rejects.toHaveProperty('code', 'INGRESS_GYG_TARGET_NOT_PENDING');
    expect(h.db.state.events[0].application_status).toBe('applied');
    h.db.state.events.push({ ...h.db.state.events[0], id_evento_integracion: 128 });
    await expect(h.receiver.receiveOnce()).rejects.toHaveProperty('code', 'INGRESS_GYG_TARGET_AMBIGUOUS');
    expect(h.db.state.events).toHaveLength(2); unchangedState(h.db);
});
test('impide llamadas simultáneas de la misma operación', async () => {
    const h = setup(); let release; const wait = new Promise(resolve => { release = resolve; });
    h.getGmailClient.mockImplementation(async () => { await wait; return h.client; });
    const first = h.receiver.receiveOnce(); await expect(h.receiver.receiveOnce()).rejects.toHaveProperty('code', 'INGRESS_BUSY');
    release(); await first; expect(h.db.state.events).toHaveLength(1); unchangedState(h.db);
});
test('respaldo: TOC rechaza tablas/secuencias ausentes y no hereda claves PG', () => {
    const inv = { tables: ['sample'], sequences: [], constraints: [], indexes: [] };
    const toc = '1; 1259 123 TABLE public sample postgres\n2; 0 123 TABLE DATA public sample postgres';
    expect(validateToc(toc, inv)).toMatchObject({ tables: 1, tableData: 1 });
    expect(() => validateToc(toc.split('\n')[0], inv)).toThrow('BACKUP_TABLE_INVENTORY');
    expect(() => validateToc(toc, { ...inv, sequences: [{ name: 'missing_seq' }] })).toThrow('BACKUP_SEQUENCE_INVENTORY');
    expect(environment()).not.toHaveProperty('PGPASSWORD');
});
test('respaldo no tiene entrada automática ni comandos de restauración con conexión', () => {
    const source = fs.readFileSync(require.resolve('../../scripts/integrations/backupMain017.cjs'), 'utf8');
    expect(source).not.toMatch(/require\.main|pg_restore\.exe',\s*\[[^\]]*--dbname/);
    expect(source).toContain('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
});
