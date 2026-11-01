'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),B=require('./standalonePolicy'),C=require('./administrativeFrontendPolicy'),{checkAcl}=require('./windowsConfigAcl');
const ENVIRONMENT='bootstrap-security023-lab',PURPOSE='local-empty-installation023-lab',SQL_PRINCIPAL='ctsk_standalone_admin';
const UUID=require('../security/commandIntent').UUID;
const NAMES=['version','environment','root','directory','dataDirectory','host','pgPort','httpPort','database','runtime','cluster','code','configDigest','purpose','schemaVersion','dataGeneration','sqlPrincipal','cDirectory','cProofDigest'];
function fingerprint(root){const h=crypto.createHash('sha256').update(C.fingerprint(root));for(const file of ['scripts/bootstrapAdmin.cjs','scripts/BootstrapLab.ps1','scripts/bootstrapLab.cjs','scripts/bootstrapProbe.cjs'])h.update(file).update(fs.readFileSync(path.join(root,file)));return h.digest('hex');}
function configDigest(m){return B.sha(JSON.stringify([m.host,m.pgPort,m.database,m.cluster,m.sqlPrincipal,m.schemaVersion,m.dataGeneration]));}
function validateManifest(m,root){
  if(!m||Object.keys(m).length!==NAMES.length||NAMES.some(k=>!Object.hasOwn(m,k))||m.version!==12||m.environment!==ENVIRONMENT||m.purpose!==PURPOSE||m.schemaVersion!=='023'||m.sqlPrincipal!==SQL_PRINCIPAL||!UUID.test(m.dataGeneration||'')||!/^[a-f0-9]{64}$/.test(m.cProofDigest||'')||!path.isAbsolute(m.cDirectory||'')||m.directory===m.cDirectory)B.fail('BOOTSTRAP_PROFILE_INVALID');
  B.validateManifest({...m,version:1,environment:'standalone-development'},root);if(configDigest(m)!==m.configDigest)B.fail('BOOTSTRAP_CONFIGURATION_CHANGED');return m;
}
function verifyC(directory){
  const plan=C.readPlan(path.join(directory,'administrative-frontend-manifest.json'));
  const proofFile=path.join(directory,'administrative-frontend-proof.json');checkAcl(proofFile);const bytes=fs.readFileSync(proofFile),proof=JSON.parse(bytes);
  const signature=crypto.createHmac('sha256',Buffer.from(plan.commandKey,'hex')).update(JSON.stringify(proof.body)).digest('hex');
  const reportFile=path.join(directory,'administrative-frontend-verification.json');checkAcl(reportFile);const reportBytes=fs.readFileSync(reportFile),report=JSON.parse(reportBytes);
  if(proof.signature!==signature||proof.body?.completed!==true||proof.body.code!==plan.manifest.code||proof.body.cluster!==plan.manifest.cluster||proof.body.generation!==plan.manifest.dataGeneration||proof.body.schema!==require('./credentialSchemaContract').CATALOG_SHA||proof.body.reportDigest!==B.sha(reportBytes)||report.completed!==true||report.writers?.length!==13||report.checks?.length<28)B.fail('BOOTSTRAP_C_REQUIRED');
  return {digest:B.sha(bytes),cluster:plan.manifest.cluster,generation:plan.manifest.dataGeneration,code:plan.manifest.code};
}
function readPlan(filename,root=path.resolve(__dirname,'../..')){
  if(!path.isAbsolute(filename||''))B.fail('BOOTSTRAP_PROFILE_INVALID');checkAcl(filename);const bytes=fs.readFileSync(filename),m=validateManifest(JSON.parse(bytes),root);
  if(filename!==path.join(m.directory,'bootstrap-manifest.json')||fs.realpathSync(m.directory)!==m.directory||m.code!==fingerprint(root))B.fail('BOOTSTRAP_CODE_CHANGED');
  const c=verifyC(m.cDirectory);if(c.digest!==m.cProofDigest||c.cluster===m.cluster||c.generation===m.dataGeneration)B.fail('BOOTSTRAP_C_REQUIRED');
  B.verifyLocalCluster(m);return {manifest:Object.freeze(m),filename,digest:B.sha(bytes)};
}
module.exports={ENVIRONMENT,PURPOSE,SQL_PRINCIPAL,fingerprint,configDigest,validateManifest,verifyC,readPlan};
