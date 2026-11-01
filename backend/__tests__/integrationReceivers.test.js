jest.mock('../config/database', () => ({
    query: jest.fn(() => { throw Error('POOL_ELECTRON_PROHIBIDO'); }),
    connect: jest.fn(() => { throw Error('POOL_ELECTRON_PROHIBIDO'); })
}));
jest.mock('@google-cloud/local-auth', () => ({ authenticate: jest.fn(() => { throw Error('OAUTH_REAL_PROHIBIDO'); }) }));
jest.mock('googleapis', () => ({ google: { gmail: jest.fn(() => { throw Error('GMAIL_REAL_PROHIBIDO'); }) } }));

const request = require('supertest');
const express = require('express');
const https = require('node:https');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const { createDatabase, identity, message, gmail } = require('./helpers/integrationReceiversFake.cjs');
const { createGetYourGuideReceiver, loadExistingGmailClient } = require('../../scripts/integrations/getyourguide.cjs');
const { createFareHarborReceiver, createFareHarborTlsServer } = require('../../scripts/integrations/fareharbor.cjs');
const { obtenerResumenNotificaciones } = require('../services/notificacionesIntegracion.service');
const { crearPayloadWebhookFareHarborSanitizado } = require('./fixtures/fareharbor.booking.fixture');
const secret = 'SYNTHETIC_NOT_A_REAL_WEBHOOK_SECRET_123456';
const url = '/fareharbor/webhook?key=' + secret;
const payload = () => crearPayloadWebhookFareHarborSanitizado({ availability: {
    start_at: '2030-01-01T08:00:00-05:00', item: { pk: 77, name: 'Actividad sintetica' }
} });
const receiver = (db, extra = {}) => createFareHarborReceiver({ db, identity, enabled: true, secret, ...extra });

// Doble de terminación TLS para solicitudes HTTP locales de supertest. No prueba un certificado real.
function encrypted(app) {
    const wrapper = express();
    wrapper.use((req, _res, next) => { req.socket.encrypted = true; next(); });
    wrapper.use(app);
    return wrapper;
}
let socketGuard;
beforeEach(() => {
    const connect = net.Socket.prototype.connect;
    socketGuard = jest.spyOn(net.Socket.prototype, 'connect').mockImplementation(function (...args) {
        const opts = Array.isArray(args[0]) ? args[0][0] : args[0];
        if (!opts || typeof opts !== 'object' || opts.host !== '127.0.0.1' || Number(opts.port) === 5432) {
            throw Error('RED_EXTERNA_O_POSTGRES_PROHIBIDOS');
        }
        return connect.apply(this, args);
    });
});
afterEach(() => jest.restoreAllMocks());

describe('GetYourGuide independiente, Gmail y PostgreSQL dobles', () => {
    test('desactivado por defecto: no consulta PG ni obtiene OAuth/Gmail', async () => {
        const db = createDatabase(), getGmailClient = jest.fn();
        const r = createGetYourGuideReceiver({ db, identity, getGmailClient });
        await expect(r.runOnce()).rejects.toHaveProperty('code', 'INGRESS_GYG_CYCLE_FAILED');
        expect(db.connect).not.toHaveBeenCalled(); expect(getGmailClient).not.toHaveBeenCalled();
    });
    test.each([{ cluster: 'incorrecto' }, { unsafe: true }, { metadata: {} }])('identidad/rol/esquema inválidos %j impiden Gmail', async options => {
        const db = createDatabase(options), getGmailClient = jest.fn();
        const r = createGetYourGuideReceiver({ db, identity, enabled: true, getGmailClient });
        await expect(r.runOnce()).rejects.toHaveProperty('code', 'INGRESS_GYG_CYCLE_FAILED');
        expect(getGmailClient).not.toHaveBeenCalled(); expect(db.state.events).toHaveLength(0);
    });
    test.each([undefined, null, {}])('cliente Gmail ausente/incompleto %j no permite fallback a OAuth real', async client => {
        const db = createDatabase();
        const read = jest.spyOn(require('node:fs/promises'), 'readFile');
        const r = createGetYourGuideReceiver({ db, identity, enabled: true, getGmailClient: async () => client });
        await expect(r.runOnce()).rejects.toHaveProperty('code', 'INGRESS_GYG_CYCLE_FAILED');
        expect(read).not.toHaveBeenCalled(); expect(db.query).not.toHaveBeenCalled();
    });
    test('baseline no importa histórico; llegada, normalización y duplicado usan el DB del receptor', async () => {
        const db = createDatabase(), client = gmail();
        const r = createGetYourGuideReceiver({ db, identity, enabled: true, getGmailClient: async () => client });
        expect(await r.runOnce()).toMatchObject({ initialized: true, eventsRegistered: 0 });
        expect(await r.runOnce()).toMatchObject({ eventsRegistered: 1 });
        expect(await r.runOnce()).toMatchObject({ duplicates: 1, eventsRegistered: 0 });
        expect(db.state.events).toHaveLength(1);
        expect(db.state.events[0]).toMatchObject({ provider: 'getyourguide', review_status: 'pending_review',
            application_status: 'not_applied', normalized_data: { pax: 4, date: '2026-11-12' } });
        expect(require('../config/database').query).not.toHaveBeenCalled();
    });
    test.each([
        'do-not-reply@notification.getyourguide.com.evil.test',
        'do-not-reply@notification.getyourguide.com <attacker@example.test>',
        'GYG <do-not-reply@notification.getyourguide.com>, attacker@example.test',
        'otro@example.test'
    ])('rechaza remitente ajeno o engañoso %s', async from => {
        const db = createDatabase(); db.state.sync = { last_history_id: 'h1' };
        const r = createGetYourGuideReceiver({ db, identity, enabled: true, getGmailClient: async () => gmail([message({ from })]) });
        expect(await r.runOnce()).toMatchObject({ eventsRegistered: 0 });
        expect(db.state.events).toHaveLength(0);
    });
    test('asunto desconocido se ignora; referencia ausente falla sin avanzar cursor', async () => {
        const db = createDatabase(); db.state.sync = { last_history_id: 'h1' };
        const client = gmail([message({ subject: 'Newsletter' })]);
        const r = createGetYourGuideReceiver({ db, identity, enabled: true, getGmailClient: async () => client });
        expect(await r.runOnce()).toMatchObject({ unknownIgnored: 1, eventsRegistered: 0 });
        db.state.sync.last_history_id = 'h1';
        client.users.messages.get.mockResolvedValue({ data: message({ subject: 'Reserva - STEST001', text: 'Actividad: Test' }) });
        await expect(r.runOnce()).rejects.toHaveProperty('code', 'INGRESS_GYG_CYCLE_FAILED');
        expect(db.state.sync.last_history_id).toBe('h1'); expect(db.state.events).toHaveLength(0);
    });
    test('fallo tras primera inserción no avanza cursor; reintento deduplica lo ya persistido', async () => {
        const db = createDatabase(); db.state.sync = { last_history_id: 'h1' };
        const client = gmail([message(), message({ id: 'synthetic-message-2' })]);
        const originalGet = client.users.messages.get.getMockImplementation();
        let fail = true;
        client.users.messages.get.mockImplementation(args => {
            if (args.id === 'synthetic-message-2' && fail) throw Error('DATOS_PRIVADOS_SINTETICOS');
            return originalGet(args);
        });
        const r = createGetYourGuideReceiver({ db, identity, enabled: true, getGmailClient: async () => client });
        await expect(r.runOnce()).rejects.toMatchObject({ message: 'INGRESS_GYG_CYCLE_FAILED' });
        expect(db.state.events).toHaveLength(1); expect(db.state.sync.last_history_id).toBe('h1');
        expect(db.state.sync.last_error_code).toBe('GYG_SYNC_ERROR');
        fail = false;
        expect(await r.runOnce()).toMatchObject({ duplicates: 1, eventsRegistered: 1 });
        expect(db.state.events).toHaveLength(2); expect(db.state.sync.last_history_id).toBe('h2');
    });
    test('history expirado recupera por consulta GYG usando el mismo flujo de eventos', async () => {
        const db = createDatabase(); db.state.sync = { last_history_id: 'h0' };
        const client = gmail(); client.users.history.list.mockRejectedValue({ code: 404 });
        const r = createGetYourGuideReceiver({ db, identity, enabled: true, getGmailClient: async () => client });
        expect(await r.runOnce()).toMatchObject({ recoveryCompleted: true, eventsRegistered: 1 });
        expect(client.users.messages.list).toHaveBeenCalledWith(expect.objectContaining({ q: 'from:do-not-reply@notification.getyourguide.com' }));
    });
    test('cuota en history: espera antes de reintentar, sin temporizadores ni avance', async () => {
        const db = createDatabase(); db.state.sync = { last_history_id: 'h1' };
        const client = gmail(); client.users.history.list.mockRejectedValue({ code: 429 });
        const r = createGetYourGuideReceiver({ db, identity, enabled: true, getGmailClient: async () => client });
        const now = jest.spyOn(Date, 'now').mockReturnValue(100000);
        try {
            await expect(r.runOnce()).rejects.toHaveProperty('code', 'INGRESS_GYG_CYCLE_FAILED');
            await expect(r.runOnce()).rejects.toHaveProperty('code', 'INGRESS_RETRY_LATER');
            expect(client.users.history.list).toHaveBeenCalledTimes(1); expect(db.state.sync.last_history_id).toBe('h1');
            now.mockReturnValue(161000); client.users.history.list.mockResolvedValue({ data: { history: [], historyId: 'h2' } });
            expect(await r.runOnce()).toMatchObject({ eventsRegistered: 0 });
        } finally { now.mockRestore(); }
    });
    test('no permite dos ciclos simultáneos', async () => {
        const db = createDatabase(); let release;
        const wait = new Promise(resolve => { release = resolve; });
        const r = createGetYourGuideReceiver({ db, identity, enabled: true, getGmailClient: async () => { await wait; return gmail(); } });
        const first = r.runOnce();
        await expect(r.runOnce()).rejects.toHaveProperty('code', 'INGRESS_BUSY');
        release(); await first;
    });
});

describe('OAuth explícito, sin archivos ni permisos reales', () => {
    const service = require('../integrations/getyourguide/getyourguideGmail.service');
    const acl = require('../config/windowsConfigAcl');
    test.each([null, { refresh_token: 'SYNTHETIC' }, { refresh_token: 'SYNTHETIC', scope: 'https://mail.google.com/' }])('no inicia autorización interactiva con token inadecuado %j', async saved => {
        jest.spyOn(acl, 'checkAcl').mockImplementation(() => {});
        jest.spyOn(service, 'readSavedOAuthCredentials').mockResolvedValue(saved);
        const auth = jest.spyOn(service, 'obtenerClienteGmailAutorizado');
        await expect(loadExistingGmailClient({ credentialsPath: 'C:/synthetic/credentials.json', tokenPath: 'C:/synthetic/token.json' }))
            .rejects.toHaveProperty('code', 'INGRESS_OAUTH_AUTHORIZATION_REQUIRED');
        expect(auth).not.toHaveBeenCalled();
    });
    test('ACL insegura detiene antes de leer token', async () => {
        jest.spyOn(acl, 'checkAcl').mockImplementation(() => { throw Error('ACL'); });
        const read = jest.spyOn(service, 'readSavedOAuthCredentials');
        await expect(loadExistingGmailClient({ credentialsPath: 'C:/synthetic/c.json', tokenPath: 'C:/synthetic/t.json' }))
            .rejects.toHaveProperty('code', 'INGRESS_OAUTH_AUTHORIZATION_REQUIRED');
        expect(read).not.toHaveBeenCalled();
    });
    test('reutiliza OAuth readonly con rutas explícitas y fallback interactivo bloqueado', async () => {
        jest.spyOn(acl, 'checkAcl').mockImplementation(() => {});
        jest.spyOn(service, 'readSavedOAuthCredentials').mockResolvedValue({ refresh_token: 'SYNTHETIC', scope: service.GMAIL_READONLY_SCOPE });
        const auth = jest.spyOn(service, 'obtenerClienteGmailAutorizado').mockResolvedValue({ synthetic: true });
        jest.spyOn(service, 'createGmailClient').mockReturnValue(gmail());
        await loadExistingGmailClient({ credentialsPath: 'C:/synthetic/c.json', tokenPath: 'C:/synthetic/t.json' });
        const options = auth.mock.calls[0][0];
        expect(options.scopes).toEqual([service.GMAIL_READONLY_SCOPE]);
        await expect(options.authenticateFn()).rejects.toHaveProperty('code', 'INGRESS_OAUTH_AUTHORIZATION_REQUIRED');
    });
});

describe('FareHarbor independiente, HTTP y PostgreSQL dobles', () => {
    test('desactivado por defecto y rechaza HTTP aunque declare X-Forwarded-Proto https', async () => {
        const db = createDatabase();
        await request(encrypted(receiver(db, { enabled: false }))).post(url).send(payload()).expect(503);
        await request(receiver(db)).post(url).set('X-Forwarded-Proto', 'https').send(payload()).expect(400);
        expect(db.connect).not.toHaveBeenCalled();
    });
    test.each(['/fareharbor/webhook', '/fareharbor/webhook?key=wrong', url + '&key=second'])('rechaza secreto ausente, incorrecto o repetido %s', async route => {
        const db = createDatabase();
        await request(encrypted(receiver(db))).post(route).send(payload()).expect(401);
        expect(db.connect).not.toHaveBeenCalled();
    });
    test('valida antes de PG: JSON corrupto, tamaño, MIME y UUID', async () => {
        const db = createDatabase(), app = encrypted(receiver(db));
        await request(app).post(url).set('Content-Type', 'application/json').send('{').expect(400);
        await request(app).post(url).send({ padding: 'x'.repeat(256 * 1024) }).expect(413);
        await request(app).post(url).type('text').send('text').expect(415);
        await request(app).post(url).send({ booking: { uuid: 123 } }).expect(400);
        await request(app).post(url).send(payload()).expect(200);
        expect(db.state.events).toHaveLength(1);
    });
    test.each([{ cluster: 'other' }, { unsafe: true }, { metadata: {} }])('identidad/rol/esquema incorrecto %j: sin INSERT', async options => {
        const db = createDatabase(options);
        await request(encrypted(receiver(db))).post(url).send(payload()).expect(503);
        expect(db.state.events).toHaveLength(0); expect(db.state.calls.some(sql => /INSERT/.test(sql))).toBe(false);
    });
    test('alta normalizada, duplicado y cambio conservan revisión manual; no llamadas API', async () => {
        const db = createDatabase(), app = encrypted(receiver(db));
        await request(app).post(url).send(payload()).expect(200, { received: true });
        await request(app).post(url).send(payload()).expect(200, { received: true });
        expect(db.state.events).toHaveLength(1);
        expect(db.state.events[0]).toMatchObject({ provider: 'fareharbor', review_status: 'pending_review',
            application_status: 'not_applied', normalized_data: { customers: { total: 2 }, booking: { status: 'booked' } } });
        const change = payload(); change.booking.customer_count = 3;
        await request(app).post(url).send(change).expect(200);
        expect(db.state.events).toHaveLength(2);
        expect(db.state.calls.some(sql => /(?:INSERT INTO|UPDATE|DELETE FROM) reservaciones\b/i.test(sql))).toBe(false);
    });
    test('entregas concurrentes conservan una sola identidad de evento', async () => {
        const db = createDatabase(), app = encrypted(receiver(db));
        const responses = await Promise.all(Array.from({ length: 4 }, () => request(app).post(url).send(payload())));
        expect(responses.map(r => r.status)).toEqual([200, 200, 200, 200]);
        expect(db.state.events).toHaveLength(1);
    });
    test('error no confirma, no expone datos y permite reintento idempotente', async () => {
        const db = createDatabase(), app = encrypted(receiver(db)); db.state.failInsert = true;
        const failure = await request(app).post(url).send(payload()).expect(503);
        expect(failure.headers['retry-after']).toBe('60'); expect(failure.text).not.toMatch(/DATOS_PRIVADOS|SELECT|INSERT/);
        expect(db.state.events).toHaveLength(0); db.state.failInsert = false;
        await request(app).post(url).send(payload()).expect(200);
        await request(app).post(url).send(payload()).expect(200);
        expect(db.state.events).toHaveLength(1);
    });
    test('TLS obligatorio, mínimo 1.2, sin listen implícito', () => {
        const fake = { listen: jest.fn() }, create = jest.spyOn(https, 'createServer').mockReturnValue(fake);
        try {
            expect(() => createFareHarborTlsServer({ receiver: () => {} })).toThrow('INGRESS_TLS_REQUIRED');
            createFareHarborTlsServer({ tls: { key: 'SYNTHETIC', cert: 'SYNTHETIC' }, receiver: () => {} });
            expect(create.mock.calls[0][0]).toMatchObject({ minVersion: 'TLSv1.2' }); expect(fake.listen).not.toHaveBeenCalled();
        } finally { create.mockRestore(); }
    });
});

test('los dos receptores alimentan el resumen existente de notificaciones, sin datos personales', async () => {
    const db = createDatabase(); db.state.sync = { last_history_id: 'h1' };
    const r = createGetYourGuideReceiver({ db, identity, enabled: true, getGmailClient: async () => gmail() });
    await r.runOnce(); await request(encrypted(receiver(db))).post(url).send(payload()).expect(200);
    const summary = await obtenerResumenNotificaciones(db, new Date('2027-01-01T00:00:00Z'));
    expect(summary.counts).toMatchObject({ pending: 2, actionable: 2 });
    expect(summary.events.map(e => e.provider)).toEqual(['getyourguide', 'fareharbor']);
    expect(JSON.stringify(summary)).not.toMatch(/Cliente|example.test|normalized_data/);
});

test('desktop y distribución no cargan los receptores ni permiten activar proveedores por entorno', () => {
    const root = path.resolve(__dirname, '../..');
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.scripts.desktop).toBe('electron .'); expect(pkg.build.files).toContain('!scripts/**/*');
    for (const relative of ['electron/main.js', 'electron/ownedBackend.js', 'backend/desktopChild.js', 'backend/server.js']) {
        expect(fs.readFileSync(path.join(root, relative), 'utf8')).not.toMatch(/scripts[\\/]integrations|createGetYourGuideReceiver|createFareHarborReceiver/);
    }
    const { cleanEnvironment, validateConfig } = require('../config/desktopPolicy');
    expect(() => cleanEnvironment({ FAREHARBOR_WEBHOOK_SECRET: secret })).toThrow();
    expect(() => validateConfig({ ...identity, DB_HOST: 'localhost', GYG_GMAIL_SYNC_ENABLED: 'true' })).toThrow();
});
