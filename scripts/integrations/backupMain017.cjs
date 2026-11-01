// Mantenimiento explícito: exportación READ ONLY. Sin restauración, DDL ni arranque automático.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const readline = require('node:readline');
const { TABLES, verifySchema } = require('../../backend/config/desktopSchema');
const { WINDOWS_ENV } = require('../../backend/config/desktopPolicy');
const { checkAcl } = require('../../backend/config/windowsConfigAcl');
const MAIN = 'sian_kaan_reservaciones', CLUSTER = '7632825987452064788';
const BIN = 'C:/Program Files/PostgreSQL/18/bin';
const SQL_HASH = '5dd8c57790aa368a3ce2d6be96e2f186db1fbc491e881e21fccbfa07e1bfb817';
const fail = code => { throw Object.assign(Error(code), { code }); };
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const ident = name => { if (!/^[a-z_][a-z0-9_]*$/.test(name)) fail('BACKUP_IDENTIFIER'); return '"' + name + '"'; };
function environment(password) {
    const env = {};
    for (const [key, value] of Object.entries(process.env)) if (WINDOWS_ENV.has(key.toLowerCase())) env[key] = value;
    if (password !== undefined) Object.assign(env, { PGPASSWORD: password, PGCONNECT_TIMEOUT: '5', PGCLIENTENCODING: 'UTF8',
        PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=120000 -c lock_timeout=5000 -c search_path=public,pg_catalog' });
    return env;
}
function tool(exe, args, password) {
    return new Promise((resolve, reject) => {
        const child = cp.spawn(path.join(BIN, exe), args, { env: environment(password), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '', errorOutput = false;
        child.stdout.on('data', chunk => { out += chunk; });
        child.stderr.on('data', chunk => { if (String(chunk).trim()) errorOutput = true; });
        const timer = setTimeout(() => { child.kill(); reject(Error('BACKUP_TOOL_TIMEOUT')); }, 120000);
        child.once('error', () => { clearTimeout(timer); reject(Error('BACKUP_TOOL_START')); });
        child.once('close', code => { clearTimeout(timer); code === 0 && !errorOutput ? resolve(out) : reject(Error('BACKUP_TOOL_FAILED')); });
    });
}
function validateToc(toc, inventory) {
    const entries = toc.split(/\r?\n/).filter(line => /^\d+;/.test(line));
    const names = type => entries.filter(line => new RegExp('^\\d+; \\d+ \\d+ ' + type + ' public ').test(line))
        .map(line => line.match(new RegExp(' ' + type + ' public (\\S+) '))[1]);
    for (const type of ['TABLE', 'TABLE DATA']) {
        if (JSON.stringify(names(type).sort()) !== JSON.stringify([...inventory.tables].sort())) fail('BACKUP_TABLE_INVENTORY');
    }
    for (const type of ['SEQUENCE', 'SEQUENCE SET']) {
        if (JSON.stringify(names(type).sort()) !== JSON.stringify(inventory.sequences.map(s => s.name).sort())) fail('BACKUP_SEQUENCE_INVENTORY');
    }
    for (const c of inventory.constraints.filter(c => ['p', 'u', 'f'].includes(c.type))) {
        if (!entries.some(line => line.includes(' public ' + c.table + ' ' + c.name + ' '))) fail('BACKUP_CONSTRAINT_MISSING');
    }
    for (const i of inventory.indexes) {
        if (!inventory.constraints.some(c => ['p', 'u'].includes(c.type) && c.name === i.name)
            && !names('INDEX').includes(i.name)) fail('BACKUP_INDEX_MISSING');
    }
    return { entries: entries.length, tables: names('TABLE').length, tableData: names('TABLE DATA').length,
        sequences: names('SEQUENCE').length, sequenceSets: names('SEQUENCE SET').length };
}
async function validateContent(file, inventory) {
    // Únicamente decodificación a stdout. Nunca pasar --dbname a pg_restore.
    const child = cp.spawn(path.join(BIN, 'pg_restore.exe'), ['--exit-on-error', '--file=-', file],
        { env: environment(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let errorOutput = false, copying = null, count = 0;
    const rows = {}, sequences = [], checks = new Set(), archiveColumns = new Set();
    child.stderr.on('data', chunk => { if (String(chunk).trim()) errorOutput = true; });
    const completion = new Promise((resolve, reject) => {
        child.once('error', () => reject(Error('BACKUP_DECODE_START'))); child.once('close', resolve);
    });
    const timer = setTimeout(() => child.kill(), 120000);
    try {
        for await (const line of readline.createInterface({ input: child.stdout, crlfDelay: Infinity })) {
            if (copying) {
                if (line === '\\.') { rows[copying] = count; copying = null; count = 0; } else count++;
                continue; // No conservar ni imprimir datos de filas.
            }
            const copy = /^COPY public\.([a-z_][a-z0-9_]*) \(/.exec(line);
            if (copy) { copying = copy[1]; continue; }
            const seq = /^SELECT pg_catalog\.setval\('public\.([a-z_][a-z0-9_]*)', (-?\d+), (true|false)\);$/.exec(line);
            if (seq) sequences.push({ name: seq[1], last_value: seq[2], is_called: seq[3] === 'true' });
            const check = /^\s+CONSTRAINT ([a-z_][a-z0-9_]*) CHECK /.exec(line);
            if (check) checks.add(check[1]);
            const col = /^\s+(archived_at|archived_by|archive_reason) /.exec(line);
            if (col) archiveColumns.add(col[1]);
        }
        if (await completion !== 0 || errorOutput || copying) fail('BACKUP_DECODE_FAILED');
        if (Object.keys(rows).length !== inventory.tables.length) fail('BACKUP_ROW_INVENTORY');
        for (const t of inventory.tables) if (rows[t] !== inventory.counts[t]) fail('BACKUP_ROW_COUNT');
        if (sequences.length !== inventory.sequences.length) fail('BACKUP_SEQUENCE_STATES');
        for (const s of inventory.sequences) {
            const decoded = sequences.find(d => d.name === s.name);
            if (!decoded || decoded.last_value !== s.last_value || decoded.is_called !== s.is_called) fail('BACKUP_SEQUENCE_STATES');
        }
        for (const c of inventory.constraints.filter(c => c.type === 'c')) if (!checks.has(c.name)) fail('BACKUP_CHECK_MISSING');
        if (archiveColumns.size !== 3 || !checks.has('chk_eventos_integracion_archivo')) fail('BACKUP_017_MISSING');
        return { rows, sequences, checks: checks.size, archiveColumns: [...archiveColumns].sort(), restored: false };
    } finally { clearTimeout(timer); }
}
async function identity(db) {
    const row = (await db.query("SELECT current_database() database,current_user username,host(inet_server_addr()) host,inet_server_port() port,(SELECT system_identifier::text FROM pg_control_system()) cluster,current_setting('server_version') version,current_setting('transaction_read_only') readonly,current_schema() schema")).rows[0];
    if (row.database !== MAIN || row.username !== 'postgres' || row.host !== '127.0.0.1' || row.port !== 5432
        || row.cluster !== CLUSTER || row.version !== '18.3' || row.readonly !== 'on' || row.schema !== 'public') fail('BACKUP_IDENTITY');
    await verifySchema(db);
    return row;
}
async function inventory(db) {
    const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r => r.tablename);
    if (JSON.stringify(tables) !== JSON.stringify([...TABLES].sort())) fail('BACKUP_UNEXPECTED_TABLES');
    const counts = {}, rowHashes = {};
    for (const table of tables) {
        const rows = (await db.query('SELECT row_to_json(t)::text value FROM public.' + ident(table) + ' t ORDER BY to_jsonb(t)::text COLLATE "C"')).rows;
        counts[table] = rows.length; rowHashes[table] = hash(rows.map(r => r.value).join('\n'));
    }
    const constraints = (await db.query("SELECT t.relname AS table,c.conname name,c.contype type,c.convalidated validated,pg_get_constraintdef(c.oid) definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY 1,2")).rows;
    const indexes = (await db.query("SELECT t.relname AS table,i.relname name,x.indisvalid valid,x.indisready ready,pg_get_indexdef(i.oid) definition FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY 1,2")).rows;
    const sequenceNames = (await db.query("SELECT c.relname name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S' ORDER BY 1")).rows;
    const sequences = [];
    for (const s of sequenceNames) sequences.push({ name: s.name, ...(await db.query('SELECT last_value::text,is_called FROM public.' + ident(s.name))).rows[0] });
    const columns = (await db.query("SELECT table_name,column_name,data_type,is_nullable,column_default,is_identity,identity_generation FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
    const protectedEvents = (await db.query('SELECT id_evento_integracion,md5(row_to_json(t)::text) fingerprint FROM public.eventos_integracion t WHERE id_evento_integracion=ANY($1::int[]) ORDER BY id_evento_integracion', [[124, 126]])).rows;
    const acl = (await db.query("SELECT c.relname,c.relowner,c.relacl::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname")).rows;
    if (constraints.some(c => !c.validated) || indexes.some(i => !i.valid || !i.ready)) fail('BACKUP_SCHEMA_INVALID');
    return { tables, counts, rowHashes, constraints, indexes, sequences, columns, protectedEvents, aclHash: hash(JSON.stringify(acl)) };
}
function validateBaseline(actual, expected) {
    // Inventario leído antes de la exportación: no congelar conteos de una prueba anterior.
    if (!expected || !expected.counts || !expected.rowHashes || expected.protectedEvents?.length !== 2
        || JSON.stringify(actual.counts) !== JSON.stringify(expected.counts)
        || JSON.stringify(actual.rowHashes) !== JSON.stringify(expected.rowHashes)
        || JSON.stringify(actual.protectedEvents) !== JSON.stringify(expected.protectedEvents)
        || actual.aclHash !== expected.aclHash) fail('BACKUP_BASELINE_CHANGED');
}
async function backupMain017({ directory, maintenanceConfigPath, expectedState }) {
    const base = path.join(process.env.LOCALAPPDATA, 'CommunityTours/backups/principal-final');
    const output = fs.realpathSync(directory);
    if (path.dirname(output) !== base || !path.basename(output).startsWith('run-')) fail('BACKUP_DESTINATION');
    checkAcl(path.join(output, 'directory-security.json'));
    if (hash(fs.readFileSync(path.join(__dirname, '../../database/migrations/017_archivo_eventos_integracion.sql'))) !== SQL_HASH) fail('BACKUP_SQL_HASH');
    for (const exe of ['pg_dump.exe', 'pg_restore.exe']) if (!(await tool(exe, ['--version'])).includes('18.3')) fail('BACKUP_TOOL_VERSION');
    // Fuente de mantenimiento histórica autorizada, solo en memoria. No es configuración de Electron.
    // Se ignoran completamente destinos y variables PG heredadas; no se modifica su ACL.
    const cfg = require('dotenv').parse(fs.readFileSync(maintenanceConfigPath));
    if (cfg.DB_HOST !== 'localhost' || cfg.DB_PORT !== '5432' || cfg.DB_NAME !== MAIN || cfg.DB_USER !== 'postgres' || !cfg.DB_PASSWORD) fail('BACKUP_MAINTENANCE_ACCOUNT');
    const { Client } = require('pg');
    const db = new Client({ host: '127.0.0.1', port: 5432, database: MAIN, user: 'postgres', password: cfg.DB_PASSWORD,
        connectionTimeoutMillis: 5000, application_name: 'ctsk-backup017-readonly',
        options: '-c default_transaction_read_only=on -c search_path=public,pg_catalog -c timezone=UTC -c statement_timeout=120000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=180000' });
    const startedAt = new Date().toISOString();
    try {
        await db.connect(); await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const verifiedIdentity = await identity(db), before = await inventory(db);
        validateBaseline(before, expectedState);
        const snapshot = (await db.query('SELECT pg_export_snapshot() snapshot')).rows[0].snapshot;
        if (!/^[0-9A-F]+-[0-9A-F]+-\d+$/.test(snapshot)) fail('BACKUP_SNAPSHOT');
        const file = path.join(output, 'principal-017.backup');
        fs.closeSync(fs.openSync(file, 'wx', 0o600)); checkAcl(file);
        await tool('pg_dump.exe', ['--host=127.0.0.1', '--port=5432', '--username=postgres', '--no-password', '--dbname=' + MAIN,
            '--format=custom', '--create', '--lock-wait-timeout=5s', '--snapshot=' + snapshot, '--file=' + file], cfg.DB_PASSWORD);
        if (fs.readFileSync(file).subarray(0, 5).toString() !== 'PGDMP') fail('BACKUP_FORMAT');
        const listing = await tool('pg_restore.exe', ['--list', file]);
        const toc = validateToc(listing, before), content = await validateContent(file, before);
        await identity(db);
        if (JSON.stringify(await inventory(db)) !== JSON.stringify(before)) fail('BACKUP_SNAPSHOT_CHANGED');
        await db.query('ROLLBACK');
        // Nueva instantánea: detectar cambios reales concurrentes, no solo comparar el mismo snapshot.
        await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); await identity(db);
        if (JSON.stringify(await inventory(db)) !== JSON.stringify(before)) fail('BACKUP_LIVE_STATE_CHANGED');
        await db.query('ROLLBACK');
        checkAcl(file);
        const manifest = { status: 'VERIFIED', startedAt, finishedAt: new Date().toISOString(), identity: verifiedIdentity,
            migration017Sha256: SQL_HASH, filename: path.basename(file), bytes: fs.statSync(file).size, sha256: hash(fs.readFileSync(file)),
            sharedSnapshot: true, inventory: before, toc, content, databaseUnchanged: true, restored: false,
            maintenanceSourceAclWarning: 'La fuente histórica mantiene permisos amplios; no se modificó ni se usa como configuración del receptor.' };
        fs.writeFileSync(path.join(output, 'inventory.json'), JSON.stringify(before, null, 2) + '\n', { flag: 'wx' });
        fs.writeFileSync(path.join(output, 'toc.list'), listing, { flag: 'wx' });
        fs.writeFileSync(path.join(output, 'backup-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
        for (const entry of fs.readdirSync(output)) checkAcl(path.join(output, entry));
        return { directory: output, file, sha256: manifest.sha256, bytes: manifest.bytes, counts: before.counts,
            tables: toc.tables, sequences: toc.sequences, constraints: before.constraints.length, status: 'VERIFIED', restored: false };
    } finally { await db.end().catch(() => {}); }
}
module.exports = { backupMain017, validateToc, validateBaseline, environment, inventory, identity };
