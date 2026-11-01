// Orquestación exclusiva de una restauración NUEVA. Nunca lee .env ni conecta a principal/DEV.
const S = require('./preRelease03RestoreSafety.cjs');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), cp = require('node:child_process'), net = require('node:net');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const EVIDENCE = path.join(S.ROOT, 'docs/pre-release-03-restore');
let stage = 'argumentos', m, report = { startedAt: new Date().toISOString(), cases: [], completed: false }, pools = [], started = false;
function save(name, value) { fs.mkdirSync(EVIDENCE, { recursive: true }); fs.writeFileSync(path.join(EVIDENCE, name), JSON.stringify(value, null, 2) + '\n'); }
function privateSave(name, value) { fs.writeFileSync(path.join(m.dir, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); }
function passed(name, detail) { report.cases.push({ name, status: 'passed', detail }); }
function ps(command, input = '') { return cp.execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { input, env: S.env(), encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 }).trim(); }
function protect(value) { return ps("$v=[Console]::In.ReadToEnd(); ConvertFrom-SecureString (ConvertTo-SecureString -String $v -AsPlainText -Force)", value); }
function pidCheck() {
  const pid = fs.readFileSync(path.join(m.data, 'postmaster.pid'), 'utf8').split(/\r?\n/);
  if (path.resolve(pid[1]) !== m.data || Number(pid[3]) !== m.port || pid[5] !== '127.0.0.1') S.fail('PID_DEL_SERVIDOR_NO_COINCIDE');
  return Number(pid[0]);
}
async function pgctl(action) {
  if (action === 'stop') pidCheck();
  const exe = path.join(S.BIN, 'pg_ctl.exe').replace(/'/g, "''"), data = m.data.replace(/'/g, "''"), log = path.join(m.dir, 'postgres.log').replace(/'/g, "''");
  const args = action === 'start' ? "@('start','-w','-t','30','-D','" + data + "','-l','" + log + "')" : "@('stop','-m','fast','-w','-t','15','-D','" + data + "')";
  ps("$p=Start-Process -FilePath '" + exe + "' -ArgumentList " + args + " -WindowStyle Hidden -PassThru; $p.WaitForExit(); if($p.ExitCode -ne 0){exit $p.ExitCode}");
}
async function identity(admin, app, requireEmpty = false) {
  S.validarDestino(m); pidCheck();
  const id = (await admin.query("SELECT current_database() database,current_user username,host(inet_server_addr()) host,inet_server_port() port,current_setting('data_directory') data,current_setting('cluster_name') cluster_name,current_setting('server_version') version,(SELECT system_identifier::text FROM pg_control_system()) system_identifier")).rows[0];
  if (id.database !== m.database || id.username !== m.owner || id.host !== m.host || id.port !== m.port || path.resolve(id.data) !== m.data || id.cluster_name !== m.clusterName || id.version !== '18.3') S.fail('IDENTIDAD_ADMIN_NO_COINCIDE');
  if (m.systemIdentifier && id.system_identifier !== m.systemIdentifier) S.fail('CLUSTER_CAMBIO');
  if (['7632825987452064788', '7697702573746832088', '7697092329288606316'].includes(id.system_identifier)) S.fail('CLUSTER_CONOCIDO_PROHIBIDO');
  const databases = (await admin.query('SELECT datname FROM pg_database ORDER BY datname')).rows.map(r => r.datname);
  assert.deepEqual(databases, [m.database, 'postgres', 'template0', 'template1'].sort());
  if (app) {
    const limited = (await app.query('SELECT current_database() database,current_user username,host(inet_server_addr()) host,inet_server_port() port')).rows[0];
    assert.deepEqual(limited, { database: m.database, username: m.app, host: m.host, port: m.port });
    const role = (await app.query('SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolinherit FROM pg_roles WHERE rolname=current_user')).rows[0];
    assert.ok(Object.values(role).every(v => v === false));
    const allowed = (await app.query("SELECT datname FROM pg_database WHERE datallowconn AND has_database_privilege(current_user,oid,'CONNECT') ORDER BY datname")).rows.map(r => r.datname);
    assert.deepEqual(allowed, [m.database]);
    if (requireEmpty) assert.equal((await app.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')")).rows[0].n, 0);
  }
  return { ...id, pid: pidCheck(), databases, emptyBeforeRestore: requireEmpty };
}
async function run(dir) {
  stage = 'verificacion_respaldo';
  if (S.hash(fs.readFileSync(S.BACKUP)) !== S.BACKUP_HASH || fs.statSync(S.BACKUP).size !== 124403 || fs.readFileSync(S.BACKUP).subarray(0, 5).toString() !== 'PGDMP') S.fail('RESPALDO_DISTINTO');
  const inventoryDoc = JSON.parse(fs.readFileSync(path.join(S.BACKUP_DIR, 'inventory.json')));
  const manifest = JSON.parse(fs.readFileSync(path.join(S.BACKUP_DIR, 'backup-manifest.json')));
  const expected = inventoryDoc.inventory;
  if (manifest.sha256 !== S.BACKUP_HASH || inventoryDoc.identity.cluster !== '7632825987452064788') S.fail('MANIFIESTO_NO_COINCIDE');
  const { TABLES, validarToc } = require('./preRelease03ProdBackup.cjs');
  assert.deepEqual(expected.tables, TABLES); assert.equal(expected.counts.reservaciones, '1150'); assert.equal(expected.counts.eventos_integracion, '136');
  for (const exe of ['postgres.exe', 'initdb.exe', 'pg_restore.exe', 'pg_dump.exe']) {
    const v = await S.ejecutar(exe, ['--version']);
    if (v.code !== 0 || !v.out.includes('18.3') || v.err.trim()) S.fail('VERSION_DE_HERRAMIENTAS_DISTINTA');
  }
  const toc = await S.ejecutar('pg_restore.exe', ['--list', S.BACKUP]);
  if (toc.code !== 0 || toc.err.trim()) S.fail('TOC_NO_VALIDO');
  assert.deepEqual(validarToc(toc.out, expected), manifest.toc);
  const createSql = await S.ejecutar('pg_restore.exe', ['--create', '--schema-only', '--file=-', S.BACKUP]);
  if (createSql.code !== 0 || createSql.err.trim()) S.fail('METADATOS_DE_CREACION_NO_LEIBLES');
  const databaseDefinition = createSql.out.split(/\r?\n/).find(line => line.startsWith('CREATE DATABASE sian_kaan_reservaciones '));
  if (!databaseDefinition || !databaseDefinition.includes("ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'Spanish_Mexico.1252'")) S.fail('LOCALE_DEL_RESPALDO_REQUIERE_REVISION');
  report.databaseSettingsExpected = { encoding: 'UTF8', localeProvider: 'libc', collate: 'Spanish_Mexico.1252', ctype: 'Spanish_Mexico.1252' };
  const backupContent = await S.huellasHerramienta('pg_restore.exe', ['--exit-on-error', '--file=-', S.BACKUP]);
  for (const table of TABLES) assert.equal(String(backupContent.tables[table].count), expected.counts[table]);
  passed('respaldo', 'SHA-256, tamaño, PGDMP, 122 entradas e inventario de 18 tablas coinciden.');
  report.backup = { filename: path.basename(S.BACKUP), sha256: S.BACKUP_HASH, bytes: 124403, toc: manifest.toc };
  console.log('RESPALDO_ORIGINAL_VERIFICADO');

  stage = 'preparacion_cluster';
  const real = fs.realpathSync(dir);
  if (!fs.existsSync(path.join(real, 'directory-security.json'))) S.fail('DIRECTORIO_PRIVADO_NO_PREPARADO');
  const port = await new Promise((resolve, reject) => { const s = net.createServer(); s.once('error', reject); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  const suffix = crypto.randomBytes(6).toString('hex');
  m = S.validarDestino({ dir: real, data: path.join(real, 'data'), port, host: '127.0.0.1', database: 'pre_release_03_restore_' + suffix, owner: 'pr03_restore_owner', app: 'pr03_restore_app', clusterName: 'pre_release_03_restore_' + suffix });
  if (fs.existsSync(m.data)) S.fail('DIRECTORIO_DATA_YA_EXISTE');
  const barrier = S.instalarBarrera(port);
  assert.throws(() => net.connect(5432, '127.0.0.1'), /RED_FUERA/); assert.throws(() => net.connect(55473, '127.0.0.1'), /RED_FUERA/);
  assert.throws(() => require('dotenv'), /CONFIGURACION_O_PROVEEDOR_BLOQUEADO/);
  assert.throws(() => require('../backend/config/database'), /POOL_PREDETERMINADO_NO_INYECTADO/);
  passed('barreras', '5432, 55473, dotenv y pool predeterminado rechazados antes de conectar/cargar configuración.');
  const secrets = { ownerPassword: crypto.randomBytes(32).toString('hex'), appPassword: crypto.randomBytes(32).toString('hex') };
  fs.writeFileSync(path.join(m.dir, 'credentials.dpapi'), protect(JSON.stringify(secrets)), { flag: 'wx' });
  const pwfile = path.join(m.dir, 'init-password.tmp'); fs.writeFileSync(pwfile, secrets.ownerPassword, { flag: 'wx' });
  try {
    const init = await S.ejecutar('initdb.exe', ['-D', m.data, '-U', m.owner, '--encoding=UTF8', '--locale=C', '--auth=scram-sha-256', '--pwfile=' + pwfile]);
    if (init.code !== 0) S.fail('INITDB_FALLO');
  } finally { fs.unlinkSync(pwfile); }
  fs.appendFileSync(path.join(m.data, 'postgresql.conf'), "\n# PRE-RELEASE-03-RESTORE: cluster nuevo privado\nlisten_addresses='127.0.0.1'\nport=" + m.port + "\ncluster_name='" + m.clusterName + "'\nunix_socket_directories=''\nlog_statement='none'\nlog_min_error_statement='panic'\n");
  await pgctl('start'); started = true; pidCheck();
  const { Pool } = require('pg');
  const make = (user, password, database = m.database, readonly = false) => {
    if (![m.database, 'postgres'].includes(database) || ![m.owner, m.app].includes(user)) S.fail('POOL_NO_AUTORIZADO');
    const p = new Pool({ host: m.host, port: m.port, database, user, password, max: 3, connectionTimeoutMillis: 5000, application_name: 'pre_release_03_restore',
      options: '-c search_path=public -c timezone=UTC -c statement_timeout=30000 -c lock_timeout=5000' + (readonly ? ' -c default_transaction_read_only=on' : '') });
    pools.push(p); return p;
  };
  const maintenance = make(m.owner, secrets.ownerPassword, 'postgres');
  const initial = (await maintenance.query("SELECT current_database() database,current_user username,current_setting('data_directory') data,inet_server_port() port,(SELECT system_identifier::text FROM pg_control_system()) system_identifier")).rows[0];
  if (initial.database !== 'postgres' || initial.username !== m.owner || path.resolve(initial.data) !== m.data || initial.port !== port || ['7632825987452064788', '7697702573746832088', '7697092329288606316'].includes(initial.system_identifier)) S.fail('CLUSTER_NUEVO_NO_ACREDITADO');
  assert.deepEqual((await maintenance.query('SELECT datname FROM pg_database ORDER BY datname')).rows.map(r => r.datname), ['postgres', 'template0', 'template1']);
  m.systemIdentifier = initial.system_identifier;
  await maintenance.query('CREATE ROLE ' + S.ident(m.app) + " LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD '" + secrets.appPassword + "'");
  await maintenance.query('CREATE DATABASE ' + S.ident(m.database) + ' OWNER ' + S.ident(m.app) + " TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER libc LOCALE 'Spanish_Mexico.1252'");
  for (const name of ['postgres', 'template1', m.database]) await maintenance.query('REVOKE ALL ON DATABASE ' + S.ident(name) + ' FROM PUBLIC');
  const admin = make(m.owner, secrets.ownerPassword), db = make(m.app, secrets.appPassword);
  await db.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
  const beforeIdentity = await identity(admin, db, true);
  const databaseSettings = (await admin.query("SELECT pg_encoding_to_char(encoding) encoding,datcollate collate,datctype ctype,datlocprovider provider,datcollversion stored_version,pg_database_collation_actual_version(oid) actual_version FROM pg_database WHERE datname=current_database()")).rows[0];
  assert.equal(databaseSettings.encoding, 'UTF8'); assert.equal(databaseSettings.collate, 'Spanish_Mexico.1252'); assert.equal(databaseSettings.ctype, 'Spanish_Mexico.1252'); assert.equal(databaseSettings.provider, 'c'); assert.equal(databaseSettings.stored_version, databaseSettings.actual_version);
  report.databaseSettings = databaseSettings;
  privateSave('manifest.json', m); save('aislamiento.json', { beforeRestore: beforeIdentity, limitedRole: m.app, providerConfigurationLoaded: false, defaultPoolLoaded: false });
  passed('aislamiento', 'Clúster nuevo con ID distinto, data/puerto/rol/base propios; base vacía y rol limitado solo a ella.');
  console.log('CLUSTER_NUEVO_VERIFICADO ' + JSON.stringify({ port, database: m.database, systemIdentifier: m.systemIdentifier }));

  stage = 'restauracion';
  const toolEnv = { PGPASSWORD: secrets.appPassword, PGCONNECT_TIMEOUT: '5', PGOPTIONS: '-c search_path=public -c timezone=UTC -c lock_timeout=5000 -c statement_timeout=60000' };
  const toolArgs = ['--host=127.0.0.1', '--port=' + port, '--username=' + m.app, '--no-password', '--dbname=' + m.database];
  const startRestore = performance.now();
  const restored = await S.ejecutar('pg_restore.exe', [...toolArgs, '--exit-on-error', '--single-transaction', '--no-owner', '--no-acl', S.BACKUP], toolEnv);
  report.restore = { seconds: (performance.now() - startRestore) / 1000, exitCode: restored.code, warnings: restored.err.trim() ? 1 : 0, options: ['--exit-on-error', '--single-transaction', '--no-owner', '--no-acl'], createOrClean: false, securityRestored: false };
  if (restored.code !== 0 || restored.err.trim()) S.fail('RESTAURACION_FALLO_O_ADVERTENCIA');
  await identity(admin, db);
  const meta = await S.metadatos(db);
  assert.deepEqual(meta.tables, TABLES);
  assert.deepEqual(meta.columns, expected.columns);
  assert.deepEqual(meta.constraints.map(S.canon), expected.constraints.map(S.canon));
  assert.deepEqual(meta.indexes, expected.indexes);
  const dumped = await S.huellasHerramienta('pg_dump.exe', [...toolArgs, '--format=plain', '--data-only', '--no-owner', '--no-acl'], { ...toolEnv, PGOPTIONS: toolEnv.PGOPTIONS + ' -c default_transaction_read_only=on' });
  assert.deepEqual(dumped, backupContent);
  const originalKeys = await S.originales(db, meta);
  const baseline = await S.originales(db, meta, originalKeys);
  const sequences = await S.secuencias(db, meta);
  assert.equal(sequences.length, 17);
  for (const s of sequences) assert.deepEqual({ name: s.name, last_value: s.last_value, is_called: s.is_called }, backupContent.sequences.find(v => v.name === s.name));
  const fks = await S.integridad(db); assert.equal(fks.length, 18);
  privateSave('baseline-private.json', { metadata: meta, keys: originalKeys, signatures: baseline, sequences });
  report.beforeMigration = { counts: Object.fromEntries(Object.entries(baseline).map(([t, v]) => [t, v.count])), tables: meta.tables.length, sequences: sequences.length, pk: 18, fk: fks.length, unique: 12, checks: 15, indexes: meta.indexes.length, dataFingerprintsMatchBackup: true, sequencesMatchBackup: true, nextIdentifiersSafe: true, orphanCounts: fks };
  passed('restauracion_integra', '18 tablas: contenido COPY completo, columnas/restricciones/índices y 17 secuencias coinciden con el respaldo; 18 FK sin huérfanos.');
  console.log('RESTAURACION_INTEGRA_ANTES_DE_017');

  stage = 'ensayo_017';
  const result = await require('./preRelease03RestoreCases.cjs').probar({ db, admin, m, make, secrets, identity, meta, originalKeys, baseline, sequences, barrier, passed, report });
  privateSave('result-private.json', result);
  const final = await S.originales(db, meta, originalKeys); assert.deepEqual(final, baseline);
  assert.equal((await db.query('SELECT count(*)::int n FROM eventos_integracion WHERE id_evento_integracion=ANY($1::int[]) AND (archived_at IS NOT NULL OR archived_by IS NOT NULL OR archive_reason IS NOT NULL)', [originalKeys.eventos_integracion.map(k => k.id_evento_integracion)])).rows[0].n, 0);
  const finalFks = await S.integridad(db); assert.equal(finalFks.length, 19);
  report.originalData = { all18TablesUnchanged: true, signatures: final, originalEventsUnarchived: 136, events124and126Unchanged: true, allOriginalLinksPreserved: true };
  report.finalSequences = await S.secuencias(db, meta);
  report.finalIdentity = await identity(admin, db);
  report.network = { blockedAttempts: barrier.blocked, allowedPostgresPort: port, mainAndDevConnected: false, previousLabConnected: false, dotenvLoaded: false };
  assert.equal(S.hash(fs.readFileSync(S.BACKUP)), S.BACKUP_HASH);
  passed('conservacion_final', 'Firmas de todas las filas/columnas originales y sus vínculos iguales; 136 eventos originales sin archivo, incluidos 124/126.');
  report.completed = true;
}
async function inspect(dir) {
  stage = 'inspeccion_solo_lectura'; report.inspection = true;
  m = S.validarDestino(JSON.parse(fs.readFileSync(path.join(fs.realpathSync(dir), 'manifest.json'), 'utf8')));
  if (path.resolve(dir) !== m.dir || fs.existsSync(path.join(m.data, 'postmaster.pid'))) S.fail('INSPECCION_EXIGE_LAB_PROPIO_DETENIDO');
  S.instalarBarrera(m.port);
  const encrypted = fs.readFileSync(path.join(m.dir, 'credentials.dpapi'), 'utf8');
  const secrets = JSON.parse(ps("$s=ConvertTo-SecureString -String ([Console]::In.ReadToEnd()); [System.Net.NetworkCredential]::new('', $s).Password", encrypted));
  await pgctl('start'); started = true;
  const { Pool } = require('pg');
  const db = new Pool({ host: m.host, port: m.port, database: m.database, user: m.owner, password: secrets.ownerPassword, connectionTimeoutMillis: 5000, options: '-c default_transaction_read_only=on -c search_path=public' }); pools.push(db);
  await identity(db);
  const actual = await S.metadatos(db), expected = JSON.parse(fs.readFileSync(path.join(S.BACKUP_DIR, 'inventory.json'))).inventory;
  const differences = actual.constraints.map(c => ({ restored: S.canon(c), backup: expected.constraints.map(S.canon).find(b => b.table_name === c.table_name && b.name === c.name) })).filter(pair => JSON.stringify(pair.restored) !== JSON.stringify(pair.backup));
  report.metadataDifferences = differences;
  console.log('DIFERENCIAS_DE_METADATOS ' + JSON.stringify(differences));
  report.completed = true;
}
async function main() {
  if (process.argv.length !== 4 || !['--new-lab', '--inspect-lab'].includes(process.argv[2])) S.fail('AUTORIZACION_CLI_REQUERIDA');
  try { if (process.argv[2] === '--inspect-lab') await inspect(process.argv[3]); else await run(process.argv[3]); }
  catch (error) { report.failure = { stage, code: /^[A-Z_0-9]+$/.test(error.code || '') ? error.code : error.name, sourceFrames: String(error.stack || '').split('\n').filter(line => /^\s+at /.test(line)).slice(0, 3) }; throw error; }
  finally {
    for (const p of pools) await p.end().catch(() => {});
    if (started || (m && fs.existsSync(path.join(m.data, 'postmaster.pid')))) {
      try { await pgctl('stop'); report.serverStopped = !fs.existsSync(path.join(m.data, 'postmaster.pid')); }
      catch { report.serverStopped = false; }
    }
    report.finishedAt = new Date().toISOString(); report.lab = m ? { ...m } : null;
    save(report.inspection ? 'inspeccion.json' : report.completed ? 'resultado.json' : 'fallo.json', report);
  }
  if (!report.serverStopped) S.fail('SERVIDOR_PROPIO_NO_DETENIDO');
  console.log(report.inspection ? 'INSPECCION_SIN_MIGRACION_OK' : 'PRE_RELEASE_03_RESTORE_OK');
}
main().catch(error => { console.error('PRE_RELEASE_03_RESTORE_DETENIDO ' + stage + ' ' + (/^[A-Z_0-9]+$/.test(error.code || '') ? error.code : error.name)); process.exitCode = 1; });
