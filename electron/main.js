const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs/promises');
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
const EXPORT_DAILY_PDF_CHANNEL = 'daily:export-pdf';
const PACKAGED_CONFIG_FILE = 'config.env';
const REQUIRED_CONFIG_KEYS = [
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'JWT_SECRET'
];

let mainWindow = null;
let backendProcess = null;
let isQuitting = false;
let isExportingDailyPdf = false;

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

function getRuntimeRoot() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'app.asar.unpacked');
    }

    return path.join(__dirname, '..');
}

function getBackendServerPath() {
    return path.join(getRuntimeRoot(), 'backend', 'server.js');
}

function getPackagedConfigPath() {
    return path.join(app.getPath('userData'), PACKAGED_CONFIG_FILE);
}

function createConfigError(code, message, configPath) {
    const error = new Error(message);
    error.code = code;
    error.configPath = configPath;
    return error;
}

function parseEnvKeys(content) {
    const keys = new Map();

    content.split(/\r?\n/).forEach((line) => {
        const trimmedLine = line.trim();

        if (!trimmedLine || trimmedLine.startsWith('#')) {
            return;
        }

        const separatorIndex = trimmedLine.indexOf('=');

        if (separatorIndex <= 0) {
            return;
        }

        const key = trimmedLine.slice(0, separatorIndex).trim();
        const value = trimmedLine.slice(separatorIndex + 1).trim();

        keys.set(key, value);
    });

    return keys;
}

async function validatePackagedConfig() {
    const configPath = getPackagedConfigPath();
    let content;

    try {
        content = await fs.readFile(configPath, 'utf8');
    } catch (error) {
        throw createConfigError(
            'config_missing',
            'La aplicacion no esta configurada para conectarse a la base de datos.',
            configPath
        );
    }

    const keys = parseEnvKeys(content);
    const missingKeys = REQUIRED_CONFIG_KEYS.filter((key) => !keys.get(key));

    if (missingKeys.length > 0) {
        throw createConfigError(
            'config_invalid',
            'La configuracion de la aplicacion esta incompleta.',
            configPath
        );
    }

    return configPath;
}

async function buildBackendEnvironment() {
    const env = Object.assign({}, process.env, {
        ELECTRON_RUN_AS_NODE: '1'
    });

    if (app.isPackaged) {
        env.APP_CONFIG_PATH = await validatePackagedConfig();
    }

    return env;
}

async function startBackend() {
    const runtimeRoot = getRuntimeRoot();
    const serverPath = getBackendServerPath();
    const backendEnv = await buildBackendEnvironment();

    backendProcess = spawn(process.execPath, [serverPath], {
        cwd: runtimeRoot,
        env: backendEnv,
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

    await startBackend();

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

    if (error && (error.code === 'config_missing' || error.code === 'config_invalid')) {
        dialog.showErrorBox(
            'Configuracion requerida',
            `${error.message}\n\nArchivo esperado:\n${error.configPath}`
        );
        return;
    }

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
