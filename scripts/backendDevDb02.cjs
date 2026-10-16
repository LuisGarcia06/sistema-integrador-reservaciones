// Backend DEV-DB-02: proceso hijo propio con confirmacion privada por IPC.
const g=require('./devDb02.cjs'),crypto=require('node:crypto');
let pool,server,closing=false;
async function close(){if(closing)return;closing=true;if(server)await new Promise(r=>server.close(r));if(pool)await pool.end();process.exit(0);}
async function main(){
 const nonce=process.env.APP_DEV_BACKEND_NONCE;
 if(process.env.APP_DEV_DB02!=='1'||process.env.APP_CONFIG_PATH!==g.CONFIG||!process.send||!process.connected||!/^[a-f0-9]{64}$/.test(nonce||''))g.fail('DEV_PRIVATE_PARENT_REQUIRED');
 const cfg=g.readConfig(),credentials={username:process.env.DB_USER,password:process.env.DB_PASSWORD};
 process.env=g.cleanEnvironment(cfg,credentials);process.env.APP_DEV_BACKEND_NONCE=nonce;
 process.once('disconnect',close);process.once('SIGTERM',close);process.once('SIGINT',close);
 g.blockProviderNetwork();
 pool=require('../backend/config/database');pool.options.connectionTimeoutMillis=5000;
 const db=await pool.connect();
 try{await db.query('BEGIN READ ONLY');await g.verifyIdentity(db,{username:credentials.username});await g.rejectPrivilegedRole(db);await g.verifySchema(db);await db.query('ROLLBACK');}
 catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
 if(closing||!process.connected)g.fail('DEV_PARENT_DISCONNECTED');
 const express=require('express'),app=express();
 app.use((req,res,next)=>/^\/api\/(?:eventos-integracion|webhooks|integraciones)(?:\/|$)/.test(req.path)?res.status(503).json({mensaje:'Integraciones deshabilitadas en desarrollo'}):next());
 // Importar no ejecuta server.js como main: ningun worker es iniciado.
 app.use(require('../backend/server'));
 await new Promise((resolve,reject)=>{server=app.listen({host:'127.0.0.1',port:3000,exclusive:true},resolve);server.once('error',()=>reject(Object.assign(new Error('DEV_PORT_UNAVAILABLE'),{code:'DEV_PORT_UNAVAILABLE'})));});
 if(!process.connected)g.fail('DEV_PARENT_DISCONNECTED');
 process.send({type:'dev-ready',nonce});
}
if(require.main===module)main().catch(async e=>{
 const nonce=process.env.APP_DEV_BACKEND_NONCE;
 if(process.connected)process.send({type:'dev-error',nonce,code:/^DEV_[A-Z0-9_]+$/.test(e.code||'')?e.code:'DEV_DATABASE_OR_START_FAILED'});
 console.error('DEV-DB-02 backend detenido:',/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'DEV_START_FAILED');
 if(server)server.close();if(pool)await pool.end().catch(()=>{});process.exit(1);
});
module.exports={main};

