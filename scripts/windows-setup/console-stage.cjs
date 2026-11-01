'use strict';
// Consola Node propia: la contraseña solo transita por el terminal seguro en memoria.
const fs=require('node:fs'),path=require('node:path');
async function main(jobFile){
 const C=require('./coordinator.cjs'),c=C.context(),job=C.validateJob(c,jobFile);
 let exitCode=1;
 try{
  if(job.action==='bootstrap'){
   // El hijo detached dispone de consola propia; no leer de pipes/archivos.
   const tty=require('node:tty');
   const input=new tty.ReadStream(fs.openSync('CONIN$','r'));let output;
   try{output=new tty.WriteStream(fs.openSync('CONOUT$','w'));}catch(error){input.destroy();throw error;}
   try{await require(path.join(job.server,'tools/maintenance.cjs')).main(['--isolated-lab',job.request],{input,output,signal:AbortSignal.timeout(25*60000)});exitCode=0;}finally{input.destroy();output.destroy();}
  }else if(job.action==='server'){
   await require(path.join(job.server,'tools/server-control.cjs')).run(['run',job.plan,job.authority]);exitCode=0;
  }else throw Error('SESSION_REJECTED');
 }finally{
  const fd=fs.openSync(job.receipt,'wx');try{fs.writeFileSync(fd,JSON.stringify({jobId:job.jobId,action:job.action,exitCode}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}c.acl(job.receipt);
 }
}
if(require.main===module)main(process.argv[2]).catch(()=>{console.error('CONSOLE_STAGE_REVIEW_REQUIRED');process.exitCode=1;});
module.exports={main};
