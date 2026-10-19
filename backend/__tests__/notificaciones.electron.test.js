const path = require('node:path'), { spawnSync } = require('node:child_process');
test('Electron: avisos globales, navegación, lectura, dos ventanas, fallos y ACCESS-SCOPE con API sintética', () => {
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const r = spawnSync(require('electron'), [path.join(__dirname, 'helpers/notificacionesUiHarness.cjs'), '--disable-gpu'], { env, windowsHide: true, encoding: 'utf8', timeout: 90000 });
    if (r.status !== 0) throw Error(r.stdout + '\n' + r.stderr + '\n' + r.error);
    expect(r.stdout).toContain('NOTIFICACIONES_UI_OK');
}, 95000);
