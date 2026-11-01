'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os'),cp=require('node:child_process');
const P=require('./policy.cjs'),I=require('./integrity.cjs'),S=require('./state.cjs');
const W=require('./windowsProcess.js');
const ROOT=path.resolve(__dirname,'../..');
const META_SCRIPT="[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false);$c=Get-CimInstance Win32_ComputerSystem;$p=Get-CimInstance Win32_ComputerSystemProduct;@{manufacturer=$c.Manufacturer;model=$c.Model;uuid=$p.UUID;sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value}|ConvertTo-Json -Compress";
function ps(){return path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');}
function machine(env){const bytes=cp.execFileSync(ps(),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(META_SCRIPT,'utf16le').toString('base64')],{env,encoding:'utf8',windowsHide:true,timeout:15000});return P.guardMachine({...JSON.parse(bytes),platform:process.platform,arch:process.arch,release:os.release()});}
function context(){
 // Comprobar SO antes de consultar WMI o lanzar cualquier proceso de mantenimiento.
 if(process.platform!=='win32'||process.arch!=='x64'||Number(os.release().split('.')[2])<22000)P.fail('VM_WINDOWS11_REQUIRED');
 I.verify(ROOT);const env=P.environment(process.env),m=machine(env),loc=P.locations(fs.realpathSync(env.LOCALAPPDATA));
 const ref=JSON.parse(fs.readFileSync(path.join(__dirname,'candidate-reference.json')));
 for(const side of ['server','client']){
  const file=path.join(loc[side],'distribution-inventory.json');
  if(I.sha(fs.readFileSync(file))!==ref[side].inventorySha256)P.fail('INTEGRITY');
  const H=require('./payload.cjs'),inventory=H.verify(loc[side],side);
  if(inventory.release!==P.RELEASE)P.fail('INTEGRITY');
 }
 const ACL=require(path.join(loc.server,'app/backend/config/windowsConfigAcl.js')),acl=ACL.checkAcl;
 // Programa: permitir lectura pública, rechazar escritura/sustitución por terceros.
 const programScript=ACL.SCRIPT.replace('2032127','852310');
 for(const file of [path.join(loc.server,'runtime/node.exe'),path.join(loc.client,'runtime/electron.exe')]){
  const checked=cp.spawnSync(ps(),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(programScript,'utf16le').toString('base64')],{input:file,env,encoding:'utf8',windowsHide:true,timeout:15000});
  if(checked.status!==0)P.fail('CONFIG_ACL');
 }
 // Los binarios pueden ser públicos; validar ancestros mediante un archivo privado
 // se hace antes de generar secretos. Inventarios del programa ya están fijados.
 return {env,m,loc,acl};
}
function runScript(c,file,args,timeout=180000){let output;try{output=cp.execFileSync(ps(),['-NoProfile','-NonInteractive','-File',file,...args],{env:c.env,encoding:'utf8',windowsHide:true,timeout,maxBuffer:1024*1024});}catch(e){if(/PSSecurityException|UnauthorizedAccess|cannot be loaded|no se puede cargar/i.test(String(e.stderr||'')))P.fail('POLICY_BLOCKED');P.fail('MAINTENANCE_FAILED');}return output;}
function plan(c,s){const Q=require(path.join(c.loc.server,'app/backend/config/enterprise026Policy.js'));return Q.readPlan(path.join(s.serverData,'server026.json'),path.join(s.serverData,'authority026.json'),path.join(c.loc.server,'app'));}
function client(c,s){return require(path.join(c.loc.client,'runtime/resources/app/electron/enterprise026ClientPolicy.js')).readClient(path.join(s.clientData,'client026.json'),path.join(s.clientData,'authority026.json'));}
function request(c,s,action){const common={action,scope:P.SCOPE},p=f=>path.join(c.loc.session,f),server=path.join(s.serverData,'server026.json'),authority=path.join(s.serverData,'authority026.json');let r;
 if(action==='init')r={...common,directory:s.serverData,authority:p('authority026.json'),authorityKey:p('authority-key.pem'),certificate:p('certificate.pem'),tlsKey:p('tls-key.pem')};
 else if(action==='bootstrap')r={...common,server,authority,authorityKey:p('authority-key.pem')};
 else if(action==='client')r={...common,server,authority,authorityKey:p('authority-key.pem'),clientRoot:c.loc.client,directory:s.clientData,ca:p('ca.pem')};else P.fail('UNKNOWN_ACTION');
 const file=p('request-'+action+'.json');fs.writeFileSync(file,JSON.stringify(r,null,2),{flag:'wx'});c.acl(file);return file;
}
function launchConsole(c,s,action,requestFile){
 const jobId=crypto.randomUUID(),job=path.join(c.loc.session,'job-'+jobId+'.json'),receipt=path.join(c.loc.session,'receipt-'+jobId+'.json');
 fs.writeFileSync(job,JSON.stringify({jobId,action,server:c.loc.server,request:requestFile||null,plan:path.join(s.serverData,'server026.json'),authority:path.join(s.serverData,'authority026.json'),receipt}),{flag:'wx'});c.acl(job);
 const exe=ps(),line=W.commandLine(['-NoProfile','-File',path.join(__dirname,'console-stage.ps1'),'-Job',job]);
 const script="[Console]::InputEncoding=New-Object Text.UTF8Encoding($false);$ErrorActionPreference='Stop';$v=ConvertFrom-Json ([Console]::In.ReadToEnd());$s=New-Object Diagnostics.ProcessStartInfo;$s.FileName=$v.exe;$s.Arguments=$v.line;$s.UseShellExecute=$true;$p=[Diagnostics.Process]::Start($s);[Console]::WriteLine($p.Id)";
 cp.execFileSync(exe,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{input:JSON.stringify({exe,line}),env:c.env,windowsHide:true,timeout:15000,stdio:'pipe'});
 return {jobId,receipt};
}
async function identity(c,s){const config=client(c,s),nonce=crypto.randomBytes(32).toString('hex'),root=path.join(c.loc.client,'runtime/resources/app');const r=await require(path.join(root,'electron/enterprise026Tls.js')).request(config,'/api/installation?nonce='+nonce,3000);if(r.statusCode!==200)P.fail('SERVER_UNAVAILABLE');require(path.join(root,'electron/enterprise026ClientPolicy.js')).verify(config,nonce,JSON.parse(r.body));return true;}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitReceipt(c,job){const deadline=Date.now()+30*60000;while(Date.now()<deadline){if(fs.existsSync(job.receipt)){c.acl(job.receipt);const r=JSON.parse(fs.readFileSync(job.receipt));if(r.jobId!==job.jobId||r.action!=='bootstrap'||r.exitCode!==0)P.fail('BOOTSTRAP_REVIEW');return;}await delay(500);}P.fail('BOOTSTRAP_REVIEW');}
function validateJob(c,file){c.acl(file);if(path.dirname(file)!==c.loc.session)P.fail('SESSION_REJECTED');const j=JSON.parse(fs.readFileSync(file)),s=S.read(c.loc,c.m,c.acl);if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(j.jobId||'')||!['bootstrap','server'].includes(j.action)||s.steps[P.STEPS.indexOf(j.action)]!=='running'||j.server!==c.loc.server||j.plan!==path.join(s.serverData,'server026.json')||j.authority!==path.join(s.serverData,'authority026.json')||file!==path.join(c.loc.session,'job-'+j.jobId+'.json')||j.receipt!==path.join(c.loc.session,'receipt-'+j.jobId+'.json')||(j.action==='bootstrap'&&j.request!==path.join(c.loc.session,'request-bootstrap.json')))P.fail('SESSION_REJECTED');return j;}
async function execute(c,s,action){
 if(action==='trust')return require('./crypto-material.cjs').generate({directory:c.loc.session,openssl:path.join(ROOT,'crypto/openssl.exe'),env:c.env,checkAcl:c.acl});
 if(action==='init'){
  const file=request(c,s,'init'),output=runScript(c,path.join(c.loc.server,'Maintain-Server.ps1'),['-IsolatedLab','-Request',file],300000);
  if(!output.includes('NEW_SYNTHETIC_INSTALLATION_T0_VERIFIED'))P.fail('T0_REJECTED');
  const p=plan(c,s),receipt=path.join(s.serverData,'t0-installation026.json');c.acl(receipt);const t0=JSON.parse(fs.readFileSync(receipt));
  if(!t0.clean||t0.database!==p.manifest.database||t0.cluster!==p.manifest.cluster||p.manifest.state!=='empty'||t0.state?.tables?.length!==23)P.fail('T0_REJECTED');return {t0:true};
 }
 if(action==='bootstrap'){
  const job=launchConsole(c,s,'bootstrap',request(c,s,'bootstrap'));await waitReceipt(c,job);
  const p=plan(c,s),Q=require(path.join(c.loc.server,'app/shared/release026.js')),file=path.join(s.serverData,'bootstrap-completed026.json');c.acl(file);const proof=JSON.parse(fs.readFileSync(file)),o=p.manifest.bootstrapOrigin;
  if(p.manifest.state!=='initialized'||!o||!Q.signed(p.manifest.verificationKey,proof)||proof.body.purpose!=='ctsk-bootstrap-completed026-v1'||proof.body.attempt!==o.attempt||proof.body.user!==o.user||proof.body.cluster!==p.manifest.cluster)P.fail('BOOTSTRAP_REVIEW');return {bootstrap:true};
 }
 if(action==='client'){
  const output=runScript(c,path.join(c.loc.server,'Maintain-Server.ps1'),['-IsolatedLab','-Request',request(c,s,'client')]);
  if(!output.includes('CLIENT026_DESCRIPTOR_CREATED_EXTERNAL'))P.fail('CLIENT_REJECTED');client(c,s);return {descriptor:true};
 }
 if(action==='server'){
  runScript(c,path.join(c.loc.server,'Start-Server.ps1'),['-ServerConfig',path.join(s.serverData,'server026.json'),'-Authority',path.join(s.serverData,'authority026.json'),'-CheckOnly']);
  try{await identity(c,s);return {serverVerified:true};}catch{}
  launchConsole(c,s,'server');const deadline=Date.now()+150000;while(Date.now()<deadline){try{await identity(c,s);return {serverVerified:true};}catch{}await delay(1000);}P.fail('SERVER_UNAVAILABLE');
 }
 if(action==='open'){
  await identity(c,s);return await new Promise((resolve,reject)=>{
   const child=cp.spawn(path.join(c.loc.client,'runtime/electron.exe'),['--ctsk-descriptor='+path.join(s.clientData,'client026.json'),'--ctsk-trust='+path.join(s.clientData,'authority026.json')],{cwd:c.loc.client,env:c.env,windowsHide:false,stdio:['ignore','pipe','pipe']});
   let text='',done=false;const timer=setTimeout(()=>finish(false),60000);
   function finish(ok){if(done)return;done=true;clearTimeout(timer);child.stdout.destroy();child.stderr.destroy();child.unref();if(ok)resolve({clientStarted:true,login:'pending-manual'});else reject(Error('CLIENT_REJECTED'));}
   const data=b=>{text=(text+b.toString()).slice(-2048);if(text.includes('CLIENT026_REJECTED'))finish(false);else if(text.includes('CLIENT026_READY'))finish(true);};child.stdout.on('data',data);child.stderr.on('data',data);child.once('error',()=>finish(false));child.once('exit',()=>finish(false));
  });
 }
 P.fail('UNKNOWN_ACTION');
}
async function dispatch(action,ack=false){
 const c=context();
 if(action==='status'){
  if(!fs.existsSync(c.loc.session))return {steps:['pending','pending','pending','pending','pending','pending','pending','pending'],release:P.RELEASE};
  const s=S.read(c.loc,c.m,c.acl);return {steps:s.steps.map(x=>x==='running'?'review':x),release:P.RELEASE,lastError:s.lastError};
 }
 if(action==='verify'){
  for(const side of ['server','client'])runScript(c,path.join(c.loc[side],'Verify-Payload.ps1'),['-Side',side]);
  for(const name of ['postgres','pg_ctl','initdb','pg_dump','pg_restore','pg_controldata']){const v=cp.execFileSync('C:/Program Files/PostgreSQL/18/bin/'+name+'.exe',['--version'],{env:c.env,encoding:'utf8',windowsHide:true,timeout:10000});if(!/\b18\.3\b/.test(v))P.fail('START_FAILED');}
  if(!ack)P.fail('SESSION_REJECTED');return {verified:true,uuid:c.m.uuid};
 }
 if(action==='directories'){
  if(!ack)P.fail('SESSION_REJECTED');await dispatch('verify',true);const serverData=path.join(c.loc.local,'ctsk-server026-'+crypto.randomUUID());
  const dirs=[c.loc.session,serverData,c.loc.clientData];if(dirs.some(x=>fs.existsSync(x)))P.fail('DIRECTORY_EXISTS');
  runScript(c,path.join(__dirname,'private-directories.ps1'),['-Request',JSON.stringify({paths:dirs})]);
  for(const directory of dirs){const probe=path.join(directory,'acl-probe.json');fs.writeFileSync(probe,'{}',{flag:'wx'});c.acl(probe);fs.unlinkSync(probe);}
  const s={protocol:'ctsk-setup026-v1',release:P.RELEASE,scope:P.SCOPE,productionAuthorized:false,uuid:c.m.uuid,sid:c.m.sid,session:c.loc.session,clientData:c.loc.clientData,serverData,steps:['done','done','pending','pending','pending','pending','pending','pending']};
  S.atomic(path.join(c.loc.session,'state.json'),s);return {directories:true};
 }
 const s=S.read(c.loc,c.m,c.acl),unlock=S.lock(c.loc.session);try{return await S.perform(s,action,value=>S.atomic(path.join(c.loc.session,'state.json'),value),()=>execute(c,s,action));}finally{unlock();}
}
module.exports={context,dispatch,execute,validateJob,request,plan,client,identity,runScript,launchConsole,META_SCRIPT};
