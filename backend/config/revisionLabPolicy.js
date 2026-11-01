// Perfil de pruebas de esquema; nunca es una modalidad de servidor HTTP/Electron.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const P = require('./standalonePolicy'), desktop = require('./desktopPolicy');
const {checkAcl} = require('./windowsConfigAcl');
const ENVIRONMENT = 'revision-schema-lab', PURPOSE = 'schema-tests-only', SCHEMA = '019';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const KEYS = ['APP_ENVIRONMENT','DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASSWORD','DB_CLUSTER_ID','DB_SERVER_VERSION','DB_SCHEMA_VERSION','JWT_SECRET','JWT_EXPIRES_IN','GYG_GMAIL_SYNC_ENABLED'];
function validateManifest(m, root) {
    // Reutiliza las comprobaciones de destino desechable; versión y propósito
    // se validan aparte. No sustituye ni falsea versiones de esquema.
    if (!m || m.version !== 2 || m.environment !== ENVIRONMENT || m.purpose !== PURPOSE || !UUID.test(m.dataGeneration || '')) P.fail('REVISION_LAB_PROFILE');
    P.validateManifest({...m, version:1, environment:'standalone-development'}, root);
    const expected = ['version','environment','purpose','dataGeneration','root','directory','dataDirectory','host','pgPort','httpPort','database','runtime','cluster','code','configDigest'];
    if (Object.keys(m).some(k => !expected.includes(k)) || expected.some(k => !Object.hasOwn(m,k))) P.fail('REVISION_LAB_PROFILE');
    return m;
}
function validateConfig(c, m) {
    if (Object.keys(c).length !== KEYS.length || KEYS.some(k => typeof c[k] !== 'string') || Object.keys(c).some(k => !KEYS.includes(k)) ||
        c.APP_ENVIRONMENT !== ENVIRONMENT || c.DB_SCHEMA_VERSION !== SCHEMA || c.DB_NAME !== m.database || c.DB_USER !== m.runtime ||
        c.DB_HOST !== 'localhost' || c.DB_PORT !== String(m.pgPort) || c.DB_CLUSTER_ID !== m.cluster || c.DB_SERVER_VERSION !== '18.3' ||
        !/^[a-f0-9]{64}$/.test(c.DB_PASSWORD) || !/^[a-f0-9]{64}$/.test(c.JWT_SECRET) || c.JWT_EXPIRES_IN !== '8h' || c.GYG_GMAIL_SYNC_ENABLED !== 'false') P.fail('REVISION_LAB_CONFIG');
    return Object.freeze({...c});
}
function readPlan(filename, root = path.resolve(__dirname,'../..')) {
    if (!path.isAbsolute(filename || '')) P.fail('REVISION_LAB_PROFILE');
    checkAcl(filename);
    const bytes = fs.readFileSync(filename), m = validateManifest(JSON.parse(bytes),root);
    if (filename !== path.join(m.directory,'manifest.json') || fs.realpathSync(m.directory) !== m.directory) P.fail('REVISION_LAB_PROFILE');
    const loaded = desktop.readConfig(path.join(m.directory,'runtime.env'),{validate:c=>validateConfig(c,m)});
    if (loaded.digest !== m.configDigest) P.fail('CONFIG_CHANGED');
    if (P.codeFingerprint(root) !== m.code) P.fail('CODE_CHANGED');
    checkAcl(filename);
    return {manifest:Object.freeze(m),config:loaded.config,digest:P.sha(bytes),filename};
}
async function verify(pool, plan) {
    validateManifest(plan.manifest,plan.manifest.root); validateConfig(plan.config,plan.manifest);
    P.verifyLocalCluster(plan.manifest); // BEFORE opening a PostgreSQL connection.
    await require('./desktopPostgres').verifyPostgresWithIdentity(pool,plan.config,(r,c)=>P.validateIdentity(r,c,plan.manifest));
    const db = await pool.connect();
    try {
        await db.query('BEGIN READ ONLY');
        await require('./revisionSchema').verifySchema(db);
        await db.query('ROLLBACK');
    } catch (error) { await db.query('ROLLBACK').catch(()=>{}); throw error; }
    finally { db.release(); }
}
function assertStopped(m) {
    validateManifest(m,m.root);
    if (fs.existsSync(path.join(m.dataDirectory,'postmaster.pid'))) P.fail('REVISION_LAB_MUST_BE_STOPPED');
    if (fs.realpathSync(m.dataDirectory) !== m.dataDirectory) P.fail('REVISION_LAB_PROFILE');
    for (const name of ['PG_VERSION','postgresql.conf','postgresql.auto.conf']) checkAcl(path.join(m.dataDirectory,name));
    const conf = fs.readFileSync(path.join(m.dataDirectory,'postgresql.conf'),'utf8').split(/\r?\n/).map(l=>l.trim()).filter(l=>l && !l.startsWith('#'));
    const auto = fs.readFileSync(path.join(m.dataDirectory,'postgresql.auto.conf'),'utf8').split(/\r?\n/).some(l=>l.trim()&&!l.trim().startsWith('#'));
    if (auto || conf.some(l=>/^include/i.test(l)) || conf.filter(l=>/^listen_addresses\s*=/.test(l)).at(-1) !== "listen_addresses='127.0.0.1'" ||
        conf.filter(l=>/^port\s*=/.test(l)).at(-1) !== `port=${m.pgPort}`) P.fail('REVISION_LAB_PROFILE');
    const env = desktop.cleanEnvironment(); delete env.ELECTRON_RUN_AS_NODE;
    const text = require('node:child_process').execFileSync('C:/Program Files/PostgreSQL/18/bin/pg_controldata.exe',[m.dataDirectory],{env,windowsHide:true,encoding:'utf8',timeout:10000});
    if (text.match(/(?:identifier|identificador)[^\r\n]*?([0-9]{19,20})/i)?.[1] !== m.cluster) P.fail('PG_CLUSTER');
}
function renewGeneration(filename) {
    const plan = readPlan(filename); assertStopped(plan.manifest);
    const next = {...plan.manifest,dataGeneration:crypto.randomUUID()};
    const temp = path.join(next.directory,'generation-'+crypto.randomBytes(6).toString('hex')+'.tmp');
    try {
        fs.writeFileSync(temp,JSON.stringify(next,null,2),{flag:'wx'});checkAcl(temp);
        if (readPlan(filename).digest !== plan.digest) P.fail('CONFIG_CHANGED');
        fs.renameSync(temp,filename);
    } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
    return readPlan(filename);
}
module.exports = {ENVIRONMENT,PURPOSE,SCHEMA,UUID,validateManifest,validateConfig,readPlan,verify,assertStopped,renewGeneration};
