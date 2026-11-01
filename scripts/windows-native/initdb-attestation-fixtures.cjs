'use strict';
// Escenario enteramente sintético: no son hashes, SID ni tokens de una VM real.
const { createPlan } = require('../windows-installers/postgres-service-contract.cjs');
function scenario() {
  const expected = { installationId: '11111111-2222-4333-8444-555555555555', pgPort: 23456,
    runId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', nonce: '1'.repeat(64),
    vmUuid: '22222222-3333-4444-8555-666666666666', serviceSid: 'S-1-5-80-1-2-3-4-5', logonSid: 'S-1-5-5-17-29',
    inventoryDigest: '2'.repeat(64), environmentDigests: { root: '3'.repeat(64), descendant: '4'.repeat(64) },
    imageHashes: { initdb: '5'.repeat(64), cmd: '6'.repeat(64), postgres: '7'.repeat(64) },
    modules: [{ path: 'C:\\Windows\\System32\\ntdll.dll', sha256: '8'.repeat(64) }] };
  const plan = createPlan({ installationId: expected.installationId, pgPort: expected.pgPort });
  const events = [];
  const add = value => events.push({ seq: events.length + 1, runId: expected.runId, nonce: expected.nonce, ...value });
  add({ type: 'preflight', platform: 'win32', arch: 'x64', build: 26200, vmUuid: expected.vmUuid,
    serviceSid: expected.serviceSid, ageMs: 0, inventoryDigest: expected.inventoryDigest,
    accountViaScmAndToken: true, emptyPgdata: true, directoryHandlesHeld: true, privateAclChecked: true,
    registryPrincipalSid: expected.serviceSid,
    autoRun: { machine64: 'absent', machine32: 'absent', principal64: 'absent', principal32: 'absent' },
    registryHandlesStable: true, protectedPathsDenied: true,
    job: { assignedAtCreation: true, killOnClose: true, breakawayAllowed: false, securityMutableByChild: false },
    debugger: { allDescendants: true, killOnExit: true, sameCreatorThread: true, independentHandleReader: true } });
  const process = (key, role, operation, parent, pid) => {
    const createdAt = pid.toString(16).padStart(16, '0');
    add({ type: 'create', key, role, operation, parent, pid, createdAt,
      preUserMode: true, processHandleHeld: true, imageHandleHeld: true, inOwnedJob: true, debugTreeMember: true });
    add({ type: 'inspect', key, pid, createdAt, imagePath: role.startsWith('initdb') ? plan.initdb : role === 'cmd' ? plan.comspec : plan.postgres,
      imageSha256: expected.imageHashes[role.startsWith('initdb') ? 'initdb' : role], commandApproved: true,
      environmentDigest: expected.environmentDigests[role === 'initdb-root' ? 'root' : 'descendant'], safeInheritedHandles: true,
      token: { reader: 'independent-process-handle', primary: true, integrityRid: 8192, elevated: false,
        restrictingSids: [expected.serviceSid, expected.logonSid, 'S-1-1-0', 'S-1-5-33'],
        properties: { schemaVersion: 1, user: expected.serviceSid, hasRestrictions: true,
          privileges: ['SeChangeNotifyPrivilege'], privilegesComplete: true, groupsComplete: true,
          groups: { 'S-1-5-32-544': null, 'S-1-5-32-547': null } } } });
    add({ type: 'continue', key, pid, createdAt });
    return { key, pid, createdAt };
  };
  const exit = (p, exitCode = 0) => add({ type: 'exit', ...p, exitCode, handleSignaled: true });
  const original = process('root', 'initdb-root', 'initialize', null, 1001);
  const reexec = process('reexec', 'initdb-reexec', 'initialize', 'root', 1002);
  const operations = ['check', 'bootstrap', 'post-bootstrap'];
  for (const [i, operation] of operations.entries()) {
    const cmd = process('cmd-' + i, 'cmd', operation, 'reexec', 1100 + i * 2);
    const postgres = process('postgres-' + i, 'postgres', operation, cmd.key, 1101 + i * 2);
    // Un --check rechazado por postgres puede formar parte de la búsqueda normal
    // de configuración de initdb; no es un fallo de reducción del token.
    exit(postgres, operation === 'check' ? 1 : 0); exit(cmd, operation === 'check' ? 1 : 0);
  }
  exit(reexec); exit(original);
  add({ type: 'complete', activeProcesses: 0, totalProcesses: 8, exitedProcesses: 8,
    completeHandleAccounting: true, diagnosticsComplete: true, reductionDiagnosticSeen: false, clusterOfflineVerified: true });
  return { expected, events };
}
function renumber(events) { return events.map((e, index) => ({ ...e, seq: index + 1 })); }
module.exports = { scenario, renumber };
