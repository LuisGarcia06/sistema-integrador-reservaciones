const path = require('node:path');
const { spawnSync } = require('node:child_process');
test('Electron: administracion, navegacion, Dashboard y aislamiento de sesiones con API simulada', () => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const result = spawnSync(require('electron'), [path.join(__dirname, 'helpers', 'frontendScopeHarness.cjs'), '--disable-gpu'], {
        env, windowsHide: true, encoding: 'utf8', timeout: 60000
    });
    if (result.status !== 0) throw new Error('Electron harness: ' + result.stdout + '\n' + result.stderr + '\n' + result.error);
    expect(result.stdout).toContain('FRONTEND_SCOPE_OK');
}, 65000);
