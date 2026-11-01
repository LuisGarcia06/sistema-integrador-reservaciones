'use strict';
// Worker de laboratorio con HTTP loopback y RPC heredado. No pg ni secretos SQL.
const crypto=require('node:crypto'),net=require('node:net');const pending=new Map();
process.on('message',m=>{if(m.type==='worker-reply'){const pair=pending.get(m.id);if(pair){pending.delete(m.id);pair(m);}}});
process.once('message',async input=>{if(input.type!=='worker-input')return;try{
 process.env=require('../backend/config/desktopPolicy').cleanEnvironment();delete process.env.ELECTRON_RUN_AS_NODE;
 const connect=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...args){const a=Array.isArray(args[0])?args[0]:args,t=a[0],host=typeof t==='object'?t.host:a[1],port=Number(typeof t==='object'?t.port:t);if(host!=='127.0.0.1'||port!==input.config.port)throw Error('WORKER_NETWORK_BLOCKED');return connect.apply(this,args);};
 const adapter=require('../backend/integrations/controlled/fareharborReadAdapter').create(input.config);
 function call(action,payload){return new Promise((yes,no)=>{const id=crypto.randomUUID(),timer=setTimeout(()=>{pending.delete(id);no(Error('WORKER_RPC_TIMEOUT'));},20000);pending.set(id,m=>{clearTimeout(timer);m.ok?yes(m.result):no(Object.assign(Error(m.code),{code:m.code}));});process.send({type:'worker-call',id,action,payload});});}
 const result=await require('../backend/integrations/controlled/sync024.worker').cycle({adapter,call,until:input.until,stopAfter:input.stopAfter});process.send({type:'worker-result',result},()=>process.exit(0));
 }catch(e){process.send({type:'worker-result',result:{failed:true,code:e.code||e.message}},()=>process.exit(1));}});
