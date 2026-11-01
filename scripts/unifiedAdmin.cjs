'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),B=require('../backend/config/standalonePolicy'),P=require('../backend/config/unifiedPolicy');
function verifyLogin(firstProfile,observed){
 const plan=firstProfile.plan,login=observed?.login,session=observed?.session,m=plan.manifest;
 if(login?.status!==200||session?.status!==200||login.headers?.['x-ctsk-protocol']!==require('../backend/config/firstAccessPolicy').PROTOCOL||session.headers?.['x-ctsk-data-generation']!==m.dataGeneration)B.fail('UNIFIED_OBSERVED_FIRST_LOGIN_REQUIRED');
 let claims;try{claims=require('jsonwebtoken').verify(login.body?.token,plan.config.JWT_SECRET,{algorithms:['HS256'],issuer:require('../backend/security/credentialPolicy').ISSUER,audience:require('../backend/security/credentialPolicy').AUDIENCE});}catch{B.fail('UNIFIED_OBSERVED_FIRST_LOGIN_REQUIRED');}
 const user=session.body?.usuario;
 if(claims.sub!==String(m.initialUser)||claims.dg!==m.dataGeneration||claims.cv!=='1'||claims.token_use!=='access'||!user||user.id_usuario!==m.initialUser||user.rol!=='Administrador'||user.alcance_plataformas!=='all'||!Array.isArray(user.platform_ids)||user.platform_ids.length||JSON.stringify(user)!==JSON.stringify(login.body.usuario))B.fail('UNIFIED_OBSERVED_FIRST_LOGIN_REQUIRED');
 return true;
}
function createProfile(firstProfile,observed){
 verifyLogin(firstProfile,observed);
 const first=firstProfile.plan,config={...first.config,APP_ENVIRONMENT:P.ENVIRONMENT},bytes=Object.entries(config).map(([k,v])=>k+'='+v).join('\n')+'\n',key=crypto.randomBytes(32).toString('hex'),commandKey=crypto.randomBytes(32).toString('hex');
 const body={purpose:P.LOGIN_PROOF,completed:true,firstAccess:first.digest,cluster:first.manifest.cluster,generation:first.manifest.dataGeneration,bootstrap:first.manifest.bootstrapDigest,initialUser:first.manifest.initialUser,schema:require('../backend/config/credentialSchemaContract').CATALOG_SHA,sessionVerified:true,loginTokenVerified:true,unifiedCode:P.fingerprint(first.manifest.root)};
 const proof={body,signature:crypto.sign(null,Buffer.from(JSON.stringify(body)),firstProfile.privateKey).toString('base64')},proofBytes=JSON.stringify(proof,null,2);
 const m={...first.manifest,version:14,environment:P.ENVIRONMENT,purpose:P.PURPOSE,protocol:P.PROTOCOL,activation:'backend-only',backendGateDigest:'0'.repeat(64),firstAccessDigest:first.digest,loginProofDigest:B.sha(proofBytes),etagKeyDigest:B.sha(key),commandKeyDigest:B.sha(commandKey),code:P.fingerprint(first.manifest.root),configDigest:B.sha(bytes)};
 for(const [name,data]of [['unified-runtime.env',bytes],['unified-preconditions.key',key],['unified-commands.key',commandKey],['unified-first-login-proof.json',proofBytes],['unified-manifest.json',JSON.stringify(m,null,2)]])fs.writeFileSync(path.join(m.directory,name),data,{flag:'wx'});
 return {plan:P.readPlan(path.join(m.directory,'unified-manifest.json')),privateKey:firstProfile.privateKey};
}
async function start({plan,privateKey,db,probe=false,onEvent=()=>{}}){
 const env=require('../backend/config/desktopPolicy').cleanEnvironment();delete env.ELECTRON_RUN_AS_NODE;
 const child=cp.spawn(process.execPath,probe?[path.join(__dirname,'unifiedProbe.cjs'),plan.filename]:[path.join(plan.manifest.root,'backend/unifiedApi.js'),'--manifest',plan.filename],{env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});let output='',verificationError;const waiters=new Map();
 child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 const ended=new Promise(resolve=>child.once('exit',code=>resolve({code,output,verificationError})));const close=async()=>{if(child.exitCode===null){child.kill();await ended;}};
 child.on('message',async message=>{onEvent(message);if(message?.type==='unified-challenge'){try{const proof=await require('../backend/services/unifiedVerification.service').attest(db,plan,message.challenge,privateKey);child.send({type:'unified-attestation',proof});}catch(e){verificationError=e.code||e.message;if(child.connected)child.send({type:'unified-attestation',error:'VERIFICATION_REJECTED'});}}else if(message?.id&&waiters.has(message.id)){waiters.get(message.id)(message);waiters.delete(message.id);}});
 try{await new Promise((yes,no)=>{const timer=setTimeout(()=>no(Error('UNIFIED_START_TIMEOUT')),90000);child.stdout.on('data',()=>{if(output.includes(probe?'UNIFIED_PROBE_READY':'UNIFIED_READY')){clearTimeout(timer);yes();}});ended.then(r=>{clearTimeout(timer);no(Error(r.verificationError||r.output||'UNIFIED_EARLY_EXIT'));});child.once('error',no);});
 return {child,close,ended,get output(){return output;},request(message){return new Promise((yes,no)=>{const id=crypto.randomUUID(),timer=setTimeout(()=>{waiters.delete(id);no(Error('UNIFIED_IPC_TIMEOUT'));},10000);waiters.set(id,m=>{clearTimeout(timer);yes(m);});child.send({...message,id});});}};
 }catch(e){await close();throw e;}
}
function promote(profile,report){
 if(report.completed!==true||report.capacityDecisionPending!==false||report.checks.length<24)throw Error('UNIFIED_BACKEND_GATE');const plan=profile.plan,dir=plan.manifest.directory,original=fs.readFileSync(plan.filename),reportBytes=JSON.stringify(report,null,2);
 fs.writeFileSync(path.join(dir,'unified-backend-manifest.json'),original,{flag:'wx'});fs.writeFileSync(path.join(dir,'unified-backend-gate-report.json'),reportBytes,{flag:'wx'});
 const body={purpose:'ctsk-unified-backend-verified023-v1',completed:true,code:plan.manifest.code,cluster:plan.manifest.cluster,generation:plan.manifest.dataGeneration,schema:require('../backend/config/credentialSchemaContract').CATALOG_SHA,manifest:B.sha(original),report:B.sha(reportBytes)};
 const proof={body,signature:crypto.sign(null,Buffer.from(JSON.stringify(body)),profile.privateKey).toString('base64')},bytes=JSON.stringify(proof,null,2);fs.writeFileSync(path.join(dir,'unified-backend-proof.json'),bytes,{flag:'wx'});
 fs.writeFileSync(plan.filename,JSON.stringify({...plan.manifest,activation:'electron-original',backendGateDigest:B.sha(bytes)},null,2));return {...profile,plan:P.readPlan(plan.filename)};
}
module.exports={createProfile,start,verifyLogin,promote};
