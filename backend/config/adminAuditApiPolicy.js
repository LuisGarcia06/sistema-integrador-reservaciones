'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const B=require('./standalonePolicy'),prior=require('./commandApiPolicy'),D=require('./desktopPolicy');
const {checkAcl}=require('./windowsConfigAcl'),C=require('../security/revisionApiContract');
const ENVIRONMENT='admin-audit-api-lab',PURPOSE='transactional-catalog-audit-writers-lab',SCHEMA='022',PROTOCOL='ctsk-admin-audit-api-v1';
const CATALOGS=Object.freeze(['tours','guias','operadores','vehiculos','paises','plataformas']);
function fingerprint(root){
    const h=crypto.createHash('sha256').update(require('./adminAuditSchemaPolicy').fingerprint(root));
    for(const file of ['scripts/AdminAuditApiLab.ps1','scripts/adminAuditApiLab.cjs','scripts/adminAuditApiCases.cjs','scripts/adminAuditApiServerProbe.cjs'])h.update(file).update(fs.readFileSync(path.join(root,file)));
    return h.digest('hex');
}
function validateManifest(m,root){
    if(!m||m.version!==8||m.environment!==ENVIRONMENT||m.purpose!==PURPOSE||m.schemaVersion!==SCHEMA||m.protocol!==PROTOCOL)B.fail('ADMIN_AUDIT_API_PROFILE');
    const {schemaVersion,...rest}=m;
    prior.validateManifest({...rest,version:4,environment:prior.ENVIRONMENT,purpose:prior.PURPOSE,protocol:prior.PROTOCOL},root);return m;
}
function validateConfig(c,m){
    if(c.APP_ENVIRONMENT!==ENVIRONMENT||c.DB_SCHEMA_VERSION!==SCHEMA)B.fail('ADMIN_AUDIT_API_CONFIG');
    prior.validateConfig({...c,APP_ENVIRONMENT:prior.ENVIRONMENT,DB_SCHEMA_VERSION:prior.SCHEMA},m);return Object.freeze({...c});
}
function readPlan(filename,root=path.resolve(__dirname,'../..')){
    if(!path.isAbsolute(filename||''))B.fail('ADMIN_AUDIT_API_PROFILE');checkAcl(filename);
    const bytes=fs.readFileSync(filename),m=validateManifest(JSON.parse(bytes),root);
    if(filename!==path.join(m.directory,'admin-api-manifest.json')||fs.realpathSync(m.directory)!==m.directory)B.fail('ADMIN_AUDIT_API_PROFILE');
    const loaded=D.readConfig(path.join(m.directory,'admin-api-runtime.env'),{validate:c=>validateConfig(c,m)});
    const key=(name,digest)=>{const file=path.join(m.directory,name);checkAcl(file);const value=fs.readFileSync(file,'utf8');if(!/^[a-f0-9]{64}$/.test(value)||B.sha(value)!==digest)B.fail('CONFIG_CHANGED');return value;};
    const preconditions=key('admin-preconditions.key',m.etagKeyDigest),commands=key('admin-commands.key',m.commandKeyDigest);
    if(preconditions===commands||loaded.digest!==m.configDigest||fingerprint(root)!==m.code)B.fail('CONFIG_CHANGED');
    return {manifest:Object.freeze(m),config:loaded.config,key:preconditions,commandKey:commands,filename,digest:B.sha(bytes)};
}
async function verify(pool,plan){
    validateManifest(plan.manifest,plan.manifest.root);validateConfig(plan.config,plan.manifest);B.verifyLocalCluster(plan.manifest);
    const current=readPlan(plan.filename);
    if(current.digest!==plan.digest||current.key!==plan.key||current.commandKey!==plan.commandKey)B.fail('CONFIG_CHANGED');
    const db=await pool.connect();
    try{
        await db.query('BEGIN READ ONLY');const pg=require('./desktopPostgres'),S=require('./desktopSchema');
        B.validateIdentity((await db.query(pg.IDENTITY_SQL)).rows[0],plan.config,plan.manifest);
        if((await db.query('SELECT system_identifier::text AS cluster FROM pg_catalog.pg_control_system()')).rows[0].cluster!==plan.manifest.cluster)B.fail('PG_CLUSTER');
        if((await db.query(pg.ROLE_SQL)).rows[0].unsafe!==false)B.fail('PG_ROLE');
        const row=(await db.query(S.SCHEMA_SQL)).rows[0];
        if(JSON.stringify([...row.tables].sort())!==JSON.stringify([...S.TABLES,'comandos_idempotentes'].sort()))B.fail('ADMIN_AUDIT_SCHEMA_INVALID');
        S.validateSchema({...row,tables:row.tables.filter(t=>t!=='comandos_idempotentes')});
        await require('./revisionSchema').verifySchema(db);
        await require('./adminAuditSchema').verifyLedger(db,plan.manifest.dataGeneration);
        await require('./adminAuditSchema').verifySchema(db);
        await db.query('ROLLBACK');
    }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
}
function command(method,url,body){
    const valid=method==='POST'&&/^\/api\/(tours|guias|operadores|vehiculos|paises|plataformas)$/.test(url)
        ||method==='PATCH'&&/^\/api\/(tours|guias|operadores|vehiculos)\/[1-9][0-9]{0,9}$/.test(url);
    if(!valid)throw require('../security/revisionTokens').error(405,'ESCRITURA_NO_HABILITADA');
    return C.command(method,url,body);
}
function allowHttp(method,url){
    if(method==='POST'&&['/api/auth/login','/api/precondiciones'].includes(url))return true;
    if(['GET','HEAD'].includes(method))return url==='/api/auth/sesion'
        ||/^\/api\/comandos\/[a-f0-9-]{36}$/.test(url)
        ||/^\/api\/(tours|guias|operadores|vehiculos|paises|plataformas)$/.test(url)
        ||/^\/api\/(tours|guias|operadores|vehiculos)\/[1-9][0-9]{0,9}$/.test(url);
    try{command(method,url,{});return true;}catch{return false;}
}
module.exports={ENVIRONMENT,PURPOSE,SCHEMA,PROTOCOL,CATALOGS,fingerprint,validateManifest,validateConfig,readPlan,verify,command,allowHttp};
