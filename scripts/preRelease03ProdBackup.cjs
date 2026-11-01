// PRE-RELEASE-03-PROD: diagnóstico READ ONLY + pg_dump. No ejecuta migraciones/restauración.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const readline = require('node:readline');
const ROOT = path.resolve(__dirname, '..');
const MAIN = 'sian_kaan_reservaciones';
const CLUSTER = '7632825987452064788';
const MIGRATION_HASH = '5dd8c57790aa368a3ce2d6be96e2f186db1fbc491e881e21fccbfa07e1bfb817';
const BIN = 'C:\\Program Files\\PostgreSQL\\18\\bin';
const TABLES = ['bitacora', 'daily_observaciones', 'equivalencias_tours_externos', 'eventos_integracion', 'guias', 'integracion_sync_estado', 'operaciones_tour', 'operadores', 'paises', 'plataformas', 'reservaciones', 'reservas_integracion_link', 'roles', 'tours', 'transportes_operacion', 'usuario_plataformas_visibles', 'usuarios', 'vehiculos'];
const fail = code => { throw Object.assign(new Error(code), { code }); };
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const ident = value => { if (!/^[a-z_][a-z0-9_]*$/.test(value)) fail('IDENTIFICADOR_NO_PERMITIDO'); return '"' + value + '"'; };
function validarIdentidad(row) {
  if (row.database !== MAIN || row.username !== 'postgres' || row.address !== '::1' || row.port !== 5432
    || row.cluster !== CLUSTER || row.version !== '18.3' || row.readonly !== 'on' || row.schema !== 'public') fail('IDENTIDAD_O_SOLO_LECTURA_NO_COINCIDE');
  return row;
}
function childEnv(password) {
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'PATH', 'PATHEXT', 'SystemDrive']) if (process.env[key] !== undefined) env[key] = process.env[key];
  if (password !== undefined) {
    env.PGPASSWORD = password;
    env.PGOPTIONS = '-c default_transaction_read_only=on -c statement_timeout=120000 -c lock_timeout=5000 -c search_path=public,pg_catalog -c application_name=pre_release_03_prod_dump';
    env.PGCLIENTENCODING = 'UTF8';
    env.PGCONNECT_TIMEOUT = '5';
  }
  return env;
}
function cfg() {
  // parse no modifica process.env y no consulta APP_CONFIG_PATH ni PG* heredadas.
  const values = require('dotenv').parse(fs.readFileSync(path.join(ROOT, '.env')));
  if (values.DB_HOST !== 'localhost' || values.DB_PORT !== '5432' || values.DB_NAME !== MAIN || values.DB_USER !== 'postgres' || !values.DB_PASSWORD) fail('CONFIGURACION_HISTORICA_NO_COINCIDE');
  return { password: values.DB_PASSWORD };
}
async function identidad(db) {
  return validarIdentidad((await db.query("SELECT current_database() database,current_user username,host(inet_server_addr()) address,inet_server_port() port,current_schema() schema,current_setting('server_version') version,current_setting('transaction_read_only') readonly,(SELECT system_identifier::text FROM pg_control_system()) cluster")).rows[0]);
}
async function inventario(db) {
  const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r => r.tablename);
  if (JSON.stringify(tables) !== JSON.stringify(TABLES)) fail('INVENTARIO_DE_TABLAS_INESPERADO');
  const schemas = (await db.query("SELECT nspname FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema' ORDER BY 1")).rows.map(r => r.nspname);
  if (JSON.stringify(schemas) !== '["public"]') fail('ESQUEMAS_ADICIONALES_REQUIEREN_REVISION');
  const columns = (await db.query("SELECT table_name,column_name,data_type,character_maximum_length,is_nullable,column_default,is_identity,identity_generation FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
  const constraints = (await db.query("SELECT t.relname table_name,c.conname name,c.contype type,c.convalidated validated,pg_get_constraintdef(c.oid) definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY 1,2")).rows;
  const indexes = (await db.query("SELECT t.relname table_name,i.relname name,x.indisvalid valid,x.indisready ready FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY 1,2")).rows;
  const counts = {};
  for (const table of tables) counts[table] = (await db.query('SELECT count(*)::text n FROM public.' + ident(table))).rows[0].n;
  const sequences = [];
  for (const c of columns.filter(c => c.is_identity === 'YES')) {
    const seq = (await db.query('SELECT pg_get_serial_sequence($1,$2) name', ['public.' + c.table_name, c.column_name])).rows[0].name;
    if (!/^public\.[a-z_][a-z0-9_]*$/.test(seq || '')) fail('SECUENCIA_INESPERADA');
    const state = (await db.query('SELECT last_value::text,is_called FROM public.' + ident(seq.slice(7)))).rows[0];
    sequences.push({ table: c.table_name, column: c.column_name, name: seq.slice(7), ...state });
  }
  const role = (await db.query("SELECT current_user username,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolbypassrls,pg_get_userbyid(e.relowner) event_table_owner,pg_get_userbyid(u.relowner) user_table_owner,has_schema_privilege(current_user,'public','USAGE') schema_usage,has_schema_privilege(current_user,'public','CREATE') schema_create,has_table_privilege(current_user,'public.eventos_integracion','SELECT') event_select,has_table_privilege(current_user,'public.usuarios','REFERENCES') user_references FROM pg_roles r CROSS JOIN pg_class e CROSS JOIN pg_class u WHERE r.rolname=current_user AND e.oid='public.eventos_integracion'::regclass AND u.oid='public.usuarios'::regclass")).rows[0];
  const archiveColumns = columns.filter(c => c.table_name === 'eventos_integracion' && ['archived_at', 'archived_by', 'archive_reason'].includes(c.column_name));
  const compat = {
    archiveColumns,
    archiveConstraints: constraints.filter(c => ['fk_eventos_integracion_archived_by', 'chk_eventos_integracion_archivo'].includes(c.name)),
    archiveIndexes: indexes.filter(i => i.name === 'idx_eventos_integracion_archived_at'),
    accessScopeColumn: columns.find(c => c.table_name === 'usuarios' && c.column_name === 'alcance_plataformas'),
    accessScopeConstraints: constraints.filter(c => (c.table_name === 'usuario_plataformas_visibles' && ['p', 'f'].includes(c.type)) || c.name === 'chk_usuarios_alcance_plataformas'),
    requiredPreviousColumns: [
      ['reservaciones', 'turno'], ['reservaciones', 'idioma'], ['reservaciones', 'notificado'], ['reservaciones', 'motivo_cancelacion'],
      ['operaciones_tour', 'numero_grupo'], ['operaciones_tour', 'turno'],
      ['eventos_integracion', 'reviewed_by'], ['eventos_integracion', 'reviewed_at'], ['eventos_integracion', 'review_note'], ['eventos_integracion', 'application_status'], ['eventos_integracion', 'applied_by'], ['eventos_integracion', 'applied_at'],
      ['integracion_sync_estado', 'recovery_active'], ['integracion_sync_estado', 'recovery_page_token'], ['integracion_sync_estado', 'recovery_target_history_id'], ['integracion_sync_estado', 'recovery_started_at'], ['integracion_sync_estado', 'backoff_until']
    ].map(([table, column]) => ({ table, column, present: columns.some(c => c.table_name === table && c.column_name === column) }))
  };
  if (compat.requiredPreviousColumns.some(c => !c.present) || !compat.accessScopeColumn || compat.accessScopeConstraints.length !== 4) {
    console.log('REVISION_ESTRUCTURA_016 ' + JSON.stringify({ missingColumns: compat.requiredPreviousColumns.filter(c => !c.present), scopeColumn: compat.accessScopeColumn || null, scopeConstraints: compat.accessScopeConstraints.map(c => ({ table: c.table_name, name: c.name, type: c.type })) }));
    fail('ESTRUCTURA_HASTA_016_NO_COINCIDE');
  }
  if (archiveColumns.length || compat.archiveConstraints.length || compat.archiveIndexes.length) fail('ESTADO_017_CAMBIO_REQUIERE_REVISION');
  if (constraints.some(c => !c.validated) || indexes.some(i => !i.valid || !i.ready)) fail('OBJETOS_NO_VALIDADOS');
  const businessRelations = (await db.query("SELECT count(*)::int orphans FROM public.reservas_integracion_link l LEFT JOIN public.reservaciones r USING(id_reservacion) WHERE r.id_reservacion IS NULL")).rows[0];
  if (businessRelations.orphans) fail('VINCULOS_HUERFANOS');
  const sessions = (await db.query("SELECT state,count(*)::int count FROM pg_stat_activity WHERE datname=current_database() AND backend_type='client backend' AND pid<>pg_backend_pid() GROUP BY state ORDER BY state")).rows;
  const dbsize = (await db.query('SELECT pg_database_size(current_database())::text bytes')).rows[0].bytes;
  return { tables, schemas, columns, constraints, indexes, counts, sequences, role, compat, businessRelations, otherClientSessions: sessions, databaseBytes: dbsize };
}
function ejecutar(exe, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(BIN, exe), args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', chunk => { out += chunk; }); child.stderr.on('data', chunk => { err += chunk; });
    const timer = setTimeout(() => { child.kill(); reject(Object.assign(new Error('HERRAMIENTA_TIMEOUT'), { code: 'HERRAMIENTA_TIMEOUT' })); }, 180000);
    child.once('error', () => { clearTimeout(timer); reject(Object.assign(new Error('HERRAMIENTA_NO_INICIADA'), { code: 'HERRAMIENTA_NO_INICIADA' })); });
    child.once('exit', code => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}
function validarToc(text, inv) {
  const lines = text.split(/\r?\n/).filter(line => /^\d+;/.test(line));
  const names = type => lines.filter(line => new RegExp('^\\d+; \\d+ \\d+ ' + type + ' public ').test(line)).map(line => line.match(new RegExp(' ' + type + ' public (\\S+) '))[1]);
  for (const table of inv.tables) if (!names('TABLE').includes(table) || !names('TABLE DATA').includes(table)) fail('DUMP_TABLA_O_DATOS_AUSENTES');
  for (const seq of inv.sequences) if (!names('SEQUENCE').includes(seq.name) || !names('SEQUENCE SET').includes(seq.name)) fail('DUMP_SECUENCIA_AUSENTE');
  for (const index of inv.indexes) {
    // Los índices de PK/UNIQUE se recuperan con su entrada CONSTRAINT.
    const supporting = inv.constraints.some(c => ['p', 'u'].includes(c.type) && c.name === index.name);
    if (!supporting && !names('INDEX').includes(index.name)) fail('DUMP_INDICE_AUSENTE');
  }
  for (const c of inv.constraints.filter(c => ['p', 'u', 'f'].includes(c.type))) if (!lines.some(line => line.includes(' public ' + c.table_name + ' ' + c.name + ' '))) fail('DUMP_RESTRICCION_AUSENTE');
  // CHECK forma parte de CREATE TABLE y se verifica al decodificar el esquema, no como TOC independiente.
  return { entries: lines.length, tables: names('TABLE').length, tableData: names('TABLE DATA').length, sequences: names('SEQUENCE').length, sequenceSet: names('SEQUENCE SET').length, indexes: names('INDEX').length, constraints: names('CONSTRAINT').length, foreignKeys: names('FK CONSTRAINT').length };
}
async function validarContenido(file, inv) {
  // Sin --dbname: pg_restore solo decodifica a stdout. Nunca ejecuta este SQL.
  const child = spawn(path.join(BIN, 'pg_restore.exe'), ['--exit-on-error', '--file=-', file], { env: childEnv(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '', copying = null, current = 0, lineError = null;
  const rows = {}, sequenceSets = [], checkNames = new Set();
  const completion = new Promise((resolve, reject) => { child.once('error', () => reject(Object.assign(new Error('DECODIFICACION_NO_INICIADA'), { code: 'DECODIFICACION_NO_INICIADA' }))); child.once('close', resolve); });
  child.stderr.on('data', chunk => { err += chunk; });
  const timer = setTimeout(() => child.kill(), 180000);
  try {
    for await (const line of readline.createInterface({ input: child.stdout, crlfDelay: Infinity })) {
      if (copying) {
        if (line === '\\.') { rows[copying] = current; copying = null; current = 0; }
        else current++;
        continue; // Nunca retener ni publicar contenidos de filas.
      }
      const copy = line.match(/^COPY public\.([a-z_][a-z0-9_]*) \(/);
      if (copy) { if (!inv.tables.includes(copy[1])) lineError = 'COPY_INESPERADO'; copying = copy[1]; continue; }
      const set = line.match(/^SELECT pg_catalog\.setval\('public\.([a-z_][a-z0-9_]*)', (-?\d+), (true|false)\);$/);
      if (set) sequenceSets.push({ name: set[1], last_value: set[2], is_called: set[3] === 'true' });
      const check = line.match(/^\s+CONSTRAINT ([a-z_][a-z0-9_]*) CHECK /);
      if (check) checkNames.add(check[1]);
    }
    const code = await completion;
    if (code !== 0 || err.trim() || copying || lineError) fail(lineError || 'DECODIFICACION_INCOMPLETA');
    for (const table of inv.tables) if (String(rows[table]) !== inv.counts[table]) fail('FILAS_DUMP_NO_COINCIDEN_CON_SNAPSHOT');
    for (const c of inv.constraints.filter(c => c.type === 'c')) if (!checkNames.has(c.name)) fail('CHECK_AUSENTE_DEL_ESQUEMA');
    if (sequenceSets.length !== inv.sequences.length) fail('ESTADOS_DE_SECUENCIA_INCOMPLETOS');
    return { exitCode: code, warningCount: 0, rows, sequenceSets, checkConstraints: checkNames.size, restorationExecuted: false };
  } finally { clearTimeout(timer); }
}
async function run(dir) {
  const base = path.join(ROOT, '.access-scope-lab/pre-release-03-main-backup');
  const output = fs.realpathSync(dir);
  if (!output.startsWith(base + path.sep) || path.dirname(output) !== base || !fs.existsSync(path.join(output, 'directory-security.json'))) fail('DESTINO_PRIVADO_NO_PREPARADO');
  const security = JSON.parse(fs.readFileSync(path.join(output, 'directory-security.json'), 'utf8').replace(/^\uFEFF/, ''));
  if (!security.protected || !security.onlyAuthorized || security.freeBytes < 100 * 1024 * 1024) fail('SEGURIDAD_O_ESPACIO_INSUFICIENTE');
  const migration = fs.readFileSync(path.join(ROOT, 'database/migrations/017_archivo_eventos_integracion.sql'));
  if (hash(migration) !== MIGRATION_HASH) fail('HASH_017_DISTINTO_DEL_LABORATORIO');
  const tools = {};
  for (const exe of ['pg_dump.exe', 'pg_restore.exe']) {
    const version = await ejecutar(exe, ['--version'], childEnv());
    if (version.code !== 0 || !version.out.includes('18.3') || version.err.trim()) fail('VERSION_HERRAMIENTA_INCOMPATIBLE');
    tools[exe] = version.out.trim();
  }
  const { password } = cfg();
  const { Client } = require('pg');
  // Dirección histórica literal. Sin DNS, sin parámetros heredados ni conexión a DEV/laboratorio.
  const db = new Client({ host: '::1', port: 5432, database: MAIN, user: 'postgres', password, connectionTimeoutMillis: 5000,
    application_name: 'pre_release_03_prod_readonly', options: '-c default_transaction_read_only=on -c search_path=public -c timezone=UTC -c statement_timeout=120000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=180000' });
  const startedAt = new Date().toISOString();
  const save = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  try {
    await db.connect();
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const identity = await identidad(db);
    console.log('IDENTIDAD_PRINCIPAL_CONFIRMADA_SOLO_LECTURA ' + JSON.stringify(identity));
    const inv = await inventario(db);
    if (security.freeBytes < Math.max(100 * 1024 * 1024, Number(inv.databaseBytes) * 4)) fail('ESPACIO_INSUFICIENTE_PARA_RESPALDO');
    save('inventory.json', { identity, inventory: inv, startedAt });
    const snapshot = (await db.query('SELECT pg_export_snapshot() snapshot')).rows[0].snapshot;
    if (!/^[0-9A-F]+-[0-9A-F]+-\d+$/.test(snapshot)) fail('SNAPSHOT_INVALIDO');
    const stem = MAIN + '_' + new Date().toISOString().replace(/[:.]/g, '-') + '_' + crypto.randomBytes(4).toString('hex');
    const partial = path.join(output, stem + '.backup.partial'), final = path.join(output, stem + '.backup');
    fs.closeSync(fs.openSync(partial, 'wx', 0o600));
    const dump = await ejecutar('pg_dump.exe', ['--host=::1', '--port=5432', '--username=postgres', '--no-password', '--dbname=' + MAIN, '--format=custom', '--create', '--lock-wait-timeout=5s', '--snapshot=' + snapshot, '--file=' + partial], childEnv(password));
    if (dump.code !== 0 || dump.err.trim()) fail(dump.code !== 0 ? 'PG_DUMP_FALLO_SIN_MOSTRAR_SECRETOS' : 'PG_DUMP_ADVERTENCIAS_REQUIEREN_REVISION');
    if (fs.statSync(partial).size === 0 || fs.readFileSync(partial).subarray(0, 5).toString() !== 'PGDMP') fail('ARCHIVO_CUSTOM_INVALIDO');
    const listing = await ejecutar('pg_restore.exe', ['--list', partial], childEnv());
    if (listing.code !== 0 || listing.err.trim()) fail('INDICE_DEL_RESPALDO_NO_VALIDO');
    const toc = validarToc(listing.out, inv);
    fs.writeFileSync(path.join(output, 'toc.list'), listing.out, { flag: 'wx' });
    const content = await validarContenido(partial, inv);
    const sequenceObservations = content.sequenceSets.filter(s => { const before = inv.sequences.find(b => b.name === s.name); return before.last_value !== s.last_value || before.is_called !== s.is_called; }).map(s => s.name);
    const identityAfter = await identidad(db);
    const invAfter = await inventario(db);
    if (JSON.stringify(invAfter.columns) !== JSON.stringify(inv.columns) || JSON.stringify(invAfter.constraints) !== JSON.stringify(inv.constraints)) fail('ESQUEMA_CAMBIO_DURANTE_RESPALDO');
    await db.query('ROLLBACK');
    // COPYFILE_EXCL garantiza no reemplazar un respaldo anterior.
    fs.copyFileSync(partial, final, fs.constants.COPYFILE_EXCL);
    const sha256 = hash(fs.readFileSync(final));
    if (sha256 !== hash(fs.readFileSync(partial))) fail('COPIA_DEL_RESPALDO_NO_COINCIDE');
    fs.unlinkSync(partial); // Solo el temporal creado exclusivamente por esta ejecución.
    const manifest = { startedAt, finishedAt: new Date().toISOString(), identity, identityAfter, tools,
      snapshotSharedWithInventory: true, filename: path.basename(final), bytes: fs.statSync(final).size, sha256, dumpExitCode: dump.code, dumpWarnings: 0,
      listExitCode: listing.code, listWarnings: 0, toc, content, sequenceObservations, migration017Sha256: MIGRATION_HASH,
      inventoryCounts: inv.counts, constraintCounts: Object.fromEntries(['p', 'f', 'c', 'u'].map(t => [t, inv.constraints.filter(c => c.type === t).length])), indexCount: inv.indexes.length,
      role: inv.role, archiveColumnsPresent: inv.compat.archiveColumns.length, previousColumnsAllPresent: inv.compat.requiredPreviousColumns.every(c => c.present),
      otherClientSessions: inv.otherClientSessions, databaseBytes: inv.databaseBytes, restored: false, migrationExecuted: false, postgresWritesExecuted: false,
      observations: ['Restauración aislada de este respaldo pendiente de autorización.', 'Copia local: no protege frente a fallo o pérdida de la unidad.'],
      inheritedConfigKeysIgnored: Object.keys(process.env).filter(k => /^(DB_|PG|JWT|APP_CONFIG_PATH$|NODE_OPTIONS$)/.test(k)) };
    save('backup-manifest.json', manifest);
    console.log('RESPALDO_GENERADO ' + JSON.stringify({ filename: manifest.filename, bytes: manifest.bytes, sha256, toc, rowsMatchSnapshot: true, restored: false }));
  } finally { await db.end().catch(() => {}); }
}
module.exports = { validarIdentidad, validarToc, childEnv, MAIN, CLUSTER, MIGRATION_HASH, TABLES };
if (require.main === module) {
  if (process.argv.length !== 4 || process.argv[2] !== '--backup') { console.error('Uso exclusivo: --backup <directorio privado nuevo preparado por PowerShell>'); process.exitCode = 1; }
  else run(process.argv[3]).catch(error => { console.error('PRE_RELEASE_03_PROD_BLOQUEADO: ' + (/^[A-Z_0-9]+$/.test(error.code || '') ? error.code : 'ERROR_SIN_DETALLES_SENSIBLES')); process.exitCode = 1; });
}
