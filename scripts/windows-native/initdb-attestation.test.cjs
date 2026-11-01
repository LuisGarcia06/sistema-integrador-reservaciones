'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { reviewTrace } = require('./initdb-attestation.cjs');
const { scenario, renumber } = require('./initdb-attestation-fixtures.cjs');
function reject(s) { const r = reviewTrace(s.expected, s.events); assert.equal(r.modelAccepted, false); assert.equal(r.nativeVerified, false); assert.equal(r.installationApproved, false); return r; }
function event(s, type, key) { return s.events.find(e => e.type === type && (key === undefined || e.key === key)); }
test('traza sintética completa satisface solo el modelo, nunca autoriza instalación', () => {
  const s = scenario(), r = reviewTrace(s.expected, s.events);
  assert.equal(r.modelAccepted, true); assert.equal(r.processesReviewed, 8);
  assert.equal(r.nativeVerified, false); assert.equal(r.installationApproved, false);
  assert.equal(r.productionAuthorized, false);
});
test('el modelo no importa ejecutores nativos ni modifica fase 1', () => {
  const source = fs.readFileSync(path.join(__dirname, 'initdb-attestation.cjs'), 'utf8');
  assert.ok(!/child_process|spawn\(|execFile|CreateProcessAsUser\(|writeFile|powershell\.exe|cmd\.exe/.test(source));
});
for (const property of ['platform', 'arch', 'build', 'vmUuid', 'serviceSid', 'ageMs', 'inventoryDigest'])
  test('preflight rechaza identidad incompleta/ajena: ' + property, () => {
    const s = scenario(); delete s.events[0][property]; reject(s);
    const changed = scenario(); changed.events[0][property] = property === 'ageMs' ? 1001 : 'wrong'; reject(changed);
  });
for (const key of ['accountViaScmAndToken', 'emptyPgdata', 'directoryHandlesHeld', 'privateAclChecked', 'registryHandlesStable', 'protectedPathsDenied'])
  test('no llega al primer proceso sin ' + key, () => { const s = scenario(); s.events[0][key] = false; assert.equal(reject(s).processesReviewed, 0); });
test('Windows 10 se rechaza sin inicializar ni considerar procesos', () => {
  const s = scenario(); s.events[0].build = 19045; assert.equal(reject(s).processesReviewed, 0);
});
for (const view of ['machine64', 'machine32', 'principal64', 'principal32'])
  test('AutoRun presente/desconocido/no leído bloquea antes del hijo: ' + view, () => {
    for (const value of ['present', 'unknown', '', null]) { const s = scenario(); s.events[0].autoRun[view] = value; assert.equal(reject(s).processesReviewed, 0); }
    const s = scenario(); delete s.events[0].autoRun[view]; reject(s);
  });
test('HKCU del instalador no sustituye al hive del usuario del servicio', () => {
  const s = scenario(); s.events[0].registryPrincipalSid = 'S-1-5-21-1-2-3-1001'; reject(s);
});
for (const key of ['assignedAtCreation', 'killOnClose', 'breakawayAllowed', 'securityMutableByChild'])
  test('job incompleto, escapable o mutable bloquea: ' + key, () => {
    const s = scenario(); s.events[0].job[key] = !s.events[0].job[key]; reject(s);
  });
for (const key of ['allDescendants', 'killOnExit', 'sameCreatorThread', 'independentHandleReader'])
  test('no sustituye debug completo por telemetría posterior: ' + key, () => {
    const s = scenario(); s.events[0].debugger[key] = false; reject(s);
  });
for (const key of ['preUserMode', 'processHandleHeld', 'imageHandleHeld', 'inOwnedJob', 'debugTreeMember'])
  test('hijo no verificable no se acepta: ' + key, () => { const s = scenario(); event(s, 'create', 'root')[key] = false; reject(s); });
test('reanudar antes de inspeccionar token rechaza aunque después aparezca evidencia buena', () => {
  const s = scenario(), i = s.events.findIndex(e => e.type === 'inspect');
  [s.events[i], s.events[i + 1]] = [s.events[i + 1], s.events[i]]; s.events = renumber(s.events);
  assert.equal(reject(s).reason, 'CONTINUE_BEFORE_INSPECTION');
});
for (const process of ['root', 'reexec', 'cmd-0', 'postgres-0'])
  test('token no restringido nunca se permite: ' + process, () => {
    const s = scenario(); event(s, 'inspect', process).token.properties.hasRestrictions = false;
    assert.equal(reject(s).reason, 'TOKEN_PROPERTIES_REJECTED');
  });
for (const [key, value] of [['reader', 'child-self-report'], ['primary', false], ['integrityRid', 16384], ['elevated', true], ['restrictingSids', []]])
  test('rechaza contexto del token: ' + key, () => { const s = scenario(); event(s, 'inspect', 'root').token[key] = value; reject(s); });
test('service SID, logon SID y enumeración completa son obligatorios', () => {
  for (const key of ['user', 'groupsComplete', 'privilegesComplete']) {
    const s = scenario(); delete event(s, 'inspect', 'root').token.properties[key]; reject(s);
  }
  for (const missing of ['S-1-5-80-1-2-3-4-5', 'S-1-5-5-17-29']) {
    const s = scenario(), t = event(s, 'inspect', 'root').token; t.restrictingSids = t.restrictingSids.filter(x => x !== missing); reject(s);
  }
});
test('Administradores habilitado, privilegio adicional y token ajeno se rechazan', () => {
  const mutations = [t => { t.groups['S-1-5-32-544'] = 4; }, t => { t.privileges.push('SeDebugPrivilege'); },
    t => { t.user = 'S-1-5-18'; }, t => { t.privileges = ['SeImpersonatePrivilege']; }];
  for (const mutate of mutations) { const s = scenario(); mutate(event(s, 'inspect', 'root').token.properties); reject(s); }
});
for (const key of ['imagePath', 'imageSha256', 'environmentDigest', 'commandApproved', 'safeInheritedHandles'])
  test('ruta, comando, hash, entorno o handles no aprobados: ' + key, () => {
    const s = scenario(); event(s, 'inspect', 'cmd-0')[key] = false; reject(s);
  });
test('PID reutilizado, creación distinta o clave duplicada nunca identifican un proceso propio', () => {
  const a = scenario(); event(a, 'inspect', 'root').createdAt = 'f'.repeat(16); reject(a);
  const b = scenario(); event(b, 'create', 'reexec').pid = event(b, 'create', 'root').pid; reject(b);
  const c = scenario(); event(c, 'create', 'reexec').key = 'root'; reject(c);
});
test('replay, sesión/nonce distintos y reordenamiento se rechazan', () => {
  for (const key of ['seq', 'runId', 'nonce']) { const s = scenario(); s.events[1][key] = 'foreign'; reject(s); }
  const s = scenario(); s.events.splice(3, 0, { ...s.events[2] }); s.events = renumber(s.events); reject(s);
});
test('diagnóstico interno de reducción fallida invalida salida cero y no se resucita', () => {
  const s = scenario(); s.events.splice(4, 0, { type: 'reduction-failed', runId: s.expected.runId, nonce: s.expected.nonce });
  s.events = renumber(s.events); assert.equal(reject(s).reason, 'RUN_REJECTED_REDUCTION_FAILED');
});
test('fallback oficial sin reexec: root ya era seguro, pero no recibe aprobación', () => {
  const s = scenario(); s.events = s.events.filter(e => e.key !== 'reexec');
  for (const e of s.events) if (e.parent === 'reexec') e.parent = 'root';
  s.events = renumber(s.events); assert.equal(reject(s).reason, 'CMD_TOPOLOGY');
});
for (const type of ['timeout', 'cancel', 'api-failed', 'debugger-detach', 'registry-changed', 'output-overflow', 'monitor-lost', 'attempt-reuse'])
  test('interrupción o cambio de contexto termina el intento: ' + type, () => {
    const s = scenario(); s.events.splice(4, 0, { type, runId: s.expected.runId, nonce: s.expected.nonce }); s.events = renumber(s.events); reject(s);
  });
test('árbol con padre ajeno, ejecutable desconocido o parentesco falso se rechaza', () => {
  for (const [key, value] of [['parent', 'foreign'], ['role', 'external.exe'], ['parent', 'root']]) {
    const s = scenario(); event(s, 'create', 'postgres-0')[key] = value; reject(s);
  }
});
test('DLL fuera de inventario se rechaza antes de aprobar su entrada', () => {
  const s = scenario(), p = event(s, 'create', 'root');
  const moduleEvent = { type: 'load-module', key: p.key, pid: p.pid, createdAt: p.createdAt,
    path: 'C:\\Users\\María & %PATH%\\evil.dll', sha256: '9'.repeat(64), handleHeld: true, beforeEntry: true,
    runId: s.expected.runId, nonce: s.expected.nonce };
  s.events.splice(4, 0, moduleEvent); s.events = renumber(s.events); reject(s);
  moduleEvent.path = s.expected.modules[0].path; moduleEvent.sha256 = s.expected.modules[0].sha256;
  const allowed = scenario(); allowed.events.splice(4, 0, moduleEvent); allowed.events = renumber(allowed.events);
  assert.equal(reviewTrace(allowed.expected, allowed.events).modelAccepted, true);
});
test('fallos --check previstos no se confunden con fallo de seguridad; bootstrap no puede fallar', () => {
  const s = scenario(); event(s, 'exit', 'postgres-1').exitCode = 1; reject(s);
  const unknown = scenario(); event(unknown, 'exit', 'postgres-0').exitCode = 5; reject(unknown);
});
for (const key of ['activeProcesses', 'totalProcesses', 'exitedProcesses', 'completeHandleAccounting',
  'diagnosticsComplete', 'reductionDiagnosticSeen', 'clusterOfflineVerified'])
  test('salida cero no sustituye a postcondición: ' + key, () => {
    const s = scenario(), end = event(s, 'complete'); end[key] = typeof end[key] === 'boolean' ? !end[key] : end[key] + 1; reject(s);
  });
test('ni perdida de proceso rápido ni salida de un padre ocultan hijos vivos', () => {
  const s = scenario(); s.events = renumber(s.events.filter(e => !(e.type === 'exit' && e.key === 'cmd-0'))); reject(s);
  const lost = scenario(); lost.events = renumber(lost.events.filter(e => e.key !== 'postgres-0')); reject(lost);
});
test('trazas truncadas, huecos y tipos inesperados fallan cerrado', () => {
  const s = scenario(); s.events.pop(); reject(s);
  for (const events of [null, [], Array(5), {}, [{ type: 'preflight' }]]) reject({ expected: scenario().expected, events });
});
test('binding inválido no cambia privilegios ni inventa un SID de servicio', () => {
  for (const value of ['S-1-5-18', 'S-1-5-80-1-2-3-4-4294967296', 'S-1-5-80-01-2-3-4-5', null]) {
    const s = scenario(); s.expected.serviceSid = value; reject(s);
  }
});
