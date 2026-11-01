// Staging nuevo y recuperable. No sobrescribe la release protegida anterior.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function main() {
    const releaseOnly = process.argv.length === 3 && process.argv[2] === '--release-only';
    if (!(process.argv.length === 2 || releaseOnly)) throw Error('INVALID_MODE');
    const base = path.join(process.env.LOCALAPPDATA, 'CommunityTours/secure-runtime');
    const fh = JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA, 'CommunityTours/integrations/fareharbor/continuous.json')));
    const policy = require('../../backend/config/desktopPolicy');
    policy.readConfig(fh.postgresConfigPath);
    const priorFile = path.join(base, 'admin/approved-manifests/release-03d-preparacion.json');
    require('../../backend/config/windowsConfigAcl').checkAcl(priorFile);
    const prior = JSON.parse(fs.readFileSync(priorFile));
    const files = prior.files.filter(f => f.path.startsWith('node_modules/'));
    // Reutilizar exclusivamente las dependencias ya aprobadas, con la misma huella.
    for (const f of files) if (hash(fs.readFileSync(path.join(root, f.path))) !== f.sha256) throw Error('DEPENDENCY_CHANGED');
    function add(relative) {
        const file = path.join(root, relative), stat = fs.lstatSync(file);
        if (stat.isSymbolicLink()) throw Error('SOURCE_LINK');
        if (stat.isDirectory()) {
            for (const name of fs.readdirSync(file).sort()) if (!['__tests__', '__fixtures__'].includes(name) && !name.endsWith('.test.js')) add(relative + '/' + name);
        } else {
            const bytes = fs.readFileSync(file); files.push({ path: relative, bytes: bytes.length, sha256: hash(bytes) });
        }
    }
    for (const relative of ['package.json', 'package-lock.json', 'backend', 'frontend', 'electron']) add(relative);
    files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const manifest = { ...prior, createdAt: new Date().toISOString(), status: 'APPROVED',
        approvalReference: 'Solicitud expresa del usuario: implementación real de controles y actualización recuperable de Electron, 2026-10-21.',
        configExcluded: true, files };
    const encoded = JSON.stringify(manifest, null, 2) + '\n';
    const digest = hash(encoded), releaseId = 'r-' + stamp + '-' + digest.slice(0, 12);
    const manifestPath = path.join(base, 'admin/approved-manifests/controls018-' + releaseId + '.json');
    fs.writeFileSync(manifestPath, encoded, { flag: 'wx' });
    const gyg = path.join(process.env.LOCALAPPDATA, 'CommunityTours/integrations/getyourguide');
    const runtimeRoot = path.join(gyg, 'runtime');
    if (!releaseOnly && (fs.existsSync(runtimeRoot) || fs.existsSync(path.join(gyg, 'continuous.json')))) throw Error('GYG_STAGING_ALREADY_EXISTS');
    const visited = new Set();
    function dependency(relative) {
        if (visited.has(relative)) return;
        visited.add(relative);
        const file = path.join(root, relative);
        if (fs.lstatSync(file).isSymbolicLink()) throw Error('SOURCE_LINK');
        const content = fs.readFileSync(file, 'utf8');
        for (const match of content.matchAll(/require\(['"](\.{1,2}\/[^'"]+)['"]\)/g)) {
            const target = path.resolve(path.dirname(file), match[1]);
            const resolved = [target, target + '.js', target + '.cjs', path.join(target, 'index.js')].find(f => fs.existsSync(f) && fs.statSync(f).isFile());
            if (!resolved || path.relative(root, resolved).startsWith('..')) throw Error('SOURCE_DEPENDENCY_MISSING');
            dependency(path.relative(root, resolved).replaceAll('\\', '/'));
        }
    }
    dependency('scripts/integrations/getyourguideContinuous.cjs');
    visited.add('scripts/Start-GetYourGuideContinuous.ps1');
    const hashes = {};
    if (!releaseOnly) fs.mkdirSync(runtimeRoot);
    for (const relative of releaseOnly ? [] : [...visited].sort()) {
        const bytes = fs.readFileSync(path.join(root, relative)), target = path.join(runtimeRoot, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, bytes, { flag: 'wx' }); hashes[relative] = hash(bytes);
        if (hash(fs.readFileSync(target)) !== hashes[relative]) throw Error('STAGING_HASH');
    }
    if (!releaseOnly) fs.writeFileSync(path.join(gyg, 'continuous.json'), JSON.stringify({ version: 1, enabled: true,
        intervalMs: 120000, nodeExecutable: fh.nodeExecutable, dependencyRoot: fh.dependencyRoot,
        postgresConfigPath: fh.postgresConfigPath, sourceHashes: hashes, automaticApplication: false }, null, 2), { flag: 'wx' });
    require('../../backend/config/windowsConfigAcl').checkAcl(path.join(gyg, 'continuous.json'));
    const record = { releaseId, manifestPath, manifestSha256: digest, files: files.length,
        gygRuntime: runtimeRoot, gygFiles: visited.size, previousRelease: path.dirname(fh.postgresConfigPath),
        state: 'STAGED_NOT_STARTED' };
    const recordPath = path.join(base, 'admin/update-records/controls018-staging.json');
    if (fs.existsSync(recordPath)) {
        const previousRecord = JSON.parse(fs.readFileSync(recordPath));
        const archived = path.join(base, 'admin/update-records/controls018-staging-' + previousRecord.releaseId + '.json');
        if (!fs.existsSync(archived)) fs.copyFileSync(recordPath, archived, fs.constants.COPYFILE_EXCL);
    }
    fs.writeFileSync(recordPath, JSON.stringify(record, null, 2));
    console.log(JSON.stringify(record));
}
if (require.main === module) { try { main(); } catch (error) { console.error(JSON.stringify({ code: error.code || error.message })); process.exitCode = 1; } }
module.exports = { main };
