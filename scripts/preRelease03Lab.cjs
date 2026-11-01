// Solo PRE-RELEASE-03-LAB. Nunca lee .env ni reutiliza un clúster existente.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const net = require('node:net');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, '.access-scope-lab', 'pre-release-03-lab20261017-pg18');
const data = path.join(dir, 'data');
const bin = 'C:\\Program Files\\PostgreSQL\\18\\bin';
const database = 'pre_release_03_disposable_lab20261017';
const owner = 'pr03_lab_owner';
const role = 'pr03_fixture_test';
const port = 55473;
const evidenceDir = path.join(root, 'docs', 'pre-release-03-lab');
const manifestPath = path.join(dir, 'manifest.json');
function ps(command, input) {
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.toLowerCase() === 'psmodulepath') delete env[key];
    return cp.execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command],
        { input, env, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}
function protect(value) {
    return ps("$v=[Console]::In.ReadToEnd(); ConvertFrom-SecureString (ConvertTo-SecureString -String $v -AsPlainText -Force)", value);
}
function unprotect(file) {
    return ps("$v=[Console]::In.ReadToEnd(); $s=ConvertTo-SecureString -String $v; [System.Net.NetworkCredential]::new('', $s).Password", fs.readFileSync(file, 'utf8'));
}
function pool(user, password, db = database) {
    return new Pool({ host: '127.0.0.1', port, database: db, user, password, max: 2,
        application_name: 'pre_release_03_lab_control', connectionTimeoutMillis: 5000,
        options: '-c statement_timeout=10000 -c search_path=public' });
}
function writeEvidence(name, value) {
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, name), JSON.stringify(value, null, 2) + '\n');
}
async function freePort() {
    await new Promise((resolve, reject) => {
        const s = net.createServer(); s.once('error', reject);
        s.listen({ host: '127.0.0.1', port, exclusive: true }, () => s.close(resolve));
    });
}
async function prepare() {
    assert.ok(!fs.existsSync(dir), 'El directorio debe ser nuevo; no se reutiliza ni elimina');
    await freePort();
    const version = cp.execFileSync(path.join(bin, 'postgres.exe'), ['--version'], { encoding: 'utf8', windowsHide: true }).trim();
    assert.match(version, /18\.3/);
    fs.mkdirSync(dir);
    const account = cp.execFileSync('whoami.exe', [], { encoding: 'utf8', windowsHide: true }).trim();
    cp.execFileSync('icacls.exe', [dir, '/inheritance:r', '/grant:r', `${account}:(OI)(CI)F`, '/grant:r', 'SYSTEM:(OI)(CI)F'], { windowsHide: true, stdio: 'pipe' });
    const ownerPassword = crypto.randomBytes(32).toString('hex');
    const testPassword = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(path.join(dir, 'owner.dpapi'), protect(ownerPassword));
    fs.writeFileSync(path.join(dir, 'fixture.dpapi'), protect(testPassword));
    const pwfile = path.join(dir, 'init-password.tmp');
    fs.writeFileSync(pwfile, ownerPassword, { flag: 'wx' });
    try {
        cp.execFileSync(path.join(bin, 'initdb.exe'), ['-D', data, '-U', owner, '--encoding=UTF8', '--locale=C', '--auth=scram-sha-256', '--pwfile=' + pwfile],
            { windowsHide: true, stdio: 'pipe', timeout: 60000 });
    } finally { fs.unlinkSync(pwfile); }
    fs.appendFileSync(path.join(data, 'postgresql.conf'), `\n# Clúster independiente PRE-RELEASE-03-LAB\nlisten_addresses = '127.0.0.1'\nport = ${port}\ncluster_name = 'pre_release_03_lab20261017'\nlog_statement = 'none'\nlog_min_error_statement = 'panic'\n`);
    const pgctl = path.join(bin, 'pg_ctl.exe').replace(/'/g, "''");
    ps(`$p=Start-Process -FilePath '${pgctl}' -ArgumentList @('start','-w','-t','30','-D','${data}','-l','${path.join(dir, 'postgres.log')}') -WindowStyle Hidden -PassThru; $p.WaitForExit(); if($p.ExitCode -ne 0){exit $p.ExitCode}`);
    await finishNewCluster();
}
async function finishNewCluster() {
    assert.ok(!fs.existsSync(manifestPath), 'No se repite la creación de base/rol');
    const pidFile = fs.readFileSync(path.join(data, 'postmaster.pid'), 'utf8').split(/\r?\n/);
    assert.equal(path.resolve(pidFile[1]), path.resolve(data));
    assert.equal(Number(pidFile[3]), port); assert.equal(pidFile[5], '127.0.0.1');
    const testPassword = unprotect(path.join(dir, 'fixture.dpapi'));
    const admin = pool(owner, unprotect(path.join(dir, 'owner.dpapi')), 'postgres');
    try {
        const identity = (await admin.query("SELECT current_user AS role, current_setting('data_directory') AS data, current_setting('port')::int AS port, current_setting('cluster_name') AS cluster")).rows[0];
        assert.equal(identity.role, owner); assert.equal(path.resolve(identity.data), path.resolve(data));
        assert.equal(identity.port, port); assert.equal(identity.cluster, 'pre_release_03_lab20261017');
        assert.deepEqual((await admin.query('SELECT datname FROM pg_database ORDER BY datname')).rows.map(r => r.datname), ['postgres','template0','template1']);
        assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_roles WHERE rolname=$1", [role])).rows[0].n, 0);
        await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD '${testPassword}'`);
        await admin.query(`CREATE DATABASE ${database} OWNER ${owner} TEMPLATE template0 ENCODING 'UTF8'`);
        for (const db of ['postgres', 'template1', database]) await admin.query(`REVOKE ALL ON DATABASE ${db} FROM PUBLIC`);
        await admin.query(`GRANT CONNECT ON DATABASE ${database} TO ${role}`);
        const system = (await admin.query('SELECT system_identifier::text FROM pg_control_system()')).rows[0];
        fs.writeFileSync(manifestPath, JSON.stringify({ createdAt: new Date().toISOString(), version: 'PostgreSQL 18.3', host: '127.0.0.1', port, database, role, owner, data, systemIdentifier: system.system_identifier }, null, 2));
    } finally { await admin.end(); }
    const target = pool(owner, unprotect(path.join(dir, 'owner.dpapi')));
    try {
        await target.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
        await target.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${role}`);
    } finally { await target.end(); }
    console.log('Laboratorio independiente creado; credenciales DPAPI fuera de Git.');
}
async function verify(requireEmpty) {
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(m.data, data); assert.equal(m.port, port); assert.equal(m.database, database);
    const admin = pool(owner, unprotect(path.join(dir, 'owner.dpapi')));
    const test = pool(role, unprotect(path.join(dir, 'fixture.dpapi')));
    try {
        const system = (await admin.query("SELECT system_identifier::text, current_setting('data_directory') AS data_directory, current_setting('cluster_name') AS cluster_name, pg_postmaster_start_time() AS started_at FROM pg_control_system()")).rows[0];
        assert.equal(system.system_identifier, m.systemIdentifier);
        assert.equal(path.resolve(system.data_directory), path.resolve(data));
        assert.equal(system.cluster_name, 'pre_release_03_lab20261017');
        const databases = (await admin.query('SELECT datname FROM pg_database ORDER BY datname')).rows.map(r => r.datname);
        assert.deepEqual(databases, [database, 'postgres', 'template0', 'template1'].sort());
        const sessions = (await admin.query('SELECT DISTINCT datname FROM pg_stat_activity WHERE datname IS NOT NULL ORDER BY datname')).rows.map(r => r.datname);
        assert.ok(sessions.every(n => n === database));
        const identity = (await test.query('SELECT current_database() AS database, current_user AS role, host(inet_server_addr()) AS host, inet_server_port() AS port, version() AS version')).rows[0];
        assert.equal(identity.database, database); assert.equal(identity.role, role); assert.equal(identity.port, port); assert.equal(identity.host, '127.0.0.1');
        const privileges = (await test.query('SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolinherit FROM pg_roles WHERE rolname=current_user')).rows[0];
        assert.ok(Object.values(privileges).every(v => v === false));
        assert.equal((await test.query("SELECT count(*)::int AS n FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)")).rows[0].n, 0);
        for (const db of ['postgres', 'template1']) assert.equal((await test.query("SELECT has_database_privilege(current_user,$1,'CONNECT') AS allowed", [db])).rows[0].allowed, false);
        const tables = (await test.query("SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY 1,2")).rows;
        if (requireEmpty) assert.deepEqual(tables, []);
        const pid = Number(fs.readFileSync(path.join(data, 'postmaster.pid'), 'utf8').split(/\r?\n/)[0]);
        const result = { checkedAt: new Date().toISOString(), identity, system, pid, databases, sessions, privileges, tables, emptyBeforeExecution: requireEmpty, appConfigurationLoaded: false };
        result.databasePermissions = (await test.query("SELECT datname, datallowconn, has_database_privilege(current_user,oid,'CONNECT') AS connect FROM pg_database ORDER BY datname")).rows;
        assert.deepEqual(result.databasePermissions.filter(d => d.datallowconn && d.connect).map(d => d.datname), [database]);
        if (!requireEmpty) {
            result.archiveConstraints = (await test.query("SELECT conname, convalidated, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public.eventos_integracion'::regclass AND conname IN ('fk_eventos_integracion_archived_by','chk_eventos_integracion_archivo') ORDER BY conname")).rows;
            assert.equal(result.archiveConstraints.length, 2); assert.ok(result.archiveConstraints.every(c => c.convalidated));
            result.archiveIndex = (await test.query("SELECT c.relname, i.indisvalid, pg_get_expr(i.indpred,i.indrelid) AS predicate FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.oid='public.idx_eventos_integracion_archived_at'::regclass")).rows[0];
            assert.equal(result.archiveIndex.indisvalid, true); assert.equal(result.archiveIndex.predicate, '(archived_at IS NOT NULL)');
            result.events = (await test.query('SELECT id_evento_integracion,provider,external_event_id,external_booking_id,event_type,review_status,application_status,archived_by,archive_reason FROM eventos_integracion ORDER BY id_evento_integracion')).rows;
            result.witnessReservations = (await test.query('SELECT * FROM reservaciones ORDER BY id_reservacion')).rows;
            result.links = (await test.query('SELECT * FROM reservas_integracion_link ORDER BY provider,external_booking_id')).rows;
            result.configurationSources = (await admin.query('SELECT DISTINCT sourcefile FROM pg_file_settings ORDER BY sourcefile')).rows.map(r => r.sourcefile);
            assert.ok(result.configurationSources.every(file => path.resolve(file).startsWith(path.resolve(data) + path.sep)));
        }
        writeEvidence(requireEmpty ? 'aislamiento-antes.json' : 'aislamiento-despues.json', result);
        return result;
    } finally { await test.end(); await admin.end(); }
}
async function execute() {
    await verify(true); // Obligatorio antes del script; nunca vuelve a una base poblada.
    const password = unprotect(path.join(dir, 'fixture.dpapi'));
    const url = new URL(`postgresql://127.0.0.1:${port}/${database}`);
    url.username = role; url.password = password;
    const result = cp.spawnSync(process.execPath, ['--require', path.join(__dirname, 'preRelease03LabNetworkGuard.cjs'), path.join(__dirname, 'verificarArchivoEventosDesechable.cjs'), '--execute-disposable'],
        { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 120000, env: { ...process.env, NODE_ENV: 'test', APP_CONFIG_PATH: 'NUL',
            GYG_GMAIL_SYNC_ENABLED: 'false', PRERELEASE03_DISPOSABLE_DATABASE_URL: url.href,
            PRERELEASE03_CONFIRM: 'SOLO_BASE_DESECHABLE_PRE_RELEASE_03', PRERELEASE03_LAB_REPORT: path.join(evidenceDir, 'casos.json') } });
    // No se imprime ningún error del driver o comando que pueda contener la URL.
    const safe = { completedAt: new Date().toISOString(), status: result.status, signal: result.signal,
        successMarker: result.stdout?.includes('PRE_RELEASE_03_DISPOSABLE_OK') || false,
        stoppedCode: /Comprobación detenida: ([A-Za-z0-9_]+)/.exec(result.stderr || '')?.[1] || null };
    writeEvidence('ejecucion.json', safe);
    console.log(JSON.stringify(safe));
    await verify(false);
    assert.equal(result.status, 0, 'La ejecución falló; revisar evidencia redactada antes de corregir');
}
async function main() {
    if (process.argv[2] === '--prepare') { await prepare(); await verify(true); }
    else if (process.argv[2] === '--finish-new-cluster') { await finishNewCluster(); await verify(true); }
    else if (process.argv[2] === '--execute') await execute();
    else if (process.argv[2] === '--verify') await verify(false);
    else throw Error('Se requiere --prepare, --execute o --verify');
}
main().catch(e => { console.error('Laboratorio detenido:', e.code || e.name); process.exitCode = 1; });
