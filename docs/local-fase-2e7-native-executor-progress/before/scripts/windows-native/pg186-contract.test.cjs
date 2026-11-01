'use strict';
// Solo fixtures: ninguna llamada SQL, proceso o comprobación de firma real.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const PG = require('../../shared/postgresExperimentalContract');
const C = require('../windows-installers/postgres-service-contract.cjs');
const root = path.resolve(__dirname, '../..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');
const fail = code => { throw Error(code); };
const banner = tool => tool + ' (PostgreSQL) 18.6';
for (const tool of PG.TOOLS) test('salida exacta vinculada a herramienta: ' + tool, () => {
  for (const suffix of ['', '\n', '\r\n']) assert.equal(PG.matchesToolVersion(tool, banner(tool) + suffix), true);
  for (const value of ['18.3', '18.4', '18.5', '18.60', '18.6.1', '18.7', '19.6'])
    assert.equal(PG.matchesToolVersion(tool, tool + ' (PostgreSQL) ' + value), false);
  for (const output of [banner(tool) + '-vendor', banner(tool) + '\nwarning', 'prefix ' + banner(tool),
    banner(tool) + '\0', banner(tool) + '\n\n', banner(tool) + '\r', 'PostgreSQL 18.6',
    Buffer.from(banner(tool)), null, undefined]) assert.equal(PG.matchesToolVersion(tool, output), false);
  assert.equal(PG.matchesToolVersion(tool, banner(tool === 'postgres' ? 'initdb' : 'postgres')), false);
});
test('ningún nombre ajeno o argumento es una herramienta admitida', () => {
  for (const tool of ['unknown', '..\\initdb', 'initdb.exe', 'initdb & whoami', 'INITDB', null])
    assert.equal(PG.matchesToolVersion(tool, banner(tool)), false);
  assert.equal(Object.isFrozen(PG), true); assert.equal(Object.isFrozen(PG.TOOLS), true);
  assert.equal(PG.productionAuthorized, false); assert.equal(PG.operationallyApproved, false);
});
function policyHarness() {
  const checks = [], kills = [], nativeQueries=[], module = { exports: {} };
  const manifest = { database: 'ctsk_install_' + 'a'.repeat(24), runtime: 'ctsk_standalone_runtime',
    pgPort: 23456, cluster: '8000000000000000001', dataDirectory: 'C:\\Synthetic\\data', root: 'C:\\Synthetic\\app' };
  const plan = { manifest, digest: 'a', filename: 'plan', trustFile: 'trust' };
  const nativeService={postmasterPid:123,systemIdentifier:manifest.cluster,serviceState:'running'};
  vm.runInNewContext(source('backend/config/enterprise026Policy.js') + '\nreadPlan=()=>injectedPlan;', {
    module, __dirname: 'C:\\Synthetic\\app\\backend\\config', injectedPlan: plan,
    process: { kill: (...args) => kills.push(args) },
    require(id) {
      if (id === 'node:path') return path.win32;
      if (id === 'node:fs') return { readFileSync: () => '123\n' + manifest.dataDirectory + '\n0\n23456\n' };
      if (id === '../../shared/release026') return { fail };
      if (id === '../../shared/postgresExperimentalContract') return PG;
      if (id === '../../scripts/enterprise026Provision.cjs') return {control(_manifest,action){nativeQueries.push(action);return nativeService;}};
      if (id === './unifiedHttpPolicy') return {};
      if (id === './desktopPostgres') return { IDENTITY_SQL: 'IDENTITY', ROLE_SQL: 'ROLE' };
      if (['./credentialSchema', './integration024Policy', './manualReferences025Policy'].includes(id))
        return { verify: async () => checks.push(id) };
      if (id.startsWith('.')) throw Error('UNEXPECTED_IMPORT:' + id);
      return require(id);
    }
  });
  return { P: module.exports, manifest, plan, checks, kills,nativeQueries,nativeService };
}
const runtime = m => ({ database: m.database, username: m.runtime, port: m.pgPort,
  address: '127.0.0.1', schema: 'public', version: '180006', cluster_allowed: true });
function fakeDb(h, row, cluster = h.manifest.cluster, unsafe = false) {
  const calls = []; let released = false;
  const db = { async query(sql) { calls.push(sql);
    if (sql === 'IDENTITY') return { rows: [row] };
    if (sql === 'ROLE') return { rows: [{ unsafe }] };
    if (sql.includes('SELECT system_identifier::text cluster')) return { rows: [{ cluster }] };
    return { rows: [] };
  }, release() { released = true; } };
  return { db, pool: { connect: async () => db }, calls, released: () => released };
}
test('configuración experimental acepta solo 18.6 y conserva identidad de destino', () => {
  const h = policyHarness(), m = h.manifest;
  const c = { APP_ENVIRONMENT: 'enterprise026', DB_HOST: 'localhost', DB_PORT: String(m.pgPort),
    DB_NAME: m.database, DB_CLUSTER_ID: m.cluster, DB_USER: m.runtime, DB_SCHEMA_VERSION: '023',
    DB_SERVER_VERSION: '18.6', GYG_GMAIL_SYNC_ENABLED: 'false', DB_PASSWORD: 'a'.repeat(64), JWT_SECRET: 'b'.repeat(64) };
  assert.equal(h.P.validateConfig(c, m), c);
  for (const version of ['18.3', '18.60', '18.6\n', 18.6, null])
    assert.throws(() => h.P.validateConfig({ ...c, DB_SERVER_VERSION: version }, m), /ENTERPRISE026_CONFIG/);
  for (const patch of [{ DB_NAME: 'sian_kaan_reservaciones' }, { DB_PORT: '5432' }, { DB_CLUSTER_ID: 'other' },
    { DB_USER: 'postgres' }, { DB_HOST: 'remote' }])
    assert.throws(() => h.P.validateConfig({ ...c, ...patch }, m), /ENTERPRISE026_CONFIG/);
});
test('runtime 180006 sigue verificando clúster, roles y contratos posteriores', async () => {
  const h = policyHarness(), f = fakeDb(h, runtime(h.manifest));
  await h.P.verify(f.pool, h.plan);
  assert.equal(h.checks.length, 3); assert.equal(f.released(), true);
  assert.equal(f.calls[0], 'BEGIN READ ONLY'); assert.equal(f.calls.at(-1), 'ROLLBACK');
});
for (const version of ['180003', '180004', '180060', '180006\n', 180006, null, undefined]) {
  test('SQL runtime rechaza versión distinta o ambigua: ' + JSON.stringify(version), async () => {
    const h = policyHarness(), f = fakeDb(h, { ...runtime(h.manifest), version });
    await assert.rejects(h.P.verify(f.pool, h.plan), /ENTERPRISE026_RUNTIME_IDENTITY/);
    assert.equal(h.checks.length, 0); assert.equal(f.released(), true); assert.equal(f.calls.at(-1), 'ROLLBACK');
  });
  test('SQL mantenimiento rechaza la misma versión antes de comprobar PID: ' + JSON.stringify(version), async () => {
    const h = policyHarness(), m = h.manifest;
    const row = { db: m.database, principal: 'ctsk_standalone_admin', session: 'ctsk_standalone_admin',
      address: '127.0.0.1', port: m.pgPort, directory: m.dataDirectory, cluster: m.cluster, version };
    await assert.rejects(h.P.maintenanceIdentity({ query: async () => ({ rows: [row] }) }, h.plan), /ENTERPRISE026_DATABASE_IDENTITY/);
    assert.equal(h.kills.length, 0);
  });
}
test('mantenimiento 180006 conserva comprobación de proceso y clúster', async () => {
  const h = policyHarness(), m = h.manifest;
  const row = { db: m.database, principal: 'ctsk_standalone_admin', session: 'ctsk_standalone_admin',
    address: '127.0.0.1', port: m.pgPort, directory: m.dataDirectory, cluster: m.cluster, version: '180006' };
  await h.P.maintenanceIdentity({ query: async () => ({ rows: [row] }) }, h.plan);
  assert.deepEqual(h.kills, []);assert.deepEqual(h.nativeQueries,['query']);
  h.nativeService.postmasterPid=999;await assert.rejects(h.P.maintenanceIdentity({ query:async()=>({rows:[row]}) },h.plan),/ENTERPRISE026_CLUSTER_PROCESS/);h.nativeService.postmasterPid=123;
  await assert.rejects(h.P.maintenanceIdentity({ query: async () => ({ rows: [{ ...row, cluster: 'other' }] }) }, h.plan), /ENTERPRISE026_DATABASE_IDENTITY/);
});
for (const [label, patch, cluster, unsafe] of [
  ['base protegida', { database: 'sian_kaan_reservaciones' }], ['base dev', { database: 'sian_kaan_reservaciones_dev' }],
  ['usuario SQL', { username: 'postgres' }], ['puerto', { port: 5432 }], ['red', { address: '10.0.0.1' }],
  ['esquema', { schema: 'other' }], ['privilegio control_system', { cluster_allowed: false }],
  ['otro clúster', {}, '8000000000000000002'], ['rol inseguro', {}, undefined, true]
]) test('180006 no permite relajar: ' + label, async () => {
  const h = policyHarness(), f = fakeDb(h, { ...runtime(h.manifest), ...patch }, cluster, unsafe);
  await assert.rejects(h.P.verify(f.pool, h.plan), /ENTERPRISE026_RUNTIME_IDENTITY/);
  assert.equal(h.checks.length, 0); assert.equal(f.released(), true);
});
function provisionHarness(output) {
  const module = { exports: {} }, calls = [];
  vm.runInNewContext(source('scripts/enterprise026Provision.cjs'), { module, process: { env: {} },
    require(id) {
      if (id === 'node:child_process') return { execFileSync(exe, args) { calls.push({ exe, args }); return args[0] === '--version' ? output : 'MOCKED_OPERATION'; } };
      if (id === '../shared/release026') return { fail };
      if (id === '../shared/postgresExperimentalContract') return PG;
      if (id === '../backend/config/desktopPolicy') return { cleanEnvironment: () => ({}) };
      if (id.startsWith('.')) throw Error('UNEXPECTED_IMPORT'); return require(id);
    }
  }); return { Q: module.exports, calls };
}
test('aprovisionamiento simulado acepta salida exacta y rechaza antes de la operación', () => {
  const valid = provisionHarness(banner('initdb') + '\r\n');
  assert.equal(valid.Q.tool('initdb', ['SYNTHETIC-ONLY']), 'MOCKED_OPERATION'); assert.equal(valid.calls.length, 2);
  for (const bad of ['initdb (PostgreSQL) 18.3', banner('postgres'), banner('initdb') + '\nerror', 'prefix 18.6']) {
    const h = provisionHarness(bad); assert.throws(() => h.Q.tool('initdb', []), /PROVISION_TOOL_VERSION/);
    assert.equal(h.calls.length, 1); assert.equal(h.calls[0].args[0], '--version');
  }
  for (const name of ['unknown', '..\\initdb', 'initdb.exe', 'initdb & whoami']) {
    const h = provisionHarness(banner(name));
    assert.throws(() => h.Q.tool(name, []), /PROVISION_TOOL_VERSION/); assert.equal(h.calls.length, 0);
  }
});
function controlHarness(mixedTool) {
  const module = { exports: {} }, calls = [];
  // Regresión histórica: esta ruta fue reemplazada por capacidad nativa fail-closed.
  vm.runInNewContext(source('docs/local-fase-2e7-optionc-implementation/before/scripts/windows-installers/server-control.cjs'), {
    module, __dirname: 'C:\\Synthetic\\server\\tools', process: { argv: [], env: {} }, console: { log() {} },
    require(id) {
      if (id === 'node:path') return path.win32;
      if (id === 'node:fs') return {};
      if (id === 'node:child_process') return { execFileSync(exe, args) {
        calls.push({ exe, args }); const tool = path.win32.basename(exe, '.exe');
        return tool + ' (PostgreSQL) ' + (tool === mixedTool ? '18.3' : '18.6') + '\r\n';
      } };
      if (id === './payload.cjs') return { verify() {} };
      if (id.endsWith('enterprise026Provision.cjs')) return { environment: () => ({}), control: () => fail('UNEXPECTED_CONTROL') };
      if (id.endsWith('enterprise026Policy.js')) return { readPlan: () => ({}) };
      if (id.endsWith('postgresExperimentalContract.js')) return PG;
      throw Error('UNEXPECTED_IMPORT:' + id);
    }
  }); return { run: module.exports.run, calls };
}
test('regresión histórica: preflight exigía seis herramientas 18.6 sin iniciar clúster', async () => {
  const h = controlHarness(); await h.run(['check', 'plan', 'trust']);
  assert.equal(h.calls.length, 6); assert.ok(h.calls.every(c => c.args.length === 1 && c.args[0] === '--version'));
});
for (const tool of PG.TOOLS) test('regresión histórica: preflight rechaza mezcla en ' + tool, async () => {
  const h = controlHarness(tool); await assert.rejects(h.run(['check', 'plan', 'trust']), /POSTGRES_PREREQUISITE_VERSION/);
  assert.equal(h.calls.length, PG.TOOLS.indexOf(tool) + 1);
});
test('plan futuro liga versión y SQL sin declararse autorizado para operar', () => {
  const p = C.createPlan({ installationId: '11111111-2222-4333-8444-555555555555', pgPort: 23456 });
  assert.equal(p.postgresVersion, '18.6'); assert.equal(p.serverVersionNum, '180006');
  assert.equal(p.operationallyApproved, false); assert.equal(p.productionAuthorized, false);
  assert.throws(() => C.reviewCmdContext({ ...p, postgresVersion: '18.3' }, {}), /PG_SERVICE_PLAN/);
  assert.throws(() => C.reviewCmdContext({ ...p, serverVersionNum: '180003' }, {}), /PG_SERVICE_PLAN/);
});
