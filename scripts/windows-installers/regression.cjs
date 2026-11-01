'use strict';
// Misma selección 2E.6; nunca descubre suites ni paquetes históricos recursivamente.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const previous = JSON.parse(fs.readFileSync(path.join(root, 'docs/local-fase-2e6-enterprise/jest-final.json')));
const files = [...new Set(previous.testResults.map(item => 'backend/__tests__/' + path.basename(item.name)))];
files.push('backend/__tests__/windowsInstallers.test.js');
const name = process.argv[2] || 'jest-final';
if (!/^jest-[a-z0-9-]+$/.test(name)) throw Error('EVIDENCE_NAME');
const output = path.join(root, 'docs/local-fase-2e7', name + '.json');
if (fs.existsSync(output)) throw Error('EVIDENCE_EXISTS');
const env = require(path.join(root, 'backend/config/desktopPolicy')).cleanEnvironment();
delete env.ELECTRON_RUN_AS_NODE;
const child = cp.spawn(process.execPath, [path.join(root, 'node_modules/jest/bin/jest.js'),
  '--config', 'backend/__tests__/standalone.jest.config.cjs', '--runInBand', '--runTestsByPath',
  ...files, '--json', '--outputFile=' + output], { cwd: root, env, windowsHide: true });
const log = fs.createWriteStream(path.join(root, 'docs/local-fase-2e7', name + '.log'), { flags: 'wx' });
child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
child.on('error', () => { console.error('REGRESSION_START_FAILED'); process.exitCode = 1; log.end(); });
child.on('exit', code => { log.end(); console.log('JEST_EXIT ' + code); process.exitCode = code ?? 1; });
