// Fase 1: contrato exclusivo de desarrollo. Nunca admite el clúster principal.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const desktop = require('./desktopPolicy');
const { checkAcl } = require('./windowsConfigAcl');
const HOST = '127.0.0.1';
const PROTECTED_CLUSTER = '7632825987452064788';
const FORBIDDEN_PORTS = new Set([3000, 3443, 5432, 55473, 57593, 57479, 57512, 57533, 55432, 65435, 51621, 53043, 62415]);
const fail = code => { throw Object.assign(Error(code), { code }); };
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function validPort(port) { return Number.isInteger(port) && port >= 1024 && port <= 65535 && !FORBIDDEN_PORTS.has(port); }
function codeFingerprint(root) {
    const hash = crypto.createHash('sha256').update(desktop.fingerprint(root));
    for (const file of ['main.js', 'preload.js', 'ownedBackend.js', 'independentBackend.js', 'httpsBackend.js', 'lanClientPolicy.js', 'lanEntry.js', 'connection.html']) {
        hash.update(file).update(fs.readFileSync(path.join(root, 'electron', file)));
    }
    for (const file of ['serverIdentity.js', 'windowsConfigAcl.js', 'lanContract.js']) {
        hash.update(file).update(fs.readFileSync(path.join(root, 'shared', file)));
    }
    return hash.digest('hex');
}
function validateManifest(m, root) {
    if (!m || m.version !== 1 || m.environment !== 'standalone-development' || m.root !== root ||
        path.dirname(m.directory || '') !== fs.realpathSync(process.env.LOCALAPPDATA || 'invalid') ||
        !/^ctsk-standalone-[a-f0-9]{12}$/.test(path.basename(m.directory || '')) ||
        m.dataDirectory !== path.join(m.directory, 'data') || m.host !== HOST ||
        !validPort(m.pgPort) || !validPort(m.httpPort) || m.pgPort === m.httpPort ||
        !/^ctsk_standalone_[a-f0-9]{12}_test$/.test(m.database || '') || m.runtime !== 'ctsk_standalone_runtime' ||
        !/^\d{19,20}$/.test(m.cluster || '') || m.cluster === PROTECTED_CLUSTER ||
        !/^[a-f0-9]{64}$/.test(m.code || '') || !/^[a-f0-9]{64}$/.test(m.configDigest || '')) fail('STANDALONE_ISOLATION');
    return m;
}
function validateConfig(c, m) {
    if (c.APP_ENVIRONMENT !== m.environment || c.DB_NAME !== m.database || c.DB_USER !== m.runtime ||
        c.DB_HOST !== 'localhost' || c.DB_PORT !== String(m.pgPort) || c.DB_CLUSTER_ID !== m.cluster) fail('STANDALONE_ISOLATION');
    // Reutilizar el contrato de secretos/TTL/versión/esquema sin aceptar principal como destino.
    desktop.validateConfig({ ...c, APP_ENVIRONMENT: 'principal', DB_NAME: 'sian_kaan_reservaciones',
        DB_PORT: '5432', DB_CLUSTER_ID: PROTECTED_CLUSTER });
    return Object.freeze({ ...c });
}
function readDatabasePlan(filename, root = path.resolve(__dirname, '../..')) {
    if (!path.isAbsolute(filename || '')) fail('STANDALONE_MANIFEST_REQUIRED');
    checkAcl(filename);
    const bytes = fs.readFileSync(filename);
    const m = validateManifest(JSON.parse(bytes), root);
    if (filename !== path.join(m.directory, 'manifest.json') || fs.realpathSync(m.directory) !== m.directory) fail('STANDALONE_ISOLATION');
    const loaded = desktop.readConfig(path.join(m.directory, 'runtime.env'), { validate: c => validateConfig(c, m) });
    if (loaded.digest !== m.configDigest) fail('CONFIG_CHANGED');
    if (codeFingerprint(root) !== m.code) fail('CODE_CHANGED');
    return { manifest: Object.freeze(m), config: loaded.config, digest: sha(bytes), filename };
}
function readPlan(filename, root) {
    const plan = readDatabasePlan(filename, root);
    const keyFile = path.join(plan.manifest.directory, 'service.key'); checkAcl(keyFile);
    const key = fs.readFileSync(keyFile, 'utf8').trim();
    if (!/^[a-f0-9]{64}$/.test(key)) fail('CONFIG_CHANGED');
    return { ...plan, key };
}
function verifyLocalCluster(m) {
    // Antes de abrir socket: comprobar el proceso del directorio nuevo, nunca sondear 5432.
    const pidFile = path.join(m.dataDirectory, 'postmaster.pid'); checkAcl(pidFile);
    const lines = fs.readFileSync(pidFile, 'utf8').split(/\r?\n/);
    if (!/^\d+$/.test(lines[0]) || path.resolve(lines[1] || '') !== m.dataDirectory ||
        Number(lines[3]) !== m.pgPort || lines[5] !== HOST || fs.realpathSync(m.dataDirectory) !== m.dataDirectory) fail('STANDALONE_CLUSTER_NOT_RUNNING');
    process.kill(Number(lines[0]), 0);
}
function validateIdentity(row, c, m) {
    if (!row || row.database !== m.database || row.database !== c.DB_NAME || row.username !== m.runtime ||
        row.username !== c.DB_USER || row.port !== m.pgPort || ![HOST, HOST + '/32'].includes(row.address) ||
        row.schema !== 'public' || String(row.version) !== '180003') fail('PG_IDENTITY');
    if (row.cluster_allowed !== true) fail('PG_CLUSTER');
}
function blockNetwork(pgPort) {
    if (!validPort(pgPort)) fail('STANDALONE_ISOLATION');
    const net = require('node:net'), connect = net.Socket.prototype.connect;
    net.Socket.prototype.connect = function (...args) {
        const values = Array.isArray(args[0]) ? args[0] : args, target = values[0];
        const host = target && typeof target === 'object' ? target.host : values[1];
        const port = target && typeof target === 'object' ? target.port : target;
        if (host !== HOST || Number(port) !== pgPort) fail('STANDALONE_NETWORK_BLOCKED');
        return connect.apply(this, args);
    };
    require('node:dgram').createSocket = () => fail('STANDALONE_NETWORK_BLOCKED');
    global.fetch = async () => fail('STANDALONE_NETWORK_BLOCKED');
}
function proof(key, challenge, identity) {
    return crypto.createHmac('sha256', key).update(JSON.stringify([challenge, identity])).digest('hex');
}
function verifyProof(key, challenge, response, expected) {
    if (!response || JSON.stringify(response.identity && { ...response.identity, pid: 0 }) !==
        JSON.stringify({ ...expected, pid: 0 }) || !Number.isSafeInteger(response.identity?.pid) ||
        response.identity.pid <= 0 || !/^[a-f0-9]{64}$/.test(response.proof || '')) fail('STANDALONE_IDENTITY');
    if (!crypto.timingSafeEqual(Buffer.from(response.proof, 'hex'), Buffer.from(proof(key, challenge, response.identity), 'hex'))) fail('STANDALONE_IDENTITY');
}
function publicIdentity(plan, pid = process.pid) {
    const m = plan.manifest;
    return { environment: m.environment, code: m.code, manifest: plan.digest, config: m.configDigest,
        database: m.database, cluster: m.cluster, port: m.httpPort, pid };
}
module.exports = { HOST, PROTECTED_CLUSTER, FORBIDDEN_PORTS, fail, sha, validPort, codeFingerprint,
    validateManifest, validateConfig, readPlan, readDatabasePlan, verifyLocalCluster, validateIdentity, blockNetwork, proof, verifyProof, publicIdentity };
