'use strict';
// Evidencia del diseño y modelo offline; ninguna llamada a procesos/red/SQL.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { preservedArtifacts } = require('./security-review-baseline.cjs');
const { reviewTrace } = require('./initdb-attestation.cjs');
const { scenario, renumber } = require('./initdb-attestation-fixtures.cjs');
const root = path.resolve(__dirname, '../..');
const relative = 'docs/local-fase-2e7-initdb-design';
const directory = path.join(root, relative);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hashFile = file => sha(fs.readFileSync(path.join(root, file)));
const write = (file, value) => fs.writeFileSync(path.join(directory, file), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
function verifyPrior(name, digest) {
  const base = 'docs/' + name, inventoryFile = base + '/review-inventory.json';
  if (hashFile(inventoryFile) !== digest) throw Error('PREVIOUS_INVENTORY_CHANGED');
  const inventory = JSON.parse(fs.readFileSync(path.join(root, inventoryFile)));
  for (const row of inventory.files) if (hashFile(row.file) !== row.sha256) throw Error('PREVIOUS_FILE_CHANGED:' + row.file);
  const sums = fs.readFileSync(path.join(root, base, 'SHA256SUMS.txt'), 'utf8').trim().split('\n');
  for (const line of sums) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match || hashFile(match[2]) !== match[1]) throw Error('PREVIOUS_CHECKSUM_CHANGED');
  }
  return { inventory: inventoryFile, sha256: digest, filesVerified: inventory.files.length, checksumEntriesVerified: sums.length };
}
if (require.main === module) {
  const prior = [verifyPrior('local-fase-2e7-security-review', 'c53bba13338fd007bfcf46444f92bf48347252ae7e23b3a1b8877f1cdfe8a811'),
    verifyPrior('local-fase-2e7-postgresql-exception', '4199c8c58a478a77d01ea22055c12d58c8d7fe48a21c7172826bca57f143bda1')];
  const artifacts = preservedArtifacts();
  const oldBaseline = JSON.parse(fs.readFileSync(path.join(root, 'docs/local-fase-2e7-security-review/baseline.json')));
  if (JSON.stringify(artifacts) !== JSON.stringify(oldBaseline.preserved)) throw Error('ARTIFACT_PRESERVATION_FAILED');
  write('preservation.json', { unchanged: true, priorReviews: prior, previousArtifactsAndQuarantineEvidence: artifacts });
  const build = JSON.parse(fs.readFileSync(path.join(root, 'docs/local-fase-2e7-native05/probe-build.json')));
  const originalSource = 'docs/local-fase-2e7-security-review/before/scripts__windows-native__SecurityProbe.cs.txt';
  if (hashFile(originalSource) !== build.source) throw Error('HISTORICAL_SOURCE_CORRELATION_FAILED');
  write('quarantine-source-correlation.json', {
    compiledSourceSnapshot: originalSource, sourceSha256: build.source, matchesHistoricalBuildRecord: true,
    recordedBinarySha256: build.sha256, binaryHashReadAgain: false, binaryStillQuarantinedPerUserEvidence: true,
    currentSource: 'scripts/windows-native/SecurityProbe.cs', currentSourceSha256: hashFile('scripts/windows-native/SecurityProbe.cs'),
    currentSourceProducedThatBinary: false, submittedToVendor: false,
    vendorPath: 'https://www.mcafee.com/en-us/consumer-support/dispute-detection-allowlisting.html',
    quarantinePreservingSampleExportDocumentedByPublicPage: false
  });
  const good = scenario();
  const results = [{ name: 'complete-synthetic-trace', result: reviewTrace(good.expected, good.events) }];
  if (!results[0].result.modelAccepted) throw Error('REFERENCE_TRACE_FAILED');
  for (const [name, mutate] of [
    ['root-token-not-restricted', s => { s.events.find(e => e.type === 'inspect').token.properties.hasRestrictions = false; }],
    ['continue-before-inspection', s => { [s.events[2], s.events[3]] = [s.events[3], s.events[2]]; s.events = renumber(s.events); }],
    ['internal-reduction-failed', s => { s.events.splice(4, 0, { type: 'reduction-failed', runId: s.expected.runId, nonce: s.expected.nonce }); s.events = renumber(s.events); }],
    ['autoRun-not-verified', s => { s.events[0].autoRun.principal64 = 'unknown'; }],
    ['fast-child-not-accounted', s => { s.events = renumber(s.events.filter(e => e.key !== 'postgres-0')); }],
    ['tree-still-active', s => { s.events.at(-1).activeProcesses = 1; }]
  ]) {
    const sample = scenario(); mutate(sample); const result = reviewTrace(sample.expected, sample.events);
    if (result.modelAccepted) throw Error('NEGATIVE_TRACE_ACCEPTED:' + name);
    results.push({ name, result });
  }
  write('synthetic-trace.json', { mode: 'fixture-not-native-evidence', ...good });
  write('model-results.json', { mode: 'offline-model-not-windows-verification', results });
  const tap = fs.readFileSync(path.join(directory, 'tests.tap'), 'utf8');
  const counts = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].map(key => {
    const matches = [...tap.matchAll(new RegExp('^# ' + key + ' (\\d+)\\s*$', 'gm'))];
    if (matches.length !== 1) throw Error('TEST_SUMMARY_AMBIGUOUS');
    return [key, Number(matches[0][1])];
  }));
  if (counts.tests !== 237 || counts.pass !== 237 || counts.fail || counts.cancelled || counts.skipped || counts.todo)
    throw Error('TEST_GATE_FAILED');
  const command = 'node --require ./scripts/windows-native/safe-test-guard.cjs --test --experimental-test-isolation=none --test-reporter=tap scripts/windows-native/probe-contract.test.cjs scripts/windows-native/acl-regression.test.cjs scripts/windows-native/initdb-attestation.test.cjs scripts/windows-installers/postgres-service-contract.test.cjs scripts/windows-setup/coordinator.test.cjs scripts/windows-setup/ui.test.cjs scripts/windows-setup/restricted-policy.test.cjs';
  write('verification.json', { reviewDate: '2026-10-31', timezone: 'America/Cancun',
    scope: 'synthetic-acceptance-only', productionAuthorized: false, status: 'design-and-model-ready-native-validation-blocked',
    tests: { ...counts, newTests: 76, priorTests: 161, node: process.version, command,
      mode: 'guarded-javascript-model-regression-static-and-mocked-integration' },
    design: { preferredArchitecture: 'official-exclusive-postgresql-18.3-service',
      bootstrapIdentity: 'same-virtual-service-account-before-and-after-proposed-scm-image-transition',
      rootTokenRequiredBeforeUserCode: true, descendantsRequireIndependentPreUserModeInspection: true,
      internalReductionFailureMayLeaveDataUnderAlreadyApprovedToken: true, partialDataAutomaticallyReused: false,
      outputExitCodeAloneSufficient: false, debugCreateEventsProposed: true, jobPollingAloneSufficient: false },
    implementation: { referenceModelOnly: true, productExecutionPathsModified: false,
      nativeBrokerImplemented: false, nativeAccountCompatibilityVerified: false, nativeDebuggerVerified: false,
      nativeTokenVerified: false, nativeAclAndRegistryVerified: false, nativeFaultInjectionPerformed: false,
      newNativeSourceOrBinaryBuilt: false, postgresOfficialServicePreservedAsPreferred: true },
    blockers: ['QUARANTINE_REVIEW_AND_AUTHORIZED_NATIVE_VALIDATION_PATH', 'REVIEWED_NATIVE_BROKER_AND_INDEPENDENT_READER',
      'WINDOWS11_HOME_ACCOUNT_TOKEN_MEDIUM_INTEGRITY_DEBUG_COMPATIBILITY', 'CMD_GRAMMAR_AND_REGISTRY_ACL_NATIVE_PROOF',
      'NATIVE_FAILURE_CLEANUP_AND_PERSISTENT_SERVICE_TRANSITION_PROOF', 'FULL_VIRTUALBOX_ACCEPTANCE'],
    quarantine: { restored: false, excluded: false, recompiled: false, executed: false, vendorContacted: false, filesUploaded: false },
    windowsPoliciesChanged: false, antivirusOrSmartScreenChanged: false, globalTrustStoreChanged: false,
    databaseConnections: 0, protectedDatabasesModified: false, windows10ProvisioningExecuted: false,
    nativeServicesCreated: false, nativePostgresToolsExecuted: false, realCompanyDataUsed: false,
    reservationsDailyRolesIntegrationsModified: false, candidate05Generated: false, setup03Generated: false,
    installationApproved: false, windows11Acceptance: 'pending-real-t0-bootstrap-https-login-shutdown-restart' });
  const files = ['scripts/windows-native/initdb-attestation.cjs', 'scripts/windows-native/initdb-attestation-fixtures.cjs',
    'scripts/windows-native/initdb-attestation.test.cjs', 'scripts/windows-native/initdb-review-evidence.cjs',
    'docs/INITDB-IDENTIDAD-TOKEN-DISENO-2026-10-31.md', 'docs/MCAFEE-REVISION-SIN-RESTAURACION-2026-10-31.md'];
  function collect(base) {
    for (const entry of fs.readdirSync(path.join(root, base), { withFileTypes: true })) {
      const file = base + '/' + entry.name;
      if (entry.isDirectory()) collect(file);
      else if (entry.isFile()) files.push(file);
      else throw Error('EVIDENCE_FILE_TYPE');
    }
  }
  collect(relative);
  const rows = files.sort().map(file => ({ file, sha256: hashFile(file), bytes: fs.statSync(path.join(root, file)).size }));
  write('review-inventory.json', { protocol: 'ctsk-initdb-identity-design-v1', scope: 'synthetic-acceptance-only',
    productionAuthorized: false, installerInventory: false, files: rows });
  const inventoryFile = relative + '/review-inventory.json';
  rows.push({ file: inventoryFile, sha256: hashFile(inventoryFile) });
  fs.writeFileSync(path.join(directory, 'SHA256SUMS.txt'), rows.map(row => row.sha256 + '  ' + row.file).join('\n') + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ tests: counts, reviewInventorySha256: rows.at(-1).sha256,
    previousReviewsAndCandidatesUnchanged: true, nativeVerified: false, installationApproved: false }));
}
