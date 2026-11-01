'use strict';
// Solo lector/verificador de esquema; no importa servidor, pool global o escritores.
const fs=require('node:fs'),path=require('node:path');
const P=require('./standalonePolicy'),R=require('./revisionLabPolicy'),D=require('./desktopPolicy');
const C=require('./auditSchemaContract'),{checkAcl}=require('./windowsConfigAcl');
const KEYS=['APP_ENVIRONMENT','DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASSWORD','DB_CLUSTER_ID','DB_SERVER_VERSION','DB_SCHEMA_VERSION'];
function fingerprint(root){const h=require('node:crypto').createHash('sha256').update(P.codeFingerprint(root));for(const p of [C.FILE,'database/migrations/018_publicacion_integraciones.sql','database/migrations/019_revisiones_registros_lab.sql','database/migrations/020_comandos_idempotentes_lab.sql','scripts/auditSchemaLab.cjs','scripts/auditSchemaCases.cjs','scripts/AuditSchemaLab.ps1','scripts/standaloneDev.cjs','scripts/revisionFixtures.cjs','scripts/commandFixtures.cjs'])h.update(p).update(fs.readFileSync(path.join(root,p)));return h.digest('hex');}
function validateManifest(m,root){
    const names=['version','environment','purpose','schemaVersion','dataGeneration','root','directory','dataDirectory','host','pgPort','httpPort','database','runtime','cluster','code','configDigest'];
    if(!m||m.version!==5||m.environment!==C.ENVIRONMENT||m.purpose!==C.PURPOSE||m.schemaVersion!==C.SCHEMA||!R.UUID.test(m.dataGeneration||'')||Object.keys(m).length!==names.length||names.some(n=>!Object.hasOwn(m,n)))P.fail('AUDIT_LAB_PROFILE');
    P.validateManifest({...m,version:1,environment:'standalone-development'},root);return m;
}
function validateConfig(c,m){if(Object.keys(c).length!==KEYS.length||KEYS.some(k=>typeof c[k]!=='string')||c.APP_ENVIRONMENT!==C.ENVIRONMENT||c.DB_SCHEMA_VERSION!==C.SCHEMA||c.DB_HOST!=='localhost'||c.DB_PORT!==String(m.pgPort)||c.DB_NAME!==m.database||c.DB_USER!==m.runtime||c.DB_CLUSTER_ID!==m.cluster||c.DB_SERVER_VERSION!=='18.3'||!/^[a-f0-9]{64}$/.test(c.DB_PASSWORD))P.fail('AUDIT_LAB_CONFIG');return Object.freeze({...c});}
function readPlan(filename,root=path.resolve(__dirname,'../..')){
    if(!path.isAbsolute(filename||''))P.fail('AUDIT_LAB_PROFILE');checkAcl(filename);
    const bytes=fs.readFileSync(filename),m=validateManifest(JSON.parse(bytes),root);
    if(filename!==path.join(m.directory,'manifest.json')||fs.realpathSync(m.directory)!==m.directory)P.fail('AUDIT_LAB_PROFILE');
    const loaded=D.readConfig(path.join(m.directory,'runtime.env'),{validate:c=>validateConfig(c,m)});
    if(loaded.digest!==m.configDigest||fingerprint(root)!==m.code)P.fail('CONFIG_CHANGED');
    return {manifest:Object.freeze(m),config:loaded.config,filename,digest:P.sha(bytes)};
}
async function verify(db,plan){
    validateManifest(plan.manifest,plan.manifest.root);validateConfig(plan.config,plan.manifest);P.verifyLocalCluster(plan.manifest);
    if(readPlan(plan.filename).digest!==plan.digest)P.fail('CONFIG_CHANGED');
    const pg=require('./desktopPostgres'),S=require('./desktopSchema');
    P.validateIdentity((await db.query(pg.IDENTITY_SQL)).rows[0],plan.config,plan.manifest);
    if((await db.query('SELECT system_identifier::text AS cluster FROM pg_catalog.pg_control_system()')).rows[0].cluster!==plan.manifest.cluster)P.fail('PG_CLUSTER');
    if((await db.query(pg.ROLE_SQL)).rows[0].unsafe!==false)P.fail('PG_ROLE');
    const row=(await db.query(S.SCHEMA_SQL)).rows[0];
    if(JSON.stringify([...row.tables].sort())!==JSON.stringify([...S.TABLES,'comandos_idempotentes'].sort()))P.fail('AUDIT_SCHEMA_INVALID');
    S.validateSchema({...row,tables:row.tables.filter(t=>t!=='comandos_idempotentes')});
    await require('./revisionSchema').verifySchema(db);
    await require('./commandSchema').verifySchema(db,plan.manifest.dataGeneration);
    await require('./auditSchema').verifySchema(db);
}
module.exports={...C,KEYS,fingerprint,validateManifest,validateConfig,readPlan,verify};
