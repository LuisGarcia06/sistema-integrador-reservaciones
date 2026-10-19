const path = require('node:path');
const { spawnSync } = require('node:child_process');
test('Electron: archivo consciente, contadores, historial paginado, auditoría y ACCESS-SCOPE con API sintética', () => {
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const result = spawnSync(require('electron'), [path.join(__dirname, 'helpers/archivoEventosUiHarness.cjs'), '--disable-gpu'], { env, windowsHide: true, encoding: 'utf8', timeout: 60000 });
    if (result.status !== 0) throw Error(result.stdout + '\n' + result.stderr + '\n' + result.error);
    expect(result.stdout).toContain('ARCHIVO_EVENTOS_UI_OK');
}, 65000);
