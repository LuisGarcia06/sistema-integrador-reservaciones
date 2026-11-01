'use strict';
// Modelo offline de aceptación de trazas, NO un ejecutor ni una atestación nativa.
// Los datos deben proceder en el futuro de handles/eventos independientes.
const { assess } = require('./probe-contract.cjs');
const { createPlan } = require('../windows-installers/postgres-service-contract.cjs');
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const exact = (x, keys) => object(x) && Object.keys(x).length === keys.length && keys.every(k => Object.hasOwn(x, k));
const hash = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const id = x => typeof x === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x);
const serviceSid = x => typeof x === 'string' && /^S-1-5-80-(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*)){4}$/.test(x) &&
  x.split('-').slice(4).every(part => Number(part) <= 4294967295);
const filetime = x => typeof x === 'string' && /^[a-f0-9]{16}$/.test(x) && x !== '0'.repeat(16);
const logonSid = x => typeof x === 'string' && /^S-1-5-5-(?:0|[1-9]\d*)-(?:0|[1-9]\d*)$/.test(x) &&
  x.split('-').slice(4).every(part => Number(part) <= 4294967295);
const result = (modelAccepted, reason, count = 0) => Object.freeze({ modelAccepted, reason, processesReviewed: count,
  nativeVerified: false, installationApproved: false, productionAuthorized: false });
function must(condition, reason) { if (!condition) throw Object.assign(Error(reason), { code: reason }); }
function reviewTrace(expected, events) {
  const processes = new Map(), pids = new Set();
  try {
    must(exact(expected, ['installationId', 'pgPort', 'runId', 'nonce', 'vmUuid', 'serviceSid', 'logonSid', 'inventoryDigest',
      'environmentDigests', 'imageHashes', 'modules']), 'EXPECTED_BINDING');
    const plan = createPlan({ installationId: expected.installationId, pgPort: expected.pgPort });
    must(id(expected.runId) && id(expected.vmUuid) && hash(expected.nonce) && serviceSid(expected.serviceSid) && logonSid(expected.logonSid) &&
      hash(expected.inventoryDigest) && exact(expected.imageHashes, ['initdb', 'cmd', 'postgres']) &&
      Object.values(expected.imageHashes).every(hash) &&
      exact(expected.environmentDigests, ['root', 'descendant']) && Object.values(expected.environmentDigests).every(hash) &&
      Array.isArray(expected.modules) && expected.modules.length > 0 &&
      expected.modules.every(m => exact(m, ['path', 'sha256']) && typeof m.path === 'string' && hash(m.sha256)), 'EXPECTED_BINDING');
    must(Array.isArray(events) && events.length >= 2 && events.length <= 10000, 'TRACE_INCOMPLETE');
    let preflight = false, root = null, reexec = null, completed = false;
    const phases = new Set();
    const roleImages = { 'initdb-root': plan.initdb, 'initdb-reexec': plan.initdb, cmd: plan.comspec, postgres: plan.postgres };
    const roleHash = role => expected.imageHashes[role.startsWith('initdb') ? 'initdb' : role];
    for (let index = 0; index < events.length; index++) {
      const e = events[index];
      must(object(e) && !completed && e.seq === index + 1 && e.runId === expected.runId && e.nonce === expected.nonce,
        'TRACE_ORDER_OR_REPLAY');
      const envelope = ['type', 'seq', 'runId', 'nonce'];
      if (e.type === 'preflight') {
        must(index === 0 && exact(e, [...envelope, 'platform', 'arch', 'build', 'vmUuid', 'serviceSid', 'ageMs',
          'inventoryDigest', 'accountViaScmAndToken', 'emptyPgdata', 'directoryHandlesHeld', 'privateAclChecked',
          'registryPrincipalSid', 'autoRun', 'registryHandlesStable', 'protectedPathsDenied', 'job', 'debugger']), 'PREFLIGHT_SCHEMA');
        must(e.platform === 'win32' && e.arch === 'x64' && Number.isInteger(e.build) && e.build >= 22000 &&
          e.vmUuid === expected.vmUuid && e.serviceSid === expected.serviceSid &&
          Number.isInteger(e.ageMs) && e.ageMs >= 0 && e.ageMs <= 1000 && e.inventoryDigest === expected.inventoryDigest,
          'PREFLIGHT_IDENTITY');
        must(['accountViaScmAndToken', 'emptyPgdata', 'directoryHandlesHeld', 'privateAclChecked',
          'registryHandlesStable', 'protectedPathsDenied'].every(k => e[k] === true), 'PREFLIGHT_UNPROVEN');
        must(e.registryPrincipalSid === expected.serviceSid && exact(e.autoRun, ['machine64', 'machine32', 'principal64', 'principal32']) &&
          Object.values(e.autoRun).every(x => x === 'absent'), 'CMD_CONTEXT_UNPROVEN');
        must(exact(e.job, ['assignedAtCreation', 'killOnClose', 'breakawayAllowed', 'securityMutableByChild']) &&
          e.job.assignedAtCreation === true && e.job.killOnClose === true && e.job.breakawayAllowed === false &&
          e.job.securityMutableByChild === false, 'JOB_UNPROVEN');
        must(exact(e.debugger, ['allDescendants', 'killOnExit', 'sameCreatorThread', 'independentHandleReader']) &&
          Object.values(e.debugger).every(x => x === true), 'DEBUGGER_UNPROVEN');
        preflight = true; continue;
      }
      must(preflight, 'PREFLIGHT_REQUIRED');
      if (e.type === 'create') {
        must(exact(e, [...envelope, 'key', 'role', 'operation', 'parent', 'pid', 'createdAt', 'preUserMode',
          'processHandleHeld', 'imageHandleHeld', 'inOwnedJob', 'debugTreeMember']), 'CREATE_SCHEMA');
        must(typeof e.key === 'string' && /^[a-z0-9-]{1,80}$/.test(e.key) && !processes.has(e.key) &&
          Number.isInteger(e.pid) && e.pid > 0 && !pids.has(e.pid) && filetime(e.createdAt), 'PROCESS_IDENTITY');
        must(['preUserMode', 'processHandleHeld', 'imageHandleHeld', 'inOwnedJob', 'debugTreeMember'].every(k => e[k] === true),
          'PROCESS_NOT_STOPPED_AND_CONTAINED');
        must(Object.hasOwn(roleImages, e.role), 'PROCESS_ROLE');
        if (e.role === 'initdb-root') {
          must(root === null && e.parent === null && e.operation === 'initialize', 'ROOT_TOPOLOGY'); root = e.key;
        } else {
          const parent = processes.get(e.parent);
          must(parent && parent.continued && !parent.exited, 'PARENT_UNPROVEN');
          if (e.role === 'initdb-reexec') {
            must(parent.role === 'initdb-root' && reexec === null && e.operation === 'initialize', 'REEXEC_TOPOLOGY'); reexec = e.key;
          } else if (e.role === 'cmd') {
            must(parent.role === 'initdb-reexec' && ['check', 'bootstrap', 'post-bootstrap'].includes(e.operation), 'CMD_TOPOLOGY');
          } else {
            must(parent.role === 'cmd' && parent.operation === e.operation, 'POSTGRES_TOPOLOGY'); phases.add(e.operation);
          }
        }
        processes.set(e.key, { ...e, inspected: false, continued: false, exited: false }); pids.add(e.pid); continue;
      }
      if (['inspect', 'continue', 'exit', 'load-module'].includes(e.type)) {
        const p = processes.get(e.key);
        must(p && !p.exited && e.pid === p.pid && e.createdAt === p.createdAt, 'PROCESS_IDENTITY_CHANGED');
        if (e.type === 'inspect') {
          must(exact(e, [...envelope, 'key', 'pid', 'createdAt', 'imagePath', 'imageSha256', 'commandApproved',
            'environmentDigest', 'safeInheritedHandles', 'token']), 'INSPECT_SCHEMA');
          must(!p.inspected && !p.continued, 'INSPECT_TOO_LATE');
          must(e.imagePath === roleImages[p.role] && e.imageSha256 === roleHash(p.role) && e.commandApproved === true &&
            e.environmentDigest === expected.environmentDigests[p.role === 'initdb-root' ? 'root' : 'descendant'] &&
            e.safeInheritedHandles === true, 'IMAGE_ARGUMENTS_ENVIRONMENT_OR_HANDLES');
          const t = e.token;
          must(exact(t, ['reader', 'primary', 'integrityRid', 'elevated', 'restrictingSids', 'properties']) &&
            t.reader === 'independent-process-handle' && t.primary === true && t.integrityRid === 8192 && t.elevated === false &&
            Array.isArray(t.restrictingSids) && t.restrictingSids.length === 4 &&
            [expected.serviceSid, expected.logonSid, 'S-1-1-0', 'S-1-5-33'].every(sid => t.restrictingSids.includes(sid)) &&
            new Set(t.restrictingSids).size === t.restrictingSids.length,
          'TOKEN_CONTEXT_UNPROVEN');
          must(assess({ status: 0, error: null, signal: null, expectedUserSid: expected.serviceSid, child: t.properties }).verified,
            'TOKEN_PROPERTIES_REJECTED');
          p.inspected = true; continue;
        }
        if (e.type === 'continue') {
          must(exact(e, [...envelope, 'key', 'pid', 'createdAt']) && p.inspected && !p.continued, 'CONTINUE_BEFORE_INSPECTION');
          p.continued = true; continue;
        }
        if (e.type === 'load-module') {
          must(exact(e, [...envelope, 'key', 'pid', 'createdAt', 'path', 'sha256', 'handleHeld', 'beforeEntry']) &&
            p.continued && e.handleHeld === true && e.beforeEntry === true &&
            expected.modules.some(m => m.path === e.path && m.sha256 === e.sha256), 'MODULE_UNPROVEN'); continue;
        }
        must(exact(e, [...envelope, 'key', 'pid', 'createdAt', 'exitCode', 'handleSignaled']) && p.continued &&
          e.handleSignaled === true && Number.isInteger(e.exitCode) &&
          (e.exitCode === 0 || (p.operation === 'check' && e.exitCode === 1)), 'PROCESS_EXIT_FAILED_OR_UNPROVEN');
        p.exited = true; continue;
      }
      if (e.type === 'complete') {
        must(exact(e, [...envelope, 'activeProcesses', 'totalProcesses', 'exitedProcesses', 'completeHandleAccounting',
          'diagnosticsComplete', 'reductionDiagnosticSeen', 'clusterOfflineVerified']), 'COMPLETE_SCHEMA');
        must(root && reexec && phases.has('bootstrap') && phases.has('post-bootstrap'), 'REEXEC_OR_BOOTSTRAP_MISSING');
        must(e.activeProcesses === 0 && e.totalProcesses === processes.size && e.exitedProcesses === processes.size &&
          [...processes.values()].every(p => p.exited) && e.completeHandleAccounting === true, 'PROCESS_TREE_INCOMPLETE');
        must(e.diagnosticsComplete === true && e.reductionDiagnosticSeen === false && e.clusterOfflineVerified === true,
          'POSTCONDITION_UNPROVEN'); completed = true; continue;
      }
      // API failure, timeout, cancellation, policy/registry change, detach or lost
      // evidence terminates the model. No later "success" can revive this run.
      must(false, 'RUN_REJECTED_' + (typeof e.type === 'string' && /^[a-z-]{1,40}$/.test(e.type) ? e.type.toUpperCase().replaceAll('-', '_') : 'UNKNOWN_EVENT'));
    }
    must(completed, 'TRACE_INCOMPLETE');
    return result(true, 'OFFLINE_TRACE_CONDITIONS_ONLY', processes.size);
  } catch (error) { return result(false, error.code || 'TRACE_MALFORMED', processes.size); }
}
module.exports = { reviewTrace };
