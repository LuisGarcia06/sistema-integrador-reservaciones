'use strict';
// Supervisor local: SQL de mantenimiento sólo en memoria, nunca se transmite al hijo HTTP.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const B=require('../backend/config/standalonePolicy'),P=require('../backend/config/firstAccessPolicy');
function createProfile(bootstrapPlan,config,record){
 const pair=crypto.generateKeyPairSync('ed25519'),bp=bootstrapPlan.manifest;
 const c={...config,APP_ENVIRONMENT:P.ENVIRONMENT,DB_SCHEMA_VERSION:'023'},bytes=Object.entries(c).map(([k,v])=>k+'='+v).join('\n')+'\n';
 const m={...bp,version:13,environment:P.ENVIRONMENT,purpose:P.PURPOSE,protocol:P.PROTOCOL,accessMode:'bootstrap',schemaVersion:'023',bootstrapAttempt:record.id_inicializacion,initialUser:record.id_usuario,bootstrapDigest:bootstrapPlan.digest,verificationKey:pair.publicKey.export({type:'spki',format:'pem'}),code:P.fingerprint(bp.root),configDigest:B.sha(bytes)};
 P.validateManifest(m,m.root);P.validateConfig(c,m);
 fs.writeFileSync(path.join(m.directory,'first-access-runtime.env'),bytes);
 const filename=path.join(m.directory,P.MANIFEST);fs.writeFileSync(filename,JSON.stringify(m,null,2));
 return {plan:P.readPlan(filename),privateKey:pair.privateKey};
}
async function start({plan,privateKey,db,transformProof=p=>p}){
 const env=require('../backend/config/desktopPolicy').cleanEnvironment();delete env.ELECTRON_RUN_AS_NODE;
 const child=cp.spawn(process.execPath,[path.join(plan.manifest.root,'backend/firstAccessApi.js'),'--manifest',plan.filename],{env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
 let output='',verificationError,proof;child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 child.on('message',async message=>{if(message?.type!=='first-access-challenge')return;try{proof=await require('../backend/services/firstAccessVerification.service').attest(db,plan,message.challenge,privateKey);child.send({type:'first-access-attestation',proof:transformProof(proof,message.challenge)});}catch(e){verificationError=e.code||e.message;if(child.connected)child.send({type:'first-access-attestation',error:'LOCAL_VERIFICATION_REJECTED'});}});
 const ended=new Promise(resolve=>child.once('exit',(code)=>resolve({code,output,verificationError})));void ended.catch(()=>{});
 const close=async()=>{if(child.exitCode===null){child.kill();await ended;}};
 try{await new Promise((yes,no)=>{const timer=setTimeout(()=>no(Error('FIRST_ACCESS_START_TIMEOUT')),60000);child.stdout.on('data',()=>{if(output.includes('FIRST_ACCESS_READY')){clearTimeout(timer);yes();}});ended.then(r=>{clearTimeout(timer);no(Object.assign(Error(r.verificationError||r.output.trim()||'FIRST_ACCESS_EARLY_EXIT'),{startup:r}));});child.once('error',no);});return {child,close,ended,proof,get output(){return output;}};}catch(e){await close();e.startup={output,verificationError};throw e;}
}
async function main(){
 process.env=require('../backend/config/desktopPolicy').cleanEnvironment();delete process.env.ELECTRON_RUN_AS_NODE;
 const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--manifest')throw Error('FIRST_ACCESS_ARGUMENTS');
 const bp=require('../backend/config/bootstrapPolicy').readPlan(args[1]),capture=require('./bootstrapAdmin.cjs').localCapture();let db,secret,server;
 try{secret=await capture.ask('Clave SQL local para verificar la instalación (sin eco): ',true);db=await require('./bootstrapAdmin.cjs').connection(bp,secret);secret=null;const record=await require('../backend/services/credentialBootstrap.service').inspect(db,bp);if(!record.id_inicializacion)throw Error('FIRST_ACCESS_BOOTSTRAP_REQUIRED');
 const config=require('../backend/config/desktopPolicy').readConfig(path.join(bp.manifest.directory,'runtime.env'),{validate:c=>B.validateConfig(c,{...bp.manifest,environment:'standalone-development'})}).config;
 const profile=createProfile(bp,config,{id_inicializacion:record.id_inicializacion,id_usuario:record.id_usuario_inicial});server=await start({...profile,db});console.log('FIRST_ACCESS_LOCAL_READY');await server.ended;
 }finally{secret=null;capture.close();await server?.close();await db?.end();}
}
if(require.main===module)main().catch(e=>{console.error('FIRST_ACCESS_LOCAL_FAILED '+(/^[A-Z0-9_]{1,80}$/.test(e.code||e.message)?e.code||e.message:'LOCAL_VERIFICATION_REJECTED'));process.exitCode=1;});
module.exports={createProfile,start,main};
