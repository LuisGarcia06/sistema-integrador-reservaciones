'use strict';
// Diagnóstico aislado: ningún proceso PowerShell, shell o PostgreSQL se ejecuta.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const P=require('./policy.cjs');
const root=path.resolve(__dirname,'../..');
const packaged=path.join(root,'dist/windows-2e7/2e7-candidate-04');

function aclHarness(){
 const calls=[],module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(packaged,'server/app/backend/config/windowsConfigAcl.js'),'utf8'),{
  module,Buffer,process:{platform:'win32',env:{SystemRoot:'C:\\Windows'}},
  require(id){if(id==='node:child_process')return {spawnSync:(exe,args,options)=>{calls.push({exe,args,input:options.input});return {status:1};}};if(id==='node:path')return path;throw Error('UNEXPECTED_IMPORT');}
 });
 return {acl:module.exports,calls};
}
function coordinatorHarness(){
 const calls=[],writes=[],module={exports:{}};
 const context={env:{},loc:{server:'C:\\Users\\VM User\\AppData\\Local\\CommunityTours\\Candidates026\\2e7-candidate-04\\server',client:'C:\\Users\\VM User\\AppData\\Local\\CommunityTours\\Candidates026\\2e7-candidate-04\\client'}};
 const source=fs.readFileSync(path.join(__dirname,'coordinator.cjs'),'utf8');
 vm.runInNewContext(source+'\ncontext=()=>injectedContext;',{module,injectedContext:context,__dirname,Buffer,process:{env:{}},setTimeout,clearTimeout,
  require(id){
   if(id==='node:fs')return {writeFileSync:()=>{writes.push('write');throw Error('UNEXPECTED_WRITE');},existsSync:()=>false};
   if(id==='node:child_process')return {execFileSync:(exe,args)=>{calls.push({exe,args});const error=Error('Script execution is disabled');error.stderr='PSSecurityException: cannot be loaded because running scripts is disabled';throw error;},spawn:()=>{throw Error('UNEXPECTED_PROCESS');},spawnSync:()=>{throw Error('UNEXPECTED_PROCESS');}};
   if(id==='./policy.cjs')return P;
   if(['./integrity.cjs','./state.cjs','./windowsProcess.js'].includes(id))return {};
   if(id.startsWith('.'))throw Error('UNEXPECTED_IMPORT');return require(id);
  }
 });
 return {C:module.exports,context,calls,writes};
}
test('Restricted simulado: la primera llamada rechazada es Verify-Payload.ps1 del servidor',async()=>{
 const h=coordinatorHarness();await assert.rejects(h.C.dispatch('verify',true),/POLICY_BLOCKED/);
 assert.equal(h.calls.length,1);assert.equal(path.basename(h.calls[0].exe).toLowerCase(),'powershell.exe');
 const args=h.calls[0].args;assert.ok(args.includes('-File'));assert.equal(args[args.indexOf('-File')+1],path.join(h.context.loc.server,'Verify-Payload.ps1'));
 assert.equal(args.at(-1),'server');assert.equal(h.writes.length,0);
});
test('el fallo de etapa 1 no crea estado privado ni registra una operación en curso',async()=>{
 const h=coordinatorHarness();for(let i=0;i<2;i++)await assert.rejects(h.C.dispatch('verify',true),/POLICY_BLOCKED/);
 assert.equal(h.writes.length,0);assert.equal(h.calls.length,2);
 assert.ok(h.calls.every(x=>!x.args.includes('-EncodedCommand')));
});
test('Node directo a mantenimiento conserva una dependencia interna de PowerShell para ACL',async()=>{
 const a=aclHarness(),calls=[],module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(packaged,'server/tools/maintenance.cjs'),'utf8'),{module,__dirname:path.join(packaged,'server/tools'),process:{argv:[],env:{}},
  require(id){
   if(id==='node:fs')return {realpathSync:x=>x,readFileSync:()=>{throw Error('READ_AFTER_REJECTED_ACL');}};
   if(id==='./payload.cjs')return {verify(){}};
   if(id.endsWith('enterprise026Provision.cjs'))return {environment:()=>({}),provision:()=>{calls.push('provision');throw Error('FORBIDDEN');}};
   if(id.endsWith('enterprise026Policy.js'))return {};
   if(id.endsWith('windowsConfigAcl.js'))return a.acl;
   if(id.startsWith('.'))throw Error('UNEXPECTED_IMPORT');return require(id);
  }
 });
 await assert.rejects(module.exports.main(['--isolated-lab','C:\\Users\\VM User\\AppData\\Local\\ctsk-setup026-test\\request-init.json']),/CONFIG_ACL/);
 assert.equal(calls.length,0);assert.equal(a.calls.length,1);assert.ok(a.calls[0].args.includes('-EncodedCommand'));
});
for(const profile of ['VMUser','VM User','VM Usuario Prueba',"María & O'Connor %PATH% !"]){
 test('cliente distribuido conserva ACL PowerShell aunque se lance directamente: '+profile,()=>{
  const a=aclHarness(),module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(packaged,'client/runtime/resources/app/electron/enterprise026ClientPolicy.js'),'utf8'),{module,__dirname:path.join(packaged,'client/runtime/resources/app/electron'),
   require(id){if(id==='node:fs')return {realpathSync:x=>x};if(id==='../shared/release026')return {fail:code=>{throw Error(code)}};if(id==='./windowsConfigAcl')return a.acl;if(id.startsWith('.'))throw Error('UNEXPECTED_IMPORT');return require(id);}
  });
  const file='C:\\Users\\'+profile+'\\AppData\\Local\\ctsk-client026-2e7-candidate-04\\client026.json';
  assert.throws(()=>module.exports.readClient(file,file.replace('client026.json','authority026.json')),/CONFIG_ACL/);
  assert.equal(a.calls.length,1);assert.equal(a.calls[0].input,file);
 });
}
test('lanzador de candidate-04 sigue requiriendo PowerShell aun sin archivos ps1',()=>{
 const module={exports:{}};let call;
 vm.runInNewContext(fs.readFileSync(path.join(packaged,'server/app/shared/windowsProcess.js'),'utf8'),{module,Buffer,process:{env:{SystemRoot:'C:\\Windows'}},require:id=>id==='node:path'?path:{execFileSync(){throw Error('UNEXPECTED_REAL_PROCESS');}}});
 assert.throws(()=>module.exports.runHidden('C:\\Program Files\\PostgreSQL\\18\\bin\\pg_ctl.exe',['start'],{run:(exe,args)=>{call={exe,args};throw Error('POWERSHELL_NOT_ALLOWED');}}),/POWERSHELL_NOT_ALLOWED/);
 assert.equal(path.basename(call.exe).toLowerCase(),'powershell.exe');assert.ok(call.args.includes('-EncodedCommand'));
});
class Element{constructor(){this.children=[];this.textContent='';this.checked=false;this.disabled=false;this.dataset={};this.classList={toggle(){}};}append(...v){this.children.push(...v);}querySelector(s){if(s==='button')return this.children.find(x=>x.tag==='button');return this.children[0].children.find(x=>x.className==='status');}}
test('interfaz deja pendiente la etapa 1 bloqueada y mantiene etapas posteriores deshabilitadas',async()=>{
 const ids=new Map(['steps','ack','result','result-title','result-body','refresh'].map(x=>[x,new Element()]));
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'ui/app.js'),'utf8'),{document:{getElementById:id=>ids.get(id),createElement:tag=>{const e=new Element();e.tag=tag;return e;}},window:{setup026:{run:async()=>({ok:false,error:{code:'POLICY_BLOCKED',message:'Se conserva la política.'}})}}});
 ids.get('ack').checked=true;ids.get('ack').onchange();await ids.get('steps').children[0].querySelector('button').onclick();
 assert.equal(ids.get('steps').children[0].dataset.status,'pending');assert.equal(ids.get('steps').children[0].querySelector('button').disabled,false);
 assert.ok(ids.get('steps').children.slice(1).every(li=>li.querySelector('button').disabled));assert.ok(ids.get('result-body').textContent.includes('POLICY_BLOCKED'));
});
test('Node dispone de verificador de payload equivalente sin ejecutar ps1',()=>{
 const H=require('../windows-installers/payload.cjs');for(const side of ['server','client'])assert.equal(H.verify(path.join(packaged,side),side).release,'2e7-candidate-04');
});
