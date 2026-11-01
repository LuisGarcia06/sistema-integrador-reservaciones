'use strict';
// Instrumentacion privada IPC. La entrada normal nunca importa este archivo.
const {Client}=require('pg'),original=Client.prototype.query,net=require('node:net'),connect=net.Socket.prototype.connect;
const bcrypt=require('bcryptjs'),compare=bcrypt.compare;let fault=null,release,milestone='A',serial=0;const clients=new WeakMap();
net.Socket.prototype.connect=function(...args){const v=Array.isArray(args[0])?args[0]:args,t=v[0];process.send?.({type:'connection',host:typeof t==='object'?t.host:v[1],port:Number(typeof t==='object'?t.port:t)});return connect.apply(this,args);};
Client.prototype.query=function(...args){const sql=String(typeof args[0]==='string'?args[0]:args[0]?.text||'').trim();
    if(milestone!=='B'&&(/^INSERT\s+INTO\s+(?:public\.)?usuarios\b/i.test(sql)||/^UPDATE\s+(?:public\.)?usuarios\b[\s\S]*\bpassword\b/i.test(sql))){
        process.send?.({type:'forbidden-stage-a-write'});throw Error('HITO_B_NO_HABILITADO');
    }
    if(milestone!=='B')return original.apply(this,args);
    if(/^(SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT)\b/i.test(sql))return (async()=>{
        const result=await original.apply(this,args),proof=(await original.call(this,'SELECT pg_current_xact_id()::text transaction,pg_backend_pid() pid')).rows[0];
        if(!clients.has(this))clients.set(this,++serial);process.send?.({type:'savepoint-proof',control:sql,client:clients.get(this),...proof});return result;
    })();
    const match=/^(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?(usuarios|usuario_plataformas_visibles|bitacora|comandos_idempotentes)\b/i.exec(sql);
    if(!match)return original.apply(this,args);
    return (async()=>{
        const phase=match[2]==='bitacora'?'audit':match[2]==='comandos_idempotentes'?'ledger':match[2]==='usuario_plataformas_visibles'?'assignments':'business';
        if(fault===phase||fault==='assignment-insert'&&phase==='assignments'&&/^INSERT/i.test(sql)){
            fault=null;process.send?.({type:'fault-injected',phase,table:match[2],operation:match[1]});await original.call(this,'SELECT * FROM public.ctsk_private_test_fault_023');
        }
        if(fault==='deferred'&&phase==='ledger'){args=[args[0],[...args[1]]];args[1][13]=[];fault=null;process.send?.({type:'fault-injected',phase:'deferred'});}
        const result=await original.apply(this,args),proof=(await original.call(this,'SELECT pg_current_xact_id()::text transaction,pg_backend_pid() pid')).rows[0];
        if(!clients.has(this))clients.set(this,++serial);process.send?.({type:'sql-proof',phase,table:match[2],operation:match[1],client:clients.get(this),...proof,...(phase==='ledger'?{key:args[1][2]}:{})});
        if(fault==='after-'+phase){fault=null;process.send?.({type:'fault-injected',phase:'after-'+phase});throw Error('PRIVATE_TEST_AFTER_WRITE');}
        return result;
    })();
};
bcrypt.compare=async function(...args){const result=await compare.apply(this,args);if(fault==='login-compare'){fault=null;process.send?.({type:'compare-held'});await new Promise(r=>{release=r;});}return result;};
async function main(){
    const service=await require('../backend/credentialSecurityApi').start(process.argv[2]);
    milestone=service.plan.manifest.milestone;
    service.server.prependListener('request',(_req,res)=>{const end=res.end;res.end=function(...args){
        if(fault==='lost'){let body;try{body=JSON.parse(String(args[0]));}catch{}
            if(body?.comando?.estado==='confirmado'){fault=null;process.send?.({type:'response-dropped',key:body.comando.clave});res.socket.destroy();return res;}}
        return end.apply(this,args);
    };});
    process.on('message',async m=>{
        if(m.type==='arm'){fault=m.fault;process.send?.({type:'armed',id:m.id});}
        if(m.type==='release'){release?.();release=null;}
        if(m.type==='recent'){
            try{const verified=await require('../backend/services/credentialAuth.service').get().authenticate(m.token);require('../backend/security/credentialPolicy').recent(verified.auth);process.send?.({type:'recent-result',id:m.id,status:200});}
            catch(e){process.send?.({type:'recent-result',id:m.id,status:e.statusCode||500});}
        }
    });
    process.once('SIGTERM',()=>void service.close());process.once('SIGINT',()=>void service.close());process.once('disconnect',()=>void service.close());
    console.log('CREDENTIAL_SECURITY_PROBE_READY');
}
main().catch(e=>{console.error('CREDENTIAL_SECURITY_PROBE_FAILED '+(e.code||'STARTUP'));process.exitCode=1;});
