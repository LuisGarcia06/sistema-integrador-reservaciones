'use strict';
const fs=require('node:fs'),path=require('node:path');
const P=require('./policy.cjs'),S=require('./state.cjs'),R=require('./readiness.cjs'),G=require('./native-gate.cjs'),N=require('./native-readiness.cjs');
const ROOT=path.resolve(__dirname,'../..');
function context(){
 const report=R.inspect(ROOT);G.requireComponent(ROOT,'reader');
 if(!report.nativeReadCompleted)P.fail('NATIVE_SECURITY_REQUIRED');
 const c=R.contextOf(report);
 c.acl=file=>{const checked=N.inspectPaths(c.reader,c.loc,c.env,[{path:file,policy:'private-file'}]);if(checked.machine.sid!==c.machine.sid||checked.machine.uuid!==c.machine.uuid)P.fail('CONFIG_ACL');if(checked.paths[0].status==='missing')P.fail('CONFIG_MISSING');if(checked.paths[0].status!=='safe')P.fail('CONFIG_ACL');};
 return c;
}
function validateJob(c,file){return require('./operations.cjs').validateJob(c,file);}
async function dispatch(action,ack=false){
 if(action==='verify'){if(ack!==true)P.fail('SESSION_REJECTED');return R.inspect(ROOT);}
 if(!['status',...P.STEPS].includes(action))P.fail('UNKNOWN_ACTION');
 let c;
 if(action==='status'){
  const report=R.inspect(ROOT);
  if(!report.readerValidated)return {...report,steps:Array(8).fill('pending'),stateNotRead:true,release:P.RELEASE};
  c=context();
  if(!fs.existsSync(c.loc.session))return {...report,steps:Array(8).fill('pending'),release:P.RELEASE};
  const state=S.read(c.loc,c.machine,c.acl);return {...report,steps:state.steps.map(x=>x==='running'?'review':x),release:P.RELEASE,lastError:state.lastError};
 }
 if(ack!==true)P.fail('SESSION_REJECTED');
 c=context();
 if(action==='directories'){
  const native=require('./native-directories.cjs').create(c);
  const state={protocol:'ctsk-setup026-v1',release:P.RELEASE,scope:P.SCOPE,productionAuthorized:false,uuid:c.machine.uuid,sid:c.machine.sid,session:c.loc.session,clientData:c.loc.clientData,serverData:native.serverData,nativeDirectories:native,steps:['done','done','pending','pending','pending','pending','pending','pending']};
  const file=path.join(c.loc.session,'state.json');S.atomic(file,state);c.acl(file);return {directories:true,steps:state.steps};
 }
 const state=S.read(c.loc,c.machine,c.acl),unlock=S.lock(c.loc.session);
 try{return await S.perform(state,action,value=>{const file=path.join(c.loc.session,'state.json');S.atomic(file,value);c.acl(file);},()=>require('./operations.cjs').execute(c,state,action));}finally{unlock();}
}
module.exports={dispatch,context,validateJob};
