'use strict';
// Compilación offline salvo licencia oficial obtenida y registrada separadamente.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const H = require('./payload.cjs');
const root = path.resolve(__dirname, '../..');
const source = process.argv[3] ? fs.realpathSync(path.resolve(process.argv[3])) : path.join(root, 'docs/local-fase-2e6-enterprise/candidate-08');
if (!source.startsWith(root + path.sep)) throw Error('BUILD_SOURCE_OUTSIDE_WORKSPACE');
const evidence = path.join(root, 'docs/local-fase-2e7');
const release = process.argv[2] || '2e7-candidate-01';
if (!/^2e7-candidate-\d{2}$/.test(release)) throw Error('BUILD_RELEASE');
const output = path.join(root, 'dist/windows-2e7', release);
const R = require(path.join(root, 'shared/release026'));
const env = require(path.join(root, 'backend/config/desktopPolicy')).cleanEnvironment();
delete env.ELECTRON_RUN_AS_NODE;
function filesAt(dir, name) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...filesAt(file, name));
    else if (entry.name === name) found.push(file);
  }
  return found;
}
const cache = path.join(process.env.LOCALAPPDATA, 'electron-builder/Cache');
const compilers = filesAt(path.join(cache, 'nsis-3.0.4.1'), 'makensis.exe')
  .filter(file => fs.existsSync(path.join(path.dirname(file), 'nsisconf.nsh')));
if (compilers.length !== 1) throw Error('NSIS_LOCAL_REQUIRED');
const compiler = compilers[0];
const electron = path.join(root, 'node_modules/electron/dist');
assert.equal(process.version, 'v22.20.0');
assert.equal(process.arch, 'x64');
assert.equal(fs.readFileSync(path.join(electron, 'version'), 'utf8').trim(), '43.4.1');
assert.equal(H.machine(process.execPath), 0x8664);
assert.equal(H.machine(path.join(electron, 'electron.exe')), 0x8664);
const license = path.join(evidence, 'node-v22.20.0-LICENSE.txt');
assert.ok(fs.readFileSync(license, 'utf8').includes('Node.js'));
fs.mkdirSync(output, { recursive: false }); // Un candidato nunca sobrescribe otro.
const archives = JSON.parse(fs.readFileSync(path.join(source, 'archives.json')));
const report = { protocol: 'ctsk-windows-build-2e7-v1', release, productionAuthorized: false,
  scope: 'synthetic-acceptance-only', installerExecuted: false, sources: {}, payloads: {}, installers: {},
  node: process.version, electron: '43.4.1', compiler: { file: compiler, sha256: H.sha(fs.readFileSync(compiler)) },
  nodeLicense: { url: 'https://raw.githubusercontent.com/nodejs/node/v22.20.0/LICENSE', sha256: H.sha(fs.readFileSync(license)) } };
const forbidden = /(^|\/)(?:\.env(?:\..*)?|\.git|secrets|__tests__|__fixtures__|fixtures|frontend\/lab)(?:\/|$)|\.(?:pem|key|pfx|p12|dump|backup|sql\.gz|test\.js|log)$/i;
for (const side of ['server', 'client']) {
  const candidate = path.join(source, side);
  const inv = R.inventory(candidate);
  assert.equal(inv.digest, archives[side].inventoryDigest);
  assert.equal(H.sha(fs.readFileSync(path.join(source, side + '-candidate026.zip'))), archives[side].sha256);
  report.sources[side] = { inventoryDigest: inv.digest, archiveSha256: archives[side].sha256, files: inv.files.length + 1 };
  const destination = path.join(output, side);
  fs.mkdirSync(destination);
  const app = side === 'server' ? path.join(destination, 'app') : path.join(destination, 'runtime/resources/app');
  if (side === 'client') {
    fs.cpSync(electron, path.join(destination, 'runtime'), { recursive: true, errorOnExist: true, force: false });
    // default_app.asar es el ejemplo de Electron; la aplicación se distribuye en resources/app.
    fs.unlinkSync(path.join(destination, 'runtime/resources/default_app.asar'));
  }
  fs.cpSync(candidate, app, { recursive: true, errorOnExist: true, force: false });
  assert.equal(R.inventory(app).digest, inv.digest);
  fs.copyFileSync(path.join(__dirname, 'Verify-Payload.ps1'), path.join(destination, 'Verify-Payload.ps1'));
  if (side === 'server') {
    fs.mkdirSync(path.join(destination, 'runtime'));
    fs.copyFileSync(process.execPath, path.join(destination, 'runtime/node.exe'));
    fs.copyFileSync(license, path.join(destination, 'runtime/LICENSE-node.txt'));
    fs.mkdirSync(path.join(destination, 'tools'));
    for (const name of ['payload.cjs', 'server-control.cjs', 'maintenance.cjs', 'client-enrollment.cjs']) fs.copyFileSync(path.join(__dirname, name), path.join(destination, 'tools', name));
    for (const name of ['Start-Server.ps1', 'Prepare-Autostart.ps1', 'Maintain-Server.ps1']) fs.copyFileSync(path.join(__dirname, name), path.join(destination, name));
  }
  fs.writeFileSync(path.join(destination, 'LEEME.txt'), [
    'Community Tours - ' + side + ' - ' + release,
    'CANDIDATO DE ENSAYO SIN FIRMA EMPRESARIAL. SOLO VM WINDOWS 11 X64 AISLADA.',
    'No incluye autoridad, certificados, claves, contraseñas ni datos comerciales.',
    'Antes de ejecutar: Verify-Payload.ps1 -Side ' + side + '. Contrastar SHA256 por canal confiable.',
    side === 'server' ? 'Prerrequisito: herramientas PostgreSQL 18.6 exacto x64 en C:\\Program Files\\PostgreSQL\\18\\bin. No se instala ni modifica PostgreSQL.' : 'Runtime Electron 43.4.1 completo; sin backend ni PostgreSQL.',
    side === 'server' ? 'Start-Server.ps1 -ServerConfig <server026.json privado> -Authority <authority026.json privada>. No crea base ni usuario.' : 'Acceso directo: descriptor firmado y autoridad externa en %LOCALAPPDATA%\\ctsk-client026-' + release + '. Sin esos archivos, se rechaza el inicio.',
    'La identidad 026 solo admite aceptación sintética y HTTPS loopback; no permite empresa/LAN.',
    'Datos y secretos deben permanecer fuera del directorio de programa.',
    'Actualización: candidato en directorio nuevo; respaldo previo, reinscripción explícita y pruebas; no se migra al arrancar.',
    'Desinstalación conservadora: retira accesos y registro; conserva código, datos, secretos y respaldos. Retiro de archivos separado.',
    'Procedimiento completo: docs/FASE-2E7-INSTALADORES-WINDOWS.md del repositorio de revisión.'
  ].join('\r\n') + '\r\n');
  const rows = H.tree(destination);
  assert.ok(rows.every(item => !forbidden.test(item.file)), 'DISTRIBUTION_FORBIDDEN_FILE');
  if (side === 'client') assert.ok(rows.every(item => !/(^|\/)(backend|database|node_modules|scripts)(\/|$)/.test(item.file)), 'CLIENT_SERVER_COMPONENT');
  const manifest = { protocol: 'ctsk-windows-candidate-2e7-v1', release, side, scope: report.scope,
    productionAuthorized: false, sourceInventoryDigest: inv.digest, files: rows };
  fs.writeFileSync(path.join(destination, 'distribution-inventory.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
  H.verify(destination, side);
  report.payloads[side] = { files: rows.length + 1, bytes: rows.reduce((s, r) => s + r.bytes, 0),
    inventorySha256: H.sha(fs.readFileSync(path.join(destination, 'distribution-inventory.json'))),
    audit: { unchangedSource: true, unchangedCandidate08: !process.argv[3], closedInventory: true, forbiddenFiles: 0,
      backendIncluded: side === 'server', postgresIncluded: false, privateTrustIncluded: false, populatedDatabaseIncluded: false } };
  const installer = path.join(output, 'CommunityTours-' + side + '-' + release + '-win-x64-UNSIGNED.exe');
  const args = ['/V3', '/INPUTCHARSET', 'UTF8', '/DSIDE=' + side, '/DRELEASE=' + release, '/DPAYLOAD=' + destination, '/DOUTPUT=' + installer];
  if (side === 'client') args.push('/DCLIENT');
  args.push(path.join(__dirname, 'installer.nsi'));
  const result = cp.spawnSync(compiler, args, { encoding: 'utf8', windowsHide: true, timeout: 300000, env });
  fs.writeFileSync(path.join(evidence, release + '-' + side + '-build.log'), (result.stdout || '') + (result.stderr || ''));
  if (result.status !== 0) throw Error('NSIS_BUILD_' + side);
  if (/warning \d+:/i.test(result.stdout || '')) throw Error('NSIS_WARNING_' + side);
  report.installers[side] = { file: path.relative(root, installer).replaceAll('\\', '/'),
    bytes: fs.statSync(installer).size, sha256: H.sha(fs.readFileSync(installer)), signed: false };
  console.log('BUILT ' + side);
}
fs.writeFileSync(path.join(evidence, release + '-build-report.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
fs.writeFileSync(path.join(output, 'SHA256SUMS.txt'), Object.values(report.installers).map(i => i.sha256 + '  ' + path.basename(i.file)).join('\r\n') + '\r\n', { flag: 'wx' });
console.log(JSON.stringify({ release, installers: report.installers }));
