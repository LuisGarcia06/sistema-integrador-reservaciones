'use strict';
// Solo lector: ningún comando de escritura, shell, PostgreSQL o privilegio nuevo.
const cp=require('node:child_process'),path=require('node:path'),P=require('./policy.cjs');
const PROTOCOL='ctsk-setup-acl-read-v1';
const expectedKeys=['protocol','scope','productionAuthorized','complete','code','platform','arch','release','manufacturer','model','uuid','sid','localAppData','paths','firstTokenVerified','containmentVerified'];
function pathsFor(loc){return [
 {path:path.join(loc.server,'runtime/node.exe'),policy:'program-file'},
 {path:path.join(loc.client,'runtime/electron.exe'),policy:'program-file'},
 {path:loc.clientData,policy:'private-directory'},
 {path:path.join(loc.clientData,'client026.json'),policy:'private-file'},
 {path:path.join(loc.clientData,'authority026.json'),policy:'private-file'},
 {path:path.join(loc.session,'state.json'),policy:'private-file'}
];}
function inspect(executable,loc,env,{run=cp.spawnSync}={}){
 const paths=pathsFor(loc);
 const result=run(executable,['--inspect'],{input:JSON.stringify({protocol:PROTOCOL,paths}),encoding:'utf8',env,windowsHide:true,shell:false,timeout:30000,maxBuffer:65536});
 if(!result||result.status!==0||result.error!=null||result.signal!=null||typeof result.stdout!=='string'||String(result.stderr||'').trim()){
  const error=Error('NATIVE_READ_FAILED');
  try{const v=JSON.parse(result.stdout);if(v.complete===false&&['WINDOWS11_X64_REQUIRED','VIRTUALBOX_REQUIRED','MACHINE_INCOMPLETE','MACHINE_UUID','PATH_INVALID','PATH_TYPE','ACL_REPARSE_POINT','ACL_OWNER','ACL_EMPTY_OR_NULL','ACL_UNTRUSTED_ACCESS','READ_FAILED'].includes(v.code))error.nativeCode=v.code;}catch{}
  throw error;
 }
 let value;try{value=JSON.parse(result.stdout);}catch{throw Error('NATIVE_READ_FAILED');}
 if(!value||Object.keys(value).length!==expectedKeys.length||expectedKeys.some(k=>!Object.hasOwn(value,k))||value.protocol!==PROTOCOL||value.scope!==P.SCOPE||value.productionAuthorized!==false||value.complete!==true||value.code!=='READ_COMPLETE'||value.firstTokenVerified!==false||value.containmentVerified!==false)throw Error('NATIVE_READ_FAILED');
 const machine=P.guardMachine(value);
 if(typeof value.localAppData!=='string'||path.resolve(value.localAppData).toLowerCase()!==path.resolve(loc.local).toLowerCase()||!Array.isArray(value.paths)||value.paths.length!==paths.length)throw Error('NATIVE_READ_FAILED');
 value.paths.forEach((observed,i)=>{
  const expected=paths[i];
  if(!observed||Object.keys(observed).sort().join(',')!=='path,policy,status'||observed.path!==expected.path||observed.policy!==expected.policy||!['safe','missing'].includes(observed.status)||(i<2&&observed.status!=='safe'))throw Error('NATIVE_READ_FAILED');
 });
 return {machine,paths:value.paths};
}
function configurationStatus(report){
 const values=report.paths,folder=values[2].status,descriptor=values[3].status,authority=values[4].status;
 if(folder==='missing'&&(descriptor!=='missing'||authority!=='missing'))throw Error('NATIVE_READ_FAILED');
 return {directory:folder==='missing'?'missing':'acl-checked',descriptor:descriptor==='missing'?'missing':'present-acl-checked',authority:authority==='missing'?'missing':'present-acl-checked',
  enrollmentValidated:false,state:folder==='missing'?'not-prepared':descriptor==='missing'&&authority==='missing'?'not-enrolled':descriptor==='missing'||authority==='missing'?'incomplete-review-required':'signature-validation-required',
  directoryStage:2,descriptorStage:6};
}
module.exports={inspect,configurationStatus,pathsFor,PROTOCOL};
