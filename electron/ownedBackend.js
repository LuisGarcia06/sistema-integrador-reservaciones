const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');
const { PROTOCOL, fail, safeCode, cleanEnvironment, readConfig, fingerprint } = require('../backend/config/desktopPolicy');

function startOwnedBackend({ execPath, root, configPath, sourceEnv = process.env, onExit = () => {}, signal,
    spawnProcess = spawn, loadConfig = readConfig, hashCode = fingerprint, timeout = 30000 }) {
    const env = cleanEnvironment(sourceEnv);
    const { digest } = loadConfig(configPath);
    const code = hashCode(root);
    if (signal?.aborted) fail('START_CANCELLED');
    const nonce = crypto.randomBytes(32).toString('hex');
    const child = spawnProcess(execPath, [path.join(root, 'backend', 'desktopChild.js')], {
        cwd: root, env, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true
    });
    return new Promise((resolve, reject) => {
        let ready = false, settled = false, stopping = false;
        const timer = setTimeout(() => abort('START_TIMEOUT'), timeout);
        function stop() {
            if (stopping) return;
            stopping = true;
            try { if (child.connected) child.send({ type: 'stop', protocol: PROTOCOL, nonce }, () => {}); } catch (_) { /* El cierre forzado sigue acotado al hijo. */ }
            const force = setTimeout(() => { if (child.exitCode === null && !child.killed) child.kill(); }, 2000);
            force.unref(); child.once('exit', () => clearTimeout(force));
        }
        function abort(code) {
            if (settled) return;
            settled = true; clearTimeout(timer); signal?.removeEventListener('abort', cancelled); stop();
            try { fail(code); } catch (error) { reject(error); }
        }
        function cancelled() { if (ready) stop(); else abort('START_CANCELLED'); }
        signal?.addEventListener('abort', cancelled, { once: true });
        child.once('error', () => abort('START_FAILED'));
        child.once('exit', () => {
            signal?.removeEventListener('abort', cancelled);
            if (!ready) abort('CHILD_EXIT'); else if (!stopping) onExit();
        });
        child.on('message', message => {
            if (settled) return;
            if (!message || message.protocol !== PROTOCOL || message.nonce !== nonce || message.pid !== child.pid) return abort('IPC_INVALID');
            if (message.type === 'error') return abort(safeCode(message));
            if (message.type !== 'ready' || message.code !== code || message.configDigest !== digest || message.port !== 3000 || message.environment !== 'principal') return abort('IPC_INVALID');
            try { if (hashCode(root) !== code) return abort('CODE_CHANGED'); } catch (_) { return abort('CODE_CHANGED'); }
            ready = true; settled = true; clearTimeout(timer);
            resolve({ process: child, stop });
        });
        try {
            child.send({ type: 'boot', protocol: PROTOCOL, nonce, parentPid: process.pid,
                code, configDigest: digest, configPath }, error => { if (error) abort('IPC_INVALID'); });
        } catch (_) { abort('IPC_INVALID'); }
    });
}
module.exports = { startOwnedBackend };
