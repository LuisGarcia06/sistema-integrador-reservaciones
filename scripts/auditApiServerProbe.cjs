'use strict';
// Instrumentacion SOLO del corredor privado IPC; auditApi.js normal no la importa.
const {Client}=require('pg'),original=Client.prototype.query,clients=new WeakMap();let serial=0,fault=null;
Client.prototype.query=function(...args){
    const sql=String(typeof args[0]==='string'?args[0]:args[0]?.text||'').trim();
    if(/^(SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT)\b/i.test(sql))return (async()=>{
        const result=await original.apply(this,args);
        const proof=(await original.call(this,'SELECT pg_current_xact_id()::text transaction,pg_backend_pid() pid')).rows[0];
        if(!clients.has(this))clients.set(this,++serial);
        process.send?.({type:'savepoint-proof',control:sql,client:clients.get(this),...proof});return result;
    })();
    const match=/^(INSERT\s+INTO|UPDATE)\s+(?:public\.)?(operaciones_tour|transportes_operacion|daily_observaciones|bitacora|comandos_idempotentes)\b/i.exec(sql);
    if(!match)return original.apply(this,args);
    return (async()=>{
        const phase=match[2]==='bitacora'?'audit':match[2]==='comandos_idempotentes'?'ledger':'business';
        if(fault===phase){fault=null;await original.call(this,'SELECT 1/0');}
        if(fault==='deferred'&&phase==='ledger'){args=[args[0],[...args[1]]];args[1][13]=[];fault=null;}
        const value=await original.apply(this,args);
        const proof=(await original.call(this,'SELECT pg_current_xact_id()::text transaction,pg_backend_pid() pid')).rows[0];
        if(!clients.has(this))clients.set(this,++serial);
        process.send?.({type:'sql-proof',phase,client:clients.get(this),...proof,...(phase==='ledger'?{key:args[1][2]}:{})});
        if(fault==='after-'+phase){fault=null;throw Error('PRIVATE_TEST_AFTER_'+phase.toUpperCase());}
        return value;
    })();
};
async function main(){
    const service=await require('../backend/auditApi').start(process.argv[2]);
    process.on('message',m=>{if(m.type==='arm'){fault=m.fault;process.send?.({type:'armed',id:m.id});}});
    service.server.prependListener('request',(_req,res)=>{const end=res.end;res.end=function(...args){
        if(fault==='lost'){
            let body;try{body=JSON.parse(String(args[0]));}catch{}
            if(body?.comando?.estado==='confirmado'){fault=null;process.send?.({type:'response-dropped',key:body.comando.clave});res.socket.destroy();return res;}
        }
        return end.apply(this,args);
    };});
    process.once('SIGTERM',()=>void service.close());process.once('SIGINT',()=>void service.close());
    console.log('AUDIT_API_PROBE_READY');
}
main().catch(e=>{console.error('AUDIT_API_PROBE_FAILED '+(e.code||e.message));process.exitCode=1;});
