const http = require('node:http');
const path = require('node:path');
const { PROTOCOL, fail, safeCode, readConfig, fingerprint } = require('./config/desktopPolicy');

function blockProviderNetwork() {
    const net = require('node:net');
    const connect = net.Socket.prototype.connect;
    net.Socket.prototype.connect = function (...args) {
        let target = args[0]; if (Array.isArray(target)) target = target[0];
        const allowed = target && typeof target === 'object'
            ? target.host === '127.0.0.1' && Number(target.port) === 5432
            : Number(target) === 5432 && args[1] === '127.0.0.1';
        if (!allowed) fail('PRIVATE_PARENT');
        return connect.apply(this, args);
    };
    require('node:dgram').createSocket = () => fail('PRIVATE_PARENT');
    global.fetch = async () => fail('PRIVATE_PARENT');
}

// Inyección de dependencias solo por importación; no existen banderas de bypass.
function runChild({ transport = process, root = path.join(__dirname, '..'), loadConfig = readConfig,
    hashCode = fingerprint, createServer = http.createServer, initialize = require('./config/desktopConfiguration').initialize,
    getPool = () => require('./config/database'), verify = require('./config/desktopPostgres').verifyPostgres,
    getApp = () => require('./server'), isolate = blockProviderNetwork, deadline = 30000 } = {}) {
    let boot, server, pool, handler, closing = false, started = false;
    const timer = setTimeout(() => close(1), deadline);
    const send = message => {
        try { if (transport.connected && boot) transport.send({ ...message, protocol: PROTOCOL, nonce: boot.nonce, pid: transport.pid }, () => {}); } catch (_) { void close(1); }
    };
    async function close(code = 0) {
        if (closing) return;
        closing = true; clearTimeout(timer); handler = null;
        // Un pool detenido/solicitud colgada no puede conservar el puerto indefinidamente.
        const force = setTimeout(() => transport.exit(code), 1500); force.unref();
        if (server) {
            server.closeAllConnections?.();
            await new Promise(resolve => server.close(() => resolve()));
        }
        if (pool) await pool.end().catch(() => {});
        clearTimeout(force); transport.exit(code);
    }
    async function start(message) {
        try {
            if (started || !transport.send || !transport.connected || message?.type !== 'boot' || message.protocol !== PROTOCOL ||
                !/^[a-f0-9]{64}$/.test(message.nonce || '') || message.parentPid !== transport.ppid) fail('PRIVATE_PARENT');
            started = true; boot = message;
            isolate();
            // Un único bind exclusivo, retenido durante verificación y servicio: sin sondeo HTTP ni carrera check/start.
            server = createServer((req, res) => {
                if (handler && !closing) return handler(req, res);
                res.writeHead(503, { 'Cache-Control': 'no-store', Connection: 'close' }); res.end('Aplicación no disponible');
            });
            await new Promise((resolve, reject) => {
                server.once('error', error => reject(Object.assign(Error('bind'), { code: error.code === 'EADDRINUSE' ? 'PORT_OCCUPIED' : 'START_FAILED' })));
                server.listen({ host: '127.0.0.1', port: 3000, exclusive: true }, resolve);
            });
            server.on('error', () => { send({ type: 'error', code: 'START_FAILED' }); void close(1); });
            if (closing) return;
            const loaded = loadConfig(message.configPath);
            if (loaded.digest !== message.configDigest) fail('CONFIG_CHANGED');
            if (hashCode(root) !== message.code) fail('CODE_CHANGED');
            initialize(loaded.config); pool = getPool();
            await verify(pool, loaded.config);
            if (closing || !transport.connected) return close();
            if (hashCode(root) !== message.code || loadConfig(message.configPath).digest !== message.configDigest) fail('CONFIG_CHANGED');
            handler = getApp();
            clearTimeout(timer);
            send({ type: 'ready', code: message.code, configDigest: message.configDigest, port: 3000, environment: 'principal' });
        } catch (error) { send({ type: 'error', code: safeCode(error) }); await close(1); }
    }
    transport.on('message', message => {
        if (!started) { void start(message); return; }
        if (message?.type === 'stop' && message.protocol === PROTOCOL && message.nonce === boot?.nonce) void close();
        else { send({ type: 'error', code: 'IPC_INVALID' }); void close(1); }
    });
    transport.once('disconnect', () => { void close(); });
    transport.once('SIGTERM', () => { void close(); });
    transport.once('SIGINT', () => { void close(); });
    if (!transport.send || !transport.connected) void close(1);
    return { close };
}
if (require.main === module) runChild();
module.exports = { runChild, blockProviderNetwork };
