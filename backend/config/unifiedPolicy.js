'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const B=require('./standalonePolicy'),F=require('./firstAccessPolicy'),{checkAcl}=require('./windowsConfigAcl'),H=require('./unifiedHttpPolicy');
const ENVIRONMENT='unified023-lab',PURPOSE='consolidated-system023-lab',PROTOCOL='ctsk-unified023-v1',LOGIN_PROOF='ctsk-first-login-confirmed023-v1',ATTESTATION='ctsk-unified-bootstrap-startup023-v1';
function fingerprint(root){const h=crypto.createHash('sha256').update(F.fingerprint(root));for(const f of ['scripts/unifiedAdmin.cjs','scripts/unifiedProbe.cjs','scripts/prepareConsolidation.cjs','scripts/unifiedBackendCases.cjs','scripts/unifiedCapacityCases.cjs','scripts/unifiedLab.cjs','scripts/UnifiedLab.ps1','electron/unifiedBackend.js','scripts/consolidationLab.cjs','scripts/unifiedElectronDriver.cjs','scripts/ConsolidationLab.ps1'])h.update(f).update(fs.readFileSync(path.join(root,f)));return h.digest('hex');}
function validateManifest(m,root){
 if(!m||m.version!==14||m.environment!==ENVIRONMENT||m.purpose!==PURPOSE||m.protocol!==PROTOCOL||m.schemaVersion!=='023'||!['backend-only','electron-original'].includes(m.activation)||!['firstAccessDigest','loginProofDigest','etagKeyDigest','commandKeyDigest'].every(k=>/^[a-f0-9]{64}$/.test(m[k]||'')))B.fail('UNIFIED_PROFILE');
 F.validateManifest({...m,version:13,environment:F.ENVIRONMENT,purpose:F.PURPOSE,protocol:F.PROTOCOL},root);return m;
}
function validateConfig(c,m){if(c.APP_ENVIRONMENT!==ENVIRONMENT||c.DB_SCHEMA_VERSION!=='023')B.fail('UNIFIED_CONFIG');F.validateConfig({...c,APP_ENVIRONMENT:F.ENVIRONMENT},m);return Object.freeze({...c});}
function signed(publicKey,proof){try{return crypto.verify(null,Buffer.from(JSON.stringify(proof.body)),publicKey,Buffer.from(proof.signature,'base64'));}catch{return false;}}
function readPlan(filename,root=path.resolve(__dirname,'../..')){
 if(!path.isAbsolute(filename||''))B.fail('UNIFIED_PROFILE');checkAcl(filename);const bytes=fs.readFileSync(filename),m=validateManifest(JSON.parse(bytes),root);
 if(filename!==path.join(m.directory,'unified-manifest.json')||fs.realpathSync(m.directory)!==m.directory||m.code!==fingerprint(root))B.fail('UNIFIED_CODE_CHANGED');
 const first=F.readPlan(path.join(m.directory,F.MANIFEST),root);
 if(first.digest!==m.firstAccessDigest||['root','directory','dataDirectory','host','pgPort','httpPort','database','runtime','cluster','dataGeneration','bootstrapAttempt','initialUser','bootstrapDigest','verificationKey'].some(k=>m[k]!==first.manifest[k]))B.fail('UNIFIED_FIRST_ACCESS_BINDING');
 const proofFile=path.join(m.directory,'unified-first-login-proof.json');checkAcl(proofFile);const proofBytes=fs.readFileSync(proofFile),proof=JSON.parse(proofBytes),b=proof.body;
 if(B.sha(proofBytes)!==m.loginProofDigest||!signed(m.verificationKey,proof)||b?.purpose!==LOGIN_PROOF||b.completed!==true||b.firstAccess!==first.digest||b.cluster!==m.cluster||b.generation!==m.dataGeneration||b.bootstrap!==m.bootstrapDigest||b.initialUser!==m.initialUser||b.schema!==require('./credentialSchemaContract').CATALOG_SHA||b.sessionVerified!==true||b.loginTokenVerified!==true||b.unifiedCode!==m.code)B.fail('UNIFIED_FIRST_LOGIN_REQUIRED');
 const loaded=require('./desktopPolicy').readConfig(path.join(m.directory,'unified-runtime.env'),{validate:c=>validateConfig(c,m)});
 const key=(file,digest)=>{const f=path.join(m.directory,file);checkAcl(f);const k=fs.readFileSync(f,'utf8');if(!/^[a-f0-9]{64}$/.test(k)||B.sha(k)!==digest)B.fail('CONFIG_CHANGED');return k;};
 const preconditions=key('unified-preconditions.key',m.etagKeyDigest),commandKey=key('unified-commands.key',m.commandKeyDigest);
 if(preconditions===commandKey||loaded.digest!==m.configDigest)B.fail('CONFIG_CHANGED');if(m.activation==='backend-only'&&m.backendGateDigest!=='0'.repeat(64))B.fail('UNIFIED_BACKEND_GATE');
 if(m.activation==='electron-original'){
  const bFile=path.join(m.directory,'unified-backend-manifest.json'),reportFile=path.join(m.directory,'unified-backend-gate-report.json'),gateFile=path.join(m.directory,'unified-backend-proof.json');
  for(const f of [bFile,reportFile,gateFile])checkAcl(f);
  const originalBytes=fs.readFileSync(bFile),original=validateManifest(JSON.parse(originalBytes),root),reportBytes=fs.readFileSync(reportFile),report=JSON.parse(reportBytes),gateBytes=fs.readFileSync(gateFile),gate=JSON.parse(gateBytes),g=gate.body;
  if(original.activation!=='backend-only'||Object.keys(original).some(k=>!['activation','backendGateDigest'].includes(k)&&JSON.stringify(original[k])!==JSON.stringify(m[k]))||B.sha(gateBytes)!==m.backendGateDigest||!signed(m.verificationKey,gate)||g?.purpose!=='ctsk-unified-backend-verified023-v1'||g.completed!==true||g.code!==m.code||g.cluster!==m.cluster||g.generation!==m.dataGeneration||g.schema!==require('./credentialSchemaContract').CATALOG_SHA||g.manifest!==B.sha(originalBytes)||g.report!==B.sha(reportBytes)||report.completed!==true||report.capacityDecisionPending!==false||report.checks?.length<24)B.fail('UNIFIED_BACKEND_GATE');
 }
 return {manifest:Object.freeze(m),config:loaded.config,key:preconditions,commandKey,filename,digest:B.sha(bytes),firstAccessPlan:first,bootstrapPlan:first.bootstrapPlan};
}
function verifyAttestation(plan,challenge,proof){
 const m=plan.manifest,b=proof?.body,r=b?.bootstrap;
 if(!signed(m.verificationKey,proof)||b?.purpose!==ATTESTATION||b.challenge!==challenge||b.manifest!==plan.digest||b.cluster!==m.cluster||b.generation!==m.dataGeneration||b.schema!==require('./credentialSchemaContract').CATALOG_SHA||!Number.isSafeInteger(b.issuedAt)||b.issuedAt>Date.now()||Date.now()-b.issuedAt>30000||!r||r.singleton!==1||r.id_inicializacion!==m.bootstrapAttempt||r.id_usuario_inicial!==m.initialUser||r.cluster_id!==m.cluster||r.generacion_datos!==m.dataGeneration||r.huella_herramienta!==plan.bootstrapPlan.manifest.code||r.principal_sql!=='ctsk_standalone_admin'||r.version_esquema_inicial!==23||!Number.isInteger(b.activeAdmins)||b.activeAdmins<1)B.fail('UNIFIED_STARTUP_ATTESTATION');return b;
}
async function verify(pool,plan,proof,challenge){
 if(readPlan(plan.filename).digest!==plan.digest)B.fail('CONFIG_CHANGED');B.verifyLocalCluster(plan.manifest);verifyAttestation(plan,challenge,proof);
 const db=await pool.connect();try{await db.query('BEGIN READ ONLY');const pg=require('./desktopPostgres');B.validateIdentity((await db.query(pg.IDENTITY_SQL)).rows[0],plan.config,plan.manifest);if((await db.query('SELECT system_identifier::text cluster FROM pg_control_system()')).rows[0].cluster!==plan.manifest.cluster)B.fail('PG_CLUSTER');if((await db.query(pg.ROLE_SQL)).rows[0].unsafe!==false)B.fail('PG_ROLE');await require('./credentialSchema').verify(db,plan.manifest.dataGeneration);await db.query('ROLLBACK');}catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
}
module.exports={ENVIRONMENT,PURPOSE,PROTOCOL,LOGIN_PROOF,ATTESTATION,fingerprint,validateManifest,validateConfig,readPlan,verifyAttestation,verify,...H};
