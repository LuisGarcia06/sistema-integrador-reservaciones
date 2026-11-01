'use strict';
const cp=require('node:child_process'),path=require('node:path'),crypto=require('node:crypto');
async function start(plan,admin,{probe=false,onEvent=()=>{}}={}){
 const env=require('../backend/config/desktopPolicy').cleanEnvironment();delete env.ELECTRON_RUN_AS_NODE;
 const child=cp.spawn(process.execPath,[path.join(__dirname,probe?'preproductionProbe.cjs':'../backend/preproductionApi.js'),plan.filename],{env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});let output='';const pending=new Map();child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);const ended=new Promise(r=>child.once('exit',code=>r(code)));
 child.on('message',async m=>{onEvent(m);if(m.type==='preproduction-challenge'){try{child.send({type:'preproduction-attestation',proof:await require('./preproductionSetup.cjs').attest(admin,plan,m.nonce)});}catch(e){output+='\nLOCAL_VERIFICATION '+(e.code||e.message);if(child.connected)child.send({type:'preproduction-attestation'});}}else if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}});
 const close=async()=>{if(child.exitCode===null){child.kill();await ended;}};
 try{await new Promise((yes,no)=>{const timer=setTimeout(()=>no(Error('PREPRODUCTION_SERVER_TIMEOUT')),90000);child.stdout.on('data',()=>{if(output.includes(probe?'UNIFIED_PROBE_READY':'PREPRODUCTION_READY')){clearTimeout(timer);yes();}});ended.then(()=>{clearTimeout(timer);no(Object.assign(Error('PREPRODUCTION_SERVER_REJECTED'),{diagnostic:output}));});});return {child,close,get output(){return output;},request(m){return new Promise((yes,no)=>{const id=crypto.randomUUID(),timer=setTimeout(()=>no(Error('PRIVATE_RPC_TIMEOUT')),10000);pending.set(id,v=>{clearTimeout(timer);yes(v);});child.send({...m,id});});}};}catch(e){await close();throw e;}
}
module.exports={start};
