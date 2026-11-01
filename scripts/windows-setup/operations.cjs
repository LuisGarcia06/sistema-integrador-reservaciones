'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const P=require('./policy.cjs'),S=require('./state.cjs');
function request(c,s,action){
 const authority=path.join(s.serverData,'authority026.json'),server=path.join(s.serverData,'server026.json'),p=name=>path.join(c.loc.session,name);
 const common={action,scope:P.SCOPE};let value;
 if(action==='init')value={...common,directory:s.serverData,authority:p('authority026.json'),authorityKey:p('authority-key.pem'),certificate:p('certificate.pem'),tlsKey:p('tls-key.pem')};
 else if(action==='bootstrap')value={...common,server,authority,authorityKey:p('authority-key.pem')};
 else if(action==='client')value={...common,server,authority,authorityKey:p('authority-key.pem'),clientRoot:c.loc.client,directory:s.clientData,ca:p('ca.pem')};else P.fail('UNKNOWN_ACTION');
 const file=p('request-'+action+'.json');fs.writeFileSync(file,JSON.stringify(value),{flag:'wx'});c.acl(file);return file;
}
function maintenance(c,file,timeout=300000){return cp.execFileSync(path.join(c.loc.server,'runtime/node.exe'),[path.join(c.loc.server,'tools/maintenance.cjs'),'--isolated-lab',file],{env:c.env,cwd:c.loc.server,shell:false,encoding:'utf8',windowsHide:true,timeout,maxBuffer:65536});}
function plan(c,s){return require(path.join(c.loc.server,'app/backend/config/enterprise026Policy.js')).readPlan(path.join(s.serverData,'server026.json'),path.join(s.serverData,'authority026.json'),path.join(c.loc.server,'app'));}
function client(c,s){return require(path.join(c.loc.client,'runtime/resources/app/electron/enterprise026ClientPolicy.js')).readClient(path.join(s.clientData,'client026.json'),path.join(s.clientData,'authority026.json'));}
async function identity(c,s){const config=client(c,s),nonce=crypto.randomBytes(32).toString('hex'),root=path.join(c.loc.client,'runtime/resources/app');const reply=await require(path.join(root,'electron/enterprise026Tls.js')).request(config,'/api/installation?nonce='+nonce,3000);if(reply.statusCode!==200)P.fail('SERVER_UNAVAILABLE');require(path.join(root,'electron/enterprise026ClientPolicy.js')).verify(config,nonce,JSON.parse(reply.body));}
async function launchConsole(c,s,action,requestFile){
 const jobId=crypto.randomUUID(),job=path.join(c.loc.session,'job-'+jobId+'.json'),receipt=path.join(c.loc.session,'receipt-'+jobId+'.json');
 fs.writeFileSync(job,JSON.stringify({jobId,action,server:c.loc.server,request:requestFile||null,plan:path.join(s.serverData,'server026.json'),authority:path.join(s.serverData,'authority026.json'),receipt}),{flag:'wx'});c.acl(job);
 const child=cp.spawn(path.join(c.root,'node.exe'),[path.join(__dirname,'console-stage.cjs'),job],{env:c.env,cwd:c.root,shell:false,detached:true,windowsHide:false,stdio:'ignore'});
 await new Promise((resolve,reject)=>{child.once('error',()=>reject(Error('CONSOLE_START_FAILED')));child.once('spawn',resolve);});child.unref();return {jobId,receipt};
}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function execute(c,s,action){
 if(action==='trust'){
  const executables=[path.join(c.root,'node.exe'),path.join(c.root,'crypto/openssl.exe')];
  const checked=require('./native-readiness.cjs').inspectPaths(c.reader,c.loc,c.env,executables.map(p=>({path:p,policy:'program-file'})));
  if(checked.machine.sid!==c.machine.sid||checked.machine.uuid!==c.machine.uuid)P.fail('CONFIG_ACL');
  return require('./crypto-material.cjs').generate({directory:c.loc.session,openssl:executables[1],env:c.env,checkAcl:c.acl});
 }
 if(action==='init'){
  require('./native-gate.cjs').requireComponent(c.root,'initdb');require('./native-gate.cjs').requireComponent(c.root,'service');
  const output=maintenance(c,request(c,s,'init'));if(!output.includes('NEW_SYNTHETIC_INSTALLATION_T0_VERIFIED'))P.fail('T0_REJECTED');
  const p=plan(c,s),file=path.join(s.serverData,'t0-installation026.json');c.acl(file);const r=JSON.parse(fs.readFileSync(file));if(!r.clean||r.database!==p.manifest.database||r.cluster!==p.manifest.cluster||p.manifest.state!=='empty'||r.state?.tables?.length!==23)P.fail('T0_REJECTED');return {t0:true};
 }
 if(action==='bootstrap'){
  const job=await launchConsole(c,s,'bootstrap',request(c,s,'bootstrap')),deadline=Date.now()+30*60000;let receipt;
  while(Date.now()<deadline){if(fs.existsSync(job.receipt)){c.acl(job.receipt);receipt=JSON.parse(fs.readFileSync(job.receipt));break;}await delay(500);}
  if(receipt?.jobId!==job.jobId||receipt.action!=='bootstrap'||receipt.exitCode!==0)P.fail('BOOTSTRAP_REVIEW');
  const p=plan(c,s),R=require(path.join(c.loc.server,'app/shared/release026.js')),file=path.join(s.serverData,'bootstrap-completed026.json');c.acl(file);const proof=JSON.parse(fs.readFileSync(file));if(p.manifest.state!=='initialized'||!R.signed(p.manifest.verificationKey,proof)||proof.body.attempt!==p.manifest.bootstrapOrigin?.attempt||proof.body.user!==p.manifest.bootstrapOrigin?.user||proof.body.cluster!==p.manifest.cluster)P.fail('BOOTSTRAP_REVIEW');return {bootstrap:true};
 }
 if(action==='client'){if(!maintenance(c,request(c,s,'client')).includes('CLIENT026_DESCRIPTOR_CREATED_EXTERNAL'))P.fail('CLIENT_REJECTED');client(c,s);return {descriptor:true};}
 if(action==='server'){
  require('./native-gate.cjs').requireComponent(c.root,'service');
  cp.execFileSync(path.join(c.loc.server,'runtime/node.exe'),[path.join(c.loc.server,'tools/server-control.cjs'),'check',path.join(s.serverData,'server026.json'),path.join(s.serverData,'authority026.json')],{env:c.env,cwd:c.loc.server,shell:false,windowsHide:true,timeout:30000});
  try{await identity(c,s);return {serverVerified:true};}catch{}
  await launchConsole(c,s,'server');const deadline=Date.now()+150000;while(Date.now()<deadline){try{await identity(c,s);return {serverVerified:true};}catch{}await delay(1000);}P.fail('SERVER_UNAVAILABLE');
 }
 if(action==='open'){
  await identity(c,s);
  return new Promise((resolve,reject)=>{const child=cp.spawn(path.join(c.loc.client,'runtime/electron.exe'),['--ctsk-descriptor='+path.join(s.clientData,'client026.json'),'--ctsk-trust='+path.join(s.clientData,'authority026.json')],{env:c.env,cwd:c.loc.client,shell:false,windowsHide:false,stdio:['ignore','pipe','pipe']});let done=false,text='';const timer=setTimeout(()=>finish(false),60000);function finish(ok){if(done)return;done=true;clearTimeout(timer);if(!ok)child.kill();child.stdout.destroy();child.stderr.destroy();child.unref();ok?resolve({clientStarted:true,login:'pending-manual'}):reject(Error('CLIENT_REJECTED'));}const data=chunk=>{text=(text+chunk.toString()).slice(-4096);if(text.includes('CLIENT026_REJECTED'))finish(false);else if(text.includes('CLIENT026_READY'))finish(true);};child.stdout.on('data',data);child.stderr.on('data',data);child.once('error',()=>finish(false));child.once('exit',()=>finish(false));});
 }
 P.fail('UNKNOWN_ACTION');
}
function validateJob(c,file){c.acl(file);if(path.dirname(file)!==c.loc.session)P.fail('SESSION_REJECTED');const job=JSON.parse(fs.readFileSync(file)),state=S.read(c.loc,c.machine,c.acl);if(Object.keys(job).sort().join(',')!=='action,authority,jobId,plan,receipt,request,server'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(job.jobId||'')||!['bootstrap','server'].includes(job.action)||state.steps[P.STEPS.indexOf(job.action)]!=='running'||job.server!==c.loc.server||file!==path.join(c.loc.session,'job-'+job.jobId+'.json')||job.plan!==path.join(state.serverData,'server026.json')||job.authority!==path.join(state.serverData,'authority026.json')||job.receipt!==path.join(c.loc.session,'receipt-'+job.jobId+'.json')||(job.action==='bootstrap'?job.request!==path.join(c.loc.session,'request-bootstrap.json'):job.request!==null))P.fail('SESSION_REJECTED');return job;}
module.exports={execute,validateJob,request,launchConsole};
