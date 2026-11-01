'use strict';
// Pruebas offline: fuentes oficiales como texto, contratos y fixtures sintéticos.
// Ninguna llamada C/Windows se ejecuta y ninguna salida se considera atestación.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('./postgres-service-contract.cjs');
const { assess } = require('../windows-native/probe-contract.cjs');
const evidence = path.resolve(__dirname, '../../docs/local-fase-2e7-postgresql-exception');
const source = name => fs.readFileSync(path.join(evidence, 'sources', name + '.txt'), 'utf8');
const input = { installationId: '11111111-2222-4333-8444-555555555555', pgPort: 23456 };
const sid = 'S-1-5-80-1-2-3-4-5';
function cmdFixture() {
  const p = C.createPlan(input);
  return { version: 1, scope: p.scope, productionAuthorized: false, principalSid: sid, expectedPrincipalSid: sid,
    comspec: p.comspec, cmdSha256: 'a'.repeat(64), enrolledCmdSha256: 'a'.repeat(64),
    registry: { machine64: 'absent', machine32: 'absent', principal64: 'absent', principal32: 'absent' },
    registryReadComplete: true, registryAclStable: true,
    environment: { SystemRoot: 'C:\\Windows', WINDIR: 'C:\\Windows', COMSPEC: p.comspec,
      PATH: 'C:\\Program Files\\PostgreSQL\\18\\bin;C:\\Windows\\System32', PGDATA: p.dataDirectory,
      TEMP: path.win32.join(p.directory, 'private'), TMP: path.win32.join(p.directory, 'private') } };
}
function binding() {
  const p = C.createPlan(input);
  return { scope: p.scope, productionAuthorized: false, installationId: p.installationId,
    serviceName: p.serviceName, serviceAccount: p.serviceAccount, serviceSid: sid, dataDirectory: p.dataDirectory,
    systemIdentifier: '8000000000000000001', database: 'ctsk_install_' + 'b'.repeat(24), pgPort: p.pgPort,
    postgresImageSha256: 'c'.repeat(64), postgresCreatedAt: '0123456789abcdef', postgresPid: 12345 };
}
const stopped = () => ({ serviceState: 'stopped', postgresHandleSignaled: true, ownedProcessTreeEmpty: true,
  pidFileAbsent: true, portReleased: true, cleanShutdownRecorded: true, identityRechecked: true });
test('plan cerrado propone servicio exclusivo, nunca comandos libres', () => {
  const p = C.createPlan(input);
  assert.ok(Object.isFrozen(p)); assert.ok(Object.isFrozen(p.initArgs));
  assert.ok(p.serviceArgs.includes('runservice')); assert.ok(!p.serviceArgs.includes('-o'));
  assert.ok(p.initArgs.includes('--auth=scram-sha-256'));
  assert.equal(p.operationallyApproved, false);
  for (const extra of ['args', 'command', 'serviceAccount', 'directory', 'password', 'shell', 'programFiles'])
    assert.throws(() => C.createPlan({ ...input, [extra]: 'untrusted' }), /PG_SERVICE_PLAN/);
});
for (const id of ['x & whoami', '%PATH%', '!X!', '..\\outside', input.installationId + '\n', null])
  test('identificador no interpola rutas ni comandos: ' + JSON.stringify(id), () => {
    assert.throws(() => C.createPlan({ ...input, installationId: id }), /PG_SERVICE_PLAN/);
  });
for (const port of [5432, 0, 1023, 65536, '23456', NaN]) test('puerto reservado o ambiguo: ' + port, () => {
  assert.throws(() => C.createPlan({ ...input, pgPort: port }), /PG_SERVICE_PLAN/);
});
test('el contrato no importa procesos, registro ni herramientas nativas', () => {
  const text = fs.readFileSync(path.join(__dirname, 'postgres-service-contract.cjs'), 'utf8');
  assert.ok(!/child_process|execFile|spawn\(|powershell|EncodedCommand|\.cmd\b|\.bat\b/.test(text));
});
test('evidencia sintética aceptada nunca autoriza instalación', () => {
  const p = C.createPlan(input);
  for (const result of [C.reviewCmdContext(p, cmdFixture()), C.reviewClusterBinding(p, binding(), binding()), C.reviewStopped(stopped())])
    assert.equal(result.operationallyApproved, false);
});
for (const key of ['machine64', 'machine32', 'principal64', 'principal32'])
  test('AutoRun presente, vacío o desconocido bloquea: ' + key, () => {
    for (const value of ['present', 'empty', 'unknown', null, false]) {
      const e = cmdFixture(); e.registry[key] = value;
      assert.throws(() => C.reviewCmdContext(C.createPlan(input), e), /PG_CMD_AUTORUN_UNPROVEN/);
    }
    const e = cmdFixture(); delete e.registry[key];
    assert.throws(() => C.reviewCmdContext(C.createPlan(input), e), /PG_CMD_AUTORUN_UNPROVEN/);
  });
test('leer registro del instalador no acredita el del principal de PostgreSQL', () => {
  const e = cmdFixture(); e.principalSid = 'S-1-5-21-1-2-3-1001';
  assert.throws(() => C.reviewCmdContext(C.createPlan(input), e), /PG_CMD_PRINCIPAL/);
});
test('registro parcial o mutable falla cerrado', () => {
  for (const key of ['registryReadComplete', 'registryAclStable']) for (const value of [false, 'true', null]) {
    const e = cmdFixture(); e[key] = value;
    assert.throws(() => C.reviewCmdContext(C.createPlan(input), e), /PG_CMD_AUTORUN_UNPROVEN/);
  }
});
for (const name of ['PG_RESTRICT_EXEC', 'PGOPTIONS', 'PGSERVICE', 'NODE_OPTIONS', 'PATHEXT', 'ComSpec', 'password'])
  test('no hereda entorno adicional: ' + name, () => {
    const e = cmdFixture(); e.environment[name] = '1';
    assert.throws(() => C.reviewCmdContext(C.createPlan(input), e), /PG_CMD_ENVIRONMENT/);
  });
test('CMD ajeno, hash desconocido o PATH sustituido se rechazan', () => {
  for (const change of [{ comspec: 'C:\\other\\cmd.exe' }, { cmdSha256: 'd'.repeat(64) }, { enrolledCmdSha256: null }])
    assert.throws(() => C.reviewCmdContext(C.createPlan(input), { ...cmdFixture(), ...change }), /PG_CMD_IMAGE/);
  const e = cmdFixture(); e.environment.PATH = 'C:\\Users\\untrusted';
  assert.throws(() => C.reviewCmdContext(C.createPlan(input), e), /PG_CMD_ENVIRONMENT/);
});
test('plan modificado no amplía el alcance de la excepción', () => {
  for (const change of [{ operationallyApproved: true }, { productionAuthorized: true },
    { serviceArgs: ['start', '-o', 'arbitrary'] }, { initArgs: ['--auth=trust'] }])
    assert.throws(() => C.reviewCmdContext({ ...C.createPlan(input), ...change }, cmdFixture()), /PG_SERVICE_PLAN/);
});
for (const key of Object.keys(binding())) test('cambio o ausencia de identidad bloquea: ' + key, () => {
  const p = C.createPlan(input), b = binding(), other = { ...b, [key]: 'different' };
  assert.throws(() => C.reviewClusterBinding(p, b, other), /PG_SERVICE_IDENTITY_CHANGED/);
  delete other[key]; assert.throws(() => C.reviewClusterBinding(p, b, other), /PG_SERVICE_BINDING_INCOMPLETE/);
});
test('bases protegidas, clúster principal y cuenta LocalSystem se rechazan', () => {
  for (const change of [{ database: 'sian_kaan_reservaciones' }, { database: 'sian_kaan_reservaciones_dev' },
    { systemIdentifier: '7632825987452064788' }, { serviceAccount: 'LocalSystem' }, { postgresCreatedAt: 123 }]) {
    const b = { ...binding(), ...change };
    assert.throws(() => C.reviewClusterBinding(C.createPlan(input), b, b), /PG_SERVICE_BINDING/);
  }
});
for (const key of Object.keys(stopped())) test('SCM detenido no reemplaza comprobación de cierre: ' + key, () => {
  const e = { ...stopped(), [key]: key === 'serviceState' ? 'running' : false };
  assert.throws(() => C.reviewStopped(e), /PG_STOP_UNPROVEN/);
  delete e[key]; assert.throws(() => C.reviewStopped(e), /PG_STOP_EVIDENCE/);
});
test('fuente oficial: fallo de reejecución restringida registra error y sigue', () => {
  const common = source('restricted_token.c');
  const failure = common.match(/if \(\(restrictedToken = CreateRestrictedProcess\(cmdline, &pi\)\) == 0\)\s*\{([^}]+)\}\s*else/);
  assert.ok(failure); assert.ok(failure[1].includes('pg_log_error('));
  assert.ok(!/pg_fatal\(|exit\(|return\b/.test(failure[1]));
  assert.match(common, /getenv\("PG_RESTRICT_EXEC"\)/);
  assert.match(source('initdb.c'), /get_restricted_token\(\);\s*setup_pgdata\(\);/);
});
test('token original no restringido se rechaza aunque el estado sintético sea cero', () => {
  const user = 'S-1-5-21-1-2-3-1001';
  const r = assess({ status: 0, error: null, signal: null, expectedUserSid: user, child: {
    schemaVersion: 1, user, hasRestrictions: false, privileges: [], privilegesComplete: true,
    groupsComplete: true, groups: { 'S-1-5-32-544': null, 'S-1-5-32-547': null }
  } });
  assert.equal(r.verified, false); assert.equal(r.reason, 'TOKEN_RESTRICTION_UNPROVEN');
});
test('fuente oficial: initdb usa system además de popen', () => {
  const init = source('initdb.c');
  assert.match(init, /status = system\(cmd.data\);/);
  assert.match(init, /cmdfd = popen\(command, mode\);/);
  assert.match(source('system.c'), /res = _popen\(buf, type\);/);
  assert.match(source('port.h'), /#define popen\(a,b\) pgwin32_popen\(a,b\)/);
});
test('fuente oficial: pg_ctl puede consultar data_directory mediante popen', () => {
  const ctl = source('pg_ctl.c');
  const adjust = ctl.slice(ctl.indexOf('\nadjust_data_dir(void)\n{'), ctl.indexOf('\nstatic DBState\nget_control_dbstate'));
  assert.ok(adjust.includes('-C data_directory')); assert.ok(adjust.includes('popen(cmd, "r")'));
  assert.ok(adjust.includes('PG_VERSION')); // La ruta ordinaria de datos evita esta rama.
});
test('fuente oficial: servicio reutiliza token oficial sin envoltura CMD del arranque normal', () => {
  assert.match(source('pg_ctl.c'), /CreateRestrictedProcess\(pgwin32_CommandLine\(false\), &pi, true\)/);
  assert.match(source('pg_ctl.c'), /comspec = getenv\("COMSPEC"\)/);
});
test('la cuarentena permanece bloqueada y no se ha generado candidate-05/setup-03', () => {
  const root = path.resolve(__dirname, '../..');
  assert.ok(fs.readFileSync(path.join(root, 'scripts/windows-native/build-probe.cjs'), 'utf8').includes('NATIVE_PROBE_QUARANTINED_BUILD_DISABLED'));
  assert.equal(fs.existsSync(path.join(root, 'dist/windows-2e7/2e7-candidate-05')), false);
  assert.equal(fs.existsSync(path.join(root, 'dist/windows-setup/026-setup-03')), false);
});
