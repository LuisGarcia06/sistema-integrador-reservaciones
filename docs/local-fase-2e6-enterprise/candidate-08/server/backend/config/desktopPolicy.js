const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PROTOCOL = 'ctsk-desktop-03a-v1';
const WINDOWS_ENV = new Set(('path systemroot windir comspec pathext temp tmp userprofile appdata localappdata programfiles programfiles(x86) programdata systemdrive allusersprofile username userdomain homedrive homepath').split(' '));
const CONFIG_KEYS = new Set(['APP_ENVIRONMENT', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD',
    'DB_CLUSTER_ID', 'DB_SERVER_VERSION', 'DB_SCHEMA_VERSION', 'JWT_SECRET', 'JWT_EXPIRES_IN',
    'GYG_GMAIL_SYNC_ENABLED', 'INTEGRATION_DASHBOARD_CUTOFF_AT']);
const MESSAGES = Object.freeze({
    ENV_CONFLICT: 'Hay variables heredadas incompatibles. Cierre este inicio y use una consola sin configuración DB/PG, APP, Node o proveedores.',
    CONFIG_MISSING: 'Falta el archivo de configuración autorizado para este inicio.',
    CONFIG_INVALID: 'La configuración autorizada está incompleta o no corresponde al entorno principal y al rol limitado requerido.',
    CONFIG_ACL: 'La configuración o sus directorios tienen permisos inseguros o no verificables. Se requiere una intervención autorizada de permisos Windows.',
    CONFIG_CHANGED: 'La configuración cambió durante el arranque. Cierre y vuelva a iniciar tras su revisión.',
    CODE_CHANGED: 'La versión del código cambió o no coincide entre Electron y su backend.',
    PORT_OCCUPIED: 'El puerto 3000 está ocupado. Cierre manualmente el servicio correspondiente; la aplicación no reutiliza ni termina procesos ajenos.',
    IPC_INVALID: 'No se pudo verificar la identidad privada del backend propio.',
    START_TIMEOUT: 'El backend propio no completó las verificaciones a tiempo.',
    CHILD_EXIT: 'El backend propio terminó. La aplicación se cerrará para evitar utilizar otro servicio.',
    START_CANCELLED: 'Se canceló el arranque y se cerró únicamente el backend propio.',
    PG_UNAVAILABLE: 'PostgreSQL no está disponible o no permite la verificación requerida. No se abrió la aplicación.',
    PG_IDENTITY: 'La conexión PostgreSQL efectiva no coincide con la configuración autorizada.',
    PG_CLUSTER: 'La identidad del clúster no coincide o no puede verificarse con el rol autorizado.',
    PG_ROLE: 'El rol de ejecución tiene privilegios elevados, propiedad o permisos incompatibles.',
    SCHEMA_INVALID: 'El esquema requerido o la migración 017 están ausentes, incompletos o son incompatibles. No se ejecutan migraciones automáticamente.',
    PRIVATE_PARENT: 'El backend habitual requiere el canal privado del Electron que lo inició.',
    START_FAILED: 'No se pudo iniciar el backend propio. Revise la configuración autorizada.'
});
function fail(code) { throw Object.assign(new Error(MESSAGES[code] || MESSAGES.START_FAILED), { code }); }
function safeCode(error) { return Object.hasOwn(MESSAGES, error?.code) ? error.code : 'START_FAILED'; }
function cleanEnvironment(source = process.env) {
    if (source.NODE_ENV && source.NODE_ENV !== 'production') fail('ENV_CONFLICT');
    for (const key of Object.keys(source)) {
        if (/^(DB_|PG|APP_|NODE_OPTIONS$|NODE_PATH$|NODE_EXTRA_CA_CERTS$|ELECTRON_RUN_AS_NODE$|GYG_|GETYOURGUIDE_|FAREHARBOR_|WHATSAPP_|GOOGLE_|JWT_|INTEGRATION_|HTTP_PROXY$|HTTPS_PROXY$|ALL_PROXY$)/i.test(key)) fail('ENV_CONFLICT');
    }
    const env = {};
    for (const [key, value] of Object.entries(source)) if (WINDOWS_ENV.has(key.toLowerCase())) env[key] = value;
    return { ...env, ELECTRON_RUN_AS_NODE: '1', NODE_ENV: 'production' };
}
function validateConfig(c) {
    if (Object.keys(c).some(k => !CONFIG_KEYS.has(k)) || Object.values(c).some(v => typeof v !== 'string') ||
        c.APP_ENVIRONMENT !== 'principal' || c.DB_HOST !== 'localhost' || c.DB_PORT !== '5432' ||
        c.DB_NAME !== 'sian_kaan_reservaciones' || c.DB_CLUSTER_ID !== '7632825987452064788' ||
        c.DB_SERVER_VERSION !== '18.3' || c.DB_SCHEMA_VERSION !== '017' ||
        !/^[a-z][a-z0-9_]{2,62}$/.test(c.DB_USER || '') || /^(postgres|pg_)/.test(c.DB_USER) ||
        !c.DB_PASSWORD?.trim() || (c.JWT_SECRET || '').trim().length < 32 ||
        c.GYG_GMAIL_SYNC_ENABLED !== 'false' ||
        (c.JWT_EXPIRES_IN && !/^([1-9]|1[0-2])h$/.test(c.JWT_EXPIRES_IN)) ||
        (c.INTEGRATION_DASHBOARD_CUTOFF_AT && !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?(?:Z|[+-]\d\d:\d\d)$/.test(c.INTEGRATION_DASHBOARD_CUTOFF_AT))) fail('CONFIG_INVALID');
    return Object.freeze({ ...c });
}
function readConfig(filename, { checkAcl = require('./windowsConfigAcl').checkAcl, validate = validateConfig } = {}) {
    if (!path.isAbsolute(filename)) fail('CONFIG_INVALID');
    try { checkAcl(filename); } catch (error) { fail(error.code === 'CONFIG_MISSING' ? 'CONFIG_MISSING' : 'CONFIG_ACL'); }
    let content;
    try { content = fs.readFileSync(filename, 'utf8'); } catch (_) { fail('CONFIG_MISSING'); }
    // Contrato de una línea por clave: sin duplicados, export, expansión ni multilinea.
    const keys = new Set();
    for (const line of content.split(/\r?\n/)) {
        if (!line.trim() || line.trim().startsWith('#')) continue;
        const match = /^([A-Z][A-Z0-9_]*)\s*=/.exec(line);
        if (!match || keys.has(match[1]) || !CONFIG_KEYS.has(match[1])) fail('CONFIG_INVALID');
        keys.add(match[1]);
    }
    const parsed = require('dotenv').parse(content);
    if (Object.keys(parsed).length !== keys.size) fail('CONFIG_INVALID');
    const config = validate(parsed);
    checkAcl(filename);
    return { config, digest: crypto.createHash('sha256').update(content).digest('hex') };
}
function fingerprint(root) {
    const hash = crypto.createHash('sha256');
    // Mismo conjunto en fuentes y app.asar.unpacked; no contiene configuración ni secretos.
    function visit(relative) {
        for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
            if (entry.name === '__tests__' || entry.name.endsWith('.test.js')) continue;
            if (entry.isSymbolicLink()) fail('CODE_CHANGED');
            const name = path.posix.join(relative, entry.name);
            if (entry.isDirectory()) visit(name);
            else if (/\.(js|cjs|html|css|svg|png|jpg|woff2?)$/.test(name)) hash.update(name).update('\0').update(fs.readFileSync(path.join(root, name))).update('\0');
        }
    }
    visit('backend'); visit('frontend');
    hash.update(PROTOCOL);
    return hash.digest('hex');
}
module.exports = { PROTOCOL, MESSAGES, fail, safeCode, WINDOWS_ENV, cleanEnvironment, validateConfig, readConfig, fingerprint };
