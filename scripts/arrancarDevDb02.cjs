const {spawn}=require('node:child_process'),{Client}=require('pg'),g=require('./devDb02.cjs');
async function main(){
 let text='';for await(const chunk of process.stdin){text+=chunk;if(text.length>8192)g.fail('DEV_INPUT_TOO_LARGE');}
 let credentials;try{credentials=JSON.parse(text);}catch{g.fail('DEV_INPUT_INVALID');}text='';
 const cfg=g.readConfig(),env=g.cleanEnvironment(cfg,credentials);
 if(credentials.username==='postgres')g.fail('DEV_PRIVILEGED_ROLE_FORBIDDEN');
 await g.assertPortFree();
 const db=new Client({host:cfg.DB_HOST,port:5432,database:g.DATABASE,user:credentials.username,password:credentials.password,connectionTimeoutMillis:5000,options:'-c default_transaction_read_only=on'});
 try{await db.connect();await db.query('BEGIN READ ONLY');await g.verifyIdentity(db,{username:credentials.username});await g.rejectPrivilegedRole(db);await g.verifySchema(db);await db.query('ROLLBACK');}finally{await db.end();}
 const child=spawn(require('electron'),['.'],{cwd:g.ROOT,env,stdio:'inherit',windowsHide:true});
 credentials.password='';let finished=false;
 child.once('error',()=>{console.error('DEV-DB-02: no fue posible iniciar Electron.');process.exitCode=1;});
 child.once('exit',code=>{finished=true;process.exitCode=code||0;});
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{if(!finished&&!child.killed)child.kill();});
}
main().catch(e=>{console.error('DEV-DB-02 no iniciado:',/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'DEV_LAUNCH_FAILED');process.exitCode=1;});

