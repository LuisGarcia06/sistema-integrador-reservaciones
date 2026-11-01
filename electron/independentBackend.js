const http = require('node:http');
const crypto = require('node:crypto');
const policy = require('../backend/config/standalonePolicy');
function requestProof(plan, nonce) {
    return new Promise((resolve, reject) => {
        const req = http.get({ host: policy.HOST, port: plan.manifest.httpPort,
            path: '/api/local-service/challenge?nonce=' + nonce, timeout: 2000, agent: false }, res => {
            let body = '';
            if (res.statusCode !== 200) { res.resume(); return reject(Error('STANDALONE_IDENTITY')); }
            res.setEncoding('utf8');
            res.on('data', chunk => { body += chunk; if (body.length > 4096) req.destroy(Error('STANDALONE_IDENTITY')); });
            res.on('error', reject);
            res.on('end', () => { try { resolve(JSON.parse(body)); } catch { reject(Error('STANDALONE_IDENTITY')); } });
        });
        req.on('timeout', () => req.destroy(Error('STANDALONE_TIMEOUT'))); req.on('error', reject);
    });
}
async function connectIndependentBackend({ manifestPath, root, onExit = () => {},
    loadPlan = policy.readPlan, request = requestProof, interval = 3000 }) {
    const plan = loadPlan(manifestPath, root), expected = policy.publicIdentity(plan, 0);
    let stopped = false, timer, pid;
    async function verify() {
        const nonce = crypto.randomBytes(32).toString('hex'), response = await request(plan, nonce);
        policy.verifyProof(plan.key, nonce, response, expected);
        if (pid && response.identity.pid !== pid) policy.fail('STANDALONE_IDENTITY');
        pid = response.identity.pid;
    }
    await verify();
    function schedule() {
        timer = setTimeout(async () => {
            try { await verify(); if (!stopped) schedule(); }
            catch { if (!stopped) { stopped = true; onExit(); } }
        }, interval); timer.unref?.();
    }
    schedule();
    // El cliente solo retira su vigilancia; jamás obtiene un handle para terminar el servidor.
    return { origin: `http://${policy.HOST}:${plan.manifest.httpPort}`, port: plan.manifest.httpPort,
        stop() { stopped = true; clearTimeout(timer); } };
}
module.exports = { connectIndependentBackend, requestProof };
