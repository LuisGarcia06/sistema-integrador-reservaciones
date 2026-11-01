'use strict';
const http=require('node:http'),crypto=require('node:crypto'),P=require('./preproductionClientPolicy');
async function connect({config,onUnavailable,onReady}){
 let stopped=false,timer,instance,up=false;
 async function verify(){
  const nonce=crypto.randomBytes(32).toString('hex');
  const proof=await new Promise((yes,no)=>{
   const req=http.get(config.origin+'/api/installation?nonce='+nonce,{agent:false,timeout:1800},res=>{
    let text='';res.on('data',chunk=>{text+=chunk;if(text.length>12000)req.destroy(Error('IDENTITY_SIZE'));});
    res.on('end',()=>{try{res.statusCode===200?yes(JSON.parse(text)):no(Error('IDENTITY'));}catch{no(Error('IDENTITY'));}});
   });
   req.on('error',no);req.on('timeout',()=>req.destroy(Error('TIMEOUT')));
  });
  const next=P.verify(config,nonce,proof);if(instance&&instance!==next)await onUnavailable();instance=next;up=true;await onReady();
 }
 await verify();
 function poll(){timer=setTimeout(async()=>{if(stopped)return;try{await verify();}catch{if(up){up=false;await onUnavailable();}}if(!stopped)poll();},1200);timer.unref();}
 poll();return {origin:config.origin,port:Number(new URL(config.origin).port),stop(){stopped=true;clearTimeout(timer);}};
}
module.exports={connect};
