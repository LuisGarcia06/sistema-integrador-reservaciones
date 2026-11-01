'use strict';
function create(pool,plan){
 const S=require('../integrations/controlled/sync024.service').create({pool,plan}),P=require('../config/integration024Policy');
 const send=(res,r)=>res.status(r.status).json({...r.body,replayed:!!r.replayed});
 const handle=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){if(!e.statusCode)console.error('SYNC024_UNAVAILABLE '+(e.code||(/^[A-Z0-9_]+$/.test(e.message)?e.message:'INTERNAL'))+' '+e.stack?.split('\n').filter(x=>/^\s+at /.test(x)).slice(0,2).join(' '));res.status(e.statusCode||503).json({codigo:e.statusCode?e.code:'SYNC_UNAVAILABLE'});}};
 const status=handle(async(req,res)=>res.json({datos:await S.status()}));
 const recover=handle(async(req,res)=>send(res,await S.recover(req.credentialAuth,req.params.clave)));
 const control=handle(async(req,res)=>{
  if(!P.allowHttp(req.method,req.originalUrl)||req.headers['x-ctsk-sync']!==P.C.PROTOCOL||req.headers['x-ctsk-data-generation']!==plan.manifest.dataGeneration)return res.status(400).json({codigo:'CLIENTE_SYNC_INCOMPATIBLE'});
  return send(res,await S.controls(req.credentialAuth,req.params.provider,req.params.action==='activar'?'activate':'enabled',req.body,req.headers['idempotency-key']));
 });
 return {status,recover,control};
}
module.exports={create};
