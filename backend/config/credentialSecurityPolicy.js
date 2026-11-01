'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const B=require('./standalonePolicy'),prior=require('./commandApiPolicy'),D=require('./desktopPolicy');
const {checkAcl}=require('./windowsConfigAcl'),C=require('../security/revisionApiContract');
const ENVIRONMENT='credential-security-api-lab',PURPOSE='credential-security023-lab',SCHEMA='023',PROTOCOL='ctsk-credential-security-v1';
function fingerprint(root){
    const h=crypto.createHash('sha256').update(require('./adminAuditSchemaPolicy').fingerprint(root));
    for(const file of ['scripts/administrativeFrontendLab.cjs','scripts/administrativeFrontendDriver.cjs','scripts/administrativeFrontendProbe.cjs','scripts/administrativeFrontendPolicy.cjs'])h.update(file).update(fs.readFileSync(path.join(root,file)));
    for(const file of ['database/migrations/023_seguridad_credenciales_lab.sql','scripts/CredentialSecurityLab.ps1','scripts/credentialSecurityLab.cjs','scripts/credentialSecurityACases.cjs','scripts/credentialSecurityBCases.cjs','scripts/credentialIntentClient.cjs','scripts/credentialSecurityProbe.cjs','scripts/credentialSecurityFixtures.cjs'])h.update(file).update(fs.readFileSync(path.join(root,file)));
    return h.digest('hex');
}
function validateManifest(m,root){
    if(!m||m.version!==10||m.environment!==ENVIRONMENT||m.purpose!==PURPOSE||m.schemaVersion!==SCHEMA||m.protocol!==PROTOCOL)B.fail('CREDENTIAL_SECURITY_PROFILE');
    const {schemaVersion,milestone,aProof,...rest}=m; if(!['A','B'].includes(milestone)||!/^[a-f0-9]{64}$/.test(aProof||''))B.fail('CREDENTIAL_MILESTONE');
    prior.validateManifest({...rest,version:4,environment:prior.ENVIRONMENT,purpose:prior.PURPOSE,protocol:prior.PROTOCOL},root);return m;
}
function validateConfig(c,m){
    if(c.APP_ENVIRONMENT!==ENVIRONMENT||c.DB_SCHEMA_VERSION!==SCHEMA)B.fail('CREDENTIAL_SECURITY_CONFIG');
    prior.validateConfig({...c,APP_ENVIRONMENT:prior.ENVIRONMENT,DB_SCHEMA_VERSION:prior.SCHEMA},m);return Object.freeze({...c});
}
function readPlan(filename,root=path.resolve(__dirname,'../..')){
    if(!path.isAbsolute(filename||''))B.fail('CREDENTIAL_SECURITY_PROFILE');checkAcl(filename);
    const bytes=fs.readFileSync(filename),m=validateManifest(JSON.parse(bytes),root);
    if(filename!==path.join(m.directory,'security-'+m.milestone.toLowerCase()+'-manifest.json')||fs.realpathSync(m.directory)!==m.directory)B.fail('CREDENTIAL_SECURITY_PROFILE');
    const loaded=D.readConfig(path.join(m.directory,'security-runtime.env'),{validate:c=>validateConfig(c,m)});
    const key=(name,digest)=>{const file=path.join(m.directory,name);checkAcl(file);const value=fs.readFileSync(file,'utf8');if(!/^[a-f0-9]{64}$/.test(value)||B.sha(value)!==digest)B.fail('CONFIG_CHANGED');return value;};
    const preconditions=key('security-preconditions.key',m.etagKeyDigest),commands=key('security-commands.key',m.commandKeyDigest);
    if(preconditions===commands||loaded.digest!==m.configDigest||fingerprint(root)!==m.code)B.fail('CONFIG_CHANGED');
    if(m.milestone==='A'&&m.aProof!=='0'.repeat(64))B.fail('CREDENTIAL_MILESTONE');
    if(m.milestone==='B'){
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
function command(method,url,body,milestone){
    if(milestone!=='B')throw require('../security/revisionTokens').error(405,'HITO_B_NO_HABILITADO');
    if(!(method==='POST'&&url==='/api/usuarios'||method==='PATCH'&&/^\/api\/usuarios\/[1-9][0-9]{0,9}(?:\/password)?$/.test(url)))throw require('../security/revisionTokens').error(405,'ESCRITURA_NO_HABILITADA');
    return C.command(method,url,body);
}
function allowHttp(method,url,milestone){
    if(method==='POST'&&url==='/api/auth/login')return true;
    if(milestone==='B'&&method==='POST'&&url==='/api/precondiciones')return true;
    if(['GET','HEAD'].includes(method))return ['/api/auth/sesion','/api/usuarios','/api/usuarios/roles','/api/plataformas'].includes(url)
        ||/^\/api\/usuarios\/[1-9][0-9]{0,9}$/.test(url)||/^\/api\/comandos\/[a-f0-9-]{36}$/.test(url);
    try{command(method,url,{},milestone);return true;}catch{return false;}
}
module.exports={ENVIRONMENT,PURPOSE,SCHEMA,PROTOCOL,fingerprint,validateManifest,validateConfig,readPlan,verify,command,allowHttp};
