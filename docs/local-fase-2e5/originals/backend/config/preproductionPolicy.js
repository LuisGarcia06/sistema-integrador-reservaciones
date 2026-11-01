'use strict';
// Perfil exclusivamente local y sintético. No es configuración empresarial activable.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),B=require('./standalonePolicy'),H=require('./unifiedHttpPolicy');
const ENVIRONMENT='preproduction023-local',PROTOCOL='ctsk-unified023-v1';
const fail=code=>{throw Object.assign(Error(code),{code});};
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const uuid=x=>/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x||'');
function fingerprint(root){const h=crypto.createHash('sha256').update(require('./desktopPolicy').fingerprint(root));for(const f of ['electron/main.js','electron/preproductionBackend.js','electron/preproductionClientPolicy.js','scripts/integration024Lab.cjs','scripts/integration024Probe.cjs','scripts/integration024Worker.cjs','scripts/integration024ElectronDriver.cjs','scripts/preproductionSetup.cjs','scripts/preproductionBackup.cjs','scripts/preproductionSchemaRestore.cjs','scripts/preproductionServer.cjs','scripts/preproductionLab.cjs','scripts/preproductionFirstDriver.cjs','scripts/unifiedProbe.cjs','scripts/unifiedElectronDriver.cjs'])h.update(f).update(fs.readFileSync(path.join(root,f)));return h.digest('hex');}
function validateManifest(m,root){
 if(!m||m.environment!==ENVIRONMENT||m.purpose!=='synthetic-preproduction-only'||m.root!==root||m.schemaVersion!=='023'||m.protocol!==PROTOCOL||m.activation!=='electron-original'||!uuid(m.installationId)||!uuid(m.authEpoch)||!uuid(m.dataGeneration)||!['empty','initialized','restored'].includes(m.state)||!/^[a-f0-9]{64}$/.test(m.code||''))fail('PREPRODUCTION_PROFILE');
 B.validateManifest({...m,version:1,environment:'standalone-development'},root);return m;
}
function validateConfig(c,m){
 if(c.APP_ENVIRONMENT!==ENVIRONMENT||c.DB_HOST!=='localhost'||c.DB_NAME!==m.database||c.DB_PORT!==String(m.pgPort)||c.DB_CLUSTER_ID!==m.cluster||c.DB_USER!==m.runtime||c.DB_SCHEMA_VERSION!=='023'||c.DB_SERVER_VERSION!=='18.3'||c.GYG_GMAIL_SYNC_ENABLED!=='false'||!/^[a-f0-9]{64}$/.test(c.JWT_SECRET||'')||!c.DB_PASSWORD)fail('PREPRODUCTION_CONFIG');return c;
}
function readPlan(filename,root=path.resolve(__dirname,'../..')){
 const acl=require('./windowsConfigAcl').checkAcl;acl(filename);const bytes=fs.readFileSync(filename),s=JSON.parse(bytes),m=validateManifest(s.manifest,root);
 if(filename!==path.join(m.directory,'preproduction-server.json')||m.code!==fingerprint(root)||fs.realpathSync(m.directory)!==m.directory)fail('PREPRODUCTION_CODE_OR_PATH');
 acl(path.join(m.directory,'lab.marker'));if(fs.readFileSync(path.join(m.directory,'lab.marker'),'utf8')!=='NEW_SYNTHETIC_CLUSTER_ONLY')fail('PREPRODUCTION_SYNTHETIC_MARKER');
 validateConfig(s.config,m);for(const k of ['key','commandKey'])if(!/^[a-f0-9]{64}$/.test(s[k]||''))fail('PREPRODUCTION_KEYS');
 if(s.key===s.commandKey||crypto.createPublicKey(s.signingKey).export({type:'spki',format:'pem'})!==m.verificationKey)fail('PREPRODUCTION_KEYS');
 return {...s,manifest:Object.freeze(m),filename,digest:sha(bytes),authContract:{issuer:'ctsk-preproduction023:'+m.installationId,audience:'ctsk-desktop023:'+m.installationId+':'+m.authEpoch}};
}
function sign(key,body){return {body,signature:crypto.sign(null,Buffer.from(JSON.stringify(body)),key).toString('base64')};}
function signed(key,p){try{return crypto.verify(null,Buffer.from(JSON.stringify(p.body)),key,Buffer.from(p.signature,'base64'));}catch{return false;}}
function verifyAttestation(plan,nonce,p){const b=p?.body,m=plan.manifest,now=Date.now();const checks={SIGNATURE:signed(m.verificationKey,p),PURPOSE:b?.purpose==='ctsk-preproduction-startup023-v1',NONCE:b?.nonce===nonce,MANIFEST:b?.manifest===plan.digest,CLUSTER:b?.cluster===m.cluster,GENERATION:b?.generation===m.dataGeneration,INSTALLATION:b?.installationId===m.installationId,EPOCH:b?.authEpoch===m.authEpoch,SCHEMA:b?.schema===require('./credentialSchemaContract').CATALOG_SHA,TIME:Number.isInteger(b?.issuedAt)&&b.issuedAt<=now+1000&&now-b.issuedAt<=30000,INITIALIZED:b?.initialized===true};for(const [name,ok]of Object.entries(checks))if(!ok){if(name==='TIME')console.error('ATTESTATION_TIME_METADATA '+JSON.stringify({issuedAt:b?.issuedAt,now:Date.now(),integer:Number.isInteger(b?.issuedAt)}));fail('PREPRODUCTION_ATTESTATION_'+name);}}

async function verify(pool,plan){B.verifyLocalCluster(plan.manifest);const db=await pool.connect();try{await db.query('BEGIN READ ONLY');B.validateIdentity((await db.query(require('./desktopPostgres').IDENTITY_SQL)).rows[0],plan.config,plan.manifest);if((await db.query('SELECT system_identifier::text cluster FROM pg_control_system()')).rows[0].cluster!==plan.manifest.cluster)fail('PREPRODUCTION_CLUSTER');if((await db.query(require('./desktopPostgres').ROLE_SQL)).rows[0].unsafe!==false)fail('PREPRODUCTION_RUNTIME_PRIVILEGES');await require('./credentialSchema').verify(db,plan.manifest.dataGeneration);if(require('./integration024Policy').feature(plan))await require('./integration024Policy').verify(db,plan);await db.query('ROLLBACK');}catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}}
module.exports={ENVIRONMENT,PROTOCOL,fail,sha,uuid,fingerprint,validateManifest,validateConfig,readPlan,sign,signed,verifyAttestation,verify,...H};
