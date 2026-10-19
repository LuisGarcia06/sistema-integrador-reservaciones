const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('fs/promises');
const http = require('http');
const path = require('path');

const BACKEND_PORT = 3000;
const BACKEND_HOST = '127.0.0.1';
const APP_ORIGIN = `http://${BACKEND_HOST}:${BACKEND_PORT}`;
const APP_URL = `${APP_ORIGIN}/app/`;
const EXPORT_DAILY_PDF_CHANNEL = 'daily:export-pdf';
const PACKAGED_CONFIG_FILE = 'config.env';
const explicitDev = (process.argv || []).includes('--ctsk-mode=dev');
const explicitPrincipalTest = (process.argv || []).includes('--ctsk-mode=principal-test');
const modeConflict = explicitDev !== (process.env.APP_DEV_DB02 === '1') ||
    explicitPrincipalTest !== (process.env.APP_PRINCIPAL_TEST === '1') || (explicitDev && explicitPrincipalTest);
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

let mainWindow = null;
let backendProcess = null;
let ownedBackend = null;
let backendVerified = false;
let startupAbort = null;
let isQuitting = false;
let isExportingDailyPdf = false;

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
    app.quit();
}

function requestLocalPath(pathname, timeoutMs = 1200, token = null) {
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
    if (modeConflict) require(path.join(__dirname, '../backend/config/desktopPolicy')).fail('ENV_CONFLICT');
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

function createMainWindow() {
    if (!backendVerified || isQuitting) return;
    mainWindow = new BrowserWindow({
        width: 1366,
        height: 768,
        minWidth: 1024,
        minHeight: 640,
        show: false,
        webPreferences: {
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
    mainWindow.maximize();

    mainWindow.once('ready-to-show', () => {
        if (mainWindow) {
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

function showStartupError(error) {
    const { MESSAGES, safeCode } = require(path.join(__dirname, '../backend/config/desktopPolicy'));
    const code = safeCode(error);
    console.error('Arranque detenido:', code);
    dialog.showErrorBox('No se pudo abrir la aplicación', MESSAGES[code]);
}

function stopOwnedBackend() {
    backendVerified = false;
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
