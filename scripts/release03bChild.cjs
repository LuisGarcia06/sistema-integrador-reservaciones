// Entrada explícita de laboratorio; nunca importada por npm run desktop.
const L=require('./release03bSafety.cjs'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
if(process.argv[2]!=='--release03b-child')L.fail('R03B_EXPLICIT_ENTRY_REQUIRED');
const m=L.readManifest(process.argv[3]),scenario=process.argv[4]||'valid';L.barrier(m);
let server;const send=process.send.bind(process);
process.send=(message,cb)=>{
 const out={...message,laboratoryPort:server?.address()?.port};
 if(message.type==='ready'&&scenario==='wrong-pid')out.pid=process.pid+1;
 if(message.type==='ready'&&scenario==='wrong-nonce')out.nonce='0'.repeat(64);
 return send(out,cb);
};
const {runChild}=require('../backend/desktopChild');
runChild({root:L.ROOT,loadConfig:filename=>L.loadConfig(m,filename),
 hashCode:root=>scenario==='wrong-code'?'0'.repeat(64):require('../backend/config/desktopPolicy').fingerprint(root),
 isolate:()=>{},createServer(handler){server=http.createServer(handler);const listen=server.listen.bind(server);server.listen=(opts,cb)=>{if(opts.port!==3000||!opts.exclusive)L.fail('R03B_BIND_CONTRACT');return listen({...opts,port:0},cb);};return server;},
 getPool(){const c=L.loadConfig(m,path.join(m.dir,scenario==='privileged'?'privileged.env':'runtime.env')).config;
  const raw=new(require('pg').Pool)(L.pgOptions(m,c));const pool=L.guardedPool(raw,m,c.DB_USER,v=>fs.appendFileSync(path.join(m.dir,'sql-codes.jsonl'),JSON.stringify(v)+'\n'));
  const file=require.resolve('../backend/config/database');require.cache[file]={id:file,filename:file,loaded:true,exports:pool};return pool;},
 async verify(pool,c){try{
   await require('../backend/config/desktopPostgres').verifyPostgresWithIdentity(pool,{...c,DB_CLUSTER_ID:scenario==='wrong-cluster'?'0':c.DB_CLUSTER_ID},L.labIdentity(m,scenario==='wrong-db'?{database:'not_this_database'}:{}));
  }catch(e){fs.writeFileSync(path.join(m.dir,'child-'+scenario+'.json'),JSON.stringify({code:e.code||'SQL',stage:'verify',sqlState:/^[A-Z0-9]{5}$/.test(e.code||'')?e.code:undefined}));throw e;}}
});
