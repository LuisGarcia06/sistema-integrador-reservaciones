// Inicio explícito desde el supervisor Windows. Importar este archivo no abre servicios.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { TABLES } = require('../../backend/config/desktopSchema');
const UUID = '9814289b-b601-4236-8feb-c9e29102e76d';
const DOMAIN = 'fleshed-patchy-cassette.ngrok-free.dev';
const SQL_HASH = '5dd8c57790aa368a3ce2d6be96e2f186db1fbc491e881e21fccbfa07e1bfb817';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const ident = name => { if (!/^[a-z_][a-z0-9_]*$/.test(name)) fail('FH_BACKUP_INVALID'); return '"' + name + '"'; };
const readJson = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const markerSelection = selection => selection?.selectionMode === 'contact_name_marker';
const selectionValue = selection => markerSelection(selection) ? selection.trialMarker : selection?.bookingUuid || UUID;
const safeCodes = new Set(['FH_PRIVATE_CONFIG', 'FH_NGROK_CONFIG', 'FH_NOT_AUTHORIZED', 'FH_BACKUP_INVALID',
    'FH_BACKUP_CHANGED', 'FH_ALREADY_REGISTERED', 'FH_DATABASE_PERMISSIONS', 'FH_PORT_OCCUPIED',
    'FH_TUNNEL_FAILED', 'FH_PUBLIC_ROUTE_FAILED', 'FH_CONFIG_CHANGED', 'FH_EVENT_STATE', 'FH_STOP_TIMEOUT',
    'PG_IDENTITY', 'PG_CLUSTER', 'PG_ROLE', 'SCHEMA_INVALID', 'CONFIG_ACL', 'CONFIG_CHANGED', 'PG_UNAVAILABLE']);
const safeCode = error => safeCodes.has(error?.code) ? error.code : 'FH_SUPERVISOR_FAILED';

function parseAgentConfig(text) {
    const options = new Map();
    let version = 0, agent = 0;
    for (const line of text.split(/\r?\n/)) {
        if (!line.trim() || /^\s*#/.test(line)) continue;
        if (/^version: ["']?3["']?\s*$/.test(line)) { version++; continue; }
        if (/^agent:\s*$/.test(line)) { agent++; continue; }
        const entry = /^  (authtoken|web_addr|inspect_db_size|console_ui|log|update_check|remote_management):\s*(\S+)\s*$/.exec(line);
        if (!entry || options.has(entry[1])) fail('FH_NGROK_CONFIG');
        options.set(entry[1], entry[2].replace(/^["']|["']$/g, ''));
    }
    if (version !== 1 || agent !== 1 || !/^[-_A-Za-z0-9]{20,512}$/.test(options.get('authtoken') || '')
        || options.get('inspect_db_size') !== '-1'
        || ['web_addr', 'console_ui', 'log', 'update_check', 'remote_management'].some(k => options.get(k) !== 'false')) fail('FH_NGROK_CONFIG');
    // No devolver el token ni incorporarlo a argumentos o mensajes.
    return true;
}

function pendingAuthorizations(trial, supervisor) {
    const staged = supervisor.awaitingAdminKey === true && trial.enabled === false
        && supervisor.receiptBlockedUntilAdminConfirmation === true;
    return [
        [(trial.enabled === true || staged) && supervisor.enabled === true && supervisor.executionAuthorized === true, 'ACTIVATION_AUTHORIZATION'],
        [supervisor.cloudFullCaptureDetectedActive !== true && (trial.cloudFullCaptureConfirmedDisabled === true
            || staged && supervisor.cloudCaptureUnknownAuthorized === true), 'CLOUD_FULL_CAPTURE_DISABLED'],
        [trial.creationsOnlyConfirmed === true || staged, 'NEW_BOOKINGS_ONLY'],
        [trial.freeNgrokPlanConfirmed === true, 'FREE_PLAN'],
        [supervisor.exclusiveWebhookConfirmed === true, 'EXCLUSIVE_WEBHOOK'],
        [!markerSelection(trial) || trial.markerPayloadCompatibleConfirmed === true, 'MARKER_FIELD_IN_WEBHOOK'],
        [supervisor.webhookKeyConfirmedRegistered === true || staged, 'REGISTERED_WEBHOOK_KEY'],
        [supervisor.exposedAuthtokenRevocationConfirmed === true || staged && supervisor.useNewIndependentTokenAuthorized === true, 'EXPOSED_AUTHTOKEN_REVOKED']
    ].filter(([ok]) => !ok).map(([, name]) => name);
}

function loadPrivatePlan(deps = {}) {
    const acl = deps.checkAcl || require('../../backend/config/windowsConfigAcl').checkAcl;
    const directory = path.join(process.env.LOCALAPPDATA, 'CommunityTours', 'integrations', 'fareharbor');
    const trialFile = path.join(directory, 'trial.json'), supervisorFile = path.join(directory, 'supervisor.json');
    for (const file of [trialFile, supervisorFile]) acl(file);
    const trial = readJson(trialFile), supervisor = readJson(supervisorFile);
    const selectorValid = markerSelection(trial)
        ? trial.bookingUuid === null && trial.markerField === 'booking.contact.name' && /^CTSK-FH-TEST-[A-F0-9]{32}$/.test(trial.trialMarker || '')
        : trial.bookingUuid === UUID;
    if (!selectorValid || trial.ngrokDomain !== DOMAIN || supervisor.version !== 1
        || !Number.isInteger(supervisor.maxRuntimeMinutes) || supervisor.maxRuntimeMinutes < 1 || supervisor.maxRuntimeMinutes > 30) fail('FH_PRIVATE_CONFIG');
    if (supervisor.enabled === true && supervisor.awaitingAdminKey === true && (!/^[a-f0-9-]{36}$/i.test(supervisor.sessionId || '')
        || !Number.isFinite(Date.parse(supervisor.activationExpiresAt))
        || Date.parse(supervisor.activationExpiresAt) <= Date.now()
        || Date.parse(supervisor.activationExpiresAt) > Date.now() + 15 * 60000)) fail('FH_NOT_AUTHORIZED');
    // Inicializar la conexión central solo en este proceso independiente, antes de importar servicios.
    const config = (deps.readConfig || require('../../backend/config/desktopPolicy').readConfig)(trial.postgresConfigPath).config;
    (deps.initialize || require('../../backend/config/desktopConfiguration').initialize)(config);
    const receiverModule = deps.receiverModule || require('./fareharbor.cjs');
    const settings = receiverModule.loadFareHarborTrialSettings(trialFile);
    parseAgentConfig(fs.readFileSync(trial.ngrokConfigPath, 'utf8'));
    if (settings.listen.host !== '127.0.0.1' || settings.listen.port !== 3443) fail('FH_PRIVATE_CONFIG');
    const backupBase = path.join(process.env.LOCALAPPDATA, 'CommunityTours', 'backups', 'principal-final');
    const backupManifest = path.resolve(supervisor.backupManifestPath || '');
    if (path.dirname(path.dirname(backupManifest)) !== backupBase || path.basename(backupManifest) !== 'backup-manifest.json'
        || !/^[a-f0-9]{64}$/.test(supervisor.backupSha256 || '')) fail('FH_BACKUP_INVALID');
    const manifestDir = path.dirname(backupManifest), verificationFile = path.join(manifestDir, 'verification.json');
    for (const file of [backupManifest, verificationFile]) acl(file);
    const manifest = readJson(backupManifest), verification = readJson(verificationFile);
    if (manifest.filename !== 'principal-017.backup') fail('FH_BACKUP_INVALID');
    const backupFile = path.join(manifestDir, manifest.filename);
    acl(backupFile);
    if (manifest.status !== 'VERIFIED' || verification.status !== 'VERIFIED' || verification.independentSha256Matched !== true
        || manifest.sha256 !== supervisor.backupSha256 || verification.sha256 !== manifest.sha256
        || hash(fs.readFileSync(backupFile)) !== manifest.sha256 || manifest.sharedSnapshot !== true
        || manifest.content?.restored !== false || manifest.restored !== false || manifest.migration017Sha256 !== SQL_HASH
        || manifest.identity?.database !== config.DB_NAME || manifest.identity.cluster !== config.DB_CLUSTER_ID
        || JSON.stringify(manifest.inventory?.tables) !== JSON.stringify([...TABLES].sort())) fail('FH_BACKUP_INVALID');
    if (hash(fs.readFileSync(path.join(__dirname, '../../database/migrations/017_archivo_eventos_integracion.sql'))) !== SQL_HASH) fail('FH_BACKUP_INVALID');
    const snapshots = new Map();
    for (const file of [trialFile, supervisorFile, trial.postgresConfigPath, trial.ngrokConfigPath, trial.webhookSecretFile,
        trial.tls.keyFile, trial.tls.certFile, trial.tls.caCertFile, backupFile, backupManifest, verificationFile]) snapshots.set(file, hash(fs.readFileSync(file)));
    const args = [...receiverModule.buildFareHarborNgrokArgs({ configPath: trial.ngrokConfigPath, caCertPath: trial.tls.caCertFile }), '--url', 'https://' + DOMAIN];
    return { trial, supervisor, config, settings, manifest, snapshots, receiverModule, args,
        pending: pendingAuthorizations(trial, supervisor),
        ngrokExe: path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'ngrok.exe') };
}

function verifyFiles(plan) {
    for (const [file, fingerprint] of plan.snapshots) if (hash(fs.readFileSync(file)) !== fingerprint) fail('FH_CONFIG_CHANGED');
    const cert = new crypto.X509Certificate(plan.settings.tls.cert);
    if (Date.parse(cert.validTo) <= Date.now()) fail('FH_CONFIG_CHANGED');
}

async function readTrialState(db, selection) {
    const predicate = markerSelection(selection) ? "normalized_data #>> '{contact,name}'=$2" : 'lower(external_booking_id)=lower($2)';
    const events = (await db.query(`SELECT id_evento_integracion,external_booking_id,event_type,review_status,application_status,archived_at
        FROM public.eventos_integracion WHERE provider=$1 AND ${predicate}
        ORDER BY id_evento_integracion LIMIT 2`, ['fareharbor', selectionValue(selection)])).rows;
    const selectedUuid = markerSelection(selection) ? events[0]?.external_booking_id : selectionValue(selection);
    const links = selectedUuid ? (await db.query('SELECT id_reservacion FROM public.reservas_integracion_link WHERE provider=$1 AND lower(external_booking_id)=lower($2)', ['fareharbor', selectedUuid])).rows : [];
    if (links.length || events.length > 1 || markerSelection(selection) && events.some(e => e.external_booking_id?.toLowerCase() === UUID)
        || events.some(e => e.event_type !== 'new_booking' || e.review_status !== 'pending_review'
        || e.application_status !== 'not_applied' || e.archived_at)) fail('FH_EVENT_STATE');
    return events[0] || null;
}

async function verifyDatabaseAndBackup(plan, pool, verify = require('../../backend/config/desktopPostgres').verifyPostgres) {
    await verify(pool, { ...plan.config, DB_HOST: '127.0.0.1' });
    const db = await pool.connect();
    try {
        await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        if (await readTrialState(db, plan.trial)) fail('FH_ALREADY_REGISTERED');
        // Buscar también referencias capturadas manualmente o contenidas en payloads antiguos.
        for (const table of ['reservaciones', 'eventos_integracion', 'reservas_integracion_link']) {
            const result = await db.query('SELECT count(*)::int AS count FROM public.' + ident(table)
                + ' t WHERE position(lower($1) in lower(to_jsonb(t)::text))>0', [selectionValue(plan.trial)]);
            if (result.rows[0]?.count !== 0) fail('FH_ALREADY_REGISTERED');
        }
        const inventory = plan.manifest.inventory;
        for (const table of inventory.tables) {
            const rows = (await db.query('SELECT row_to_json(t)::text value FROM public.' + ident(table)
                + ' t ORDER BY to_jsonb(t)::text COLLATE "C"')).rows;
            if (rows.length !== inventory.counts[table] || hash(rows.map(r => r.value).join('\n')) !== inventory.rowHashes[table]) fail('FH_BACKUP_CHANGED');
        }
        const acl = (await db.query("SELECT c.relname,c.relowner,c.relacl::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname")).rows;
        if (hash(JSON.stringify(acl)) !== inventory.aclHash) fail('FH_BACKUP_CHANGED');
        const permissions = (await db.query(`SELECT has_table_privilege(current_user,'public.eventos_integracion','INSERT') event_insert,
            has_sequence_privilege(current_user,pg_get_serial_sequence('public.eventos_integracion','id_evento_integracion'),'USAGE') sequence_usage`)).rows[0];
        if (!permissions?.event_insert || !permissions.sequence_usage) fail('FH_DATABASE_PERMISSIONS');
        await db.query('ROLLBACK');
    } finally { await db.query('ROLLBACK').catch(() => {}); db.release(); }
}

function probePublicRoute({ hostname, pathname, nonce, signal }) {
    return new Promise((resolve, reject) => {
        const req = require('node:https').get({ hostname, port: 443, path: pathname, signal,
            rejectUnauthorized: true, timeout: 2500, headers: { 'User-Agent': 'ctsk-fareharbor-supervisor/1' } }, res => {
            res.resume();
            resolve(res.statusCode === 200 && res.headers['x-ctsk-trial-instance'] === nonce);
        });
        req.once('timeout', () => req.destroy()); req.once('error', reject);
    });
}

function runtimeAdapters(plan) {
    const controlPath = path.join(path.dirname(plan.trial.ngrokConfigPath), 'trial-control.json');
    let receiver, disabledReceiver, enabledReceiver, controlHash;
    const createReceiver = enabled => {
        const options = { db: plan.pool, identity: { ...plan.config, DB_HOST: '127.0.0.1' }, secret: plan.settings.secret,
            enabled, creationsOnlyConfirmed: enabled };
        return markerSelection(plan.trial)
            ? plan.receiverModule.createFareHarborMarkerTrialReceiver({ ...options, marker: plan.trial.trialMarker,
                windowStart: plan.supervisor.authorizationRecordedAt, windowEnd: plan.supervisor.activationExpiresAt })
            : plan.receiverModule.createFareHarborTrialReceiver({ ...options, bookingUuid: selectionValue(plan.trial) });
    };
    const refreshReceiptGate = () => {
        if (plan.supervisor?.awaitingAdminKey !== true) return;
        const bytes = fs.readFileSync(controlPath), fingerprint = hash(bytes);
        if (fingerprint === controlHash) return;
        require('../../backend/config/windowsConfigAcl').checkAcl(controlPath);
        const control = JSON.parse(bytes);
        const scopeMatches = markerSelection(plan.trial)
            ? control.bookingUuid === null && control.selectionMode === 'contact_name_marker' && control.trialMarker === plan.trial.trialMarker
            : control.bookingUuid === selectionValue(plan.trial);
        if (control.version !== 1 || control.sessionId !== plan.supervisor.sessionId || !scopeMatches
            || control.cloudFullCaptureDetectedActive === true) fail('FH_NOT_AUTHORIZED');
        const authorized = control.receiptAuthorized === true && control.creationsOnlyConfirmed === true
            && control.webhookKeyConfirmedRegistered === true;
        if (authorized && !enabledReceiver) {
            enabledReceiver = createReceiver(true);
            process.stdout.write(JSON.stringify({ code: 'FH_RECEIPT_ENABLED' }) + '\n');
        }
        receiver = authorized ? enabledReceiver : disabledReceiver;
        controlHash = fingerprint;
    };
    return {
        files: () => verifyFiles(plan),
        listen: async () => {
            const nonce = crypto.randomBytes(24).toString('hex'), pathname = '/_fareharbor_trial_ready/' + nonce;
            disabledReceiver = createReceiver(plan.supervisor?.awaitingAdminKey !== true);
            receiver = disabledReceiver;
            refreshReceiptGate();
            const handler = (req, res) => {
                if (req.method === 'GET' && req.url === pathname && req.socket.encrypted === true) {
                    res.writeHead(200, { 'Cache-Control': 'no-store', 'X-CTSK-Trial-Instance': nonce }); res.end();
                } else receiver(req, res);
            };
            const server = plan.receiverModule.createFareHarborTlsServer({ tls: plan.settings.tls, receiver: handler });
            server.requestTimeout = 15000; server.headersTimeout = 10000; server.keepAliveTimeout = 1000;
            await new Promise((resolve, reject) => {
                server.once('error', reject); server.listen({ host: '127.0.0.1', port: 3443, exclusive: true }, () => {
                    server.removeListener('error', reject); resolve();
                });
            }).catch(error => { if (error.code === 'EADDRINUSE') fail('FH_PORT_OCCUPIED'); throw error; });
            return { server, nonce, pathname, close: () => new Promise((resolve, reject) => {
                const timer = setTimeout(() => { server.closeAllConnections(); reject(Object.assign(Error(), { code: 'FH_STOP_TIMEOUT' })); }, 8000);
                server.close(() => { clearTimeout(timer); resolve(); }); server.closeIdleConnections();
            }) };
        },
        spawn: () => require('node:child_process').spawn(plan.ngrokExe, plan.args, { windowsHide: true,
            env: require('./backupMain017.cjs').environment(), stdio: 'ignore', detached: false }),
        probe: (server, signal) => probePublicRoute({ hostname: DOMAIN, pathname: server.pathname, nonce: server.nonce, signal }),
        poll: () => { refreshReceiptGate(); return readTrialState(plan.pool, plan.trial); },
        end: () => plan.pool.end(),
        emit: (code, eventId) => process.stdout.write(JSON.stringify({ code, ...(eventId ? { eventId } : {}) }) + '\n')
    };
}

// Dependencias inyectables para probar coordinación sin puertos, ngrok ni PostgreSQL.
async function supervise(plan, io, signal) {
    let server, child, stopped = false, stopReason = 'FH_STOPPED', seenEvent = null;
    const abort = new AbortController();
    const stop = reason => { stopped = true; stopReason = reason; abort.abort(); };
    const onSignal = () => stop('FH_STOPPED');
    signal.addEventListener('abort', onSignal);
    const check = () => { if (signal.aborted || stopped) fail('FH_NOT_AUTHORIZED'); };
    let shutdownError;
    const deadline = Math.min(Date.now() + plan.supervisor.maxRuntimeMinutes * 60000,
        Date.parse(plan.supervisor.activationExpiresAt) || Infinity);
    try {
        check(); io.files(); server = await io.listen();
        server.server.on('error', () => stop('FH_SUPERVISOR_FAILED'));
        check(); io.files(); child = io.spawn();
        child.once('error', () => stop('FH_TUNNEL_FAILED'));
        child.once('exit', () => { if (!stopped) stop('FH_TUNNEL_FAILED'); });
        const start = Date.now(); let ready = false;
        while (!ready && Date.now() - start < 30000) {
            check(); ready = await io.probe(server, abort.signal).catch(() => false);
            if (!ready) await new Promise(resolve => setTimeout(resolve, 250));
        }
        check(); if (!ready) fail('FH_PUBLIC_ROUTE_FAILED');
        io.emit('FH_READY');
        while (!signal.aborted && !stopped && Date.now() < deadline) {
            io.files(); const event = await io.poll();
            if (event && seenEvent !== event.id_evento_integracion) { seenEvent = event.id_evento_integracion; io.emit('FH_EVENT_PENDING', seenEvent); }
            await new Promise(resolve => { const timer = setTimeout(done, 1000); function done() { clearTimeout(timer); abort.signal.removeEventListener('abort', done); signal.removeEventListener('abort', done); resolve(); } abort.signal.addEventListener('abort', done, { once: true }); signal.addEventListener('abort', done, { once: true }); });
        }
        if (stopped && !signal.aborted) fail(stopReason);
        if (Date.now() >= deadline) stopReason = 'FH_WINDOW_FINISHED';
    } catch (error) {
        if (!signal.aborted) { stopReason = stopped ? stopReason : safeCode(error); throw Object.assign(Error(stopReason), { code: stopReason }); }
    } finally {
        stopped = true; abort.abort(); signal.removeEventListener('abort', onSignal);
        // Solo el objeto del hijo creado aquí; nunca buscar ni terminar procesos por nombre/puerto.
        try { if (child && child.exitCode === null && child.signalCode === null) child.kill(); } catch { shutdownError = Object.assign(Error(), { code: 'FH_STOP_TIMEOUT' }); }
        try { await server?.close(); } catch (error) { shutdownError = error; }
        await io.end(); io.emit(shutdownError ? 'FH_STOP_TIMEOUT' : stopReason);
        if (shutdownError) throw shutdownError;
    }
}

async function main() {
    if (process.platform !== 'win32' || process.argv.length !== 3 || !['--validate', '--start'].includes(process.argv[2])) fail('FH_NOT_AUTHORIZED');
    const signal = new AbortController(), lines = require('node:readline').createInterface({ input: process.stdin });
    // El padre asigna el Job Object antes de enviar ARM. Sin supervisor no hay arranque.
    await new Promise((resolve, reject) => {
        lines.once('line', line => line === 'ARM' ? resolve() : reject(Object.assign(Error(), { code: 'FH_NOT_AUTHORIZED' })));
        lines.once('close', () => { signal.abort(); reject(Object.assign(Error(), { code: 'FH_NOT_AUTHORIZED' })); });
    }).catch(error => { lines.close(); process.stdin.destroy(); throw error; });
    lines.on('line', line => { if (line === 'STOP') signal.abort(); }); lines.on('close', () => signal.abort());
    process.once('SIGINT', () => signal.abort()); process.once('SIGTERM', () => signal.abort());
    let plan, owned = false;
    try {
        plan = loadPrivatePlan();
        if (process.argv[2] === '--start' && plan.pending.length) fail('FH_NOT_AUTHORIZED');
        plan.pool = require('../../backend/config/database');
        await verifyDatabaseAndBackup(plan, plan.pool); verifyFiles(plan);
        if (process.argv[2] === '--validate') {
            process.stdout.write(JSON.stringify({ code: 'FH_VALIDATED_NO_SERVICES', pending: plan.pending, databaseAndBackupVerified: true }) + '\n');
        } else {
            owned = true; await supervise(plan, runtimeAdapters(plan), signal.signal);
        }
    } finally { lines.close(); if (plan?.pool && !owned) await plan.pool.end(); }
}

if (require.main === module) main().catch(error => { process.stdout.write(JSON.stringify({ code: safeCode(error) }) + '\n'); process.exitCode = 1; });
module.exports = { UUID, DOMAIN, parseAgentConfig, pendingAuthorizations, loadPrivatePlan, verifyFiles,
    readTrialState, verifyDatabaseAndBackup, runtimeAdapters, supervise, safeCode };
