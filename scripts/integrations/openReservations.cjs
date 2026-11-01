// Lanzador privado: versión aprobada, entorno limpio y backend propio de Electron.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), cp = require('node:child_process');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function main() {
    const base = path.join(process.env.LOCALAPPDATA, 'CommunityTours/secure-runtime');
    if (path.resolve(__dirname) !== path.join(base, 'admin')) throw Error('PRIVATE_LAUNCHER_REQUIRED');
    const recordPath = path.join(base, 'admin/update-records/controls018-final-verification.json');
    const record = JSON.parse(fs.readFileSync(recordPath));
    const root = path.resolve(record.root);
    if (path.dirname(root) !== path.join(base, 'releases') || record.status !== 'VERIFIED_READY_TO_OPEN') throw Error('UNVERIFIED_RELEASE');
    const manifestBytes = fs.readFileSync(record.manifestPath);
    if (hash(manifestBytes) !== record.manifestSha256) throw Error('MANIFEST_CHANGED');
    const manifest = JSON.parse(manifestBytes);
    for (const file of manifest.files) {
        const target = path.resolve(root, file.path);
        if (!target.startsWith(root + path.sep) || hash(fs.readFileSync(target)) !== file.sha256) throw Error('RELEASE_CHANGED');
    }
    const policy = require(path.join(root, 'backend/config/desktopPolicy'));
    policy.cleanEnvironment(); policy.readConfig(path.join(root, '.env'));
    require(path.join(root, 'backend/config/windowsConfigAcl')).checkAcl(recordPath);
    if (policy.fingerprint(root) !== record.fingerprint) throw Error('CODE_CHANGED');
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => policy.WINDOWS_ENV.has(key.toLowerCase())));
    const filename = path.join(base, 'admin/update-records/controls018-desktop-' + Date.now());
    const out = fs.openSync(filename + '-stdout.log', 'wx'), err = fs.openSync(filename + '-stderr.log', 'wx');
    const child = cp.spawn(path.join(root, 'node_modules/electron/dist/electron.exe'), [root], {
        cwd: root, env, detached: true, windowsHide: true, stdio: ['ignore', out, err]
    });
    child.once('error', () => { process.stderr.write('DESKTOP_START_FAILED\n'); process.exitCode = 1; });
    child.once('spawn', () => {
        const value = { startedAt: new Date().toISOString(), root, pid: child.pid, cleanEnvironment: true, logsPrefix: filename };
        fs.writeFileSync(path.join(base, 'admin/update-records/controls018-desktop-launch.json'), JSON.stringify(value, null, 2));
        console.log(JSON.stringify(value)); child.unref(); fs.closeSync(out); fs.closeSync(err);
    });
}
try { main(); } catch (error) { console.error(error.code || error.message); process.exitCode = 1; }
