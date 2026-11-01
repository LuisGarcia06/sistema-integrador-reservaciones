// Entrada privada de tarea Windows. Importar no activa red, OAuth ni PostgreSQL.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function main() {
    const root = path.resolve(__dirname, '../..');
    const privateDir = path.join(process.env.LOCALAPPDATA, 'CommunityTours/integrations/getyourguide');
    const once = process.argv.length === 3 && process.argv[2] === '--once';
    if (root !== path.join(privateDir, 'runtime') || !(process.argv.length === 2 || once)) throw Error('GYG_PRIVATE_RUNTIME_REQUIRED');
    const checkAcl = require('../../backend/config/windowsConfigAcl').checkAcl;
    const configPath = path.join(privateDir, 'continuous.json');
    checkAcl(configPath);
    const raw = fs.readFileSync(configPath), configHash = crypto.createHash('sha256').update(raw).digest('hex');
    const config = JSON.parse(raw);
    if (config.enabled !== true || config.intervalMs !== 120000 || !Object.keys(config.sourceHashes || {}).length) throw Error('GYG_CONFIG_INVALID');
    for (const [relative, digest] of Object.entries(config.sourceHashes)) {
        const file = path.resolve(root, relative);
        if (path.relative(root, file).startsWith('..') || hash(file) !== digest) throw Error('GYG_CODE_CHANGED');
        checkAcl(file);
    }
    const { readConfig } = require('../../backend/config/desktopPolicy');
    const snapshot = readConfig(config.postgresConfigPath);
    require('../../backend/config/desktopConfiguration').initialize(snapshot.config);
    const db = require('../../backend/config/database');
    const receiver = require('./getyourguide.cjs');
    const runOnce = require('../../backend/integrations/getyourguide/getyourguideContinuous.service').createContinuousSync({
        db, identity: { ...snapshot.config, DB_HOST: '127.0.0.1' }, getGmailClient: () => receiver.loadExistingGmailClient({
            credentialsPath: path.join(privateDir, 'oauth/credentials.json'), tokenPath: path.join(privateDir, 'oauth/gmail-token.json')
        }),
        register: (event, client) => {
            receiver.validateEvent(event);
            return require('../../backend/services/eventosIntegracion.service').registrarEventoIntegracion(event, client);
        }
    });
    let stopping = false;
    process.once('SIGINT', () => { stopping = true; }); process.once('SIGTERM', () => { stopping = true; });
    // Límite de espera HTTP por solicitud, no de duración ni cantidad de reservaciones.
    require('googleapis').google.options({ timeout: 10000 });
    let cycle = 0;
    try {
        while (!stopping) {
            const cycleStarted = Date.now(); cycle++;
            if (hash(configPath) !== configHash || readConfig(config.postgresConfigPath).digest !== snapshot.digest) throw Error('GYG_CONFIG_CHANGED');
            for (const [relative, digest] of Object.entries(config.sourceHashes)) {
                if (hash(path.join(root, relative)) !== digest) throw Error('GYG_CODE_CHANGED');
            }
            let code = 'GYG_SYNC_OK', detail = {};
            try {
                const result = await runOnce();
                if (result?.backoff || result?.quotaLimited) code = 'GYG_SYNC_BACKOFF';
                else if (result?.busy) code = 'GYG_SYNC_BUSY';
                else if (result?.historical?.error) code = 'GYG_SYNC_HISTORY_ERROR';
                detail = { recent: result?.recent || null, historical: result?.historical || null };
            } catch (error) { code = /^GYG_(?:SYNC_(?:ERROR|HTTP_\d{3})|OAUTH_ERROR)$/.test(error.code || '') ? error.code : 'GYG_SYNC_ERROR'; }
            const waitMs = Math.max(1000, config.intervalMs - (Date.now() - cycleStarted));
            fs.writeFileSync(path.join(privateDir, 'continuous-status.json'), JSON.stringify({ version: 2, code, cycle,
                cycleStartedAt: new Date(cycleStarted).toISOString(), updatedAt: new Date().toISOString(),
                intervalMs: config.intervalMs, nextCycleAt: new Date(Date.now() + waitMs).toISOString(), ...detail }));
            if (once) {
                if (code !== 'GYG_SYNC_OK') throw Error('GYG_SYNC_ERROR');
                return;
            }
            // setTimeout cede el proceso; no depende de que Electron o Codex estén abiertos.
            await new Promise(resolve => {
                const done = () => { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); resolve(); };
                const timer = setTimeout(done, waitMs);
                const stop = () => { clearTimeout(timer); done(); };
                process.once('SIGINT', stop); process.once('SIGTERM', stop);
            });
        }
    } finally { await db.end(); }
}
if (require.main === module) main().catch(() => { process.stderr.write('GYG_WORKER_FAILED\n'); process.exitCode = 1; });
module.exports = { main };
