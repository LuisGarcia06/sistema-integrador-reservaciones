const { spawnSync } = require('node:child_process');
const path = require('node:path');
test('PRE-RELEASE-05: Electron real con controles manuales, API aislada y bloqueo de red', () => {
  const env = { NODE_ENV: 'test' };
  for (const key of ['SystemRoot', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'PATH', 'PATHEXT', 'SystemDrive']) if (process.env[key] !== undefined) env[key] = process.env[key];
  const r = spawnSync(require('electron'), [path.resolve(__dirname, '../../scripts/preview/main.cjs'), '--preview-self-test'], { env, windowsHide: true, encoding: 'utf8', timeout: 60000 });
  if (r.status !== 0) throw Error(r.stdout + '\n' + r.stderr + '\n' + (r.error || ''));
  expect(r.stdout).toContain('PRE_RELEASE_05_OK');
}, 65000);
