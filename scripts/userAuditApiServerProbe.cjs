'use strict';
// Instrumentacion SOLO del corredor privado IPC; userAuditApi.js normal no la importa.
const {Client}=require('pg'),original=Client.prototype.query,clients=new WeakMap();let serial=0,fault=null;
const net=require('node:net'),originalConnect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){const v=Array.isArray(args[0])?args[0]:args,t=v[0];process.send?.({type:'connection',host:typeof t==='object'?t.host:v[1],port:Number(typeof t==='object'?t.port:t)});return originalConnect.apply(this,args);};
Client.prototype.query=function(...args){
    const sql=String(typeof args[0]==='string'?args[0]:args[0]?.text||'').trim();
    if(/^INSERT\s+INTO\s+(?:public\.)?usuarios\b/i.test(sql)||/^UPDATE\s+(?:public\.)?usuarios\b[\s\S]*\bpassword\b/i.test(sql)){
        process.send?.({type:'forbidden-user-write'});
        throw Error('PRIVATE_TEST_FORBIDDEN_USER_WRITE');
    }
    if(/^(SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT)\b/i.test(sql))return (async()=>{
        const result=await original.apply(this,args);
        const proof=(await original.call(this,'SELECT pg_current_xact_id()::text transaction,pg_backend_pid() pid')).rows[0];
        if(!clients.has(this))clients.set(this,++serial);
        process.send?.({type:'savepoint-proof',control:sql,client:clients.get(this),...proof});return result;
    })();
    const match=/^(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?(usuarios|usuario_plataformas_visibles|bitacora|comandos_idempotentes)\b/i.exec(sql);
    if(!match)return original.apply(this,args);
    return (async()=>{
        const phase=match[2]==='bitacora'?'audit':match[2]==='comandos_idempotentes'?'ledger':match[2]==='usuario_plataformas_visibles'?'assignments':'business';
        if(fault==='assignment-data-error'&&phase==='assignments'&&/^INSERT/i.test(sql)){fault=null;process.send?.({type:'fault-injected',phase,table:match[2],operation:match[1],code:'22012'});await original.call(this,'SELECT 1/0');}
        if(fault==='assignment-insert'&&phase==='assignments'&&/^INSERT/i.test(sql)){fault=null;process.send?.({type:'fault-injected',phase,table:match[2],operation:match[1]});await original.call(this,'SELECT * FROM public.ctsk_private_test_fault_022');}
        if(fault===phase){fault=null;process.send?.({type:'fault-injected',phase,table:match[2],operation:match[1]});await original.call(this,'SELECT * FROM public.ctsk_private_test_fault_022');}
        if(fault==='deferred'&&phase==='ledger'){args=[args[0],[...args[1]]];args[1][13]=[];fault=null;}
        const value=await original.apply(this,args);
        const proof=(await original.call(this,'SELECT pg_current_xact_id()::text transaction,pg_backend_pid() pid')).rows[0];
        if(!clients.has(this))clients.set(this,++serial);
        process.send?.({type:'sql-proof',phase,table:match[2],operation:match[1],client:clients.get(this),...proof,...(phase==='ledger'?{key:args[1][2]}:{})});
        if(fault==='after-'+phase){fault=null;throw Error('PRIVATE_TEST_AFTER_'+phase.toUpperCase());}
        return value;
    })();
};
async function main(){
    const service=await require('../backend/userAuditApi').start(process.argv[2]);
    process.on('message',m=>{if(m.type==='arm'){fault=m.fault;process.send?.({type:'armed',id:m.id});}});
    service.server.prependListener('request',(_req,res)=>{const end=res.end;res.end=function(...args){
        if(fault==='lost'){
            let body;try{body=JSON.parse(String(args[0]));}catch{}
            if(body?.comando?.estado==='confirmado'){fault=null;process.send?.({type:'response-dropped',key:body.comando.clave});res.socket.destroy();return res;}
        }
        return end.apply(this,args);
    };});
    process.once('SIGTERM',()=>void service.close());process.once('SIGINT',()=>void service.close());
    process.once('disconnect',()=>void service.close());
    console.log('USER_AUDIT_API_PROBE_READY');
}
main().catch(e=>{console.error('USER_AUDIT_API_PROBE_FAILED '+(e.code||e.message));process.exitCode=1;});
