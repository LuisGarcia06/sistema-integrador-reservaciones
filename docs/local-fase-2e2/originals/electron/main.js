const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('fs/promises');
const http = require('http');
const path = require('path');

let BACKEND_PORT = 3000;
const BACKEND_HOST = '127.0.0.1';
let APP_ORIGIN = `http://${BACKEND_HOST}:${BACKEND_PORT}`;
let APP_URL = `${APP_ORIGIN}/app/`;
const EXPORT_DAILY_PDF_CHANNEL = 'daily:export-pdf';
const PACKAGED_CONFIG_FILE = 'config.env';
const explicitUnified = process.argv.includes('--ctsk-mode=unified023-lab');
const unifiedDriver = process.argv.includes('--ctsk-unified-test-driver');
const unifiedArgs = process.argv.filter(value=>value.startsWith('--ctsk-unified-manifest='));
const explicitDev = (process.argv || []).includes('--ctsk-mode=dev');
const explicitPrincipalTest = (process.argv || []).includes('--ctsk-mode=principal-test');
const explicitIndependent = (process.argv || []).includes('--ctsk-mode=independent-dev');
const explicitHttps = (process.argv || []).includes('--ctsk-mode=https-lab');
const explicitLan = (process.argv || []).includes('--ctsk-mode=lan-lab');
const secureClient = explicitHttps || explicitLan;
const httpsArgs = (process.argv || []).filter(value => value.startsWith('--ctsk-client='));
const independentArgs = (process.argv || []).filter(value => value.startsWith('--ctsk-manifest='));
const unifiedConflict = (explicitUnified && (explicitDev || explicitPrincipalTest || explicitIndependent || explicitHttps || explicitLan || unifiedArgs.length !== 1 || !process.send)) || (!explicitUnified && (unifiedArgs.length || unifiedDriver));
const modeConflict = unifiedConflict || explicitDev !== (process.env.APP_DEV_DB02 === '1') ||
    explicitPrincipalTest !== (process.env.APP_PRINCIPAL_TEST === '1') || (explicitDev && explicitPrincipalTest) ||
    (explicitIndependent && (explicitDev || explicitPrincipalTest || independentArgs.length !== 1)) ||
    (!explicitIndependent && independentArgs.length !== 0) ||
    (secureClient && (explicitDev || explicitPrincipalTest || explicitIndependent || httpsArgs.length !== 1)) ||
    (explicitHttps && explicitLan) || (!secureClient && httpsArgs.length !== 0);
const DEV_DB02 = explicitDev && !modeConflict;
const PRINCIPAL_TEST = explicitPrincipalTest && !modeConflict;
if (PRINCIPAL_TEST) {
    if (DEV_DB02 || app.isPackaged) throw new Error('Pruebas de principal requieren fuentes y modo exclusivo.');
    const principal = require('../scripts/prodAccessTest.cjs');
    if (process.env.APP_CONFIG_PATH !== principal.CONFIG) throw new Error('Configuracion de pruebas principal no verificada.');
    principal.readConfig();
    app.setPath('userData', path.join(principal.LAB, 'electron-profile'));
}
if (DEV_DB02) {
    if (app.isPackaged) throw new Error('DEV-DB-02 requiere las fuentes de desarrollo.');
    const dev = require('../scripts/devDb02.cjs');
    app.setPath('userData', path.join(dev.LAB, 'electron-profile'));
}
let independentStartupError = null;
if (explicitUnified) app.setPath('userData',path.join(app.getPath('temp'),'ctsk-unified-rejected-'+require('node:crypto').randomUUID()));
if (explicitUnified && !modeConflict) {
 try {
  if (app.isPackaged || process.argv.some(a=>/^--(?:no-sandbox|ignore-certificate-errors|disable-web-security|remote-debugging-port|remote-debugging-pipe|inspect|inspect-brk|js-flags)(?:=|$)/.test(a))) throw Error('UNIFIED_SOURCE_FLAGS_REQUIRED');
  require('../backend/config/desktopPolicy').cleanEnvironment();const plan=require('../backend/config/unifiedPolicy').readPlan(unifiedArgs[0].slice('--ctsk-unified-manifest='.length),getRuntimeRoot());
  if(plan.manifest.activation!=='electron-original')throw Error('UNIFIED_BACKEND_GATE');app.setPath('userData',path.join(plan.manifest.directory,'electron-original-profile'));
  app.commandLine.appendSwitch('disable-background-networking');if(unifiedDriver){app.disableHardwareAcceleration();app.commandLine.appendSwitch('in-process-gpu');}
 } catch(error){ independentStartupError=error; }
}
let httpsClientConfig = null;
// Incluso un paquete rechazado evita reclamar el perfil y bloqueo de la aplicación habitual.
if (explicitLan) app.setPath('userData', path.join(app.getPath('temp'), 'ctsk-lan-rejected-' + require('node:crypto').randomUUID()));
if (explicitLan && !modeConflict) {
    try {
        if (app.isPackaged) throw new Error('LAN de laboratorio requiere paquete público de fuentes.');
        if (process.argv.some(a => /^--(?:no-sandbox|ignore-certificate-errors|disable-web-security|disable-site-isolation-trials|remote-debugging-port|remote-debugging-pipe|inspect|inspect-brk|js-flags)(?:=|$)/.test(a))) throw Object.assign(Error('LAN_UNSAFE_FLAGS'), { code: 'LAN_UNSAFE_FLAGS' });
        httpsClientConfig = require('./lanClientPolicy').readClient(httpsArgs[0].slice('--ctsk-client='.length), getRuntimeRoot());
        app.setPath('userData', path.join(httpsClientConfig.directory, 'electron-profile'));
    } catch (error) { independentStartupError = error; }
}
if (explicitHttps && !modeConflict) {
    try {
        if (app.isPackaged) throw new Error('HTTPS de laboratorio requiere fuentes.');
        require('../backend/config/desktopPolicy').cleanEnvironment();
        httpsClientConfig = require('../backend/config/httpsLabPolicy').readClient(httpsArgs[0].slice('--ctsk-client='.length), getRuntimeRoot());
        app.setPath('userData', path.join(httpsClientConfig.directory, 'electron-profile'));
    } catch (error) { independentStartupError = error; }
}
if (explicitIndependent && !modeConflict) {
    try {
        if (app.isPackaged) throw new Error('Modo independiente solo disponible desde fuentes.');
        require('../backend/config/desktopPolicy').cleanEnvironment();
        const plan = require('../backend/config/standalonePolicy').readPlan(independentArgs[0].slice('--ctsk-manifest='.length), getRuntimeRoot());
        // Antes del single-instance lock: no reclamar el perfil de la aplicación habitual.
        app.setPath('userData', path.join(plan.manifest.directory, 'electron-profile'));
    } catch (error) { independentStartupError = error; }
}

let mainWindow = null;
let backendProcess = null;
let ownedBackend = null;
let independentBackend = null;
let httpsBackend = null;
let httpsSession = null;
let connectionWindow = null;
let backendVerified = false;
let startupAbort = null;
let isQuitting = false;
let isExportingDailyPdf = false;

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
    app.quit();
}

function requestLocalPath(pathname, timeoutMs = 1200, token = null) {
    if (secureClient) return httpsBackend ? httpsBackend.request(pathname, timeoutMs, token).catch(() => null) : Promise.resolve(null);
    return new Promise((resolve) => {
        let body = '';
        const request = http.get(
            {
                host: BACKEND_HOST,
                port: BACKEND_PORT,
                path: pathname,
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                timeout: timeoutMs
            },
            (response) => {
                response.setEncoding('utf8');

                response.on('data', (chunk) => {
                    body += chunk;
                });

                response.on('end', () => {
                    resolve({
                        body,
                        statusCode: response.statusCode
                    });
                });
            }
        );

        request.on('timeout', () => {
            request.destroy();
            resolve(null);
        });

        request.on('error', () => {
            resolve(null);
        });
    });
}

function getRuntimeRoot() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'app.asar.unpacked');
    }

    return path.join(__dirname, '..');
}

async function ensureBackend() {
    if (modeConflict) throw Object.assign(new Error('ENV_CONFLICT'), { code: 'ENV_CONFLICT' });
    if (secureClient) {
        if (independentStartupError) throw independentStartupError;
        if (!gotSingleInstanceLock || isQuitting || !httpsClientConfig) throw new Error('Inicio HTTPS cancelado.');
        const connector = require('./httpsBackend');
        httpsSession = require('electron').session.fromPartition(explicitLan ? 'persist:https-private-lan-lab' : 'persist:https-loopback-lab');
        if (explicitLan) await httpsSession.setProxy({ mode: 'direct' });
        connector.installTrust(httpsSession, httpsClientConfig);
        APP_ORIGIN = httpsClientConfig.origin; APP_URL = `${APP_ORIGIN}/app/`; BACKEND_PORT = httpsClientConfig.port;
        httpsBackend = connector.watchBackend(httpsClientConfig, {
            beforePoll: explicitLan ? () => require('../shared/lanContract').verifyLocal(httpsClientConfig.network, 'client') : () => {},
            onState: state => {
            if (isQuitting) return;
            if (state === 'ready') {
                backendVerified = true;
                if (!mainWindow) createMainWindow();
                if (connectionWindow) { connectionWindow.destroy(); connectionWindow = null; }
            } else {
                backendVerified = false;
                showConnectionState(state);
                if (mainWindow) mainWindow.destroy();
            }
        }});
        return;
    }
    if (explicitUnified) {
        if(independentStartupError)throw independentStartupError;
        const invalidate=()=>{backendVerified=false;if(mainWindow&&!mainWindow.isDestroyed())void mainWindow.webContents.executeJavaScript("App.auth.cerrarSesion();true").catch(()=>{});};
        independentBackend=await require('./unifiedBackend').connect({manifestPath:unifiedArgs[0].slice('--ctsk-unified-manifest='.length),root:getRuntimeRoot(),onUnavailable:invalidate,onRestart:invalidate,onReady:()=>{backendVerified=true;}});
        BACKEND_PORT=independentBackend.port;APP_ORIGIN=independentBackend.origin;APP_URL=APP_ORIGIN+'/app/';return;
    }
    if (explicitIndependent) {
        if (independentStartupError) throw independentStartupError;
        if (app.isPackaged || !gotSingleInstanceLock || isQuitting) throw new Error('Modo independiente requiere fuentes y sesión exclusiva.');
        const policy = require('../backend/config/desktopPolicy');
        policy.cleanEnvironment();
        const manifestPath = independentArgs[0].slice('--ctsk-manifest='.length);
        independentBackend = await require('./independentBackend').connectIndependentBackend({
            manifestPath, root: getRuntimeRoot(), onExit: () => {
                backendVerified = false;
                if (!isQuitting) { showStartupError({ code: 'CHILD_EXIT' }); isQuitting = true; mainWindow?.destroy(); app.quit(); }
            }
        });
        BACKEND_PORT = independentBackend.port;
        APP_ORIGIN = independentBackend.origin;
        APP_URL = `${APP_ORIGIN}/app/`;
        if (isQuitting) { independentBackend.stop(); independentBackend = null; }
        return;
    }
    if (PRINCIPAL_TEST) {
        if (!gotSingleInstanceLock) throw new Error('La instancia de pruebas principal ya esta abierta.');
        const principal = require('../scripts/prodAccessTest.cjs');
        backendProcess = await principal.startOwnedBackend({
            execPath: process.execPath,
            onExit: () => { if (!isQuitting) app.quit(); }
        });
        return;
    }
    if (DEV_DB02) {
        if (!gotSingleInstanceLock) throw new Error('La instancia DEV ya esta abierta.');
        const dev = require('../scripts/devDb02.cjs');
        backendProcess = await dev.startOwnedBackend({
            execPath: process.execPath, env: process.env,
            onExit: () => { if (!isQuitting) app.quit(); }
        });
        return;
    }

    if (!gotSingleInstanceLock || isQuitting) throw new Error('Inicio cancelado.');
    startupAbort = new AbortController();
    const runtimeRoot = getRuntimeRoot();
    ownedBackend = await require('./ownedBackend').startOwnedBackend({
        execPath: process.execPath, root: runtimeRoot,
        configPath: app.isPackaged ? path.join(app.getPath('userData'), PACKAGED_CONFIG_FILE)
            : path.join(runtimeRoot, '.env'),
        signal: startupAbort.signal,
        onExit: () => {
            backendVerified = false;
            if (!isQuitting) {
                showStartupError({ code: 'CHILD_EXIT' });
                isQuitting = true;
                mainWindow?.destroy();
                app.quit();
            }
        }
    });
    backendProcess = ownedBackend.process;
}

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

function showConnectionState(state) {
    const messages = { connecting: 'Verificando la conexión segura…', disconnected: 'El servidor no está disponible. Reintentando…',
        restarted: 'El servidor se reinició. Verificando la nueva conexión…', untrusted: 'No fue posible verificar la identidad segura del servidor. Las operaciones están bloqueadas.' };
    const update = () => connectionWindow?.webContents.executeJavaScript('document.getElementById("connection-state").textContent=' + JSON.stringify(messages[state] || messages.disconnected)).catch(() => {});
    if (!connectionWindow) {
        connectionWindow = new BrowserWindow({ width: 760, height: 360, webPreferences: {
            partition: 'https-connection-status', nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false
        }});
        connectionWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        connectionWindow.webContents.on('will-navigate', event => event.preventDefault());
        connectionWindow.webContents.on('will-redirect', event => event.preventDefault());
        connectionWindow.webContents.session.setPermissionRequestHandler((_w, _p, callback) => callback(false));
        connectionWindow.webContents.session.setPermissionCheckHandler(() => false);
        connectionWindow.webContents.session.webRequest.onBeforeRequest((details, callback) => {
            const { pathToFileURL } = require('node:url');
            callback({ cancel: details.url !== pathToFileURL(path.join(__dirname, 'connection.html')).href });
        });
        connectionWindow.webContents.once('did-finish-load', update);
        connectionWindow.on('closed', () => { connectionWindow = null; });
        connectionWindow.loadFile(path.join(__dirname, 'connection.html'));
    } else update();
}

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

    if (PRINCIPAL_TEST) require('../scripts/prodAccessTest.cjs').restrictRendererNetwork(mainWindow.webContents.session);
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
    if (!unifiedDriver) mainWindow.maximize();

    mainWindow.once('ready-to-show', () => {
        if (mainWindow && !unifiedDriver) {
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

    if(explicitUnified&&unifiedDriver){mainWindow.setSize(1440,1000);mainWindow.webContents.setBackgroundThrottling(false);mainWindow.webContents.once('did-finish-load',()=>require('../scripts/unifiedElectronDriver.cjs').attach(mainWindow));}
    mainWindow.loadURL(APP_URL);
}

function showStartupError(error) {
    if(explicitUnified&&unifiedDriver){console.error('UNIFIED_ORIGINAL_START_FAILED '+require('../backend/config/desktopPolicy').safeCode(error));process.send?.({type:'original-electron-start-failed',code:error.code||'UNIFIED_START_REJECTED'});return;}
    if (explicitLan) {
        console.error('Arranque LAN detenido:', /^[A-Z_]+$/.test(error.code || '') ? error.code : 'LAN_START_REJECTED');
        dialog.showErrorBox('Laboratorio LAN no autorizado', 'Revise el paquete público, la confianza HTTPS y la aprobación vigente de los dos equipos aislados.');
        return;
    }
    const { MESSAGES, safeCode } = require(path.join(__dirname, '../backend/config/desktopPolicy'));
    const code = safeCode(error);
    console.error('Arranque detenido:', code);
    dialog.showErrorBox('No se pudo abrir la aplicación', MESSAGES[code]);
}

function stopOwnedBackend() {
    backendVerified = false;
    if (httpsBackend) { httpsBackend.stop(); httpsBackend = null; }
    if (independentBackend) { independentBackend.stop(); independentBackend = null; }
    startupAbort?.abort();
    if (ownedBackend) {
        ownedBackend.stop(); ownedBackend = null; backendProcess = null;
        return;
    }
    if (!backendProcess) {
        return;
    }

    const processToStop = backendProcess;
    backendProcess = null;

    if (!processToStop.killed) {
        processToStop.kill();
    }
}

app.on('second-instance', () => {
    if (!mainWindow) {
        return;
    }

    if (mainWindow.isMinimized()) {
        mainWindow.restore();
    }

    mainWindow.focus();
});

if (gotSingleInstanceLock) app.whenReady()
    .then(async () => {
        await ensureBackend();
        if (isQuitting) { stopOwnedBackend(); return; }
        if (secureClient) return;
        backendVerified = true;
        createMainWindow();
    })
    .catch((error) => {
        showStartupError(error);
        app.quit();
    });

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && mainWindow === null) {
        createMainWindow();
    }
});

app.on('window-all-closed', () => {
    app.quit();
});

app.on('before-quit', () => {
    isQuitting = true;
    stopOwnedBackend();
});
