const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('Impresion corporativa: seis formatos, assets, IPC y permisos con API simulada', () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.BRANDING_PDF_OUTPUT;
  const result = spawnSync(require('electron'), [path.join(__dirname, 'helpers/printBrandingHarness.cjs'), '--disable-gpu'], {
    env, windowsHide: true, encoding: 'utf8', timeout: 90000
  });
  if (result.status !== 0) throw new Error(result.stdout + '\n' + result.stderr + '\n' + result.error);
  expect(result.stdout).toContain('PRINT_BRANDING_OK');
}, 95000);
