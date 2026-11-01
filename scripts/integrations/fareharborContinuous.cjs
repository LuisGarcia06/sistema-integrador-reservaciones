// Proceso independiente; importar este módulo no conecta ni publica servicios.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { TABLES } = require('../../backend/config/desktopSchema');
const prior = require('./fareharborSupervisor.cjs');
const SQL_HASH = '5dd8c57790aa368a3ce2d6be96e2f186db1fbc491e881e21fccbfa07e1bfb817';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fail = code => { throw Object.assign(Error(code), { code }); };
const read = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const delay = (ms, signal) => new Promise(resolve => {
    const timer = setTimeout(done, ms);
    function done() { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); }
    signal.addEventListener('abort', done, { once: true });
    if (signal.aborted) done();
});

function pending(config) {
    return [
        [config.enabled === true, 'RECEIVER_DISABLED'],
        [config.executionAuthorized === true, 'ACTIVATION_AUTHORIZATION'],
        [require('./fareharbor.cjs').isContinuousBookingScopeAuthorized(config) && config.exclusiveWebhookConfirmed === true, 'NEW_BOOKINGS_ONLY'],
        [config.webhookKeyConfirmedRegistered === true, 'REGISTERED_WEBHOOK_KEY'],
        [require('./fareharborCapturePolicy.cjs').captureAllowed(config),
        'CLOUD_CAPTURE_NOT_CONFIRMED'],
        [config.cloudFullCaptureDetectedActive !== true, 'CLOUD_CAPTURE_ACTIVE'],
        [config.newIndependentTokenConfirmed === true, 'INDEPENDENT_TOKEN']
    ].filter(([ok]) => !ok).map(([, code]) => code);
}

function loadPlan({ checkAcl = require('../../backend/config/windowsConfigAcl').checkAcl } = {}) {
    const directory = path.join(process.env.LOCALAPPDATA, 'CommunityTours', 'integrations', 'fareharbor');
    const filename = path.join(directory, 'continuous.json');
    checkAcl(filename);
    const config = read(filename);
    if (config.version !== 1 || config.mode !== 'continuous' || config.ngrokDomain !== prior.DOMAIN
        || config.bookingUuid != null || config.trialMarker != null || config.maxRuntimeMinutes != null
        || config.maxNewEvents != null || !Object.keys(config.sourceHashes || {}).length
        || config.autoApplyUserId != null && (!Number.isSafeInteger(config.autoApplyUserId) || config.autoApplyUserId <= 0)) fail('FH_CONTINUOUS_CONFIG');
    const repo = path.resolve(__dirname, '../..');
    if (repo !== path.join(directory, 'runtime') || config.runtimeRoot !== repo
        || config.dependencyRoot !== path.join(path.dirname(config.postgresConfigPath), 'node_modules')) fail('FH_CONTINUOUS_CONFIG');
    for (const packageName of ['pg', 'express', 'dotenv']) {
        const packageFile = path.join(config.dependencyRoot, packageName, 'package.json');
        checkAcl(packageFile);
        const resolved = require.resolve(packageName);
        if (!resolved.startsWith(config.dependencyRoot + path.sep)) fail('FH_DEPENDENCY_PATH');
    }
    const snapshots = new Map([[filename, hash(fs.readFileSync(filename))]]);
    for (const [relative, fingerprint] of Object.entries(config.sourceHashes)) {
        const file = path.resolve(repo, relative), rel = path.relative(repo, file);
        if (rel.startsWith('..') || path.isAbsolute(rel) || !/^[a-f0-9]{64}$/.test(fingerprint)
            || hash(fs.readFileSync(file)) !== fingerprint) fail('FH_SOURCE_CHANGED');
        snapshots.set(file, fingerprint);
    }
    const dbConfig = require('../../backend/config/desktopPolicy').readConfig(config.postgresConfigPath).config;
    require('../../backend/config/desktopConfiguration').initialize(dbConfig);
    const receiverModule = require('./fareharbor.cjs');
    const settings = receiverModule.loadFareHarborTrialSettings(filename, { continuous: true });
    prior.parseAgentConfig(fs.readFileSync(config.ngrokConfigPath, 'utf8'));
    const manifestFile = path.resolve(config.backupManifestPath || '');
    const backupRoot = path.join(process.env.LOCALAPPDATA, 'CommunityTours', 'backups', 'principal-final');
    if (path.dirname(path.dirname(manifestFile)) !== backupRoot || path.basename(manifestFile) !== 'backup-manifest.json') fail('FH_BACKUP_INVALID');
    const verificationFile = path.join(path.dirname(manifestFile), 'verification.json');
    for (const file of [manifestFile, verificationFile]) checkAcl(file);
    const manifest = read(manifestFile), verification = read(verificationFile);
    if (manifest.filename !== 'principal-017.backup') fail('FH_BACKUP_INVALID');
    const backupFile = path.join(path.dirname(manifestFile), manifest.filename);
    checkAcl(backupFile);
    if (manifest.status !== 'VERIFIED' || verification.status !== 'VERIFIED' || !verification.independentSha256Matched
        || manifest.sha256 !== config.backupSha256 || verification.sha256 !== config.backupSha256
        || hash(fs.readFileSync(backupFile)) !== config.backupSha256 || manifest.sharedSnapshot !== true
        || manifest.content?.restored !== false || manifest.restored !== false || manifest.migration017Sha256 !== SQL_HASH
        || manifest.identity?.database !== dbConfig.DB_NAME || manifest.identity?.cluster !== dbConfig.DB_CLUSTER_ID
        || JSON.stringify(manifest.inventory?.tables) !== JSON.stringify([...TABLES].sort())
        || hash(fs.readFileSync(path.join(repo, 'database/migrations/017_archivo_eventos_integracion.sql'))) !== SQL_HASH) fail('FH_BACKUP_INVALID');
    for (const file of [config.postgresConfigPath, config.ngrokConfigPath, config.webhookSecretFile,
        config.tls.keyFile, config.tls.certFile, config.tls.caCertFile, manifestFile, verificationFile, backupFile]) {
        snapshots.set(file, hash(fs.readFileSync(file)));
    }
    return { config, filename, settings, dbConfig, snapshots, manifest, receiverModule,
        args: [...receiverModule.buildFareHarborNgrokArgs({ configPath: config.ngrokConfigPath, caCertPath: config.tls.caCertFile }), '--url', 'https://' + prior.DOMAIN],
        ngrokExe: path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'ngrok.exe'),
        blockers: pending(config) };
}

function verifyFiles(plan) {
    for (const [file, fingerprint] of plan.snapshots) if (hash(fs.readFileSync(file)) !== fingerprint) fail('FH_CONFIG_CHANGED');
    const cert = new crypto.X509Certificate(plan.settings.tls.cert);
    if (Date.parse(cert.validTo) <= Date.now() || Date.parse(cert.validFrom) > Date.now()) fail('FH_TLS_EXPIRED');
}

async function verifyDatabase(plan, pool, { initial = false } = {}) {
    await require('../../backend/config/desktopPostgres').verifyPostgres(pool, { ...plan.dbConfig, DB_HOST: '127.0.0.1' });
    const db = await pool.connect();
    try {
        await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const permissions = (await db.query(`SELECT has_table_privilege(current_user,'public.eventos_integracion','INSERT') event_insert,
            has_sequence_privilege(current_user,pg_get_serial_sequence('public.eventos_integracion','id_evento_integracion'),'USAGE') sequence_usage`)).rows[0];
        if (!permissions?.event_insert || !permissions.sequence_usage) fail('FH_DATABASE_PERMISSIONS');
        if (initial) {
            for (const table of plan.manifest.inventory.tables) {
                if (!/^[a-z_]+$/.test(table)) fail('FH_BACKUP_INVALID');
                const rows = (await db.query('SELECT row_to_json(t)::text value FROM public."' + table + '" t ORDER BY to_jsonb(t)::text COLLATE "C"')).rows;
                if (rows.length !== plan.manifest.inventory.counts[table]
                    || hash(rows.map(r => r.value).join('\n')) !== plan.manifest.inventory.rowHashes[table]) fail('FH_BACKUP_CHANGED');
            }
            const acl = (await db.query("SELECT c.relname,c.relowner,c.relacl::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname")).rows;
            if (hash(JSON.stringify(acl)) !== plan.manifest.inventory.aclHash) fail('FH_BACKUP_CHANGED');
        }
        await db.query('ROLLBACK');
    } finally { await db.query('ROLLBACK').catch(() => {}); db.release(); }
}

// Sin cuerpos, cabeceras, URL, UUID o nombres: diagnóstico acotado de entregas.
function safeStatusWriter(directory) {
    let requests = 0;
    return (state, statusCode) => {
        if (state === 'request') requests++;
        const value = { version: 1, updatedAt: new Date().toISOString(), state, requests,
            ...(Number.isInteger(statusCode) ? { lastHttpStatus: statusCode } : {}) };
        fs.writeFileSync(path.join(directory, 'continuous-status.json'), JSON.stringify(value) + '\n', { mode: 0o600 });
    };
}

function adapters(plan) {
    const status = safeStatusWriter(path.dirname(plan.filename));
    return {
        files: () => verifyFiles(plan),
        listen: async () => {
            const nonce = crypto.randomBytes(24).toString('hex'), pathname = '/_fareharbor_ready/' + nonce;
            const receiver = plan.receiverModule.createFareHarborContinuousReceiver({ db: plan.pool,
                identity: { ...plan.dbConfig, DB_HOST: '127.0.0.1' }, secret: plan.settings.secret,
                enabled: true, creationsOnlyConfirmed: plan.config.creationsOnlyConfirmed,
                bookingChangesAuthorized: plan.config.bookingChangesAuthorized, autoApplyUserId: plan.config.autoApplyUserId });
            const server = plan.receiverModule.createFareHarborTlsServer({ tls: plan.settings.tls, receiver: (req, res) => {
                if (req.method === 'GET' && req.url === pathname && req.socket.encrypted === true) {
                    res.writeHead(200, { 'Cache-Control': 'no-store', 'X-CTSK-Continuous-Instance': nonce }); return res.end();
                }
                res.once('finish', () => { try { status('request', res.statusCode); } catch {} });
                receiver(req, res);
            } });
            server.requestTimeout = 15000; server.headersTimeout = 10000; server.keepAliveTimeout = 1000;
            await new Promise((resolve, reject) => {
                server.once('error', reject); server.listen({ host: '127.0.0.1', port: 3443, exclusive: true }, () => {
                    server.removeListener('error', reject); resolve();
                });
            });
            return { server, nonce, pathname, close: () => new Promise(resolve => {
                const timer = setTimeout(() => server.closeAllConnections(), 8000);
                server.close(() => { clearTimeout(timer); resolve(); }); server.closeIdleConnections();
            }) };
        },
        spawn: () => require('node:child_process').spawn(plan.ngrokExe, plan.args,
            { windowsHide: true, env: require('./backupMain017.cjs').environment(), stdio: 'ignore' }),
        probe: (server, signal) => new Promise(resolve => {
            const request = require('node:https').get({ hostname: prior.DOMAIN, port: 443, path: server.pathname,
                rejectUnauthorized: true, timeout: 2500, signal, headers: { 'User-Agent': 'ctsk-fareharbor-continuous/1' } }, res => {
                res.resume(); resolve(res.statusCode === 200 && res.headers['x-ctsk-continuous-instance'] === server.nonce);
            });
            request.once('timeout', () => request.destroy()); request.once('error', () => resolve(false));
        }),
        pause: delay,
        emit: code => { status(code); process.stdout.write(JSON.stringify({ code }) + '\n'); },
        end: () => plan.pool.end()
    };
}

function retryDelay(attempt) { return Math.min(900000, 1000 * 2 ** Math.min(attempt, 10)); }
async function stopChild(child) {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Object.assign(Error(), { code: 'FH_STOP_TIMEOUT' })), 8000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
        child.kill();
    });
}

async function supervise(plan, io, signal) {
    let server, child, attempts = 0, nextProbe = 0, failures = 0;
    try {
        io.files(); if (signal.aborted) return;
        server = await io.listen();
        let serverError = false; server.server.on('error', () => { serverError = true; });
        while (!signal.aborted) {
            io.files(); if (serverError) fail('FH_LISTENER_FAILED');
            if (!child || child.exitCode !== null || child.signalCode !== null || child.failed) {
                if (child) attempts = Math.max(1, attempts);
                await stopChild(child); child = null;
                if (attempts) { io.emit('FH_RECONNECTING'); await io.pause(retryDelay(attempts - 1), signal); }
                if (signal.aborted) break;
                io.files(); child = io.spawn(); child.once('error', () => { child.failed = true; });
                attempts++; failures = 0; nextProbe = 0;
            }
            if (Date.now() >= nextProbe) {
                const ready = await io.probe(server, signal);
                // Un sondeo sano cada 15 minutos consume ~2,880 peticiones/mes,
                // en vez de agotar las 20,000 del plan Free con sondeos cada 30s.
                nextProbe = Date.now() + (ready ? 900000 : Math.min(60000, 5000 * 2 ** failures));
                if (ready) { attempts = 0; failures = 0; io.emit('FH_CONTINUOUS_READY'); }
                else if (++failures >= 3) { await stopChild(child); child = null; attempts = Math.max(1, attempts); }
            }
            await io.pause(1000, signal);
        }
    } finally {
        try { await stopChild(child); } finally {
            try { await server?.close(); } finally { await io.end(); io.emit('FH_CONTINUOUS_STOPPED'); }
        }
    }
}

async function main() {
    const mode = process.argv[2];
    if (process.platform !== 'win32' || process.argv.length !== 3 || !['--validate', '--initial-validate', '--start'].includes(mode)) fail('FH_NOT_AUTHORIZED');
    const signal = new AbortController(), lines = require('node:readline').createInterface({ input: process.stdin });
    await new Promise((resolve, reject) => {
        lines.once('line', line => line === 'ARM' ? resolve() : reject(Error('FH_NOT_AUTHORIZED')));
        lines.once('close', () => { signal.abort(); reject(Error('FH_NOT_AUTHORIZED')); });
    });
    lines.on('line', line => { if (line === 'STOP') signal.abort(); }); lines.on('close', () => signal.abort());
    process.once('SIGINT', () => signal.abort()); process.once('SIGTERM', () => signal.abort());
    let plan, owned = false;
    try {
        plan = loadPlan();
        if (mode === '--start' && plan.blockers.length) fail(plan.blockers[0]);
        if (mode === '--start' && !plan.config.initialBackupVerifiedAt) fail('FH_INITIAL_BACKUP_REQUIRED');
        plan.pool = require('../../backend/config/database');
        await verifyDatabase(plan, plan.pool, { initial: mode === '--initial-validate' }); verifyFiles(plan);
        if (mode !== '--start') process.stdout.write(JSON.stringify({ code: 'FH_CONTINUOUS_VALIDATED_NO_SERVICES',
            pending: plan.blockers, databaseAndBackupVerified: true, initial: mode === '--initial-validate',
            automaticApplication: plan.config.autoApplyUserId !== null,
            tlsExpiresAt: new crypto.X509Certificate(plan.settings.tls.cert).validTo }) + '\n');
        else { owned = true; await supervise(plan, adapters(plan), signal.signal); }
    } finally { lines.close(); if (plan?.pool && !owned) await plan.pool.end(); }
}

const publicErrors = new Set(['FH_CONTINUOUS_CONFIG', 'FH_SOURCE_CHANGED', 'FH_BACKUP_INVALID', 'FH_BACKUP_CHANGED',
    'FH_DATABASE_PERMISSIONS', 'FH_CONFIG_CHANGED', 'FH_TLS_EXPIRED', 'FH_LISTENER_FAILED', 'FH_STOP_TIMEOUT',
    'ACTIVATION_AUTHORIZATION', 'RECEIVER_DISABLED', 'FH_DEPENDENCY_PATH', 'NEW_BOOKINGS_ONLY', 'REGISTERED_WEBHOOK_KEY', 'CLOUD_CAPTURE_NOT_CONFIRMED',
    'CLOUD_CAPTURE_ACTIVE', 'INDEPENDENT_TOKEN', 'FH_INITIAL_BACKUP_REQUIRED', 'PG_IDENTITY', 'PG_CLUSTER', 'PG_ROLE',
    'SCHEMA_INVALID', 'PG_UNAVAILABLE', 'CONFIG_ACL']);
if (require.main === module) main().catch(error => {
    process.stdout.write(JSON.stringify({ code: publicErrors.has(error.code) ? error.code : 'FH_CONTINUOUS_FAILED' }) + '\n'); process.exitCode = 1;
});
module.exports = { pending, loadPlan, verifyFiles, verifyDatabase, retryDelay, stopChild, supervise, adapters };
