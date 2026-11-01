'use strict';
// Canal heredado del supervisor de laboratorio; no hay rutas de worker públicas.
require('./unifiedProbe.cjs');
let fault=null,dropSnapshot=null,dropControl=false;
require('../backend/preproductionApi').start(process.argv[2]).then(service=>{
 const sync=require('../backend/integrations/controlled/sync024.service').create({pool:service.pool,plan:service.plan,fault(phase){if(fault===phase){fault=null;throw Error('SYNTHETIC_TRANSACTION_FAILURE');}}});
 process.on('message',async m=>{if(m.type!=='integration024-private'||!m.id)return;try{const p=m.payload||{};let result;
  if(m.action==='begin')result=await sync.begin(p.provider,p.until);
  else if(m.action==='window')result=await sync.window(p.provider,p.run,p.day,p.through,p.ids);
  else if(m.action==='snapshot')result=await sync.snapshot(p.provider,p.run,p.raw,{linked:!!p.linked});
  else if(m.action==='complete')result=await sync.complete(p.provider,p.run);
  else if(m.action==='finish')result=await sync.finish(p.provider,p.run);
  else if(m.action==='fail')result=await sync.fail(p.provider,p.run,p.code,p.retrySeconds);
  else if(m.action==='fault'){if(p.phase==='lose-snapshot')dropSnapshot=p.bookingId||'*';else if(p.phase==='lose-control')dropControl=true;else fault=p.phase;result={armed:true};}
  else throw Error('PRIVATE_ACTION_INVALID');
  if(m.action==='snapshot'&&dropSnapshot&&(dropSnapshot==='*'||p.raw?.uuid===dropSnapshot)){dropSnapshot=null;process.send({type:'integration-response-lost',id:m.id});return;}
  if(process.connected)process.send({id:m.id,type:'integration024-result',ok:true,result});
 }catch(e){if(process.connected)process.send({id:m.id,type:'integration024-result',ok:false,code:e.code||e.message,status:e.statusCode||503});}});
 service.server.prependListener('request',(req,res)=>{if(!dropControl||req.method!=='POST'||!req.url.startsWith('/api/sincronizacion/'))return;const end=res.end;res.end=function(...args){if(dropControl&&res.statusCode===200){dropControl=false;res.socket.destroy();return res;}return end.apply(this,args);};});
 process.once('SIGTERM',()=>void service.close());console.log('INTEGRATION024_READY');
}).catch(e=>{console.error('INTEGRATION024_REJECTED '+(e.code||e.message));process.exitCode=1;});
