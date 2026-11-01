'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const P=require('./policy.cjs');
function atomic(file,value){const temp=file+'.'+crypto.randomUUID()+'.tmp';const fd=fs.openSync(temp,'wx');try{fs.writeFileSync(fd,JSON.stringify(value,null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,file);}
function read(loc,m,acl){const file=path.join(loc.session,'state.json');acl(file);return P.validateState(JSON.parse(fs.readFileSync(file)),loc,m);}
async function perform(state,action,save,execute){const i=P.canRun(state,action);state.steps[i]='running';save(state);try{const result=await execute();state.steps[i]='done';state.lastError=null;save(state);return result;}catch(e){state.steps[i]='review';state.lastError=P.publicError(e).code;save(state);throw e;}}
function lock(directory){const file=path.join(directory,'operation.lock'),id=crypto.randomUUID();let fd;try{fd=fs.openSync(file,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid,id}));fs.closeSync(fd);}catch{P.fail('BUSY');}return()=>{const own=JSON.parse(fs.readFileSync(file));if(own.id!==id)P.fail('BUSY');fs.unlinkSync(file);};}
module.exports={atomic,read,perform,lock};
