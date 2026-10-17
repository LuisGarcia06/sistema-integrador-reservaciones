const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('Identidad y navegacion en nueve pantallas, dialogos y dos resoluciones con API simulada', () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.BRANDING_SCREENS_OUTPUT;
  const result = spawnSync(require('electron'), [path.join(__dirname, 'helpers/brandingScreensHarness.cjs'), '--disable-gpu'], {
    env, windowsHide: true, encoding: 'utf8', timeout: 100000
  });
  if (result.status !== 0) throw new Error(result.stdout + '\n' + result.stderr + '\n' + result.error);
  expect(result.stdout).toContain('BRANDING_SCREENS_OK');
}, 105000);
