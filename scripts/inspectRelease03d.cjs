'use strict';
// Inventario estático: lee fuentes/dependencias; escribe solo evidencia pública en docs.
// No require('electron'), npm, imports de servidor, PG, copia operativa ni cambios de ACL.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const root = path.resolve(__dirname, '..');
if (process.argv.length !== 3 || process.argv[2] !== '--design-only') throw Error('DESIGN_ONLY_REQUIRED');
const output = path.join(root, 'docs/release-03d');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const pkg = json('package.json');
const lock = json('package-lock.json');
if (lock.lockfileVersion !== 3 || pkg.scripts.desktop !== 'electron .' || pkg.main !== 'electron/main.js') throw Error('ENTRY_CONTRACT_CHANGED');
const packages = new Set();
const pending = Object.keys(pkg.dependencies).concat('electron').map(name => ({ from: '', name }));
const missingOptional = [];
function resolveInstalled(from, name) {
    for (const base of Module._nodeModulePaths(path.join(root, from))) {
        const full = path.join(base, name);
        const rel = path.relative(root, full).replaceAll('\\', '/');
        if (rel.startsWith('../')) continue;
        if (lock.packages[rel] && fs.existsSync(path.join(full, 'package.json'))) return rel;
    }
}
while (pending.length) {
    const request = pending.pop();
    const rel = resolveInstalled(request.from, request.name);
    if (!rel) {
        if (request.optional) { missingOptional.push(request); continue; }
        throw Error('REQUIRED_DEPENDENCY_NOT_INSTALLED: ' + request.name);
    }
    if (packages.has(rel)) continue;
    const entry = lock.packages[rel];
    if (entry.link || fs.lstatSync(path.join(root, rel)).isSymbolicLink()) throw Error('LINK_DEPENDENCY');
    const installed = json(rel + '/package.json');
    if (installed.version !== entry.version) throw Error('LOCK_VERSION_MISMATCH: ' + rel);
    packages.add(rel);
    for (const name of new Set([...Object.keys(entry.dependencies || {}), ...Object.keys(entry.optionalDependencies || {}), ...Object.keys(entry.peerDependencies || {})])) {
        pending.push({ from: rel, name, optional: Boolean(entry.optionalDependencies?.[name] || entry.peerDependenciesMeta?.[name]?.optional) });
    }
}
const selected = new Set(['package.json', 'package-lock.json']);
const excludedApplication = [];
const suspiciousDependencyNames = [];
function walk(rel, vendor = false, top = true) {
    const abs = path.join(root, rel);
    const stat = fs.lstatSync(abs);
    if (stat.isSymbolicLink()) throw Error('LINK_IN_PAYLOAD: ' + rel);
    if (stat.isDirectory()) {
        for (const entry of fs.readdirSync(abs).sort()) {
            if (vendor && entry === 'node_modules') continue; // Se visitan explícitamente las dependencias seleccionadas.
            const child = rel + '/' + entry;
            if (!vendor && (['__tests__', '__fixtures__', 'fixtures', 'coverage'].includes(entry) || /\.test\.[^.]+$/.test(entry))) { excludedApplication.push(child); continue; }
            walk(child, vendor, false);
        }
    } else if (stat.isFile()) {
        if (/(^|\/)\.env(?:\.|$)|\.(?:dpapi|backup|dump|log)$|(^|\/)\.npmrc$/.test(rel)) {
            if (vendor) suspiciousDependencyNames.push(rel);
            else throw Error('PRIVATE_NAME_IN_APPLICATION_PAYLOAD');
            return;
        }
        selected.add(rel);
    } else throw Error('NON_REGULAR_PAYLOAD');
}
for (const dir of ['electron', 'backend', 'frontend']) walk(dir);
for (const dir of [...packages].sort()) walk(dir, true);
for (const file of ['electron', 'electron.cmd', 'electron.ps1']) {
    const rel = 'node_modules/.bin/' + file;
    if (fs.existsSync(path.join(root, rel))) {
        if (fs.lstatSync(path.join(root, rel)).isSymbolicLink()) throw Error('SHIM_LINK');
        selected.add(rel);
    }
}
const files = [...selected].sort().map(file => {
    const bytes = fs.readFileSync(path.join(root, file));
    return { path: file, bytes: bytes.length, sha256: hash(bytes) };
});
const binary = files.find(f => f.path === 'node_modules/electron/dist/electron.exe');
if (!binary || fs.readFileSync(path.join(root, 'node_modules/electron/path.txt'), 'utf8').trim() !== 'electron.exe') throw Error('ELECTRON_DIST_INCOMPLETE');
const own = files.filter(f => !f.path.startsWith('node_modules/'));
const total = files.reduce((n, f) => n + f.bytes, 0);
const manifest = {
    schema: 'ctsk-secure-runtime-manifest-v1', createdAt: new Date().toISOString(), status: 'CANDIDATE_NOT_APPROVED',
    source: root, branch: 'GYG+FRHB-implementado', approvalReference: null, platform: 'win32', arch: process.arch,
    configExcluded: true, operationalCopyCreated: false, files,
    groups: { applicationFiles: own.length, applicationBytes: own.reduce((n, f) => n + f.bytes, 0), dependencyFiles: files.length - own.length, totalFiles: files.length, totalBytes: total },
    dependencies: [...packages].sort().map(p => ({ path: p, version: lock.packages[p].version, lockIntegrityPresent: Boolean(lock.packages[p].integrity) })),
    missingOptional, suspiciousDependencyNames, excludedApplication,
    policy: { includeRoots: ['package.json','package-lock.json','electron','backend','frontend','node_modules'], excludeOriginalEnv: true, excludeGit: true, excludeLabsAndBackups: true, noAclCopy: true }
};
fs.mkdirSync(output, { recursive: true });
const encoded = JSON.stringify(manifest, null, 2) + '\n';
fs.writeFileSync(path.join(output, 'manifest-candidato.json'), encoded);
fs.writeFileSync(path.join(output, 'inventario-resumen.json'), JSON.stringify({ createdAt: manifest.createdAt, ...manifest.groups, dependencyPackages: packages.size, installedLockPackages: Object.keys(lock.packages).length - 1, missingOptional, suspiciousDependencyNames, excludedApplication, manifestSha256: hash(encoded), electronVersion: json('node_modules/electron/package.json').version, node: process.version, electronExecutableSha256: binary.sha256, packageLifecycleScripts: pkg.scripts }, null, 2) + '\n');
console.log(JSON.stringify({ ...manifest.groups, dependencyPackages: packages.size, missingOptional: missingOptional.length, suspiciousDependencyNames, manifestApproved: false, operationalCopyCreated: false }));
