// Solo el lanzador nuevo: sin puertos, procesos externos ni conexiones PostgreSQL.
const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../../scripts/integrations/fareharborSupervisor.cjs');
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
const yaml = 'version: "3"\nagent:\n  authtoken: "' + 'SYNTHETIC'.repeat(5) + '"\n  web_addr: false\n  inspect_db_size: -1\n  console_ui: false\n  log: "false"\n  update_check: false\n  remote_management: false\n';
const trial = { enabled: true, creationsOnlyConfirmed: true, freeNgrokPlanConfirmed: true, cloudFullCaptureConfirmedDisabled: true };
const authorization = { enabled: true, executionAuthorized: true, maxRuntimeMinutes: 15, exclusiveWebhookConfirmed: true,
    webhookKeyConfirmedRegistered: true, exposedAuthtokenRevocationConfirmed: true };
beforeEach(() => {
    jest.spyOn(require('node:child_process'), 'spawn').mockImplementation(() => { throw Error('REAL_PROCESS_FORBIDDEN'); });
    jest.spyOn(require('node:net').Server.prototype, 'listen').mockImplementation(() => { throw Error('REAL_LISTENER_FORBIDDEN'); });
    jest.spyOn(require('node:https'), 'get').mockImplementation(() => { throw Error('REAL_NETWORK_FORBIDDEN'); });
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

test('sin invocación explícita no hay procesos ni listeners', () => {
    expect(require('node:child_process').spawn).not.toHaveBeenCalled();
    expect(require('node:net').Server.prototype.listen).not.toHaveBeenCalled();
});
test('ngrok acepta únicamente configuración local sin captura ni endpoints adicionales', () => {
    expect(S.parseAgentConfig(yaml)).toBe(true);
    for (const bad of [yaml.replace('inspect_db_size: -1', 'inspect_db_size: 0'), yaml.replace('web_addr: false', 'web_addr: localhost:4040'),
        yaml + 'endpoints:\n', yaml + '  authtoken: duplicate\n', yaml + 'version: 3\n', yaml.replace('remote_management: false', 'remote_management: true')]) {
        expect(() => S.parseAgentConfig(bad)).toThrow('FH_NGROK_CONFIG');
    }
});
test.each([
    ['trial', 'enabled'], ['trial', 'cloudFullCaptureConfirmedDisabled'], ['trial', 'creationsOnlyConfirmed'], ['trial', 'freeNgrokPlanConfirmed'],
    ['supervisor', 'enabled'], ['supervisor', 'executionAuthorized'], ['supervisor', 'exclusiveWebhookConfirmed'],
    ['supervisor', 'webhookKeyConfirmedRegistered'], ['supervisor', 'exposedAuthtokenRevocationConfirmed']
])('ninguna autorización se presupone: %s.%s', (part, field) => {
    const t = { ...trial }, a = { ...authorization }; (part === 'trial' ? t : a)[field] = false;
    expect(S.pendingAuthorizations(t, a).length).toBeGreaterThan(0);
    expect(S.pendingAuthorizations(trial, authorization)).toEqual([]);
});

function databaseFixture({ changed = false, registered = false, permissions = true } = {}) {
    const row = { value: '{"synthetic":true}' }, inventory = { tables: ['reservaciones'], counts: { reservaciones: 1 },
        rowHashes: { reservaciones: hash(row.value) }, aclHash: hash('[]') };
    const db = { release: jest.fn(), query: jest.fn(async sql => {
        if (/ORDER BY id_evento_integracion LIMIT 2/.test(sql)) return { rows: registered ? [{ id_evento_integracion: 9001,
            event_type: 'new_booking', review_status: 'pending_review', application_status: 'not_applied' }] : [] };
        if (/SELECT id_reservacion FROM public.reservas_integracion_link/.test(sql)) return { rows: [] };
        if (/count\(\*\)::int/.test(sql)) return { rows: [{ count: 0 }] };
        if (/row_to_json/.test(sql)) return { rows: changed ? [] : [row] };
        if (/SELECT c.relname,c.relowner/.test(sql)) return { rows: [] };
        if (/has_table_privilege/.test(sql)) return { rows: [{ event_insert: permissions, sequence_usage: permissions }] };
        if (/^(BEGIN|ROLLBACK)/.test(sql)) return { rows: [] };
        throw Error('UNEXPECTED_QUERY');
    }) };
    return { db, pool: { connect: jest.fn(async () => db) }, plan: { config: {}, manifest: { inventory } } };
}
test('preflight del lanzador es READ ONLY y compara todas las huellas sin consumir secuencias', async () => {
    const f = databaseFixture(), verify = jest.fn(async () => {});
    await S.verifyDatabaseAndBackup(f.plan, f.pool, verify);
    expect(verify).toHaveBeenCalled(); expect(f.db.release).toHaveBeenCalled();
    expect(f.db.query.mock.calls[0][0]).toMatch(/BEGIN.*READ ONLY/);
    expect(f.db.query.mock.calls.some(([sql]) => /^\s*(INSERT|UPDATE|DELETE)\b|\b(nextval|setval)\s*\(/.test(sql))).toBe(false);
});
test.each([
    [{ changed: true }, 'FH_BACKUP_CHANGED'], [{ registered: true }, 'FH_ALREADY_REGISTERED'],
    [{ permissions: false }, 'FH_DATABASE_PERMISSIONS']
])('preflight detiene estados incompatibles sin escribir: %j', async (options, code) => {
    const f = databaseFixture(options);
    await expect(S.verifyDatabaseAndBackup(f.plan, f.pool, async () => {})).rejects.toThrow(code);
    expect(f.db.release).toHaveBeenCalled(); expect(f.db.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
});
test('una identidad PostgreSQL incorrecta impide el resto del preflight', async () => {
    const f = databaseFixture(); await expect(S.verifyDatabaseAndBackup(f.plan, f.pool, async () => { throw Object.assign(Error(), { code: 'PG_CLUSTER' }); })).rejects.toMatchObject({ code: 'PG_CLUSTER' });
    expect(f.pool.connect).not.toHaveBeenCalled();
});

function coordinationFixture() {
    const signal = new AbortController(), child = new EventEmitter(), server = new EventEmitter();
    child.exitCode = null; child.signalCode = null; child.kill = jest.fn();
    const io = { files: jest.fn(), listen: jest.fn(async () => ({ server, close: io.close })), close: jest.fn(async () => {}),
        spawn: jest.fn(() => child), probe: jest.fn(async () => true),
        poll: jest.fn(async () => { signal.abort(); return null; }), end: jest.fn(async () => {}), emit: jest.fn() };
    return { io, child, server, signal, plan: { supervisor: { maxRuntimeMinutes: 1 } } };
}
async function complete(promise) { await jest.runAllTimersAsync(); return promise; }
test('arranca TLS antes de ngrok y STOP cierra solo el hijo propio, servidor y pool', async () => {
    jest.useFakeTimers(); const f = coordinationFixture(); await complete(S.supervise(f.plan, f.io, f.signal.signal));
    expect(f.io.listen.mock.invocationCallOrder[0]).toBeLessThan(f.io.spawn.mock.invocationCallOrder[0]);
    expect(f.io.emit).toHaveBeenCalledWith('FH_READY'); expect(f.child.kill).toHaveBeenCalledTimes(1);
    expect(f.io.close).toHaveBeenCalledTimes(1); expect(f.io.end).toHaveBeenCalledTimes(1);
});
test('3443 ocupado no inicia ngrok ni termina procesos ajenos', async () => {
    const f = coordinationFixture(); f.io.listen.mockRejectedValue(Object.assign(Error(), { code: 'FH_PORT_OCCUPIED' }));
    await expect(S.supervise(f.plan, f.io, f.signal.signal)).rejects.toThrow('FH_PORT_OCCUPIED');
    expect(f.io.spawn).not.toHaveBeenCalled(); expect(f.child.kill).not.toHaveBeenCalled(); expect(f.io.end).toHaveBeenCalled();
});
test('fallo al crear el túnel cierra HTTPS y PostgreSQL', async () => {
    const f = coordinationFixture(); f.io.spawn.mockImplementation(() => { throw Error('private token must never be logged'); });
    await expect(S.supervise(f.plan, f.io, f.signal.signal)).rejects.toThrow('FH_SUPERVISOR_FAILED');
    expect(f.io.close).toHaveBeenCalled(); expect(f.io.end).toHaveBeenCalled();
    expect(JSON.stringify(f.io.emit.mock.calls)).not.toContain('private token');
});
test('salida inesperada de ngrok impide declarar la conexión lista', async () => {
    jest.useFakeTimers(); const f = coordinationFixture();
    f.io.probe.mockImplementation(async () => { f.child.emit('exit', 1); return false; });
    const assertion = expect(S.supervise(f.plan, f.io, f.signal.signal)).rejects.toThrow('FH_TUNNEL_FAILED');
    await complete(assertion); expect(f.io.emit).not.toHaveBeenCalledWith('FH_READY'); expect(f.io.close).toHaveBeenCalled();
});
test('no basta con que ngrok exista: la ruta pública debe confirmar la instancia TLS propia', async () => {
    jest.useFakeTimers(); const f = coordinationFixture(); f.io.probe.mockResolvedValue(false);
    const assertion = expect(S.supervise(f.plan, f.io, f.signal.signal)).rejects.toThrow('FH_PUBLIC_ROUTE_FAILED');
    await complete(assertion); expect(f.child.kill).toHaveBeenCalled(); expect(f.io.emit).not.toHaveBeenCalledWith('FH_READY');
});
test('el monitor informa solamente el ID del evento pendiente y no lo aplica', async () => {
    jest.useFakeTimers(); const f = coordinationFixture(); f.io.poll.mockImplementation(async () => { f.signal.abort(); return { id_evento_integracion: 9001 }; });
    await complete(S.supervise(f.plan, f.io, f.signal.signal)); expect(f.io.emit).toHaveBeenCalledWith('FH_EVENT_PENDING', 9001);
});
test('modificar la configuración durante la ventana cierra ambos componentes', async () => {
    jest.useFakeTimers(); const f = coordinationFixture();
    f.io.files.mockImplementationOnce(() => {}).mockImplementationOnce(() => {}).mockImplementation(() => { throw Object.assign(Error(), { code: 'FH_CONFIG_CHANGED' }); });
    const assertion = expect(S.supervise(f.plan, f.io, f.signal.signal)).rejects.toThrow('FH_CONFIG_CHANGED');
    await complete(assertion); expect(f.child.kill).toHaveBeenCalled(); expect(f.io.close).toHaveBeenCalled();
});
test('una parada anterior al arranque no abre siquiera el listener', async () => {
    const f = coordinationFixture(); f.signal.abort(); await S.supervise(f.plan, f.io, f.signal.signal);
    expect(f.io.listen).not.toHaveBeenCalled(); expect(f.io.spawn).not.toHaveBeenCalled();
});
test('se cierra al vencer la ventana, sin sincronización permanente', async () => {
    jest.useFakeTimers(); const f = coordinationFixture(); f.io.poll.mockResolvedValue(null);
    await complete(S.supervise(f.plan, f.io, f.signal.signal)); expect(f.io.emit).toHaveBeenCalledWith('FH_WINDOW_FINISHED');
});
test('el adaptador utiliza solo 127.0.0.1:3443 y el receptor restringido existente', async () => {
    const server = new EventEmitter(); server.listen = jest.fn((options, callback) => callback());
    const receiverModule = { createFareHarborTrialReceiver: jest.fn(() => () => {}), createFareHarborTlsServer: jest.fn(() => server) };
    const plan = { config: {}, trial: { ngrokConfigPath: 'C:\\synthetic\\ngrok.yml' }, supervisor: {},
        settings: { secret: 'SYNTHETIC', tls: {} }, receiverModule, pool: {} };
    await S.runtimeAdapters(plan).listen();
    expect(server.listen).toHaveBeenCalledWith({ host: '127.0.0.1', port: 3443, exclusive: true }, expect.any(Function));
    expect(receiverModule.createFareHarborTrialReceiver).toHaveBeenCalledWith(expect.objectContaining({ bookingUuid: S.UUID, enabled: true, creationsOnlyConfirmed: true }));
    expect(JSON.stringify(server.listen.mock.calls)).not.toMatch(/3000|5432|0\.0\.0\.0/);
});
test('errores privados se reducen a códigos conocidos', () => {
    expect(S.safeCode(Error('token=PRIVATE customer=PRIVATE'))).toBe('FH_SUPERVISOR_FAILED');
});

test('activación por etapas conserva Full Capture desconocido y la recepción bloqueada', () => {
    const t = { ...trial, enabled: false, cloudFullCaptureConfirmedDisabled: false, creationsOnlyConfirmed: false };
    const a = { ...authorization, awaitingAdminKey: true, receiptBlockedUntilAdminConfirmation: true,
        cloudCaptureUnknownAuthorized: true, useNewIndependentTokenAuthorized: true,
        webhookKeyConfirmedRegistered: false, exposedAuthtokenRevocationConfirmed: false };
    expect(S.pendingAuthorizations(t, a)).toEqual([]);
    expect(t.cloudFullCaptureConfirmedDisabled).toBe(false);
    expect(t.enabled).toBe(false);
    expect(S.pendingAuthorizations(t, { ...a, cloudFullCaptureDetectedActive: true })).toContain('CLOUD_FULL_CAPTURE_DISABLED');
    expect(S.pendingAuthorizations(t, { ...a, cloudCaptureUnknownAuthorized: false })).toContain('CLOUD_FULL_CAPTURE_DISABLED');
    expect(S.pendingAuthorizations({ ...t, enabled: true }, a)).toContain('CLOUD_FULL_CAPTURE_DISABLED');
});

test('activación por etapas no habilita el procesador antes de confirmar KEY y solo altas', async () => {
    const server = new EventEmitter(); server.listen = jest.fn((options, callback) => callback());
    const disabled = jest.fn();
    const receiverModule = { createFareHarborTrialReceiver: jest.fn(() => disabled), createFareHarborTlsServer: jest.fn(() => server) };
    const control = { version: 1, sessionId: 'SYNTHETIC_SESSION', bookingUuid: S.UUID,
        receiptAuthorized: false, creationsOnlyConfirmed: false, webhookKeyConfirmedRegistered: false };
    jest.spyOn(require('../config/windowsConfigAcl'), 'checkAcl').mockImplementation(() => {});
    jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from(JSON.stringify(control)));
    const plan = { config: {}, settings: { secret: 'SYNTHETIC', tls: {} }, trial: { ngrokConfigPath: path.join(process.env.LOCALAPPDATA, 'synthetic.yml') },
        supervisor: { awaitingAdminKey: true, sessionId: control.sessionId }, receiverModule, pool: {} };
    await S.runtimeAdapters(plan).listen();
    expect(receiverModule.createFareHarborTrialReceiver).toHaveBeenCalledTimes(1);
    expect(receiverModule.createFareHarborTrialReceiver).toHaveBeenCalledWith(expect.objectContaining({ enabled: false, bookingUuid: S.UUID }));
});

function privateFilesFixture() {
    const directory = path.join(process.env.LOCALAPPDATA, 'CommunityTours', 'integrations', 'fareharbor');
    const backupDirectory = path.join(process.env.LOCALAPPDATA, 'CommunityTours', 'backups', 'principal-final', 'run-synthetic');
    const backup = Buffer.from('PGDMP_SYNTHETIC'), backupHash = hash(backup);
    const sqlFile = path.resolve(__dirname, '../../database/migrations/017_archivo_eventos_integracion.sql');
    const sqlBytes = fs.readFileSync(sqlFile);
    const config = { DB_NAME: 'sian_kaan_reservaciones', DB_CLUSTER_ID: '7632825987452064788' };
    const t = { ...trial, enabled: false, bookingUuid: S.UUID, ngrokDomain: S.DOMAIN, postgresConfigPath: path.join(directory, 'synthetic.env'),
        ngrokConfigPath: path.join(directory, 'ngrok.yml'), webhookSecretFile: path.join(directory, 'webhook-secret.txt'),
        tls: { keyFile: path.join(directory, 'key.pem'), certFile: path.join(directory, 'cert.pem'), caCertFile: path.join(directory, 'cert.pem') } };
    const a = { ...authorization, version: 1, enabled: false, executionAuthorized: false, backupManifestPath: path.join(backupDirectory, 'backup-manifest.json'), backupSha256: backupHash };
    const manifest = { status: 'VERIFIED', filename: 'principal-017.backup', sha256: backupHash, sharedSnapshot: true, restored: false,
        content: { restored: false }, identity: { database: config.DB_NAME, cluster: config.DB_CLUSTER_ID },
        migration017Sha256: hash(sqlBytes), inventory: { tables: [...require('../config/desktopSchema').TABLES].sort() } };
    const files = new Map([
        [path.join(directory, 'trial.json'), JSON.stringify(t)], [path.join(directory, 'supervisor.json'), JSON.stringify(a)],
        [a.backupManifestPath, JSON.stringify(manifest)], [path.join(backupDirectory, 'verification.json'), JSON.stringify({ status: 'VERIFIED', independentSha256Matched: true, sha256: backupHash })],
        [path.join(backupDirectory, 'principal-017.backup'), backup], [sqlFile, sqlBytes], [t.ngrokConfigPath, yaml],
        [t.postgresConfigPath, 'SYNTHETIC_CONFIG'], [t.webhookSecretFile, 'SYNTHETIC_KEY'], [t.tls.keyFile, 'SYNTHETIC_KEY'], [t.tls.certFile, 'SYNTHETIC_CERT']
    ]);
    jest.spyOn(fs, 'readFileSync').mockImplementation((file, encoding) => {
        if (!files.has(file)) throw Error('UNEXPECTED_PRIVATE_READ');
        return encoding ? files.get(file).toString() : Buffer.from(files.get(file));
    });
    const deps = { checkAcl: jest.fn(), readConfig: jest.fn(() => ({ config })), initialize: jest.fn(), receiverModule: {
        loadFareHarborTrialSettings: jest.fn(() => ({ listen: { host: '127.0.0.1', port: 3443 }, secret: 'SYNTHETIC_KEY', tls: {} })),
        buildFareHarborNgrokArgs: jest.fn(() => ['http', 'https://127.0.0.1:3443', '--inspect=false', '--upstream-tls-verify']) } };
    return { files, deps, t, a, manifest, backupDirectory, directory };
}
test('plan privado conserva UUID, dominio, TLS y respaldo; no utiliza argumentos arbitrarios', () => {
    const f = privateFilesFixture(), plan = S.loadPrivatePlan(f.deps);
    expect(plan.trial.bookingUuid).toBe(S.UUID);
    expect(plan.args).toContain('--url'); expect(plan.args.at(-1)).toBe('https://' + S.DOMAIN);
    expect(plan.args[1]).toBe('https://127.0.0.1:3443'); expect(f.deps.checkAcl).toHaveBeenCalled();
    expect(plan.pending).toContain('ACTIVATION_AUTHORIZATION');
    expect(require('node:child_process').spawn).not.toHaveBeenCalled();
});
test.each(['uuid', 'domain', 'backup', 'acl', 'outside', 'migration'])('plan se detiene por configuración o respaldo incompatible: %s', kind => {
    const f = privateFilesFixture();
    if (kind === 'uuid') f.t.bookingUuid = '00000000-0000-0000-0000-000000000000';
    if (kind === 'domain') f.t.ngrokDomain = 'another.example';
    if (kind === 'backup') f.files.set(path.join(f.backupDirectory, 'principal-017.backup'), 'TAMPERED');
    if (kind === 'migration') { f.manifest.migration017Sha256 = '0'.repeat(64); f.files.set(f.a.backupManifestPath, JSON.stringify(f.manifest)); }
    if (kind === 'acl') f.deps.checkAcl.mockImplementation(() => { throw Object.assign(Error('CONFIG_ACL'), { code: 'CONFIG_ACL' }); });
    if (kind === 'outside') { f.a.backupManifestPath = path.join(f.directory, 'backup-manifest.json'); f.files.set(path.join(f.directory, 'supervisor.json'), JSON.stringify(f.a)); }
    f.files.set(path.join(f.directory, 'trial.json'), JSON.stringify(f.t));
    expect(() => S.loadPrivatePlan(f.deps)).toThrow();
    expect(require('node:child_process').spawn).not.toHaveBeenCalled();
});
