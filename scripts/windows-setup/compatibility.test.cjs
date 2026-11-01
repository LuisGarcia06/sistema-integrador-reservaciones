'use strict';
// Pruebas de argumentos: nunca ejecutan pg_ctl, Electron ni aprovisionamiento.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const candidate = path.join(root, 'dist/windows-2e7/2e7-candidate-03');
const H = require('../windows-installers/payload.cjs');
const sourceFile = path.join(candidate, 'server/app/scripts/enterprise026Provision.cjs');
const expectedProvisioner = '01237e12e6de7c9fa38b9450cfbac268b24427376caaa8573424cbc8a0180b57';
const source = fs.readFileSync(sourceFile, 'utf8');
const evidence = path.join(root, 'dist/windows-setup-compatibility', crypto.randomUUID());
fs.mkdirSync(evidence, { recursive: true });
const recorder = path.join(evidence, 'argv-recorder.cjs');
fs.writeFileSync(recorder,
  "'use strict';const fs=require('node:fs');fs.writeFileSync(process.argv[2],JSON.stringify(process.argv.slice(3)),{flag:'wx'});",
  { flag: 'wx' });

function captureControl(action = 'start') {
  const directory = 'C:\\Users\\VM User\\AppData\\Local\\ctsk-argument-probe';
  const dataDirectory = path.win32.join(directory, 'data');
  const marker = { provisionId: 'probe', cluster: 'probe', database: 'probe', dataDirectory };
  let call;
  const exported = { exports: {} };
  const fakeFs = {
    realpathSync: value => value,
    readFileSync: filename => filename.endsWith('postmaster.pid')
      ? ['12345', dataDirectory, '0', '23456'].join('\n') : JSON.stringify(marker)
  };
  vm.runInNewContext(source, {
    module: exported, Buffer,
    require(id) {
      if (id === 'node:fs') return fakeFs;
      if (id === 'node:child_process') return {
        execFileSync(file, args, options) { call = { file, args, payload: JSON.parse(options.input) }; }
      };
      if (id === '../backend/config/desktopPolicy') return { cleanEnvironment: () => ({}) };
      if (id === '../shared/release026') return { fail(code) { throw Error(code); } };
      if (id.startsWith('.')) throw Error('UNEXPECTED_RELATIVE_IMPORT');
      return require(id);
    }
  }, { filename: sourceFile });
  exported.exports.control({ ...marker, directory, pgPort: 23456 }, action);
  assert.ok(call);
  return call;
}

test('el aprovisionador probado coincide byte a byte con candidate-03', () => {
  assert.equal(H.sha(Buffer.from(source)), expectedProvisioner);
});

test('control start conserva sus validaciones y construye argumentos sin comillas', () => {
  const call = captureControl();
  assert.equal(call.file, 'powershell.exe');
  assert.equal(call.payload.exe, 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_ctl.exe');
  assert.ok(call.payload.args.includes('C:\\Users\\VM User\\AppData\\Local\\ctsk-argument-probe\\data'));
  assert.ok(call.args.includes('-EncodedCommand'));
});

test('control stop usa la misma envoltura y verifica PID, directorio y puerto simulados', () => {
  assert.equal(captureControl('stop').payload.args[0], 'stop');
});

for (const profile of ['VMUser', 'VM User', 'VM Usuario Prueba']) {
  test(`envoltura Windows real: perfil ${profile}`, { skip: process.platform !== 'win32' }, () => {
    const call = captureControl();
    const index = ['VMUser', 'VM User', 'VM Usuario Prueba'].indexOf(profile);
    const output = path.join(evidence, `case-${index}.json`);
    const intended = ['-D', `C:\\Users\\${profile}\\AppData\\Local\\ctsk-probe\\data`,
      '-l', `C:\\Users\\${profile}\\AppData\\Local\\ctsk-probe\\postgres.log`];
    // El único programa lanzado es este registrador de argumentos sin acceso a PostgreSQL.
    // Las comillas de los dos archivos del arnés no alteran los argumentos bajo prueba.
    const payload = { exe: process.execPath, args: [`"${recorder}"`, `"${output}"`, ...intended] };
    const result = cp.spawnSync(call.file, call.args, {
      input: JSON.stringify(payload), encoding: 'utf8', windowsHide: true, timeout: 15000
    });
    assert.equal(result.status, 0, result.stderr);
    const received = JSON.parse(fs.readFileSync(output));
    const preserved = JSON.stringify(received) === JSON.stringify(intended);
    // Prueba de caracterización: reproduce el defecto; no certifica compatibilidad con espacios.
    assert.equal(preserved, !profile.includes(' '));
    fs.writeFileSync(path.join(evidence, `case-${index}-evidence.json`), JSON.stringify({
      profile, intended, received, argumentsPreserved: preserved, defectReproduced: !preserved,
      postgresExecuted: false, databaseConnections: 0
    }, null, 2), { flag: 'wx' });
  });
}

test('ambos instaladores y payloads originales conservan sus inventarios y SHA256', () => {
  const report = JSON.parse(fs.readFileSync(path.join(root, 'docs/local-fase-2e7/2e7-candidate-03-build-report.json')));
  const results = [];
  for (const side of ['server', 'client']) {
    const inventory = H.verify(path.join(candidate, side), side);
    const file = path.join(root, report.installers[side].file);
    assert.equal(H.sha(fs.readFileSync(file)), report.installers[side].sha256);
    results.push({ side, files: inventory.files.length + 1, sha256: report.installers[side].sha256 });
  }
  fs.writeFileSync(path.join(evidence, 'integrity.json'), JSON.stringify({
    candidate: '2e7-candidate-03', results, installersExecuted: false,
    postgresExecuted: false, realAssistantExecuted: false, productionAuthorized: false
  }, null, 2), { flag: 'wx' });
});

process.on('exit', () => process.stdout.write(`Evidence: ${evidence}\n`));
