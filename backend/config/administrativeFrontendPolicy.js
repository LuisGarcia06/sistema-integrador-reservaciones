'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const B=require('./standalonePolicy'),prior=require('./commandApiPolicy'),D=require('./desktopPolicy');
const {checkAcl}=require('./windowsConfigAcl'),C=require('../security/revisionApiContract');
const ENVIRONMENT='administrative-frontend023-lab',PURPOSE='integrated-administrative-frontend023-lab',SCHEMA='023',PROTOCOL='ctsk-administrative-frontend023-v1';
function fingerprint(root){return require('./credentialSecurityPolicy').fingerprint(root);}
function validateManifest(m,root){
    if(!m||m.version!==11||m.environment!==ENVIRONMENT||m.purpose!==PURPOSE||m.protocol!==PROTOCOL||m.schemaVersion!=='023'||m.milestone!=='C')B.fail('ADMINISTRATIVE_FRONTEND_PROFILE');
    require('./credentialSecurityPolicy').validateManifest({...m,version:10,environment:'credential-security-api-lab',purpose:'credential-security023-lab',protocol:'ctsk-credential-security-v1',milestone:'B'},root);return m;
}
function validateConfig(c,m){
    if(c.APP_ENVIRONMENT!==ENVIRONMENT||c.DB_SCHEMA_VERSION!==SCHEMA)B.fail('CREDENTIAL_SECURITY_CONFIG');
    prior.validateConfig({...c,APP_ENVIRONMENT:prior.ENVIRONMENT,DB_SCHEMA_VERSION:prior.SCHEMA},m);return Object.freeze({...c});
}
function readPlan(filename,root=path.resolve(__dirname,'../..')){
    if(!path.isAbsolute(filename||''))B.fail('CREDENTIAL_SECURITY_PROFILE');checkAcl(filename);
    const bytes=fs.readFileSync(filename),m=validateManifest(JSON.parse(bytes),root);
    if(filename!==path.join(m.directory,'administrative-frontend-manifest.json')||fs.realpathSync(m.directory)!==m.directory)B.fail('CREDENTIAL_SECURITY_PROFILE');
    const loaded=D.readConfig(path.join(m.directory,'administrative-frontend-runtime.env'),{validate:c=>validateConfig(c,m)});
    const key=(name,digest)=>{const file=path.join(m.directory,name);checkAcl(file);const value=fs.readFileSync(file,'utf8');if(!/^[a-f0-9]{64}$/.test(value)||B.sha(value)!==digest)B.fail('CONFIG_CHANGED');return value;};
    const preconditions=key('administrative-frontend-preconditions.key',m.etagKeyDigest),commands=key('administrative-frontend-commands.key',m.commandKeyDigest);
    if(preconditions===commands||loaded.digest!==m.configDigest||fingerprint(root)!==m.code)B.fail('CONFIG_CHANGED');
    if(m.milestone==='A'&&m.aProof!=='0'.repeat(64))B.fail('CREDENTIAL_MILESTONE');
    if(m.milestone==='C'){
        const file=path.join(m.directory,'security-a-proof.json');checkAcl(file);const proofBytes=fs.readFileSync(file),proof=JSON.parse(proofBytes);
        const signature=crypto.createHmac('sha256',Buffer.from(commands,'hex')).update(JSON.stringify(proof.body)).digest('hex');
        if(B.sha(proofBytes)!==m.aProof||proof.signature!==signature||proof.body?.completed!==true||proof.body.cluster!==m.cluster
            ||proof.body.generation!==m.dataGeneration||proof.body.code!==m.code||proof.body.schema!==require('./credentialSchemaContract').CATALOG_SHA)B.fail('CREDENTIAL_MILESTONE_A_REQUIRED');
    }
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
        await require('./credentialSchema').verify(db,plan.manifest.dataGeneration);
        await db.query('ROLLBACK');
    }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
}
function command(method,url,body){
    try{return require('./credentialSecurityPolicy').command(method,url,body,'B');}catch(e){if(e.statusCode!==405)throw e;}
    return require('./adminAuditApiPolicy').command(method,url,body);
}
function allowHttp(method,url){
    if(typeof url!=='string'||url.includes('%')||url.includes('\\'))return false;
    if(method==='POST'&&['/api/auth/login','/api/precondiciones'].includes(url))return true;
    if(['GET','HEAD'].includes(method)){
        if(require('./credentialSecurityPolicy').allowHttp(method,url,'A')||require('./adminAuditApiPolicy').allowHttp(method,url))return true;
        if(url==='/api/bitacora')return true;
        const match=/^\/api\/bitacora\?(.+)$/.exec(url);if(!match)return false;
        const params=new URLSearchParams(match[1]),keys=[...params.keys()];return keys.length>0&&new Set(keys).size===keys.length&&keys.every(k=>['fecha_desde','fecha_hasta'].includes(k)&&/^\d{4}-\d\d-\d\d$/.test(params.get(k)));
    }
    try{command(method,url,{});return true;}catch{return false;}
}
module.exports={ENVIRONMENT,PURPOSE,SCHEMA,PROTOCOL,fingerprint,validateManifest,validateConfig,readPlan,verify,command,allowHttp};
