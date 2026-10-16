// DEV-DB-02: exclusivo de desarrollo; nunca carga .env por defecto.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),LAB=path.join(ROOT,'.access-scope-lab','dev-db-02'),CONFIG=path.join(LAB,'config.env');
const DATABASE='sian_kaan_reservaciones_dev',CLUSTER='7632825987452064788';
const TABLES=['roles','usuarios','tours','paises','plataformas','usuario_plataformas_visibles','vehiculos','operadores','guias','operaciones_tour','transportes_operacion','reservaciones','daily_observaciones','eventos_integracion','reservas_integracion_link','equivalencias_tours_externos','integracion_sync_estado','bitacora'].sort();
const fail=code=>{throw Object.assign(new Error(code),{code});};
const local=host=>['localhost','127.0.0.1','::1','::1/128','127.0.0.1/32'].includes(host);
const IDENTITY_SQL="SELECT current_database() AS database,current_user AS username,inet_server_addr()::text AS address,inet_server_port() AS port,current_schema() AS schema,current_setting('server_version') AS version";
const OBJECTS_SQL=`SELECT 'relation' kind,n.nspname,c.relname name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE left(n.nspname,3)<>'pg_' AND n.nspname<>'information_schema'
UNION ALL SELECT 'function',n.nspname,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE left(n.nspname,3)<>'pg_' AND n.nspname<>'information_schema'
UNION ALL SELECT 'type',n.nspname,t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE left(n.nspname,3)<>'pg_' AND n.nspname<>'information_schema'
UNION ALL SELECT 'extension',n.nspname,e.extname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname<>'plpgsql'
UNION ALL SELECT 'schema',n.nspname,n.nspname FROM pg_namespace n WHERE left(n.nspname,3)<>'pg_' AND n.nspname NOT IN ('public','information_schema')
UNION ALL SELECT 'foreign_server','public',srvname FROM pg_foreign_server
UNION ALL SELECT 'foreign_wrapper','public',fdwname FROM pg_foreign_data_wrapper
UNION ALL SELECT 'event_trigger','public',evtname FROM pg_event_trigger
UNION ALL SELECT 'publication','public',pubname FROM pg_publication
UNION ALL SELECT 'operator',n.nspname,o.oprname FROM pg_operator o JOIN pg_namespace n ON n.oid=o.oprnamespace WHERE left(n.nspname,3)<>'pg_' AND n.nspname<>'information_schema'
UNION ALL SELECT 'collation',n.nspname,o.collname FROM pg_collation o JOIN pg_namespace n ON n.oid=o.collnamespace WHERE left(n.nspname,3)<>'pg_' AND n.nspname<>'information_schema'
UNION ALL SELECT 'conversion',n.nspname,o.conname FROM pg_conversion o JOIN pg_namespace n ON n.oid=o.connamespace WHERE left(n.nspname,3)<>'pg_' AND n.nspname<>'information_schema'
UNION ALL SELECT 'operator_class',n.nspname,o.opcname FROM pg_opclass o JOIN pg_namespace n ON n.oid=o.opcnamespace WHERE left(n.nspname,3)<>'pg_' AND n.nspname<>'information_schema'
UNION ALL SELECT 'operator_family',n.nspname,o.opfname FROM pg_opfamily o JOIN pg_namespace n ON n.oid=o.opfnamespace WHERE left(n.nspname,3)<>'pg_' AND n.nspname<>'information_schema'
UNION ALL SELECT 'text_config',n.nspname,o.cfgname FROM pg_ts_config o JOIN pg_namespace n ON n.oid=o.cfgnamespace WHERE left(n.nspname,3)<>'pg_' AND n.nspname<>'information_schema'
UNION ALL SELECT 'text_dictionary',n.nspname,o.dictname FROM pg_ts_dict o JOIN pg_namespace n ON n.oid=o.dictnamespace WHERE left(n.nspname,3)<>'pg_' AND n.nspname<>'information_schema'`;
function validateIdentity(r,username){
 if(!r||r.database!==DATABASE||Number(r.port)!==5432||!local(r.address)||r.schema!=='public'||!/^18\.3(?:\D|$)/.test(r.version)||(username&&r.username!==username))fail('DEV_IDENTITY_MISMATCH');return r;
}
async function verifyIdentity(db,{empty=false,username,cluster=true}={}){
 const r=validateIdentity((await db.query(IDENTITY_SQL)).rows[0],username);
 if(cluster&&(await db.query("SELECT has_function_privilege(current_user,'pg_control_system()','EXECUTE') AS allowed")).rows[0].allowed){
  r.cluster=(await db.query('SELECT system_identifier::text AS cluster FROM pg_control_system()')).rows[0].cluster;
  if(r.cluster!==CLUSTER)fail('DEV_CLUSTER_MISMATCH');
 }
 if(empty&&(await db.query(OBJECTS_SQL)).rows.length)fail('DEV_DATABASE_NOT_EMPTY');return r;
}
async function verifySchema(db){
 const tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>r.tablename);
 if(JSON.stringify(tables)!==JSON.stringify(TABLES))fail('DEV_TABLES_MISMATCH');
 const constraints=(await db.query(`SELECT c.conname,c.contype,c.convalidated,t.relname AS table_name,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY c.conname`)).rows;
 for(const [type,count] of [['p',18],['f',18],['c',15]])if(constraints.filter(c=>c.contype===type).length!==count)fail('DEV_CONSTRAINTS_MISMATCH');
 if(constraints.some(c=>!c.convalidated))fail('DEV_UNVALIDATED_CONSTRAINT');
 const col=(await db.query("SELECT is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='usuarios' AND column_name='alcance_plataformas'")).rows[0];
 if(!col||col.is_nullable!=='NO'||col.column_default!=="'selected'::character varying")fail('DEV_SCOPE_COLUMN_MISMATCH');
 const ck=constraints.find(c=>c.conname==='chk_usuarios_alcance_plataformas');
 if(!ck||!ck.definition.includes("'all'")||!ck.definition.includes("'selected'"))fail('DEV_SCOPE_CHECK_MISSING');
 const pk=constraints.find(c=>c.conname==='pk_usuario_plataformas_visibles');
 if(!pk||pk.definition!=='PRIMARY KEY (id_usuario, id_plataforma)')fail('DEV_SCOPE_PK_MISMATCH');
 for(const name of ['fk_usuario_plataformas_visibles_usuarios','fk_usuario_plataformas_visibles_plataformas'])if(!constraints.find(c=>c.conname===name&&c.contype==='f'))fail('DEV_SCOPE_FK_MISSING');
 return {tables,constraints};
}
async function rejectPrivilegedRole(db){
 const roles=(await db.query(`SELECT r.rolname,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolbypassrls FROM pg_roles r WHERE r.rolname=current_user OR pg_has_role(current_user,r.oid,'MEMBER')`)).rows;
 if(!roles.length||roles.some(r=>r.rolsuper||r.rolcreatedb||r.rolcreaterole||r.rolreplication||r.rolbypassrls||r.rolname.startsWith('pg_')))fail('DEV_PRIVILEGED_ROLE_FORBIDDEN');
}
function readConfig(){
 const c=require('dotenv').parse(fs.readFileSync(CONFIG)),keys=['DB_HOST','DB_PORT','DB_NAME','DB_USER','JWT_SECRET','GYG_GMAIL_SYNC_ENABLED'];
 if(Object.keys(c).some(k=>!keys.includes(k))||c.DB_HOST!=='localhost'||c.DB_PORT!=='5432'||c.DB_NAME!==DATABASE||(c.DB_USER!==undefined&&c.DB_USER!=='sian_kaan_dev_app')||c.GYG_GMAIL_SYNC_ENABLED!=='false'||!/^[a-f0-9]{64}$/.test(c.JWT_SECRET||''))fail('DEV_CONFIG_INVALID');return c;
}
function cleanEnvironment(c,credentials,source=process.env){
 if(!credentials||!credentials.username||!credentials.password)fail('DEV_CREDENTIALS_REQUIRED');
 if(c.DB_USER&&c.DB_USER!==credentials.username)fail('DEV_CONFIG_USER_MISMATCH');
 const env={},keys=new Set(['path','systemroot','windir','comspec','pathext','temp','tmp','userprofile','appdata','localappdata','programfiles','programfiles(x86)','programdata','systemdrive','allusersprofile','username','userdomain','homedrive','homepath']);
 for(const [k,v] of Object.entries(source))if(keys.has(k.toLowerCase()))env[k]=v;
 return Object.assign(env,c,{DB_USER:credentials.username,DB_PASSWORD:credentials.password,APP_CONFIG_PATH:CONFIG,APP_DEV_DB02:'1',NODE_ENV:'development'});
}
async function assertPortFree(port=3000){
 if(!Number.isInteger(port)||port<1||port>65535)fail('DEV_PORT_INVALID');
 if(process.platform==='win32'){
  const result=require('node:child_process').spawnSync(path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; if (Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -eq "+port+" }) { exit 2 }; exit 0"],{windowsHide:true,encoding:'utf8',timeout:15000});
  if(result.status!==0)fail('DEV_PORT_UNAVAILABLE');
 }

 const probes=[];
 try {
  // Windows puede permitir un bind IPv6 aun con el puerto IPv4 ocupado.
  // Reservar ambos protocolos; no reutilizar ni detener listeners existentes.
  for(const [host,ipv6Only] of [['127.0.0.1',false],['::1',true],['0.0.0.0',false],['::',true]]){
   const probe=net.createServer();probes.push(probe);
   await new Promise((resolve,reject)=>{probe.once('error',()=>reject(Object.assign(new Error('DEV_PORT_UNAVAILABLE'),{code:'DEV_PORT_UNAVAILABLE'})));probe.listen({host,port,ipv6Only,exclusive:true},resolve);});
  }
 } finally {await Promise.all(probes.filter(s=>s.listening).map(s=>new Promise(r=>s.close(r))));}
}
async function startOwnedBackend({execPath,env,onExit=()=>{},timeout=15000,spawnProcess=require('node:child_process').spawn,checkPort=assertPortFree}){
 await checkPort();const nonce=crypto.randomBytes(32).toString('hex');
 const child=spawnProcess(execPath,[path.join(ROOT,'scripts','backendDevDb02.cjs')],{cwd:ROOT,env:{...env,ELECTRON_RUN_AS_NODE:'1',APP_DEV_BACKEND_NONCE:nonce},stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
 return new Promise((resolve,reject)=>{let ready=false,done=false;const timer=setTimeout(()=>finish('DEV_BACKEND_TIMEOUT'),timeout);
 function finish(code,reason){if(done)return;done=true;clearTimeout(timer);if(!ready){if(!child.killed)child.kill();reject(Object.assign(new Error(code),{code,reason:/^DEV_[A-Z0-9_]+$/.test(reason||'')?reason:undefined}));}}
 child.on('error',()=>finish('DEV_BACKEND_PROCESS_ERROR'));child.on('exit',()=>{if(ready)onExit();else finish('DEV_BACKEND_START_FAILED');});
 child.on('message',m=>{if(m?.type==='dev-error'&&m.nonce===nonce)return finish('DEV_BACKEND_REJECTED',m.code);if(!done&&!ready&&m?.type==='dev-ready'&&m.nonce===nonce){ready=true;done=true;clearTimeout(timer);resolve(child);}});
 child.stdout?.resume();child.stderr?.resume();
 });
}
function socketTargetAllowed(args){
 let v=args[0];if(Array.isArray(v))v=v[0];
 if(v&&typeof v==='object')return local(v.host)&&Number(v.port)===5432;
 return typeof v==='number'&&v===5432&&local(args[1]);
}
function blockProviderNetwork(){
 const original=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...args){if(!socketTargetAllowed(args))fail('DEV_NETWORK_BLOCKED');return original.apply(this,args);};
 for(const name of ['node:http','node:https']){const m=require(name);m.request=m.get=()=>fail('DEV_PROVIDER_HTTP_DISABLED');}
 global.fetch=async()=>fail('DEV_PROVIDER_HTTP_DISABLED');require('node:http2').connect=()=>fail('DEV_PROVIDER_HTTP_DISABLED');
}
function writeJson(name,value){fs.mkdirSync(LAB,{recursive:true});fs.writeFileSync(path.join(LAB,name),JSON.stringify(value,null,2)+'\n');}
module.exports={ROOT,LAB,CONFIG,DATABASE,CLUSTER,TABLES,IDENTITY_SQL,OBJECTS_SQL,fail,validateIdentity,verifyIdentity,verifySchema,rejectPrivilegedRole,readConfig,cleanEnvironment,assertPortFree,startOwnedBackend,socketTargetAllowed,blockProviderNetwork,writeJson};

