'use strict';
// Solo corredor privado IPC. La herramienta normal nunca importa este archivo.
if(!process.send)throw Error('BOOTSTRAP_PROBE_PRIVATE_ONLY');
const {Client}=require('pg'),raw=Client.prototype.query,P=require('../backend/config/bootstrapPolicy'),B=require('../backend/config/standalonePolicy');
let faults=[],release,activeDb;const clients=new WeakMap();let serial=0;
process.once('disconnect',()=>{release?.();void activeDb?.end().catch(()=>{}).finally(()=>process.exit(1));});
Client.prototype.query=function(...args){const sql=String(typeof args[0]==='string'?args[0]:args[0]?.text||'').trim();
  const phase=/^INSERT INTO public\.usuarios\b/.test(sql)?'user':/^INSERT INTO public\.inicializacion_sistema\b/.test(sql)?'constance':/^COMMIT$/.test(sql)?'commit':null;
  if(sql==='SELECT pg_advisory_xact_lock($1::int,$2::int)')process.send?.({type:'waiting-for-lock'});
  return (async()=>{
    if(phase==='user'&&faults.includes('before-user'))await raw.call(this,'SELECT * FROM public.ctsk_private_bootstrap_failure');
    if(phase==='constance'&&faults.includes('constance')){args=[args[0],[...args[1]]];args[1][4]='invalid-tool-digest';}
    let proof;if(phase==='commit')proof=(await raw.call(this,'SELECT pg_current_xact_id()::text transaction,pg_backend_pid() pid')).rows[0];
    const result=await raw.apply(this,args);
    if(sql==='LOCK TABLE public.usuarios IN SHARE ROW EXCLUSIVE MODE'&&faults.includes('hold')){process.send?.({type:'held'});await new Promise(r=>release=r);}
    if(phase){proof??=(await raw.call(this,'SELECT pg_current_xact_id()::text transaction,pg_backend_pid() pid')).rows[0];if(!clients.has(this))clients.set(this,++serial);process.send?.({type:'sql-proof',phase,client:clients.get(this),...proof});}
    if(phase==='user'&&faults.includes('after-user'))throw Object.assign(Error('PRIVATE_AFTER_USER'),{code:'PRIVATE_AFTER_USER'});
    if(phase==='constance'&&faults.includes('after-constance'))throw Object.assign(Error('PRIVATE_AFTER_CONSTANCE'),{code:'PRIVATE_AFTER_CONSTANCE'});
    return result;
  })();
};
process.on('message',async message=>{
  if(message.type==='release'){release?.();return;}
  if(message.type!=='input')return;let db;
  try{
    const plan=P.readPlan(process.argv[2]);B.blockNetwork(plan.manifest.pgPort);faults=message.faults||[];
    const net=require('node:net'),connect=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...args){const value=Array.isArray(args[0])?args[0]:args,t=value[0];process.send?.({type:'connection',host:typeof t==='object'?t.host:value[1],port:Number(typeof t==='object'?t.port:t)});return connect.apply(this,args);};
    if(message.runtime){db=new Client({host:'127.0.0.1',port:plan.manifest.pgPort,database:plan.manifest.database,user:plan.manifest.runtime,password:message.runtimePassword,connectionTimeoutMillis:5000});await db.connect();}
    else db=await require('./bootstrapAdmin.cjs').connection(plan,message.sqlPassword);
    activeDb=db;
    message.sqlPassword=null;message.runtimePassword=null;
    const service=require('../backend/services/credentialBootstrap.service');let result;
    if(message.inspect)result=await service.inspect(db,plan,message.attempt);
    else result=await service.initialize(db,plan,message.input,message.attempt);
    if(faults.includes('lost-output'))process.send?.({type:'output-lost'});
    else process.send?.({type:'result',ok:true,result});
    await db.end();db=null;process.exit(0);
  }catch(e){process.send?.({type:'result',ok:false,code:e.code||'BOOTSTRAP_PROBE_FAILED'});await db?.end().catch(()=>{});process.exit(1);}
  finally{if(message.input){message.input.password=null;message.input.confirmacion=null;}}
});
process.send({type:'ready'});
