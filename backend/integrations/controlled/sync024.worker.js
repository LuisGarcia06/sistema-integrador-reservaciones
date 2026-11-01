'use strict';
// call es canal privado al backend; ninguna contraseña SQL sale hacia el worker.
async function cycle({adapter,call,until,stopAfter=Infinity}){
 const state=await call('begin',{provider:'fareharbor',until});if(!state.run)return state;
 const p={provider:'fareharbor',run:state.run};let processed=0;
 try{
  for(const id of state.links){const result=await call('snapshot',{...p,raw:await adapter.detail(id),linked:true});if(!result.settled)throw Error(result.code||'RECONCILIATION_REQUIRES_REVIEW');}
  const cut=new Date(state.cut),cursor=new Date(state.cursor||state.cut),last=new Date(until);
  let date=new Date(Math.max(Date.UTC(cut.getUTCFullYear(),cut.getUTCMonth(),cut.getUTCDate()),Date.UTC(cursor.getUTCFullYear(),cursor.getUTCMonth(),cursor.getUTCDate())-86400000));
  async function work(day,end,retained=[]){const ids=[...new Set([...retained,...await adapter.list(day)])],accepted=await call('window',{...p,day,through:end,ids});
   for(const id of accepted?.ids||ids){const result=await call('snapshot',{...p,raw:await adapter.detail(id)});if(!result.settled)throw Error(result.code||'WINDOW_REQUIRES_REVIEW');if(++processed>=stopAfter)return true;}
   await call('complete',p);return false;
  }
  let resumed;
  if(state.pending){const day=state.pending.day,end=new Date(Math.min(new Date(day+'T00:00:00Z').getTime()+86400000,last.getTime())).toISOString();if(await work(day,end,state.pending.ids))return {interrupted:true,run:state.run};resumed={day,end};}
  while(date<last){const day=date.toISOString().slice(0,10),end=new Date(Math.min(date.getTime()+86400000,last.getTime())).toISOString();
   if(!(resumed?.day===day&&end<=resumed.end)&&await work(day,end))return {interrupted:true,run:state.run};date=new Date(date.getTime()+86400000);
  }
  return await call('finish',p);
 }catch(e){await call('fail',{...p,code:/^[A-Z0-9_]{1,100}$/.test(e.message)?e.message:'PROVIDER_UNAVAILABLE',retrySeconds:e.retrySeconds||0});return {failed:true,code:e.message};}
}
module.exports={cycle};
