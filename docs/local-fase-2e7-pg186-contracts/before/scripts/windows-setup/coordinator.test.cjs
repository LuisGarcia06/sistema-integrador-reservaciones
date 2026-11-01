'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const P=require('./policy.cjs'),I=require('./integrity.cjs');
function harness(options={}){
 const parent=path.resolve('dist/windows-setup-contracts');fs.mkdirSync(parent,{recursive:true});const local=path.join(parent,crypto.randomUUID());fs.mkdirSync(local);
 const loc=P.locations(local),meta={manufacturer:'Oracle Corporation',model:'VirtualBox',uuid:crypto.randomUUID(),sid:'S-1-5-21-1-2-3-1001'};
 const plan={manifest:{database:'ctsk_install_'+'a'.repeat(24),cluster:'1234567890123456789',state:'empty',verificationKey:'public',bootstrapOrigin:null}};
 const reference={},calls=[];let online=false,clock=0;
 for(const side of ['server','client']){fs.mkdirSync(loc[side],{recursive:true});const value=JSON.stringify({side});fs.writeFileSync(path.join(loc[side],'distribution-inventory.json'),value);reference[side]={inventorySha256:I.sha(value)};}
 const acl=()=>{},policy={readPlan:()=>plan};
 const fakeFs={...fs,readFileSync:(file,...args)=>String(file).endsWith('candidate-reference.json')?JSON.stringify(reference):fs.readFileSync(file,...args)};
 function completeBootstrap(){const s=JSON.parse(fs.readFileSync(path.join(loc.session,'state.json')));plan.manifest.state='initialized';plan.manifest.bootstrapOrigin={attempt:crypto.randomUUID(),user:1};fs.writeFileSync(path.join(s.serverData,'bootstrap-completed026.json'),JSON.stringify({body:{purpose:'ctsk-bootstrap-completed026-v1',attempt:plan.manifest.bootstrapOrigin.attempt,user:1,cluster:plan.manifest.cluster}}));}
 const cp={
  spawnSync:()=>({status:options.badAcl?4:0}),
  execFileSync(exe,args,opts){calls.push({exe,args});
   if(args[0]==='--version')return 'PostgreSQL 18.3';
   if(args.includes('-EncodedCommand')){
    if(!opts.input)return JSON.stringify(meta);
    const jobs=fs.readdirSync(loc.session).filter(x=>x.startsWith('job-'));
    const running=JSON.parse(fs.readFileSync(path.join(loc.session,'state.json'))).steps;
    const job=jobs.map(f=>JSON.parse(fs.readFileSync(path.join(loc.session,f)))).find(j=>running[P.STEPS.indexOf(j.action)]==='running');
    if(job.action==='bootstrap'){if(!options.badBootstrap)completeBootstrap();fs.writeFileSync(job.receipt,JSON.stringify({jobId:job.jobId,action:'bootstrap',exitCode:options.badBootstrap?1:0}));}else online=true;
    return '1234';
   }
   const file=args[args.indexOf('-File')+1];
   if(file.endsWith('private-directories.ps1')){const request=JSON.parse(args.at(-1));for(const p of request.paths)fs.mkdirSync(p);return 'PRIVATE_DIRECTORIES_CREATED';}
   if(file.endsWith('Verify-Payload.ps1'))return 'PAYLOAD_VERIFIED_UNSIGNED_CANDIDATE';
   if(file.endsWith('Start-Server.ps1'))return 'SERVER026_PREFLIGHT_OK';
   if(file.endsWith('Maintain-Server.ps1')){
    if(options.failMaintenance)throw Error('untrusted secret');
    const r=JSON.parse(fs.readFileSync(args.at(-1)));
    if(r.action==='init'){fs.writeFileSync(path.join(r.directory,'t0-installation026.json'),JSON.stringify({clean:!options.badT0,database:plan.manifest.database,cluster:plan.manifest.cluster,state:{tables:Array(23).fill('table')}}));return 'NEW_SYNTHETIC_INSTALLATION_T0_VERIFIED';}
    if(r.action==='client')return 'CLIENT026_DESCRIPTOR_CREATED_EXTERNAL';
   }
   throw Error('UNEXPECTED_COMMAND');
  },
  spawn(){const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdout.destroy=()=>{};child.stderr.destroy=()=>{};child.unref=()=>{};setImmediate(()=>child.stdout.emit('data',Buffer.from(options.badOpen?'CLIENT026_REJECTED ENOENT':'CLIENT026_READY')));return child;}
 };
 const mod={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'coordinator.cjs'),'utf8'),{module:mod,__dirname,Buffer,process:{platform:'win32',arch:'x64',env:{LOCALAPPDATA:local,SystemRoot:'C:\\Windows'}},Date:{now:()=>Date.now()+clock},setTimeout:(fn,ms)=>{if(ms<=1000){clock+=ms*100;return setTimeout(fn,0);}return setTimeout(fn,ms);},clearTimeout,require(id){
  if(id==='node:fs')return fakeFs;if(id==='node:child_process')return cp;if(id==='node:os')return {release:()=> '10.0.26200'};
  if(id==='./policy.cjs')return P;if(id==='./integrity.cjs')return {...I,verify:()=>({})};if(id==='./state.cjs')return require('./state.cjs');if(id==='./windowsProcess.js')return require('./windowsProcess.js');
  if(id==='./payload.cjs')return {verify:()=>({release:P.RELEASE})};
  if(id==='./crypto-material.cjs')return {generate:()=>({expiresAt:Date.now()+86400000})};
  if(id.endsWith('windowsConfigAcl.js'))return {checkAcl:acl,SCRIPT:'2032127'};
  if(id.endsWith('enterprise026Policy.js'))return policy;
  if(id.endsWith('release026.js'))return {signed:()=>!options.badProof};
  if(id.endsWith('enterprise026ClientPolicy.js'))return {readClient:()=>({}),verify:()=>true};
  if(id.endsWith('enterprise026Tls.js'))return {request:async()=>{if(!online||options.offline)throw Error('offline');return {statusCode:200,body:'{}'};}};
  if(id.startsWith('.'))throw Error('UNEXPECTED_IMPORT');return require(id);
 }});
 return {C:mod.exports,loc,calls,cleanup(){const resolved=fs.realpathSync(local);assert.equal(path.dirname(resolved),fs.realpathSync(parent));fs.rmSync(resolved,{recursive:true});},state:()=>JSON.parse(fs.readFileSync(path.join(loc.session,'state.json')))};
}
async function until(h,step){for(const name of P.STEPS){await h.C.dispatch(name,true);if(name===step)return;}}
test('ocho etapas completas con procesos y red simulados, sin SQL ni datos comerciales',async()=>{const h=harness();try{await until(h,'open');assert.deepEqual(h.state().steps,Array(8).fill('done'));assert.ok(h.calls.every(x=>!x.args.includes('Bypass')));assert.ok(!h.calls.some(x=>/pg_ctl\.exe|postgres\.exe|initdb\.exe/i.test(x.exe)&&!x.args.includes('--version')));const status=await h.C.dispatch('status');assert.equal(status.steps[7],'done');}finally{h.cleanup();}});
for(const [name,options,last,error] of [
 ['error de mantenimiento',{failMaintenance:true},'init','MAINTENANCE_FAILED'],
 ['T0 no limpio',{badT0:true},'init','T0_REJECTED'],
 ['bootstrap interrumpido',{badBootstrap:true},'bootstrap','BOOTSTRAP_REVIEW'],
 ['constancia no verificable',{badProof:true},'bootstrap','BOOTSTRAP_REVIEW'],
 ['servidor sin identidad',{offline:true},'server','SERVER_UNAVAILABLE'],
 ['cliente rechazado',{badOpen:true},'open','CLIENT_REJECTED']
])test(name+' conserva revisión y evita repetir',async()=>{const h=harness(options);try{await assert.rejects(until(h,last),new RegExp(error));assert.equal(h.state().steps[P.STEPS.indexOf(last)],'review');await assert.rejects(h.C.dispatch(last,true),/INTERRUPTED_REVIEW/);}finally{h.cleanup();}});
test('ACL de programa insegura bloquea antes de crear carpetas',async()=>{const h=harness({badAcl:true});try{await assert.rejects(h.C.dispatch('directories',true),/CONFIG_ACL/);assert.equal(fs.existsSync(h.loc.session),false);}finally{h.cleanup();}});
test('destinos existentes no se vacían ni se sobrescriben',async()=>{const h=harness();try{fs.mkdirSync(h.loc.clientData);fs.writeFileSync(path.join(h.loc.clientData,'preserve.txt'),'existing');await assert.rejects(h.C.dispatch('directories',true),/DIRECTORY_EXISTS/);assert.equal(fs.readFileSync(path.join(h.loc.clientData,'preserve.txt'),'utf8'),'existing');}finally{h.cleanup();}});
test('recuperación muestra operación pendiente de revisión y no vuelve a ejecutarla',async()=>{const h=harness();try{await until(h,'directories');const s=h.state();s.steps[2]='running';fs.writeFileSync(path.join(h.loc.session,'state.json'),JSON.stringify(s));const before=h.calls.length;const status=await h.C.dispatch('status');assert.equal(status.steps[2],'review');await assert.rejects(h.C.dispatch('trust'),/INTERRUPTED_REVIEW/);assert.equal(h.calls.length,before+2);/* solo lecturas WMI en context() */}finally{h.cleanup();}});
