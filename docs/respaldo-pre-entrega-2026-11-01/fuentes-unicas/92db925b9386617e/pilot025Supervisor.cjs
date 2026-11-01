'use strict';
// Puerta de ensayo; no admite instalaciones empresariales ni reutiliza constancias de otro clúster.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const P=require('../backend/config/preproductionPolicy'),B=require('../backend/config/standalonePolicy'),S=require('./preproductionSetup.cjs'),acl=require('../backend/config/windowsConfigAcl').checkAcl;
const LOCK=[1129599827,2501],sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function readEnrollment(file,authorityFile,root=path.resolve(__dirname,'..')){
 acl(file);acl(authorityFile);const doc=JSON.parse(fs.readFileSync(file)),b=doc.body,authority=fs.readFileSync(authorityFile,'utf8');
 if(crypto.createPublicKey(authority).asymmetricKeyType!=='ed25519')throw Error('ENROLLMENT025_AUTHORITY');
 if(!b||!P.signed(authority,doc)||b.purpose!=='ctsk-pilot025-start-rehearsal-v1'||b.scope!=='new-synthetic-cluster-only'||b.realIntegrations!==false||b.root!==root||!P.uuid(b.installationId)||!P.uuid(b.enrollmentId)||!b.responsible?.trim()||!Number.isInteger(b.expiresAt)||Date.now()>b.expiresAt)throw Error('ENROLLMENT025_REJECTED');
 const plan=P.readPlan(b.plan,root),m=plan.manifest;
 if(path.dirname(file)!==m.directory||path.dirname(authorityFile)!==m.directory||b.planDigest!==plan.digest||b.installationId!==m.installationId||b.cluster!==m.cluster||b.database!==m.database||b.generation!==m.dataGeneration||b.authEpoch!==m.authEpoch||b.bootstrapAttempt!==m.bootstrapOrigin?.attempt||b.code!==m.code||!m.manualReferences025||!m.integration024)throw Error('ENROLLMENT025_IDENTITY');
 B.verifyLocalCluster(m);
 const inventoryFile=path.join(root,'candidate-inventory.json');if(sha(fs.readFileSync(inventoryFile))!==b.packageInventorySha256)throw Error('PACKAGE025_INVENTORY');
 const inventory=JSON.parse(fs.readFileSync(inventoryFile));
 for(const row of inventory){if(typeof row.file!=='string'||path.isAbsolute(row.file)||row.file.split(/[\\/]/).includes('..'))throw Error('PACKAGE025_PATH');const f=path.join(root,row.file);if(fs.lstatSync(f).isSymbolicLink()||sha(fs.readFileSync(f))!==row.sha256)throw Error('PACKAGE025_CHANGED');}
 const approved=new Set([...inventory.map(x=>x.file),'candidate-inventory.json']);function walk(dir=root){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error('PACKAGE025_REPARSE');if(entry.isDirectory())walk(f);else if(!approved.has(path.relative(root,f).replaceAll('\\','/')))throw Error('PACKAGE025_EXTRA_FILE');}}walk();
 return {plan,enrollment:b};
}
async function start(file,authorityFile){
 process.env=require('../backend/config/desktopPolicy').cleanEnvironment();delete process.env.ELECTRON_RUN_AS_NODE;
 const root=path.resolve(__dirname,'..'),{plan,enrollment}=readEnrollment(file,authorityFile,root),m=plan.manifest;
 const privateFile=path.join(m.directory,'startup-maintenance025.json');acl(privateFile);const maintenance=JSON.parse(fs.readFileSync(privateFile));
 if(Object.keys(maintenance).sort().join()!=='database,host,password,port,user'||maintenance.host!=='127.0.0.1'||maintenance.port!==m.pgPort||maintenance.database!==m.database||maintenance.user!=='ctsk_standalone_admin'||typeof maintenance.password!=='string'||!maintenance.password)throw Error('MAINTENANCE025_IDENTITY');
 B.blockNetwork(m.pgPort);const db=new(require('pg').Client)(maintenance);let child,closing=false;const close=async()=>{if(closing)return;closing=true;if(child&&child.exitCode===null){const end=new Promise(r=>child.once('exit',r));child.kill();await end;}await db.end().catch(()=>{});if(process.connected)process.disconnect();};
 db.on('error',()=>{console.error('SUPERVISOR025_DATABASE_LOST');void close();});
 try{
  await db.connect();await S.verifyInstallation(db,plan);
  if((await db.query("SELECT 1 FROM public.integracion_sync_estado WHERE source='automation024' AND automation_enabled")).rowCount)throw Error('SUPERVISOR025_MANUAL_MODE_REQUIRED');
  if(!(await db.query('SELECT pg_try_advisory_lock($1::int,$2::int) owned',LOCK)).rows[0].owned)throw Error('SUPERVISOR025_ALREADY_RUNNING');
  readEnrollment(file,authorityFile,root);
  child=cp.spawn(process.execPath,[path.join(root,'backend/preproductionApi.js'),plan.filename],{cwd:root,env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
  child.stdout.on('data',chunk=>{if(String(chunk).includes('PREPRODUCTION_READY')){console.log('SUPERVISOR025_READY');process.send?.({type:'supervisor025-ready',scope:enrollment.scope});}});
  child.stderr.on('data',()=>console.error('SUPERVISOR025_BACKEND_DIAGNOSTIC'));
  child.on('message',async message=>{if(message.type!=='preproduction-challenge')return;try{readEnrollment(file,authorityFile,root);const proof=await S.attest(db,plan,message.nonce);if(child.connected)child.send({type:'preproduction-attestation',proof});}catch{console.error('SUPERVISOR025_ATTESTATION_REJECTED');await close();}});
  child.once('exit',code=>{if(!closing){console.error('SUPERVISOR025_BACKEND_EXIT');process.exitCode=code||1;void close();}});
  process.on('message',m=>{if(m?.type==='supervisor025-stop')void close();});
  process.once('SIGTERM',()=>void close());process.once('SIGINT',()=>void close());process.once('disconnect',()=>void close());
  return {close,db,child};
 }catch(e){await close();throw e;}
}
if(require.main===module){if(process.argv.length!==4)throw Error('EXPLICIT_ENROLLMENT025_REQUIRED');start(process.argv[2],process.argv[3]).catch(e=>{console.error('SUPERVISOR025_REJECTED '+(/^[A-Z0-9_]+$/.test(e.message)?e.message:'START_FAILED'));process.exitCode=1;});}
module.exports={readEnrollment,start,LOCK};
