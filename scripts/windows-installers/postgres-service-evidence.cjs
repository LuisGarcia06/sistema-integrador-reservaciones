'use strict';
// Cierre de revisión offline; sin procesos, red, compilación ni aprovisionamiento.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { preservedArtifacts } = require('../windows-native/security-review-baseline.cjs');
const root = path.resolve(__dirname, '../..');
const directory = path.join(root, 'docs/local-fase-2e7-postgresql-exception');
const previous = path.join(root, 'docs/local-fase-2e7-security-review');
const commit = '62d6c7d3df6287f1bd83199c1a746e50d31571a0';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hashFile = file => sha(fs.readFileSync(path.join(root, file)));
const write = (name, value) => fs.writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
if (require.main === module) {
  const previousInventory = JSON.parse(fs.readFileSync(path.join(previous, 'review-inventory.json')));
  for (const row of previousInventory.files) if (hashFile(row.file) !== row.sha256) throw Error('PHASE1_FILE_CHANGED:' + row.file);
  const expectedInventoryHash = 'c53bba13338fd007bfcf46444f92bf48347252ae7e23b3a1b8877f1cdfe8a811';
  if (sha(fs.readFileSync(path.join(previous, 'review-inventory.json'))) !== expectedInventoryHash) throw Error('PHASE1_INVENTORY_CHANGED');
  for (const line of fs.readFileSync(path.join(previous, 'SHA256SUMS.txt'), 'utf8').trim().split('\n')) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match || hashFile(match[2]) !== match[1]) throw Error('PHASE1_CHECKSUM_CHANGED');
  }
  const baseline = JSON.parse(fs.readFileSync(path.join(previous, 'baseline.json')));
  const artifacts = preservedArtifacts();
  if (JSON.stringify(artifacts) !== JSON.stringify(baseline.preserved)) throw Error('PREVIOUS_ARTIFACT_CHANGED');
  write('preservation.json', { phase1InventorySha256: expectedInventoryHash, phase1FilesVerified: previousInventory.files.length,
    previousArtifactsAndQuarantineEvidenceUnchanged: true, preserved: artifacts });
  const reference = JSON.parse(fs.readFileSync(path.join(directory, 'sources/tag-reference.json')));
  if (reference.ref !== 'refs/tags/REL_18_3' || reference.object.type !== 'commit' || reference.object.sha !== commit)
    throw Error('PG_SOURCE_COMMIT');
  const sources = [['pg_ctl.c', 'src/bin/pg_ctl/pg_ctl.c'], ['initdb.c', 'src/bin/initdb/initdb.c'],
    ['restricted_token.c', 'src/common/restricted_token.c'], ['system.c', 'src/port/system.c'], ['port.h', 'src/include/port.h']]
    .map(([file, repositoryPath]) => {
      const bytes = fs.readFileSync(path.join(directory, 'sources', file + '.txt'));
      if (!bytes.equals(fs.readFileSync(path.join(directory, 'sources/commit', file + '.txt')))) throw Error('PG_TAG_COMMIT_MISMATCH');
      return { file: 'sources/' + file + '.txt', sha256: sha(bytes),
        tagUrl: 'https://raw.githubusercontent.com/postgres/postgres/REL_18_3/' + repositoryPath,
        immutableUrl: 'https://raw.githubusercontent.com/postgres/postgres/' + commit + '/' + repositoryPath };
    });
  write('source-provenance.json', { tag: 'REL_18_3', commit, format: 'text-only-no-compiled-artifacts', sources });
  const tap = fs.readFileSync(path.join(directory, 'tests.tap'), 'utf8');
  const counts = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].map(key => {
    const matches = [...tap.matchAll(new RegExp('^# ' + key + ' (\\d+)\\s*$', 'gm'))];
    if (matches.length !== 1) throw Error('TEST_SUMMARY_AMBIGUOUS');
    return [key, Number(matches[0][1])];
  }));
  if (counts.tests !== 161 || counts.pass !== 161 || counts.fail || counts.cancelled || counts.skipped || counts.todo)
    throw Error('TEST_GATE_FAILED');
  const sourceText = name => fs.readFileSync(path.join(directory, 'sources', name + '.txt'), 'utf8');
  function location(name, needle) {
    const content = sourceText(name), index = content.indexOf(needle);
    if (index < 0) throw Error('SOURCE_FINDING_MISSING');
    return { file: 'sources/' + name + '.txt', line: content.slice(0, index).split('\n').length };
  }
  const findings = {
    initdbRestrictedReexecutionFailure: { evidence: location('restricted_token.c', 'if ((restrictedToken = CreateRestrictedProcess(cmdline, &pi)) == 0)'),
      mode: 'static-source-review-not-live-fault-injection', failClosedGuaranteedByThisBranch: false },
    initdbInheritedRestrictionFlag: { evidence: location('restricted_token.c', 'getenv("PG_RESTRICT_EXEC")'), inheritedFlagIsTokenAttestation: false },
    initdbSystem: location('initdb.c', 'status = system(cmd.data);'),
    pgCtlConfigOnlyDirectoryPopen: location('pg_ctl.c', 'fd = popen(cmd, "r");'),
    pgCtlServiceRestrictedStart: location('pg_ctl.c', 'CreateRestrictedProcess(pgwin32_CommandLine(false), &pi, true)'),
    pgCtlLimitedStopWait: location('pg_ctl.c', 'int\t\t\tmaxShutdownCheckPoint'),
    cmdAutoRun: { presentOrMaliciousObserved: false, vmContextVerified: false,
      reference: 'https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/cmd' }
  };
  write('findings.json', findings);
  const command = 'node --require ./scripts/windows-native/safe-test-guard.cjs --test --experimental-test-isolation=none --test-reporter=tap scripts/windows-native/probe-contract.test.cjs scripts/windows-native/acl-regression.test.cjs scripts/windows-installers/postgres-service-contract.test.cjs scripts/windows-setup/coordinator.test.cjs scripts/windows-setup/ui.test.cjs scripts/windows-setup/restricted-policy.test.cjs';
  write('verification.json', {
    reviewDate: '2026-10-31', timezone: 'America/Cancun',
    scope: 'synthetic-acceptance-only', productionAuthorized: false,
    authorization: { file: 'user-authorization.txt', sha256: sha(fs.readFileSync(path.join(directory, 'user-authorization.txt'))),
      internalOfficialPostgres183CmdAllowed: true, ownShellsAllowed: false, additionalExceptionTaken: false },
    preferredArchitecture: 'official-exclusive-service-with-unverified-native-security-boundaries',
    previousAbsoluteShellBlockSuperseded: true,
    status: 'blocked-native-token-and-process-guarantees-not-demonstrated',
    blockers: ['INITDB_RESTRICTED_REEXECUTION_FAILURE_CONTINUES', 'NATIVE_SECURITY_BOUNDARY_UNVERIFIED',
      'CMD_CONTEXT_UNVERIFIED', 'SERVICE_STOP_REQUIRES_PROCESS_CONFIRMATION'],
    tests: { ...counts, newTests: 57, priorRegressionTests: 104, node: process.version,
      mode: 'guarded-javascript-static-and-synthetic-only', command },
    officialSource: { tag: 'REL_18_3', commit, filesMatchImmutableCommit: true },
    virtualBoxAvailability: { query: 'VBoxManage list runningvms', exitCodeObserved: 0,
      outputFile: 'running-vms.txt', outputBytes: fs.statSync(path.join(directory, 'running-vms.txt')).size,
      runningVmObserved: false, vmStartedByThisReview: false },
    nativeTokenVerified: false, nativeAclVerified: false, windows11HomeCompatibilityVerified: false,
    serviceIdentityOnWindowsVerified: false, cmdArbitraryExecutionPreventedOnVmVerified: false,
    firstAdministratorCaptureImplemented: false, powerShellDependenciesRemovedFromProduct: false,
    productExecutionPathsModified: false, newContractIntegrated: false,
    newNativeBinaryCompiled: false, quarantinePrototypeRestored: false, quarantinePrototypeCompiled: false,
    quarantinePrototypeExecuted: false, nativeServicesCreated: false, postgresToolsExecuted: false,
    databaseConnections: 0, windows10ProvisioningExecuted: false, windowsPoliciesChanged: false,
    antivirusOrSmartScreenChanged: false, exclusionsAdded: false, globalCertificatesInstalled: false,
    realCompanyDataUsed: false, protectedDatabasesModified: false, reservationsDailyRolesIntegrationsModified: false,
    candidate05Generated: false, setup03Generated: false, installationApproved: false,
    windows11Acceptance: { t0: 'pending', bootstrap: 'pending', server: 'pending', https: 'pending',
      firstLogin: 'pending', shutdown: 'pending', restartAndPersistence: 'pending' }
  });
  const files = ['scripts/windows-installers/postgres-service-contract.cjs',
    'scripts/windows-installers/postgres-service-contract.test.cjs', 'scripts/windows-installers/postgres-service-evidence.cjs',
    'docs/POSTGRESQL-EXCEPCION-LIMITADA-2026-10-31.md'];
  function collect(relative) {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const file = relative + '/' + entry.name;
      if (entry.isDirectory()) collect(file);
      else if (entry.isFile()) files.push(file);
      else throw Error('EVIDENCE_FILE_TYPE');
    }
  }
  collect('docs/local-fase-2e7-postgresql-exception');
  const rows = files.sort().map(file => ({ file, sha256: hashFile(file), bytes: fs.statSync(path.join(root, file)).size }));
  write('review-inventory.json', { protocol: 'ctsk-postgresql-exception-review-v1', scope: 'synthetic-acceptance-only',
    productionAuthorized: false, installerInventory: false, files: rows });
  const inventoryFile = 'docs/local-fase-2e7-postgresql-exception/review-inventory.json';
  rows.push({ file: inventoryFile, sha256: hashFile(inventoryFile) });
  fs.writeFileSync(path.join(directory, 'SHA256SUMS.txt'), rows.map(row => row.sha256 + '  ' + row.file).join('\n') + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ tests: counts, inventorySha256: rows.at(-1).sha256,
    previousArtifactsUnchanged: true, status: 'blocked-native-security-verification' }));
}
