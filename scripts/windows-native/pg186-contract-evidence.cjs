'use strict';
// Evidencia de fuentes y pruebas offline: no procesos, red, VM ni PostgreSQL.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const evidence = 'docs/local-fase-2e7-pg186-contracts';
const read = file => fs.readFileSync(path.join(root, file));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const write = (name, value) => fs.writeFileSync(path.join(root, evidence, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const baseline = JSON.parse(read(evidence + '/baseline.json'));
const preserved = require('./security-review-baseline.cjs').preservedArtifacts();
assert.deepEqual(preserved, baseline.preserved);
const deltas = baseline.files.map(row => {
  assert.equal(hash(read(evidence + '/before/' + row.file)), row.sha256);
  const after = hash(read(row.file));
  return { file: row.file, beforeSha256: row.sha256, afterSha256: after, changed: row.sha256 !== after };
});
for (const file of ['backend/config/desktopPolicy.js', 'backend/config/desktopPostgres.js'])
  assert.equal(deltas.find(row => row.file === file).changed, false);
const tap = read(evidence + '/tests-safe.tap').toString('utf8');
const count = key => { const rows = [...tap.matchAll(new RegExp('^# ' + key + ' (\\d+)\\r?$', 'gm'))]; assert.equal(rows.length, 1); return Number(rows[0][1]); };
const tests = Object.fromEntries(['tests', 'pass', 'fail', 'skipped', 'cancelled'].map(key => [key, count(key)]));
assert.equal(tests.tests, 285); assert.equal(tests.pass, 285); assert.equal(tests.fail + tests.skipped + tests.cancelled, 0);
const PG = require('../../shared/postgresExperimentalContract');
write('dependency-requirements.json', { purpose: 'future-experimental-dependency-requirements-not-an-enrollment',
  scope: PG.scope, productionAuthorized: false, enrollmentReady: false, operationallyApproved: false,
  postgresVersion: PG.VERSION, serverVersionNum: PG.SQL_VERSION_NUM, windowsFileVersion: PG.WINDOWS_FILE_VERSION,
  distribution: { vendor: null, source: null, originalArchiveSha256: null, authenticated: false },
  tools: PG.TOOLS.map(tool => ({ file: tool + '.exe', sha256: null, peArchitecture: null, verified: false })),
  dllAndShareClosure: { files: null, verified: false }, cmdException: 'official-verified-internal-postgresql-only',
  nativeAcceptance: 'pending', installerBuilt: false });
write('verification.json', { scope: PG.scope, productionAuthorized: false, postgresVersion: PG.VERSION,
  tests, sourceDeltas: deltas, priorArtifactsUnchanged: true, preserved,
  postgresExecuted: false, nativeAcceptance: 'pending', vmAccessed: false, installersBuilt: false,
  firstTokenVerifiedNatively: false, provenanceVerifiedNatively: false, installationApproved: false });
const files = new Set(deltas.map(row => row.file));
for (const file of ['shared/postgresExperimentalContract.js', 'scripts/windows-setup/postgresExperimentalContract.js',
  'scripts/windows-native/pg186-contract.test.cjs', 'scripts/windows-native/pg186-contract-evidence.cjs',
  'scripts/windows-native/safe-test-guard.cjs', 'docs/ACTUALIZACION-CONTRATOS-POSTGRESQL-18_6.md',
  'docs/PRUEBA-NATIVA-02-PROCEDENCIA-POSTGRESQL-18_6.md']) files.add(file);
function walk(dir) { for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
  const file = dir + '/' + entry.name; assert.equal(entry.isSymbolicLink(), false);
  if (entry.isDirectory()) walk(file); else if (entry.isFile() && entry.name !== 'SHA256SUMS.txt') files.add(file);
  else if (!entry.isFile()) throw Error('UNEXPECTED_FILE_TYPE');
} }
walk(evidence);
const inventory = [...files].sort().map(file => hash(read(file)) + '  ' + file).join('\n') + '\n';
fs.writeFileSync(path.join(root, evidence, 'SHA256SUMS.txt'), inventory, { flag: 'wx' });
console.log(JSON.stringify({ tests, files: files.size, inventorySha256: hash(Buffer.from(inventory)), priorArtifactsUnchanged: true }));
