const fs=require('node:fs'),path=require('node:path');
const P=require('./standalonePolicy'),R=require('./revisionLabPolicy'),desktop=require('./desktopPolicy');
const {checkAcl}=require('./windowsConfigAcl');
const ENVIRONMENT='revision-api-lab',PURPOSE='http-preconditions-lab',PROTOCOL='ctsk-revision-api-v1',SCHEMA='019';
function validateManifest(m,root){
    if(!m||m.version!==3||m.environment!==ENVIRONMENT||m.purpose!==PURPOSE||m.protocol!==PROTOCOL||!/^[a-f0-9]{64}$/.test(m.etagKeyDigest||''))P.fail('REVISION_API_PROFILE');
    const {protocol,etagKeyDigest,...base}=m;
    R.validateManifest({...base,version:2,environment:R.ENVIRONMENT,purpose:R.PURPOSE},root);
    return m;
}
function validateConfig(c,m){
    if(c.APP_ENVIRONMENT!==ENVIRONMENT)P.fail('REVISION_API_CONFIG');
    R.validateConfig({...c,APP_ENVIRONMENT:R.ENVIRONMENT},m);
    return Object.freeze({...c});
}
function readPlan(filename,root=path.resolve(__dirname,'../..')){
    if(!path.isAbsolute(filename||''))P.fail('REVISION_API_PROFILE');checkAcl(filename);
    const bytes=fs.readFileSync(filename),m=validateManifest(JSON.parse(bytes),root);
    if(filename!==path.join(m.directory,'manifest.json')||fs.realpathSync(m.directory)!==m.directory)P.fail('REVISION_API_PROFILE');
    const loaded=desktop.readConfig(path.join(m.directory,'runtime.env'),{validate:c=>validateConfig(c,m)});
    const keyFile=path.join(m.directory,'preconditions.key');checkAcl(keyFile);const key=fs.readFileSync(keyFile,'utf8');
    if(!/^[a-f0-9]{64}$/.test(key)||P.sha(key)!==m.etagKeyDigest||loaded.digest!==m.configDigest)P.fail('CONFIG_CHANGED');
    if(P.codeFingerprint(root)!==m.code)P.fail('CODE_CHANGED');
    return {manifest:Object.freeze(m),config:loaded.config,key,digest:P.sha(bytes),filename};
}
async function verify(pool,plan){
    validateManifest(plan.manifest,path.resolve(__dirname,'../..'));validateConfig(plan.config,plan.manifest);
    P.verifyLocalCluster(plan.manifest);
    const current=readPlan(plan.filename);
    if(current.digest!==plan.digest||current.key!==plan.key)P.fail('CONFIG_CHANGED');
    await require('./desktopPostgres').verifyPostgresWithIdentity(pool,plan.config,(r,c)=>P.validateIdentity(r,c,plan.manifest));
    const db=await pool.connect();
    try{await db.query('BEGIN READ ONLY');await require('./revisionSchema').verifySchema(db);await db.query('ROLLBACK');}
    catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
}
module.exports={ENVIRONMENT,PURPOSE,PROTOCOL,SCHEMA,validateManifest,validateConfig,readPlan,verify};
