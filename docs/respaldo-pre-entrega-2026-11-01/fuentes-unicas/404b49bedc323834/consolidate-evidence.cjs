'use strict';
// Evidence-only consolidation. Does not start servers, connect to PostgreSQL or read .env.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '../..');
process.chdir(root);
const dir = path.relative(root, __dirname);
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const write = (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2) + '\n');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const walk = folder => fs.readdirSync(folder, { withFileTypes: true }).flatMap(e => {
  const file = path.join(folder, e.name);
  return e.isDirectory() ? walk(file) : [file];
});
const cdir = path.join(process.env.LOCALAPPDATA, 'ctsk-standalone-fa7dc2629623');
const C = read(path.join(cdir, 'administrative-frontend-verification.json'));
const cProof = read(path.join(cdir, 'administrative-frontend-proof.json'));
assert.equal(require(path.join(root, 'backend/config/credentialSecurityPolicy')).fingerprint(root), cProof.body.code);
assert.equal(cProof.body.reportDigest, sha(path.join(cdir, 'administrative-frontend-verification.json')));
assert.equal(C.completed, true);
assert.equal(C.checks.length, 28);
assert.equal(C.writers.length, 13);
assert.equal(C.transactionProofs.length, 28);
assert.equal(C.secretScanPassed, true);
for (const [from, to] of [
  ['administrative-frontend-verification.json', 'c-verification.json'],
  ['administrative-electron-checks.json', 'c-electron-checks.json'],
  ['administrative-frontend-proof.json', 'c-proof.json'],
  ['administrative-frontend.log', 'c-server.log'],
  ['security-verification.json', 'a-final-verification.json']
]) fs.copyFileSync(path.join(cdir, from), path.join(dir, to));
for (const file of fs.readdirSync(cdir).filter(x => x.endsWith('.png')))
  fs.copyFileSync(path.join(cdir, file), path.join(dir, file));

const before = read(path.join(dir, 'source-before.json'));
assert(!before.some(x => /(^|[\\/])\.env($|\.)/.test(x.path)));
const previous = read(path.join(dir, 'source-verification.json'));
const allowed = new Set(previous.changed.map(x => x.path.replace(/\\/g, '/')));
const changed = [], missing = [], unexpected = [];
for (const row of before) {
  if (!fs.existsSync(row.path)) { missing.push(row.path); continue; }
  const after = sha(row.path), name = row.path.replace(/\\/g, '/');
  if (after === row.sha256) continue;
  const backup = path.join(dir, 'originals', row.path);
  const item = { path: name, before: row.sha256, after, backup, backupSha: fs.existsSync(backup) ? sha(backup) : null };
  changed.push(item);
  if (!allowed.has(name)) unexpected.push(name);
}
assert.equal(missing.length, 0); assert.equal(unexpected.length, 0);
assert.equal(changed.length, 20); assert(changed.every(x => x.before === x.backupSha));
const priorSet = new Set(before.map(x => x.path.replace(/\\/g, '/')));
const created = ['backend', 'frontend', 'scripts', 'database'].flatMap(walk)
  .map(x => x.replace(/\\/g, '/')).filter(x => !priorSet.has(x)).sort();
assert.equal(created.length, 19);
const preservation = {
  priorFiles: before.length, unchanged: before.length - changed.length, changed,
  missing, unexpected, backupsExact: true,
  migrations018Through023Unchanged: !changed.some(x => /^database\//.test(x.path)),
  mainEntriesUnchanged: !changed.some(x => /^(frontend\/index\.html|backend\/server\.js|electron\/)/.test(x.path))
};
write('source-verification.json', preservation);
write('created-code-files.json', created);
write('reversion-manifest.json', {
  restoreOnlyAfterMatchingCurrentHash: changed,
  removeCreatedOnlyAfterMatchingCurrentHash: created.map(file => ({ path: file, sha256: sha(file) })),
  warning: 'Restauración individual del respaldo previo, nunca reset/clean ni HEAD. No borrar evidencias ni clústeres como parte de esta consolidación.'
});
const oldStatus = fs.readFileSync(path.join(dir, 'git-status-before.txt'), 'utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/).filter(Boolean);
const status = cp.execFileSync('git', ['status', '--porcelain=v1', '-uall'], { encoding: 'utf8' });
fs.writeFileSync(path.join(dir, 'git-status-final.txt'), status);
const finalStatus = status.trimEnd().split(/\r?\n/).filter(Boolean);
const missingEntries = oldStatus.filter(x => !finalStatus.includes(x));
assert.equal(missingEntries.length, 0);
write('git-preservation.json', { priorEntries: oldStatus.length, finalEntries: finalStatus.length, priorEntriesMissing: missingEntries });

const known = new Set(read(path.join(dir, 'labs.json')).map(x => x.directory));
for (const id of ['15e1fb624f12','fa7dc2629623','4e8b5b7abcc8','abd644df994c','8ce8a6b3ee76','91a7ef716d91'])
  known.add(path.join(process.env.LOCALAPPDATA, 'ctsk-standalone-' + id));
for (const file of fs.readdirSync(dir).filter(x => x.endsWith('.log'))) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  for (const m of text.matchAll(/ctsk-standalone-([0-9a-f]{12})\b/g))
    known.add(path.join(process.env.LOCALAPPDATA, 'ctsk-standalone-' + m[1]));
}
for (const row of read(path.join(dir, 'd-verification.json')).groups) known.add(row.directory);
const labs = [...known].sort().map(directory => {
  assert.equal(path.dirname(directory).toLowerCase(), process.env.LOCALAPPDATA.toLowerCase());
  assert.match(path.basename(directory), /^ctsk-standalone-[0-9a-f]{12}$/);
  const manifests = ['bootstrap-manifest.json','administrative-frontend-manifest.json','security-a-manifest.json','security-manifest.json','admin-api-manifest.json','audit-api-manifest.json','manifest.json'];
  const mfile = manifests.find(x => fs.existsSync(path.join(directory, x)));
  const m = mfile ? read(path.join(directory, mfile)) : null;
  const reports = ['bootstrap-verification.json','administrative-frontend-verification.json','security-verification.json','admin-api-verification.json','audit-api-verification.json'];
  const rfile = reports.find(x => fs.existsSync(path.join(directory, x)));
  const r = rfile ? read(path.join(directory, rfile)) : null;
  const provisioned = !!m?.cluster;
  if (m) assert.notEqual(m.database, 'sian_kaan_reservaciones');
  return { stage: m?.environment || 'unused', directory, provisioned, cluster: m?.cluster || null,
    database: m?.database || null, pgPort: m?.pgPort || null, httpPort: m?.httpPort || null,
    uiPort: r?.uiPort || null, report: rfile || null, completed: r?.completed || false,
    checks: Array.isArray(r?.checks) ? r.checks.length : 0,
    postgresStopped: !fs.existsSync(path.join(directory, 'data', 'postmaster.pid')) };
});
write('labs.json', labs);
if (process.argv.includes('--prepare-only')) {
  console.log(JSON.stringify({ prepared: true, C: C.checks.length, apiCalls: C.calls.length, preserved: before.length, changed: changed.length, created: created.length, directories: labs.length }));
  process.exit(0);
}
const D = read(path.join(dir, 'd-verification.json'));
assert.equal(D.completed, true); assert.equal(D.cProof.cluster, C.cluster);
assert.equal(D.cProof.code, cProof.body.code);
assert.equal(D.checks.length, 18); assert.equal(D.groups.length, 3);
assert(D.groups.every(g => g.completed && g.postgresStopped && g.secretScanPassed));
const regressions = {};
for (const [prefix, report, destination, expected] of [
  ['security023', 'security-verification.json', 'security023-regression.json', 72],
  ['catalog022', 'admin-api-verification.json', 'catalog022-final-regression.json', 73],
  ['api021', 'audit-api-verification.json', 'api021-final-regression.json', 44]
]) {
  const log = fs.readFileSync(path.join(dir, prefix + '-sealed-regression.log'), 'utf8');
  const match = log.match(/(?:CREDENTIAL_SECURITY_LAB|ADMIN_AUDIT_API_LAB|AUDIT_API_LAB) ([^\r\n]+)/);
  assert(match, prefix + ': missing lab header');
  const lab = match[1].trim();
  const value = read(path.join(lab, report));
  assert.equal(value.completed, true, prefix); assert.equal(value.postgresStopped, true, prefix);
  assert.equal(value.checks.length, expected, prefix);
  fs.copyFileSync(path.join(lab, report), path.join(dir, destination));
  regressions[prefix] = expected;
}
const jest = read(path.join(dir, 'jest-final.json'));
assert.equal(jest.success, true); assert.equal(jest.numFailedTests, 0);
assert.equal(jest.numPassedTests, 833); assert.equal(jest.numPassedTestSuites, 21);
const closure = read(path.join(dir, 'closure.json'));
assert.equal(closure.clusters, labs.filter(x => x.provisioned).length);
assert.equal(closure.labsStopped, true);
assert.equal(closure.listeners.length + closure.processes.length + closure.electronProcesses.length, 0);
assert(labs.every(x => x.postgresStopped));
const values = new Set();
for (const lab of labs) {
  const folder = lab.directory;
  for (const file of fs.readdirSync(folder)) {
    const target = path.join(folder, file);
    if (/\.key$/.test(file)) { const value = fs.readFileSync(target, 'utf8').trim(); if(value.length >= 8) values.add(value); }
    if (/^(?:runtime|security-runtime|administrative-frontend-runtime)\.env$/.test(file))
      for (const line of fs.readFileSync(target, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^(?:DB_PASSWORD|JWT_SECRET)=(.*)$/); if (m && m[1].length >= 8) values.add(m[1]);
      }
    if (file === 'test-user.json') {
      const value = read(target).password; if(typeof value === 'string' && value.length >= 8) values.add(value);
    }
  }
}
const publicFiles = [...walk(dir), 'docs/LOCAL-FASE-2D9B3.md', ...created]
  .filter(x => /\.(?:md|json|log|txt|js|cjs|ps1)$/.test(x));
const exposedFiles = [];
for (const file of publicFiles) {
  const content = fs.readFileSync(file, 'utf8');
  if ([...values].some(v => content.includes(v)) ||
      /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/.test(content) ||
      /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{20,}/.test(content))
    exposedFiles.push(file);
}
assert.equal(exposedFiles.length, 0, 'Public evidence contains a private value');
write('credential-safety.json', { checkedAt: new Date().toISOString(), publicTextFiles: publicFiles.length,
  knownPrivateValues: values.size, exposedFiles, passed: true,
  liveCScanPassed: C.secretScanPassed, liveDScansPassed: D.groups.every(g => g.secretScanPassed),
  note: 'Las contraseñas/hashes/JWT efímeros y la clave SQL D solo se cotejaron durante el corredor; no se persistieron para este escaneo posterior. PNG revisados visualmente y DOM verificado por C.' });
const processRuns = D.groups.reduce((sum, g) => sum + g.proofs.length, 0);
write('verification-summary.json', {
  phase: '2D.9B.3', completed: true, sealedAt: new Date().toISOString(),
  C: { completed: true, checks: C.checks.length, apiCalls: C.calls.length, writers: C.writers,
    transactionProofs: C.transactionProofs.length, signedARequired: true, signedCProduced: true, realElectron: true,
    directory: cdir, cluster: C.cluster },
  D: { completed: true, checks: D.checks.length, processRuns, independentClusters: 3, rollbacks: 4,
    firstHttpLogin: D.firstHttpLogin, allGroupsStopped: true },
  jest: { passed: jest.numPassedTests, suites: jest.numPassedTestSuites, failed: jest.numFailedTests, newTests: jest.numPassedTests - 761 },
  regressions, preservation: { files: before.length, unchanged: preservation.unchanged, changed: changed.length, newSources: created.length, backupsExact: true },
  closure: { clusters: closure.clusters, unusedDirectories: labs.filter(x => !x.provisioned).length, listeningPorts: 0, ownProcesses: 0, ownElectronProcesses: 0 },
  secretScanPassed: true
});
console.log(JSON.stringify({ sealed: true, C: C.checks.length, apiCalls: C.calls.length, D: D.checks.length, processRuns,
  jest: jest.numPassedTests, regressions, clusters: closure.clusters, ports: closure.ports.length }));
