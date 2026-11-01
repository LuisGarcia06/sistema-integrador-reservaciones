'use strict';
// Solo fixtures JSON, lectura de fuentes y VM JavaScript. Sin binarios nativos.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { assess, GROUP_SIDS } = require('./probe-contract.cjs');
const user = 'S-1-5-21-111-222-333-1001';
const good = () => ({ status: 0, error: null, signal: null, expectedUserSid: user, child: {
  schemaVersion: 1, user, hasRestrictions: true, privileges: ['SeChangeNotifyPrivilege'],
  privilegesComplete: true, groupsComplete: true,
  groups: { 'S-1-5-32-544': 16, 'S-1-5-32-547': null }
} });
function rejected(report) {
  const result = assess(report);
  assert.equal(result.verified, false);
  assert.equal(result.fullPostgresEquivalence, false);
}
test('regresión: el evaluador original aprobaba Administradores habilitado con el formato del productor', () => {
  const original = fs.readFileSync(path.resolve(__dirname,
    '../../docs/local-fase-2e7-security-review/before/scripts__windows-native__probe-contract.cjs.txt'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(original, { module });
  const r = good(); r.child.groups[GROUP_SIDS[0]] = 4;
  assert.equal(module.exports.assess(r).verified, true);
  assert.equal(assess(r).reason, 'TOKEN_GROUP_NOT_DENY_ONLY');
});
test('un JSON con las propiedades corregidas solo prueba propiedades declaradas', () => {
  assert.deepEqual(assess(JSON.parse(JSON.stringify(good()))), {
    verified: true, reason: 'TOKEN_PROPERTIES_ONLY', fullPostgresEquivalence: false
  });
});
test('ausencia explícita y deny-only con Mandatory son válidos tras enumeración completa', () => {
  for (const attributes of [null, 16, 17]) {
    const r = good(); for (const sid of GROUP_SIDS) r.child.groups[sid] = attributes;
    assert.equal(assess(r).verified, true);
  }
});
for (const key of Object.keys(good().child)) test('rechaza evidencia sin ' + key, () => {
  const r = good(); delete r.child[key]; rejected(r);
});
for (const key of ['status', 'error', 'signal', 'expectedUserSid', 'child']) test('rechaza informe sin ' + key, () => {
  const r = good(); delete r[key]; rejected(r);
});
for (const sid of GROUP_SIDS) {
  test('rechaza SID omitido: ' + sid, () => { const r = good(); delete r.child.groups[sid]; rejected(r); });
  for (const attributes of [0, 1, 2, 4, 6, 18, 20, 22, 4294967312, -16, 16.5, '16', false, {}, 0x80000010])
    test('rechaza atributos ambiguos/habilitados: ' + sid + ' ' + JSON.stringify(attributes), () => {
      const r = good(); r.child.groups[sid] = attributes; rejected(r);
    });
}
test('rechaza el contrato antiguo y aliases contradictorios', () => {
  rejected({ status: 0, error: null, child: { hasRestrictions: true, privileges: [], adminGroup: 16 } });
  for (const alias of ['adminGroup', 'powerUsersGroup']) { const r = good(); r.child[alias] = 4; rejected(r); }
});
for (const value of [false, null, 'true', 1]) test('no infiere restricción ni completitud desde ' + JSON.stringify(value), () => {
  for (const key of ['hasRestrictions', 'groupsComplete', 'privilegesComplete']) {
    const r = good(); r.child[key] = value; rejected(r);
  }
});
test('rechaza errores, timeouts y señales aunque status sea cero', () => {
  for (const error of [{ code: 'ENOENT' }, { code: 'ETIMEDOUT' }, false, 'error']) {
    const r = good(); r.error = error; rejected(r);
  }
  for (const signal of ['SIGTERM', 'SIGKILL', false]) { const r = good(); r.signal = signal; rejected(r); }
  for (const status of [null, 1, '0']) { const r = good(); r.status = status; rejected(r); }
  rejected(null); rejected([]); rejected({ status: 0 });
});
test('rechaza privilegios omitidos, desconocidos, repetidos y malformados', () => {
  for (const privileges of [null, {}, ['SeDebugPrivilege'], ['SeChangeNotifyPrivilege', 'SeChangeNotifyPrivilege'],
    [null], [1], Array(1)]) { const r = good(); r.child.privileges = privileges; rejected(r); }
  const r = good(); r.child.privileges = []; assert.equal(assess(r).verified, true);
});
test('la identidad declarada debe coincidir con el SID esperado', () => {
  for (const value of ['', null, 'VM User', 'S-1-5-21-4294967296', 'S-1-5-021-1', 'S-1-5-18']) {
    const r = good(); r.child.user = value; rejected(r);
  }
});
test('rechaza contenedores y versiones que no cumplen el esquema', () => {
  for (const groups of [null, [], {}, { ...good().child.groups, extra: 16 }]) {
    const r = good(); r.child.groups = groups; rejected(r);
  }
  for (const version of ['1', 0, 2]) { const r = good(); r.child.schemaVersion = version; rejected(r); }
});
const source = fs.readFileSync(path.join(__dirname, 'SecurityProbe.cs'), 'utf8');
test('contrato estático productor/evaluador: claves y grupos explícitos coinciden', () => {
  const serialized = source.match(/return new Dictionary<string,object>\{\{"schemaVersion"[^;]+/)[0];
  const keys = [...serialized.matchAll(/\{"([A-Za-z]+)",/g)].map(x => x[1]);
  assert.deepEqual(keys.sort(), Object.keys(good().child).sort());
  for (const sid of GROUP_SIDS) assert.ok(source.includes('{"' + sid + '",null}'));
  assert.ok(source.includes('TOKEN_TRUNCATED'));
});
test('fuente: no hay ruta PostgreSQL, shell o ejecutable externo', () => {
  assert.ok(source.includes('Assembly.GetExecutingAssembly().Location'));
  assert.ok(!/pg_ctl\.exe|postgres\.exe|powershell\.exe|cmd\.exe|ExecutionPolicy|Process\.Start\(/i.test(source));
  for (const value of [...GROUP_SIDS, 'CreateRestrictedToken', 'SeLockMemoryPrivilege', 'SeChangeNotifyPrivilege', 'GrantUserTokenDacl'])
    assert.ok(source.includes(value));
});
test('revisión estática: contención atómica precede creación y ResumeThread', () => {
  const launch = source.slice(source.indexOf('static void Launch('));
  assert.ok(launch.indexOf('SetInformationJobObject') < launch.indexOf('CreateProcessAsUser('));
  assert.ok(launch.indexOf('UpdateProcThreadAttribute') < launch.indexOf('CreateProcessAsUser('));
  assert.ok(launch.indexOf('CreateProcessAsUser(') < launch.indexOf('ResumeThread('));
  assert.ok(launch.includes('new IntPtr(0x2000D)')); // PROC_THREAD_ATTRIBUTE_JOB_LIST
  assert.ok(launch.includes('0x4|0x8000000|0x80000')); // Suspendido, sin consola, STARTUPINFOEX
  assert.ok(launch.includes('limits.basic.flags=0x2000')); // KILL_ON_JOB_CLOSE
});
test('revisión estática: timeout, wait fallido y fallo de Resume conservan limpieza', () => {
  for (const code of ['CHILD_TIMEOUT', 'CHILD_WAIT_FAILED', 'CHILD_WAIT_AMBIGUOUS', 'CHILD_CLEANUP_UNPROVEN', 'CHILD_TERMINATE'])
    assert.ok(source.includes(code));
  assert.ok(source.includes('TerminateJobObject(job,1)'));
  assert.ok(source.indexOf('Close(ref job,errors)') < source.indexOf('Close(ref pi.process,errors)'));
  for (const handle of ['pi.thread', 'pi.process', 'restricted', 'original']) assert.ok(source.includes('Close(ref ' + handle + ',errors)'));
  assert.ok(source.includes('DeleteProcThreadAttributeList(attributes)'));
  assert.ok(source.includes('if(sd!=IntPtr.Zero)LocalFree(sd)'));
});
test('el constructor queda bloqueado antes de importar, escribir o lanzar nada', () => {
  const builder = fs.readFileSync(path.join(__dirname, 'build-probe.cjs'), 'utf8');
  assert.throws(() => vm.runInNewContext(builder, {
    require() { assert.fail('No debe importar compilador ni crear procesos'); }
  }), /NATIVE_PROBE_QUARANTINED_BUILD_DISABLED/);
});
