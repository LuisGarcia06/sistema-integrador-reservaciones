'use strict';
// Extrae NSIS como archivo: nunca ejecuta instaladores/desinstaladores.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const H = require('./payload.cjs');
const root = path.resolve(__dirname, '../..');
const release = process.argv[2] || '2e7-candidate-03';
if (!/^2e7-candidate-\d{2}$/.test(release)) throw Error('AUDIT_RELEASE');
const out = path.join(root, 'docs/local-fase-2e7');
const distribution = path.join(root, 'dist/windows-2e7', release);
const report = JSON.parse(fs.readFileSync(path.join(out, release + '-build-report.json')));
const extractRoot = path.join(root, 'dist/windows-2e7', release + '-extracted');
fs.mkdirSync(extractRoot); // Sin reutilización de extracciones previas.
const exe = path.join(root, 'dist/windows-2e7/audit-tools/7zip-26.05/7z.exe');
const env = require(path.join(root, 'backend/config/desktopPolicy')).cleanEnvironment();
delete env.ELECTRON_RUN_AS_NODE;
function command(file, args, timeout = 120000, statuses = [0]) {
  const result = cp.spawnSync(file, args, { windowsHide: true, encoding: 'utf8', timeout, env });
  if (result.error || !statuses.includes(result.status)) throw Error('AUDIT_COMMAND_FAILED:' + path.basename(file));
  return (result.stdout || '') + (result.stderr || '');
}
const audit = { release, productionAuthorized: false, installerExecuted: false,
  extractor: { source: 'https://github.com/ip7z/7zip/releases/download/26.05/7z2605-x64.exe',
    sha256: H.sha(fs.readFileSync(exe)), extractedWithoutInstalling: true }, sides: {},
  windows11Installation: 'pending-isolated-vm', freshT0: 'pending-isolated-vm', postgresLiveRegression: 'not-run',
  historicalAcceptance: 'docs/local-fase-2e6-enterprise/attempt-10/verification.json' };
const R = require(path.join(root, 'shared/release026'));
for (const side of ['server', 'client']) {
  const installer = path.join(root, report.installers[side].file);
  assert.equal(H.sha(fs.readFileSync(installer)), report.installers[side].sha256);
  const extracted = path.join(extractRoot, side);
  const log = command(exe, ['x', installer, '-o' + extracted, '-y']);
  fs.writeFileSync(path.join(out, release + '-' + side + '-extraction.log'), log, { flag: 'wx' });
  const sourceManifest = H.verify(path.join(distribution, side), side);
  const actual = H.tree(extracted);
  const expected = new Set(sourceManifest.files.map(item => item.file));
  expected.add('distribution-inventory.json');
  const extras = actual.filter(item => !expected.has(item.file));
  assert.ok(extras.every(item => item.file.startsWith('$PLUGINSDIR/') ||
    item.file === '$LOCALAPPDATA/CommunityTours/CandidateUninstall026/' + release + '/' + side + '/Uninstall.exe'));
  for (const row of sourceManifest.files) assert.equal(H.sha(fs.readFileSync(path.join(extracted, row.file))), row.sha256, row.file);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(extracted, 'distribution-inventory.json'))), sourceManifest);
  // Auditoría independiente de PowerShell sobre el payload original, sin auxiliares NSIS.
  const verification = command('powershell.exe', ['-NoProfile', '-NonInteractive', '-File',
    path.join(distribution, side, 'Verify-Payload.ps1'), '-Side', side]);
  assert.ok(verification.includes('PAYLOAD_VERIFIED_UNSIGNED_CANDIDATE'));
  const app = side === 'server' ? path.join(extracted, 'app') : path.join(extracted, 'runtime/resources/app');
  assert.equal(R.inventory(app).digest, report.sources[side].inventoryDigest);
  const runtime = path.join(extracted, 'runtime', side === 'server' ? 'node.exe' : 'electron.exe');
  assert.equal(H.machine(runtime), 0x8664);
  const smoke = side === 'server' ? command(runtime, ['--version']) : command(runtime, []);
  if (side === 'server') assert.equal(smoke.trim(), 'v22.20.0');
  else assert.ok(smoke.includes('CLIENT026_REJECTED PUBLIC_DESCRIPTOR_REQUIRED'), 'ELECTRON_RUNTIME_FAIL_CLOSED');
  const result = { completePayloadMatch: true, unchangedApplication026: true,
    files: sourceManifest.files.length + 1, sha256: report.installers[side].sha256,
    nsisAuxiliaryFiles: extras, runtimeMachine: 'AMD64', runtimeSmoke: smoke.trim(),
    installerBootstrapMachine: H.machine(installer) === 0x14c ? 'x86-unicode (NSIS; payload AMD64)' : 'other',
    powershellInventoryPassed: true };
  if (side === 'server') {
    // Contratos SQL fijados: solo lee archivos, ninguna conexión PostgreSQL.
    result.sqlContracts = require(path.join(app, 'scripts/enterprise026Provision.cjs')).contractSources(app)
      .map(({ file, sha256 }) => ({ file, sha256 }));
    assert.equal(result.sqlContracts.length, 9);
    result.preflightRejection = command(path.join(distribution, side, 'runtime/node.exe'),
      [path.join(distribution, side, 'tools/server-control.cjs'), 'check',
        path.join(extracted, 'absent-server026.json'), path.join(extracted, 'absent-authority026.json')], 120000, [1]);
    assert.equal(result.preflightRejection.trim(), 'SERVER026_CONTROL_REJECTED');
  }
  audit.sides[side] = result;
}
const dependencies = JSON.parse(fs.readFileSync(path.join(root, 'docs/local-fase-2e6-enterprise/candidate-08/build-report.json'))).dependencies;
audit.dependencies = dependencies;
fs.writeFileSync(path.join(out, release + '-audit.json'), JSON.stringify(audit, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ release, completePayloadMatch: true, installersExecuted: false }));
