const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const BACKEND_PORT = 3000;
const BACKEND_HOST = '127.0.0.1';
const APP_ORIGIN = `http://${BACKEND_HOST}:${BACKEND_PORT}`;
const APP_URL = `${APP_ORIGIN}/app/`;
const HEALTH_URL_PATH = '/';
const HEALTH_RESPONSE_TEXT = 'API del Sistema Integrador de Reservaciones funcionando';
const STARTUP_TIMEOUT_MS = 15000;
const RETRY_INTERVAL_MS = 350;

let mainWindow = null;
let backendProcess = null;
let isQuitting = false;

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
    app.quit();
}

function requestLocalPath(pathname, timeoutMs = 1200) {
    return new Promise((resolve) => {
        let body = '';
        const request = http.get(
            {
                host: BACKEND_HOST,
                port: BACKEND_PORT,
                path: pathname,
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

async function isExpectedBackendAvailable() {
    const response = await requestLocalPath(HEALTH_URL_PATH);

    return Boolean(
        response &&
        response.statusCode === 200 &&
        response.body.trim() === HEALTH_RESPONSE_TEXT
    );
}

async function waitForBackend(timeoutMs = STARTUP_TIMEOUT_MS) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        if (await isExpectedBackendAvailable()) {
            return true;
        }

        await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));
    }

    return false;
}

function startBackend() {
    const serverPath = path.join(__dirname, '..', 'backend', 'server.js');

    backendProcess = spawn(process.execPath, [serverPath], {
        cwd: path.join(__dirname, '..'),
        env: Object.assign({}, process.env, {
            ELECTRON_RUN_AS_NODE: '1'
        }),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });

    backendProcess.stdout.on('data', (data) => {
        console.log(`[backend] ${data.toString().trim()}`);
    });

    backendProcess.stderr.on('data', (data) => {
        console.error(`[backend] ${data.toString().trim()}`);
    });

    backendProcess.on('exit', (code, signal) => {
        if (!isQuitting) {
            console.error(`Backend finalizo inesperadamente. code=${code} signal=${signal}`);
        }

        backendProcess = null;
    });
}

async function ensureBackend() {
    if (await waitForBackend(1200)) {
        return;
    }

    startBackend();

    if (await waitForBackend()) {
        return;
    }

    throw new Error('No se pudo iniciar el backend local.');
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

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1366,
        height: 768,
        minWidth: 1024,
        minHeight: 640,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            webviewTag: false
        }
    });

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
    console.error(error);

    dialog.showErrorBox(
        'No se pudo abrir la aplicacion',
        'El backend local no esta disponible. Revisa PostgreSQL y vuelve a intentar.'
    );
}

function stopOwnedBackend() {
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

app.whenReady()
    .then(async () => {
        await ensureBackend();
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
