'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const B=require('./standalonePolicy'),BP=require('./bootstrapPolicy'),D=require('./desktopPolicy'),{checkAcl}=require('./windowsConfigAcl');
const ENVIRONMENT='first-access023-lab',PURPOSE='bootstrap-first-http023-lab',PROTOCOL='ctsk-first-access023-v1';
const ATTESTATION='ctsk-bootstrap-startup-verification023-v1';
const MANIFEST='first-access-manifest.json';
function fingerprint(root){const h=crypto.createHash('sha256').update(BP.fingerprint(root));for(const f of ['scripts/firstAccessAdmin.cjs','scripts/FirstAccessLab.ps1','scripts/firstAccessLab.cjs'])h.update(f).update(fs.readFileSync(path.join(root,f)));return h.digest('hex');}
function validateManifest(m,root){
 if(!m||m.version!==13||m.environment!==ENVIRONMENT||m.purpose!==PURPOSE||m.protocol!==PROTOCOL||m.schemaVersion!=='023'||m.accessMode!=='bootstrap'||!require('../security/commandIntent').UUID.test(m.dataGeneration||'')||!require('../security/commandIntent').UUID.test(m.bootstrapAttempt||'')||!Number.isInteger(m.initialUser)||m.initialUser<1||!/^[a-f0-9]{64}$/.test(m.bootstrapDigest||'')||typeof m.verificationKey!=='string')B.fail('FIRST_ACCESS_PROFILE');
 B.validateManifest({...m,version:1,environment:'standalone-development'},root);
 try{if(crypto.createPublicKey(m.verificationKey).asymmetricKeyType!=='ed25519')B.fail('FIRST_ACCESS_VERIFICATION_KEY');}catch{B.fail('FIRST_ACCESS_VERIFICATION_KEY');}
 return m;
}
function validateConfig(c,m){if(c.APP_ENVIRONMENT!==ENVIRONMENT||c.DB_SCHEMA_VERSION!=='023')B.fail('FIRST_ACCESS_CONFIG');require('./commandApiPolicy').validateConfig({...c,APP_ENVIRONMENT:'command-api-lab',DB_SCHEMA_VERSION:'020'},m);return Object.freeze({...c});}
function readPlan(filename,root=path.resolve(__dirname,'../..')){
 if(!path.isAbsolute(filename||''))B.fail('FIRST_ACCESS_PROFILE');checkAcl(filename);const bytes=fs.readFileSync(filename),m=validateManifest(JSON.parse(bytes),root);
 if(filename!==path.join(m.directory,MANIFEST)||fs.realpathSync(m.directory)!==m.directory||fingerprint(root)!==m.code)B.fail('FIRST_ACCESS_CODE_CHANGED');
 const bp=BP.readPlan(path.join(m.directory,'bootstrap-manifest.json'),root);
 if(bp.digest!==m.bootstrapDigest||['root','directory','dataDirectory','host','pgPort','httpPort','database','runtime','cluster','dataGeneration'].some(k=>m[k]!==bp.manifest[k]))B.fail('FIRST_ACCESS_BOOTSTRAP_BINDING');
 const loaded=D.readConfig(path.join(m.directory,'first-access-runtime.env'),{validate:c=>validateConfig(c,m)});
 if(loaded.digest!==m.configDigest)B.fail('CONFIG_CHANGED');
 return {manifest:Object.freeze(m),config:loaded.config,filename,digest:B.sha(bytes),bootstrapPlan:bp};
}
function verifyAttestation(plan,challenge,proof,now=Date.now()){
 const m=plan.manifest,b=proof?.body;
 let valid=false;try{valid=crypto.verify(null,Buffer.from(JSON.stringify(b)),m.verificationKey,Buffer.from(proof.signature,'base64'));}catch{}
 if(!valid||!b||b.purpose!==ATTESTATION||b.challenge!==challenge||b.manifest!==plan.digest||b.bootstrapManifest!==m.bootstrapDigest||b.cluster!==m.cluster||b.generation!==m.dataGeneration||b.schema!==require('./credentialSchemaContract').CATALOG_SHA||!Number.isSafeInteger(b.issuedAt)||b.issuedAt>now||now-b.issuedAt>30000)B.fail('FIRST_ACCESS_ATTESTATION_INVALID');
 const r=b.bootstrap,a=b.account;
 if(!r||r.singleton!==1||r.id_inicializacion!==m.bootstrapAttempt||r.id_usuario_inicial!==m.initialUser||r.cluster_id!==m.cluster||r.generacion_datos!==m.dataGeneration||r.huella_herramienta!==plan.bootstrapPlan.manifest.code||r.principal_sql!==BP.SQL_PRINCIPAL||r.version_esquema_inicial!==23||!Number.isFinite(Date.parse(r.instante))||!a||a.id_usuario!==m.initialUser||a.rol!=='Administrador'||a.estado!==true||a.alcance_plataformas!=='all'||a.version_credenciales!=='1'||!Array.isArray(a.platform_ids)||a.platform_ids.length)B.fail('FIRST_ACCESS_INSTALLATION_INVALID');
 return b;
}
async function verify(pool,plan,proof,challenge){
 const current=readPlan(plan.filename);if(current.digest!==plan.digest)B.fail('CONFIG_CHANGED');B.verifyLocalCluster(plan.manifest);
 const b=verifyAttestation(plan,challenge,proof),db=await pool.connect();
 try{await db.query('BEGIN READ ONLY');const pg=require('./desktopPostgres');B.validateIdentity((await db.query(pg.IDENTITY_SQL)).rows[0],plan.config,plan.manifest);if((await db.query('SELECT system_identifier::text cluster FROM pg_control_system()')).rows[0].cluster!==plan.manifest.cluster)B.fail('PG_CLUSTER');if((await db.query(pg.ROLE_SQL)).rows[0].unsafe!==false)B.fail('PG_ROLE');await require('./credentialSchema').verify(db,plan.manifest.dataGeneration);
 const rows=(await db.query(require('../services/credentialAuth.service').USER_SQL)).rows;if(rows.length!==1||JSON.stringify(rows[0])!==JSON.stringify(b.account))B.fail('FIRST_ACCESS_ACCOUNT_CHANGED');await db.query('ROLLBACK');
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
}
const allowHttp=(method,url)=>method==='POST'&&url==='/api/auth/login'||['GET','HEAD'].includes(method)&&url==='/api/auth/sesion';
function command(){throw require('../security/revisionTokens').error(405,'PRIMER_ACCESO_SOLO_LECTURA');}
module.exports={ENVIRONMENT,PURPOSE,PROTOCOL,ATTESTATION,MANIFEST,fingerprint,validateManifest,validateConfig,readPlan,verifyAttestation,verify,allowHttp,command};
