// Guardia antes de cargar Electron, abrir red o crear el perfil.
require('./windows11-contract.cjs').guard();
// Entrada explícita del Electron de demostración; nunca electron/main.js.
const { instalarAislamiento } = require('./isolation.cjs');
const isolation = instalarAislamiento();
const { app, BrowserWindow, session, dialog } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { crearPreviewApi } = require('./api.cjs');
const testing = process.argv.includes('--preview-self-test');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ctsk-preview-05-'));
app.setPath('userData', profile);
app.setPath('sessionData', profile);
app.setPath('crashDumps', path.join(profile, 'crashes'));
app.setAppUserModelId('com.communitytours.preview05');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-domain-reliability');
app.commandLine.appendSwitch('no-proxy-server');
app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND, EXCLUDE 127.0.0.1');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
let win, origin, closing = false, parentTimer;
const blocked = [];
const api = crearPreviewApi({ cerrar: () => cerrar() });
function cerrar(code = 0) {
  if (closing) return;
  closing = true;
  clearInterval(parentTimer);
  if (win && !win.isDestroyed()) win.destroy();
  api.server.closeAllConnections();
  api.server.close(() => app.exit(code));
  setTimeout(() => app.exit(code), 1500).unref();
}
function proteger(s) {
  s.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  s.setPermissionCheckHandler(() => false);
  s.on('will-download', event => event.preventDefault());
  s.webRequest.onBeforeRequest((details, callback) => {
    let allowed = false;
    try { const u = new URL(details.url); allowed = Boolean(origin && u.protocol === 'http:' && u.origin === origin); } catch {}
    if (!allowed) blocked.push('Solicitud Chromium bloqueada');
    callback({ cancel: !allowed });
  });
}
app.on('session-created', proteger);
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.on('will-navigate', (event, url) => { if (!origin || new URL(url).origin !== origin) event.preventDefault(); });
});
app.on('window-all-closed', () => cerrar());
app.on('before-quit', event => { if (!closing) { event.preventDefault(); cerrar(); } });
process.on('SIGINT', () => cerrar());
process.on('SIGTERM', () => cerrar());
const parentArg = process.argv.find(a => a.startsWith('--preview-parent='));
if (parentArg) {
  const pid = Number(parentArg.split('=')[1]);
  if (!Number.isInteger(pid) || pid <= 0) throw Error('PID de supervisor inválido.');
  parentTimer = setInterval(() => { try { process.kill(pid, 0); } catch { cerrar(); } }, 1000);
  parentTimer.unref();
}
async function run() {
  await app.whenReady();
  proteger(session.defaultSession);
  await session.defaultSession.setProxy({ mode: 'direct' });
  await new Promise((resolve, reject) => { api.server.once('error', reject); api.server.listen(0, '127.0.0.1', resolve); });
  origin = 'http://127.0.0.1:' + api.server.address().port;
  win = new BrowserWindow({ title: 'DEMO · Datos ficticios · Community Tours', show: !testing, width: 1440, height: 1000,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: !testing, spellcheck: false, devTools: testing } });
  win.removeMenu();
  win.webContents.on('page-title-updated', event => { event.preventDefault(); win.setTitle('DEMO PRE-RELEASE · DATOS FICTICIOS · Community Tours'); });
  win.webContents.on('render-process-gone', () => { dialog.showErrorBox('Prueba parcial interrumpida', 'Código: PREVIEW_RENDERER_GONE. Se perdió la interfaz; no se utilizó PostgreSQL.'); cerrar(1); });
  await win.loadURL(origin + '/index.html');
  console.log('DEMO lista. API ficticia: ' + origin + ' | Perfil temporal: ' + profile);
  if (testing) {
    await require('./selfTest.cjs').probar({ win, api, origin, profile, blocked, isolation });
    console.log('PRE_RELEASE_05_OK'); cerrar();
  }
}
run().catch(async error => { console.error('PREVIEW_REJECTED'); await app.whenReady(); dialog.showErrorBox('Prueba parcial bloqueada', 'No pudo abrirse el frontend con la API sintética. Código: PREVIEW_START_FAILED. No se utilizó PostgreSQL.'); cerrar(1); });
