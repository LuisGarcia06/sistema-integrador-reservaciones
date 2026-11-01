'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const B=require('./standalonePolicy'),prior=require('./commandApiPolicy'),A=require('./auditSchemaPolicy');
const {checkAcl}=require('./windowsConfigAcl'),D=require('./desktopPolicy'),C=require('../security/revisionApiContract');
const ENVIRONMENT='audit-api-lab',PURPOSE='transactional-audit-writers-lab',SCHEMA='021',PROTOCOL='ctsk-audit-api-v1';
function fingerprint(root){const hash=crypto.createHash('sha256').update(A.fingerprint(root));for(const file of ['scripts/AuditApiLab.ps1','scripts/auditApiLab.cjs','scripts/auditApiCases.cjs','scripts/auditApiServerProbe.cjs'])hash.update(file).update(fs.readFileSync(path.join(root,file)));return hash.digest('hex');}
function validateManifest(m,root){
    if(!m||m.version!==6||m.environment!==ENVIRONMENT||m.purpose!==PURPOSE||m.schemaVersion!==SCHEMA||m.protocol!==PROTOCOL)B.fail('AUDIT_API_PROFILE');
    const {schemaVersion,...base}=m;prior.validateManifest({...base,version:4,environment:prior.ENVIRONMENT,purpose:prior.PURPOSE,protocol:prior.PROTOCOL},root);return m;
}
function validateConfig(c,m){
    if(c.APP_ENVIRONMENT!==ENVIRONMENT||c.DB_SCHEMA_VERSION!==SCHEMA)B.fail('AUDIT_API_CONFIG');
    prior.validateConfig({...c,APP_ENVIRONMENT:prior.ENVIRONMENT,DB_SCHEMA_VERSION:prior.SCHEMA},m);return Object.freeze({...c});
}
function readPlan(filename,root=path.resolve(__dirname,'../..')){
    if(!path.isAbsolute(filename||''))B.fail('AUDIT_API_PROFILE');checkAcl(filename);
    const bytes=fs.readFileSync(filename),m=validateManifest(JSON.parse(bytes),root);
    if(filename!==path.join(m.directory,'manifest.json')||fs.realpathSync(m.directory)!==m.directory)B.fail('AUDIT_API_PROFILE');
    const loaded=D.readConfig(path.join(m.directory,'runtime.env'),{validate:c=>validateConfig(c,m)});
    const key=(name,digest)=>{const file=path.join(m.directory,name);checkAcl(file);const value=fs.readFileSync(file,'utf8');if(!/^[a-f0-9]{64}$/.test(value)||B.sha(value)!==digest)B.fail('CONFIG_CHANGED');return value;};
    const preconditions=key('preconditions.key',m.etagKeyDigest),commands=key('commands.key',m.commandKeyDigest);
    if(preconditions===commands||loaded.digest!==m.configDigest||fingerprint(root)!==m.code)B.fail('CONFIG_CHANGED');
    return {manifest:Object.freeze(m),config:loaded.config,key:preconditions,commandKey:commands,filename,digest:B.sha(bytes)};
}
async function verify(pool,plan){
    validateManifest(plan.manifest,plan.manifest.root);validateConfig(plan.config,plan.manifest);B.verifyLocalCluster(plan.manifest);
    if(readPlan(plan.filename).digest!==plan.digest)B.fail('CONFIG_CHANGED');
    const db=await pool.connect();
    try{
        await db.query('BEGIN READ ONLY');const pg=require('./desktopPostgres'),S=require('./desktopSchema');
        B.validateIdentity((await db.query(pg.IDENTITY_SQL)).rows[0],plan.config,plan.manifest);
        if((await db.query('SELECT system_identifier::text AS cluster FROM pg_catalog.pg_control_system()')).rows[0].cluster!==plan.manifest.cluster)B.fail('PG_CLUSTER');
        if((await db.query(pg.ROLE_SQL)).rows[0].unsafe!==false)B.fail('PG_ROLE');
        const row=(await db.query(S.SCHEMA_SQL)).rows[0];
        if(JSON.stringify([...row.tables].sort())!==JSON.stringify([...S.TABLES,'comandos_idempotentes'].sort()))B.fail('AUDIT_SCHEMA_INVALID');
        S.validateSchema({...row,tables:row.tables.filter(t=>t!=='comandos_idempotentes')});
        await require('./revisionSchema').verifySchema(db);await require('./commandSchema').verifySchema(db,plan.manifest.dataGeneration);await require('./auditSchema').verifySchema(db);
        await db.query('ROLLBACK');
    }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
}
function command(method,url,body){
    const valid=(method==='POST'&&/^\/api\/(operaciones|transportes)$/.test(url))
        ||(method==='PATCH'&&/^\/api\/(operaciones|transportes)\/[1-9][0-9]{0,9}$/.test(url))
        ||(method==='PUT'&&/^\/api\/daily\/observaciones\?fecha=\d{4}-\d{2}-\d{2}$/.test(url));
    if(!valid)throw require('../security/revisionTokens').error(405,'ESCRITURA_NO_HABILITADA');
    if(method==='PUT'&&require('../validators/daily.validator').validarConsultaDaily({fecha:url.slice(-10)}).errores.length)throw require('../security/revisionTokens').error(400,'SOLICITUD_INVALIDA');
    return C.command(method,url,body);
}
function allowHttp(method,url){
    if(method==='POST'&&['/api/auth/login','/api/precondiciones'].includes(url))return true;
    if(['GET','HEAD'].includes(method))return url==='/api/auth/sesion'
        ||/^\/api\/comandos\/[a-f0-9-]{36}$/.test(url)
        ||/^\/api\/(operaciones|transportes)\/[1-9][0-9]{0,9}$/.test(url)
        ||/^\/api\/daily\/observaciones\?fecha=\d{4}-\d{2}-\d{2}$/.test(url);
    try{command(method,url,{});return true;}catch{return false;}
}
module.exports={ENVIRONMENT,PURPOSE,SCHEMA,PROTOCOL,fingerprint,validateManifest,validateConfig,readPlan,verify,command,allowHttp};
