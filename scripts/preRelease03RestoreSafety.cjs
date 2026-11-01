// Herramientas de laboratorio: sin .env ni destino de respaldo a principal.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const net = require('node:net'), Module = require('node:module');
const readline = require('node:readline'), { spawn } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const BIN = 'C:\\Program Files\\PostgreSQL\\18\\bin';
const BACKUP_DIR = path.join(ROOT, '.access-scope-lab/pre-release-03-main-backup/run-20261017T212123838Z-9d91b157');
const BACKUP = path.join(BACKUP_DIR, 'sian_kaan_reservaciones_2026-10-17T21-21-24-484Z_d403e067.backup');
const BACKUP_HASH = '99ea69f746333879c77ce0f434181f372d12f582acf0d51641b7544d0aae660e';
const MIGRATION_HASH = '5dd8c57790aa368a3ce2d6be96e2f186db1fbc491e881e21fccbfa07e1bfb817';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const ident = value => { if (!/^[a-z_][a-z0-9_]*$/.test(value)) fail('IDENTIFICADOR_INVALIDO'); return '"' + value + '"'; };
function env(extra = {}) {
  const result = {};
  for (const key of ['SystemRoot', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'PATH', 'PATHEXT', 'SystemDrive']) if (process.env[key] !== undefined) result[key] = process.env[key];
  return Object.assign(result, extra);
}
function validarDestino(m) {
  const base = path.join(ROOT, '.access-scope-lab/pre-release-03-restore');
  if (path.dirname(m.dir) !== base || !/^run-[a-zA-Z0-9-]+$/.test(path.basename(m.dir)) || path.resolve(m.data) !== path.join(m.dir, 'data')
    || !/^pre_release_03_restore_[a-z0-9]{8,28}$/.test(m.database) || !Number.isInteger(m.port) || m.port < 1024
    || [5432, 55473, 55432, 65435, 51621, 53043, 62415].includes(m.port) || m.host !== '127.0.0.1'
    || m.owner !== 'pr03_restore_owner' || m.app !== 'pr03_restore_app') fail('DESTINO_DE_RESTAURACION_NO_AUTORIZADO');
  return m;
}
function instalarBarrera(port) {
  const allowed = new Set([port]), blocked = [];
  const original = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    const a = Array.isArray(args[0]) ? args[0] : args, o = a[0];
    const host = typeof o === 'object' ? o.host : a[1], targetPort = Number(typeof o === 'object' ? o.port : o);
    if (host !== '127.0.0.1' || !allowed.has(targetPort)) { blocked.push({ host: String(host), port: targetPort }); fail('RED_FUERA_DEL_LABORATORIO_BLOQUEADA'); }
    return original.apply(this, args);
  };
  const load = Module._load;
  Module._load = function (request, parent, isMain) {
    if (/^(dotenv(?:\/|$)|googleapis(?:\/|$)|@google-cloud\/)/.test(request)) fail('CONFIGURACION_O_PROVEEDOR_BLOQUEADO');
    if (request.startsWith('.') || path.isAbsolute(request)) {
      const file = Module._resolveFilename(request, parent);
      if (file === path.join(ROOT, 'backend/server.js') || file === path.join(ROOT, 'electron/main.js')) fail('ARRANQUE_REAL_BLOQUEADO');
      if (file === path.join(ROOT, 'backend/config/database.js') && !require.cache[file]) fail('POOL_PREDETERMINADO_NO_INYECTADO');
    }
    return load.call(this, request, parent, isMain);
  };
  return { blocked, allowApi(p) { if ([5432, 55473].includes(p) || p === port) fail('PUERTO_API_INVALIDO'); allowed.add(p); } };
}
function ejecutar(exe, args, extra = {}, timeout = 90000) {
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(BIN, exe), args, { env: env(extra), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', c => { out += c; }); child.stderr.on('data', c => { err += c; });
    const timer = setTimeout(() => { child.kill(); reject(Object.assign(new Error('HERRAMIENTA_TIMEOUT'), { code: 'HERRAMIENTA_TIMEOUT' })); }, timeout);
    child.once('error', () => { clearTimeout(timer); reject(Object.assign(new Error('HERRAMIENTA_NO_INICIADA'), { code: 'HERRAMIENTA_NO_INICIADA' })); });
    child.once('close', code => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}
function consumirCopy(stream) {
  return (async () => {
    const tables = {}, sequences = []; let current = null;
    for await (const line of readline.createInterface({ input: stream, crlfDelay: Infinity })) {
      if (current) {
        if (line === '\\.') { current.hashes.sort(); current.sha256 = hash(current.hashes.join('')); delete current.hashes; current = null; }
        else { current.count++; current.hashes.push(hash(line)); }
        continue;
      }
      const copy = line.match(/^COPY public\.([a-z_][a-z0-9_]*) (\(.*\)) FROM stdin;$/);
      if (copy) { if (tables[copy[1]]) fail('COPY_DUPLICADO'); current = tables[copy[1]] = { columns: copy[2], count: 0, hashes: [] }; continue; }
      const seq = line.match(/^SELECT pg_catalog\.setval\('public\.([a-z_][a-z0-9_]*)', (-?\d+), (true|false)\);$/);
      if (seq) sequences.push({ name: seq[1], last_value: seq[2], is_called: seq[3] === 'true' });
    }
    if (current) fail('COPY_INCOMPLETO');
    return { tables: Object.fromEntries(Object.entries(tables).sort()), sequences: sequences.sort((a, b) => a.name.localeCompare(b.name)) };
  })();
}
async function huellasHerramienta(exe, args, extra = {}) {
  const child = spawn(path.join(BIN, exe), args, { env: env(extra), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let err = ''; child.stderr.on('data', c => { err += c; });
  const completion = new Promise((resolve, reject) => { child.once('close', resolve); child.once('error', () => reject(Object.assign(new Error('HUELLAS_NO_INICIADAS'), { code: 'HUELLAS_NO_INICIADAS' }))); });
  const result = await consumirCopy(child.stdout);
  if (await completion !== 0 || err.trim()) fail('HUELLAS_HERRAMIENTA_FALLO');
  return result;
}
async function metadatos(db) {
  const columns = (await db.query("SELECT table_name,column_name,data_type,character_maximum_length,is_nullable,column_default,is_identity,identity_generation FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
  const constraints = (await db.query("SELECT t.relname table_name,c.conname name,c.contype type,c.convalidated validated,pg_get_constraintdef(c.oid) definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY 1,2")).rows;
  const indexes = (await db.query("SELECT t.relname table_name,i.relname name,x.indisvalid valid,x.indisready ready FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY 1,2")).rows;
  const primary = (await db.query("SELECT t.relname table_name,array_agg(a.attname::text ORDER BY k.ord) columns FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.attnum WHERE n.nspname='public' AND c.contype='p' GROUP BY t.relname ORDER BY 1")).rows;
  return { tables: primary.map(p => p.table_name), columns, constraints, indexes, primary };
}
function canon(c) {
  const known = ['chk_equivalencias_tours_externos_turno', 'chk_eventos_integracion_application_status', 'chk_eventos_integracion_review_status', 'chk_operaciones_tour_turno', 'chk_reservaciones_turno', 'chk_usuarios_alcance_plataformas'];
  if (c.type !== 'c' || !known.includes(c.name)) return c;
  return { ...c, definition: c.definition.replace(/\(ARRAY\[([^\]]+)\]\)::text\[\]/g, (_, body) => 'ARRAY[' + body.replace(/'((?:[^']|'')*)'::character varying/g, "'$1'::text") + ']').replace(/\('((?:[^']|'')*)'::character varying\)::text/g, "'$1'::text") };
}
async function secuencias(db, meta) {
  const result = [];
  for (const c of meta.columns.filter(c => c.is_identity === 'YES')) {
    const name = (await db.query('SELECT pg_get_serial_sequence($1,$2) name', ['public.' + c.table_name, c.column_name])).rows[0].name;
    if (!/^public\.[a-z_][a-z0-9_]*$/.test(name || '')) fail('SECUENCIA_INVALIDA');
    const state = (await db.query('SELECT last_value::text,is_called FROM public.' + ident(name.slice(7)))).rows[0];
    const increment = (await db.query('SELECT seqincrement::text increment FROM pg_sequence WHERE seqrelid=$1::regclass', [name])).rows[0].increment;
    const max = (await db.query('SELECT max(' + ident(c.column_name) + ')::text max FROM public.' + ident(c.table_name))).rows[0].max;
    const next = BigInt(state.last_value) + (state.is_called ? BigInt(increment) : 0n);
    if (BigInt(increment) <= 0n || (max !== null && next <= BigInt(max))) fail('PROXIMO_IDENTIFICADOR_INSEGURO');
    result.push({ table: c.table_name, column: c.column_name, name: name.slice(7), ...state, increment, max, next: next.toString(), nextIsSafe: true });
  }
  return result;
}
async function originales(db, meta, keys) {
  const result = {};
  for (const table of meta.tables) {
    const pk = meta.primary.find(p => p.table_name === table).columns;
    if (!keys) {
      // Todos los PK del esquema acreditado son enteros; no se leen nombres/clientes.
      const rows = (await db.query('SELECT ' + pk.map(ident).join(',') + ' FROM public.' + ident(table) + ' ORDER BY ' + pk.map(ident).join(','))).rows;
      result[table] = rows; continue;
    }
    const cols = meta.columns.filter(c => c.table_name === table).map(c => ident(c.column_name)).join(',');
    const match = pk.map(c => 'k.' + ident(c) + '=x.' + ident(c)).join(' AND ');
    const typed = pk.map(c => ident(c) + ' integer').join(',');
    const sql = 'SELECT count(*)::int count,encode(sha256(convert_to(COALESCE(string_agg(encode(sha256(convert_to(to_jsonb(r)::text,\'UTF8\')),\'hex\'),\'\' ORDER BY ' + pk.map(c => 'r.' + ident(c)).join(',') + '),\'\'),\'UTF8\')),\'hex\') sha256 FROM (SELECT ' + cols + ' FROM public.' + ident(table) + ' x WHERE EXISTS (SELECT 1 FROM jsonb_to_recordset($1::jsonb) AS k(' + typed + ') WHERE ' + match + ')) r';
    result[table] = (await db.query(sql, [JSON.stringify(keys[table])])).rows[0];
  }
  return result;
}
async function integridad(db) {
  const fks = (await db.query("SELECT c.conname name,s.relname source,t.relname target,(SELECT array_agg(a.attname::text ORDER BY k.ord) FROM unnest(c.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num) source_columns,(SELECT array_agg(a.attname::text ORDER BY k.ord) FROM unnest(c.confkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num) target_columns FROM pg_constraint c JOIN pg_class s ON s.oid=c.conrelid JOIN pg_class t ON t.oid=c.confrelid JOIN pg_namespace n ON n.oid=s.relnamespace WHERE c.contype='f' AND n.nspname='public' ORDER BY c.conname")).rows;
  const result = [];
  for (const f of fks) {
    const join = f.source_columns.map((c, i) => 's.' + ident(c) + '=t.' + ident(f.target_columns[i])).join(' AND ');
    const nonnull = f.source_columns.map(c => 's.' + ident(c) + ' IS NOT NULL').join(' AND ');
    const n = (await db.query('SELECT count(*)::int n FROM public.' + ident(f.source) + ' s WHERE ' + nonnull + ' AND NOT EXISTS(SELECT 1 FROM public.' + ident(f.target) + ' t WHERE ' + join + ')')).rows[0].n;
    if (n) fail('INTEGRIDAD_REFERENCIAL_FALLO');
    result.push({ constraint: f.name, orphans: n });
  }
  return result;
}
module.exports = { ROOT, BIN, BACKUP_DIR, BACKUP, BACKUP_HASH, MIGRATION_HASH, hash, ident, fail, env, validarDestino, instalarBarrera, ejecutar, consumirCopy, huellasHerramienta, metadatos, canon, secuencias, originales, integridad };
