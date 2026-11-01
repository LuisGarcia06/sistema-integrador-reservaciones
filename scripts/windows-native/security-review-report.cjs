'use strict';
// Cierre de evidencia: lecturas/hashes y archivos nuevos; sin compilación ni procesos.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { assess } = require('./probe-contract.cjs');
const root = path.resolve(__dirname, '../..');
const dir = path.join(root, 'docs/local-fase-2e7-security-review');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const write = (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
if (require.main === module) {
  const tap = fs.readFileSync(path.join(dir, 'tests.tap'), 'utf8');
  const counts = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].map(key => {
    const matches = [...tap.matchAll(new RegExp('^# ' + key + ' (\\d+)\\s*$', 'gm'))];
    if (matches.length !== 1) throw Error('TEST_REPORT_AMBIGUOUS');
    return [key, Number(matches[0][1])];
  }));
  if (counts.tests !== 104 || counts.pass !== 104 || counts.fail || counts.cancelled || counts.skipped || counts.todo)
    throw Error('TEST_GATE_FAILED');
  const baseline = JSON.parse(fs.readFileSync(path.join(dir, 'baseline.json')));
  const preservation = JSON.parse(fs.readFileSync(path.join(dir, 'preservation.json')));
  if (preservation.unchanged !== true || JSON.stringify(baseline.preserved) !== JSON.stringify(preservation.preserved))
    throw Error('PRESERVATION_UNPROVEN');
  const original = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(dir, 'before/scripts__windows-native__probe-contract.cjs.txt'), 'utf8'), { module: original });
  const user = 'S-1-5-21-111-222-333-1001';
  const historical = { status: 0, error: null, child: { user, privileges: ['SeChangeNotifyPrivilege'],
    groups: { 'S-1-5-32-544': 4 }, hasRestrictions: true } };
  const current = { status: 0, error: null, signal: null, expectedUserSid: user, child: {
    ...historical.child, schemaVersion: 1, groupsComplete: true, privilegesComplete: true,
    groups: { 'S-1-5-32-544': 4, 'S-1-5-32-547': null }
  } };
  const regressions = {
    mode: 'pure-javascript-synthetic-fixtures-no-native-execution',
    historicalProducerShape: { fixture: historical, before: original.exports.assess(historical), after: assess(historical) },
    completeShapeWithEnabledAdmin: { fixture: current, before: original.exports.assess(current), after: assess(current) },
    aclBefore: 'status:0 with ETIMEDOUT was accepted; reproduced in acl-regression.test.cjs',
    aclAfter: 'same contradictory result rejected with CONFIG_ACL in both source copies'
  };
  if (!regressions.historicalProducerShape.before.verified || regressions.historicalProducerShape.after.verified ||
      regressions.completeShapeWithEnabledAdmin.after.verified) throw Error('REGRESSION_UNPROVEN');
  write('regressions.json', regressions);
  const sourceChanges = baseline.sources.map(({ file, sha256 }) => ({ file, beforeSha256: sha256,
    afterSha256: sha(fs.readFileSync(path.join(root, file))) }));
  write('verification.json', {
    reviewDate: '2026-10-31', timezone: 'America/Cancun',
    status: 'blocked-postgresql-18.3-internal-shell-dependency',
    scope: 'synthetic-acceptance-only', productionAuthorized: false,
    tests: { ...counts, node: process.version, mode: 'guarded-javascript-unit-regression-static-and-mocked-integration',
      command: 'node --require ./scripts/windows-native/safe-test-guard.cjs --test --experimental-test-isolation=none --test-reporter=tap scripts/windows-native/probe-contract.test.cjs scripts/windows-native/acl-regression.test.cjs scripts/windows-setup/coordinator.test.cjs scripts/windows-setup/ui.test.cjs scripts/windows-setup/restricted-policy.test.cjs' },
    sourceChanges,
    preservedArtifactsAndHistoricalEvidence: preservation.preserved,
    nativeProbe: { sourceRevised: true, buildDisabled: true, compiled: false, executed: false,
      tokenEquivalenceVerified: false, lifecycleVerifiedOnWindows: false, quarantineResolved: false },
    acl: { boundaryRegressionsPassed: true, rulesReviewedStatically: true, nativeAclVerified: false,
      encodedPowerShellDependencyRemoved: false },
    postgres: { sourceTag: 'REL_18_3', ordinaryPgCtlStartUsesCmd: true, serviceStartAvoidsThatWrapperInSource: true,
      initdbCallsPopen: true, win32PopenUsesCommandProcessor: true, shellFreeInitializationDemonstrated: false,
      architectureSelectedOrImplemented: false, servicesCreated: false, provisioningExecuted: false, databaseConnections: 0 },
    vmWindows11Acceptance: { t0: 'pending', bootstrap: 'pending', server: 'pending', https: 'pending',
      firstLogin: 'pending', shutdown: 'pending', restartAndPersistence: 'pending' },
    candidate05Generated: false, setup03Generated: false, installationApproved: false,
    windows10ProvisioningExecuted: false, realCompanyDataUsed: false,
    windowsPoliciesChanged: false, antivirusChanged: false, exclusionsAdded: false,
    quarantineRestored: false, installedIntegrityProtectedFilesModified: false,
    reservationsDailyRolesIntegrationsModifiedByThisReview: false
  });
  const files = [...baseline.sources.map(row => row.file),
    'scripts/windows-native/acl-regression.test.cjs', 'scripts/windows-native/safe-test-guard.cjs',
    'scripts/windows-native/security-review-baseline.cjs', 'scripts/windows-native/security-review-report.cjs',
    'docs/CORRECCION-INSTALACION-SEGURIDAD-2026-10-31.md'];
  function collect(relative) {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const file = relative + '/' + entry.name;
      if (entry.isDirectory()) collect(file);
      else if (entry.isFile()) files.push(file);
      else throw Error('REVIEW_UNEXPECTED_FILE_TYPE');
    }
  }
  collect('docs/local-fase-2e7-security-review');
  const rows = files.sort().map(file => {
    const bytes = fs.readFileSync(path.join(root, file));
    return { file, bytes: bytes.length, sha256: sha(bytes) };
  });
  write('review-inventory.json', { protocol: 'ctsk-static-security-review-v1',
    scope: 'synthetic-acceptance-only', productionAuthorized: false, installerInventory: false, files: rows });
  rows.push({ file: 'docs/local-fase-2e7-security-review/review-inventory.json',
    sha256: sha(fs.readFileSync(path.join(dir, 'review-inventory.json'))) });
  fs.writeFileSync(path.join(dir, 'SHA256SUMS.txt'), rows.map(row => row.sha256 + '  ' + row.file).join('\n') + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ tests: counts, reviewInventorySha256: rows.at(-1).sha256,
    previousArtifactsUnchanged: true, candidate05Generated: false, setup03Generated: false }));
}
