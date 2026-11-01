'use strict';
const crypto=require('node:crypto'),B=require('../backend/config/standalonePolicy'),P=require('../backend/config/unifiedPolicy');
async function connect({manifestPath,root,onUnavailable=()=>{},onReady=()=>{},onRestart=()=>{}}){
 if(!process.send)throw Error('UNIFIED_PRIVATE_PARENT_REQUIRED');const plan=P.readPlan(manifestPath,root);if(plan.manifest.activation!=='electron-original')throw Error('UNIFIED_FRONTEND_GATE_REQUIRED');
 let stopped=false,timer,pid,available=false,announced=false;const pending=new Map();
 const receive=m=>{if(m?.type!=='ctsk-backend-proof'||!pending.has(m.id))return;pending.get(m.id)(m);pending.delete(m.id);};process.on('message',receive);
 async function verify(){const nonce=crypto.randomBytes(32).toString('hex'),id=crypto.randomUUID(),response=await new Promise((yes,no)=>{const timeout=setTimeout(()=>{pending.delete(id);no(Error('UNIFIED_BACKEND_UNAVAILABLE'));},8000);pending.set(id,m=>{clearTimeout(timeout);m.response?yes(m.response):no(Error('UNIFIED_BACKEND_UNAVAILABLE'));});process.send({type:'ctsk-backend-challenge',id,nonce});});B.verifyProof(plan.key,nonce,response,B.publicIdentity(plan,0));const restarted=pid&&pid!==response.identity.pid;pid=response.identity.pid;if(restarted)onRestart();if(!available||restarted){available=true;onReady();}if(restarted||!announced){announced=true;process.send({type:'ctsk-client-state',status:'ready',pid,manifest:plan.digest});}}
 await verify();function schedule(){timer=setTimeout(async()=>{if(stopped)return;try{await verify();}catch{if(available){available=false;onUnavailable();}}if(!stopped)schedule();},3000);timer.unref?.();}schedule();
 return {origin:'http://127.0.0.1:'+plan.manifest.httpPort,port:plan.manifest.httpPort,stop(){stopped=true;clearTimeout(timer);process.off('message',receive);pending.clear();}};
}
module.exports={connect};
