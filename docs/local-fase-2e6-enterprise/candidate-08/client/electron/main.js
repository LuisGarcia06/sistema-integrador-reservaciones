'use strict';
// Ventana, preload y autorización IPC/PDF originales. Inscripción y TLS independientes.
const {app,BrowserWindow,dialog,ipcMain,session}=require('electron'),fs=require('node:fs/promises'),path=require('node:path');
const EXPORT_DAILY_PDF_CHANNEL='daily:export-pdf',secureClient=true,PRINCIPAL_TEST=false,DEV_DB02=false;
require('../shared/release026').confineModules(path.resolve(__dirname,'..'));
let APP_ORIGIN,APP_URL,BACKEND_PORT,mainWindow=null,backendVerified=false,isQuitting=false,isExportingDailyPdf=false,connection,httpsSession,config;
app.setPath('userData',path.join(app.getPath('temp'),'ctsk-client026-rejected'));
if(process.argv.some(a=>/^--(?:no-sandbox|ignore-certificate-errors|disable-web-security|remote-debugging|inspect|js-flags)/.test(a)))throw Error('UNSAFE_FLAGS');
for(const key of Object.keys(process.env))if(/^(DB_|PG|APP_|NODE_OPTIONS$|NODE_PATH$|NODE_EXTRA_CA_CERTS$|FAREHARBOR_|GETYOURGUIDE_|GYG_|JWT_|HTTP_PROXY$|HTTPS_PROXY$|ALL_PROXY$)/i.test(key))throw Error('ENV_CONFLICT');
const args=process.argv.filter(a=>a.startsWith('--ctsk-descriptor=')),trusts=process.argv.filter(a=>a.startsWith('--ctsk-trust='));
function requestLocalPath(url,timeoutMs=1200,token=null){return require('./enterprise026Tls').request(config,url,timeoutMs,token).catch(()=>null);}
function isAllowedAppUrl(targetUrl) {
    let parsedUrl;

    try {
        parsedUrl = new URL(targetUrl);
    } catch (error) {
        return false;
    }

    return parsedUrl.origin === APP_ORIGIN && parsedUrl.pathname.startsWith('/app/');
}

function isExpectedSender(event) {
    if (!mainWindow || event.sender !== mainWindow.webContents) {
        return false;
    }

    const senderUrl = event.senderFrame && event.senderFrame.url
        ? event.senderFrame.url
        : event.sender.getURL();

    return isAllowedAppUrl(senderUrl);
}

function normalizeDailyDate(value) {
    const text = typeof value === 'string' ? value : '';

    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : 'sin-fecha';
}

function buildDailyPdfFileName(fecha) {
    return `Daily_${normalizeDailyDate(fecha)}.pdf`;
}

function ensurePdfExtension(filePath) {
    return path.extname(filePath).toLowerCase() === '.pdf' ? filePath : `${filePath}.pdf`;
}

// La exportacion debe revalidar permisos aunque se invoque el IPC directamente.
async function getAuthorizedDailyPdfContext(event, fecha) {
    const context = await event.sender.executeJavaScript(`(async () => {
        try {
            if (!window.App || !App.auth || !App.auth.estaAutenticado()) return null;
            await App.auth.refrescarSesion();
            const date = document.getElementById('daily-fecha');
            const root = document.getElementById('daily-print-root');
            if (!App.auth.puedeAccederPagina('daily') || location.hash !== '#/daily'
                || !date || !root || !root.innerHTML.trim()) return null;
            await App.ui.waitForPrintAssets(root);
            if (!root.isConnected || !root.innerHTML.trim()) return null;
            return { token: App.auth.obtenerToken(), fecha: date.value,
                version: App.auth.obtenerVersionSesion() };
        } catch (error) { return null; }
    })()`);
    if (!context || !context.token || context.fecha !== fecha) return null;
    const response = await requestLocalPath(
        '/api/daily/operativo?fecha=' + encodeURIComponent(fecha), 5000, context.token
    );
    if (!response || response.statusCode !== 200) return null;
    let daily;
    try { daily = JSON.parse(response.body); } catch (error) { return null; }
    if (!daily || daily.total_transportes <= 0) return null;
    const unchanged = await event.sender.executeJavaScript(`Boolean(window.App && App.auth
        && App.auth.estaAutenticado() && App.auth.puedeAccederPagina('daily')
        && App.auth.obtenerVersionSesion() === ${Number(context.version)}
        && location.hash === '#/daily'
        && document.getElementById('daily-print-root')?.innerHTML.trim())`);
    return unchanged ? context : null;
}

ipcMain.handle(EXPORT_DAILY_PDF_CHANNEL, async (event, payload) => {
    if (!isExpectedSender(event)) {
        return { ok: false, error: 'not_allowed' };
    }

    if (isExportingDailyPdf) {
        return { ok: false, busy: true };
    }

    isExportingDailyPdf = true;

    try {
        const fecha = normalizeDailyDate(payload && payload.fecha);
        const context = await getAuthorizedDailyPdfContext(event, fecha);
        if (!context) return { ok: false, error: 'not_allowed' };
        const pdfBuffer = await event.sender.printToPDF({
            printBackground: true,
            preferCSSPageSize: true
        });
        const saveResult = await dialog.showSaveDialog(mainWindow, {
            title: 'Guardar Daily en PDF',
            defaultPath: buildDailyPdfFileName(fecha),
            filters: [
                { name: 'PDF', extensions: ['pdf'] }
            ],
            properties: ['createDirectory', 'showOverwriteConfirmation']
        });

        if (saveResult.canceled || !saveResult.filePath) {
            return { ok: false, canceled: true };
        }

        const verified = await getAuthorizedDailyPdfContext(event, fecha);
        if (!verified || verified.version !== context.version || verified.token !== context.token) {
            return { ok: false, error: 'not_allowed' };
        }
        await fs.writeFile(ensurePdfExtension(saveResult.filePath), pdfBuffer);

        return { ok: true };
    } catch (error) {
        console.error('No se pudo exportar el Daily a PDF.', error);
        return { ok: false, error: 'pdf_failed' };
    } finally {
        isExportingDailyPdf = false;
    }
});


function createMainWindow() {
    if (!backendVerified || isQuitting) return;
    mainWindow = new BrowserWindow({
        width: 1366,
        height: 768,
        minWidth: 1024,
        minHeight: 640,
        show: false,
        webPreferences: {
            ...(httpsSession ? { session: httpsSession } : {}),
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            webviewTag: false
        }
    });

    if (!PRINCIPAL_TEST && !DEV_DB02) {
        mainWindow.webContents.session.webRequest.onBeforeRequest((details, callback) => {
            let allowed = false;
            try { allowed = new URL(details.url).origin === APP_ORIGIN; } catch (_) {}
            callback({ cancel: !allowed });
        });
        mainWindow.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
        mainWindow.webContents.session.setPermissionCheckHandler(() => false);
    }

    mainWindow.setMenuBarVisibility(false);
    if (true) mainWindow.maximize();

    mainWindow.once('ready-to-show', () => {
        if (mainWindow && true) {
            mainWindow.show();
        }
    });

    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
        if (!isAllowedAppUrl(targetUrl)) {
            event.preventDefault();
        }
    });

    mainWindow.webContents.on('will-redirect', (event, targetUrl) => {
        if (!isAllowedAppUrl(targetUrl)) {
            event.preventDefault();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    mainWindow.loadURL(APP_URL);
}


app.whenReady().then(async()=>{if(args.length!==1||trusts.length!==1)throw Error('PUBLIC_DESCRIPTOR_REQUIRED');config=require('./enterprise026ClientPolicy').readClient(args[0].slice('--ctsk-descriptor='.length),trusts[0].slice('--ctsk-trust='.length));app.setPath('userData',path.join(config.directory,'desktop-profile026'));if(!app.requestSingleInstanceLock()){app.quit();return;}app.commandLine.appendSwitch('disable-background-networking');APP_ORIGIN=config.origin;APP_URL=APP_ORIGIN+'/app/';BACKEND_PORT=config.port;httpsSession=session.fromPartition('client026:'+config.installationId);require('./enterprise026Tls').installTrust(httpsSession,config);connection=await require('./enterprise026Backend').connect({config,onUnavailable:async()=>{backendVerified=false;if(mainWindow&&!mainWindow.isDestroyed())await mainWindow.webContents.executeJavaScript('App.auth.cerrarSesion();true').catch(()=>{});},onReady:()=>{backendVerified=true;}});createMainWindow();console.log('CLIENT026_READY');}).catch(e=>{console.error('CLIENT026_REJECTED '+(/^[A-Z0-9_]+$/.test(e.code||e.message)?e.code||e.message:'START'));app.quit();});
app.on('window-all-closed',()=>app.quit());app.on('before-quit',()=>{isQuitting=true;backendVerified=false;connection?.stop();});
