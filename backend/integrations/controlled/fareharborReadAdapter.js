'use strict';
// Sólo GET oficiales. Este adaptador experimental rechaza toda dirección externa.
const http=require('node:http'),Time=require('./activationTime');
const {uuid}=require('./sync024.service');
function create({origin,port,company,appKey,userKey}){
 if(origin!=='http://127.0.0.1:'+port||!Number.isInteger(port)||port<1024||port>65535||[3000,3443,5432].includes(port)||!/^synthetic-[a-f0-9]{12}$/.test(company)||!appKey||!userKey)throw Error('SIMULATED_PROVIDER_REQUIRED');
 let last=0;
 async function get(route){
  const wait=Math.max(0,125-(Date.now()-last));if(wait)await new Promise(r=>setTimeout(r,wait));last=Date.now();
  return new Promise((yes,no)=>{const req=http.get(origin+'/api/external/v1/companies/'+company+route,{headers:{Accept:'application/json','X-FareHarbor-API-App':appKey,'X-FareHarbor-API-User':userKey},timeout:5000},res=>{
   let bytes=0,body='';res.on('data',x=>{bytes+=x.length;if(bytes>2e6){res.destroy();no(Error('PROVIDER_RESPONSE_TOO_LARGE'));}else body+=x;});
   res.on('error',()=>no(Error('PROVIDER_NETWORK_ERROR')));res.on('end',()=>{if(res.statusCode!==200){const raw=res.headers['retry-after'],date=Date.parse(raw),seconds=/^\d+$/.test(raw||'')?Number(raw):Number.isFinite(date)?Math.ceil((date-Date.now())/1000):60;return no(Object.assign(Error(res.statusCode===403?'PROVIDER_FORBIDDEN':res.statusCode===429?'PROVIDER_RATE_LIMIT':'PROVIDER_UNAVAILABLE'),{retrySeconds:res.statusCode===429?Math.min(86400,Math.max(1,seconds)):0}));}try{yes(JSON.parse(body));}catch{no(Error('PROVIDER_RESPONSE_INVALID'));}});
  });req.on('timeout',()=>req.destroy());req.on('error',()=>no(Error('PROVIDER_NETWORK_ERROR')));});
 }
 async function list(day){Time.instant(day+'T00:00:00Z');const result=await get('/minimal/bookings-by-create-date/'+day+'/');if(!result||Object.keys(result).join()!=='bookings'||!Array.isArray(result.bookings)||result.bookings.length>5000||!result.bookings.every(b=>uuid(b.uuid)))throw Error('PROVIDER_WINDOW_UNVERIFIED');return [...new Set(result.bookings.map(b=>b.uuid.toLowerCase()))];}
 async function detail(id){if(!uuid(id))throw Error('PROVIDER_ID_INVALID');const result=await get('/bookings/'+id+'/');if(!result?.booking||result.booking.uuid?.toLowerCase()!==id.toLowerCase()||result.booking.company?.shortname!==company)throw Error('PROVIDER_ID_MISMATCH');return result.booking;}
 return {list,detail};
}
module.exports={create};
