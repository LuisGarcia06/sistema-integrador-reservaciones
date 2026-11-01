// Entrada Node independiente. No se inicia al importar y no acepta configuración principal.
const http = require('node:http');
const policy = require('./config/standalonePolicy');
const desktop = require('./config/desktopPolicy');

async function startStandalone(plan, {
    readPlan = policy.readPlan, verifyLocalCluster = policy.verifyLocalCluster,
    isolate = policy.blockNetwork, initialize = require('./config/desktopConfiguration').initialize,
    getPool = () => require('./config/database'),
    verify = (pool, config) => require('./config/desktopPostgres').verifyPostgresWithIdentity(pool, config,
        (row, c) => policy.validateIdentity(row, c, plan.manifest)),
    getApp = () => require('./server'), createServer = http.createServer,
    exit = code => process.exit(code), timeout = 30000,
    bindHost = policy.HOST, authorizeRequest = () => true,
    respondIdentity = ({ nonce, res }) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ identity: policy.publicIdentity(plan), proof: policy.proof(plan.key, nonce, policy.publicIdentity(plan)) }));
    }
} = {}) {
    // 019 no puede servir escrituras hasta existir el contrato API de la fase siguiente.
    if (plan?.manifest?.environment === 'revision-schema-lab' || plan?.manifest?.purpose === 'schema-tests-only' ||
        plan?.config?.APP_ENVIRONMENT === 'revision-schema-lab' || plan?.config?.DB_SCHEMA_VERSION === '019') policy.fail('SCHEMA_LAB_NOT_OPERATIONAL');
    let pool, app, ready = false, closing = false;
    const m = plan.manifest;
    const identity = policy.publicIdentity(plan);
    const server = createServer((req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        if (!ready || closing) { res.writeHead(503); return res.end(); }
        if (!authorizeRequest(req)) { res.writeHead(403); return res.end(); }
        // No aceptar nombres externos ni activar receptores/controles de integración en este laboratorio.
        if (req.headers.host !== `${bindHost}:${m.httpPort}`) { res.writeHead(403); return res.end(); }
        let url;
        try { url = new URL(req.url, `http://${policy.HOST}:${m.httpPort}`); }
        catch { res.writeHead(400); return res.end(); }
        if (url.pathname === '/api/local-service/challenge') {
            const challenge = url.searchParams.get('nonce');
            if (req.method !== 'GET' || !/^[a-f0-9]{64}$/.test(challenge || '')) { res.writeHead(400); return res.end(); }
            const failed = () => {
                if (!res.headersSent) res.writeHead(503); res.end();
            };
            try { const pending = respondIdentity({ nonce: challenge, res, pool }); pending?.catch(failed); }
            catch { failed(); }
            return;
        }
        if (/^\/api\/(?:integraciones|webhooks)(?:\/|$)/i.test(url.pathname)) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ mensaje: 'Receptores y controles de integración deshabilitados en Fase 1 de desarrollo.' }));
        }
        return app(req, res);
    });
    server.requestTimeout = 15000; server.headersTimeout = 10000; server.keepAliveTimeout = 1000;
    let closePromise;
    function close() {
        if (closePromise) return closePromise;
        closing = true; ready = false;
        closePromise = (async () => {
            const force = setTimeout(() => { server.closeAllConnections?.(); exit(1); }, 8000); force.unref();
            try {
                await new Promise(resolve => server.close(() => resolve()));
                if (pool) await pool.end();
            } finally { clearTimeout(force); }
        })();
        return closePromise;
    }
    let deadline;
    try {
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen({ host: bindHost, port: m.httpPort, exclusive: true }, resolve);
        });
        server.on('error', () => { void close().finally(() => exit(1)); });
        await Promise.race([
            (async () => {
                verifyLocalCluster(m); isolate(m.pgPort);
                initialize(plan.config); pool = getPool();
                await verify(pool, plan.config);
                // La guardia heredada 017 se conserva; la API actual requiere además publicación 018.
                await pool.query('SELECT aviso_publicado FROM public.eventos_integracion LIMIT 0');
                await pool.query('SELECT avisos_activados FROM public.integracion_sync_estado LIMIT 0');
                const after = readPlan(plan.filename);
                if (after.digest !== plan.digest || after.manifest.code !== m.code || after.key !== plan.key) policy.fail('CONFIG_CHANGED');
                if (closing) policy.fail('START_CANCELLED');
                app = getApp(); ready = true;
            })(),
            new Promise((_, reject) => { deadline = setTimeout(() => reject(Object.assign(Error('START_TIMEOUT'), { code: 'START_TIMEOUT' })), timeout); })
        ]);
        return { server, close, identity };
    } catch (error) { await close(); throw error; }
    finally { clearTimeout(deadline); }
}

async function main(argv = process.argv.slice(2)) {
    if (argv.length !== 2 || argv[0] !== '--manifest') policy.fail('STANDALONE_MANIFEST_REQUIRED');
    // Igual que el modo heredado: rechazar variables DB/PG/APP/proveedor y Node inyectadas.
    const env = desktop.cleanEnvironment(); delete env.ELECTRON_RUN_AS_NODE; process.env = env;
    const plan = policy.readPlan(argv[1]);
    const service = await startStandalone(plan);
    let stopping = false;
    const stop = () => {
        if (stopping) return; stopping = true;
        void service.close().then(() => { console.log('STANDALONE_STOPPED'); process.exit(0); }, () => process.exit(1));
    };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    console.log(JSON.stringify({ code: 'STANDALONE_READY', host: policy.HOST, port: plan.manifest.httpPort, pid: process.pid,
        environment: plan.manifest.environment }));
}
if (require.main === module) main().catch(error => {
    const allowed = new Set([...Object.keys(desktop.MESSAGES), 'STANDALONE_ISOLATION', 'STANDALONE_MANIFEST_REQUIRED',
        'STANDALONE_CLUSTER_NOT_RUNNING', 'STANDALONE_NETWORK_BLOCKED', 'EADDRINUSE']);
    console.error(allowed.has(error.code) ? error.code : 'STANDALONE_START_FAILED'); process.exitCode = 1;
});
module.exports = { startStandalone, main };
