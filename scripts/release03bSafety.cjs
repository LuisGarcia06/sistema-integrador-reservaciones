const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net'),Module=require('node:module');
const ROOT=path.resolve(__dirname,'..'),S=require('./preRelease03RestoreSafety.cjs');
const forbiddenPorts=new Set([3000,5432,55473,57593,57479,57512,57533,55432,65435,51621,53043,62415]);
const oldClusters=new Set(['7632825987452064788','7697702573746832088','7697092329288606316','7697788951308892140','7697789398560128504','7697789546630300360','7697790721838933676']);
// Incorporar identidades registradas de intentos previos sin abrir sus bases/credenciales.
for(const name of ['intento-01.json','intento-02.json','intento-03.json','fallo.json','resultado.json']){
 const filename=path.join(ROOT,'docs/release-03b',name);if(fs.existsSync(filename)){const id=JSON.parse(fs.readFileSync(filename,'utf8')).lab?.systemIdentifier;if(id)oldClusters.add(id);}
}
const fail=code=>{throw Object.assign(Error(code),{code});};
function validateManifest(m){
 const local=path.resolve(process.env.LOCALAPPDATA||'C:/invalid');const base=path.dirname(m.dir||'');
 if(path.dirname(base)!==local||!/^CTSK-Release03B-[a-f0-9]{8}$/.test(path.basename(base))||!/^run-\d{8}T\d{9}Z-[a-f0-9]{8}$/.test(path.basename(m.dir))||
    path.resolve(m.data)!==path.join(m.dir,'data')||m.host!=='127.0.0.1'||!Number.isInteger(m.port)||m.port<1024||forbiddenPorts.has(m.port)||
    !/^release03b_[a-f0-9]{12}$/.test(m.database)||m.admin!=='r03b_migrator'||m.runtime!=='r03b_runtime'||m.owner!=='r03b_owner'||
    (m.systemIdentifier&&oldClusters.has(m.systemIdentifier)))fail('R03B_ISOLATION_REJECTED');return m;
}
function readManifest(filename){
 require('../backend/config/windowsConfigAcl').checkAcl(filename);
 const m=validateManifest(JSON.parse(fs.readFileSync(filename,'utf8')));
 if(filename!==path.join(m.dir,'manifest.json')||fs.realpathSync(m.dir)!==m.dir)fail('R03B_MANIFEST_PATH');return m;
}
function loadConfig(m,filename){
 if(!['runtime.env','privileged.env','insecure.env','contradictory.env'].includes(path.basename(filename))||path.dirname(filename)!==m.dir)fail('R03B_CONFIG_PATH');
 return require('../backend/config/desktopPolicy').readConfig(filename,{validate(c){
  if(c.APP_ENVIRONMENT!=='release03b-lab'||c.DB_HOST!=='localhost'||c.DB_PORT!==String(m.port)||c.DB_NAME!==m.database||
    c.DB_CLUSTER_ID!==m.systemIdentifier||c.DB_SERVER_VERSION!=='18.3'||c.DB_SCHEMA_VERSION!=='017'||
    ![m.runtime,m.admin].includes(c.DB_USER)||!c.DB_PASSWORD||c.JWT_SECRET?.length!==64||c.GYG_GMAIL_SYNC_ENABLED!=='false')fail('CONFIG_INVALID');return Object.freeze({...c});
 }});
}
function barrier(m,{api=false}={}){
 validateManifest(m);const allowed=new Set([m.port]);const original=net.Socket.prototype.connect;
 net.Socket.prototype.connect=function(...args){const values=Array.isArray(args[0])?args[0]:args;const v=values[0];const host=typeof v==='object'?v.host:values[1],port=typeof v==='object'?v.port:v;
  if(host!=='127.0.0.1'||!allowed.has(Number(port)))fail('R03B_NETWORK_BLOCKED');return original.apply(this,args);};
 global.fetch=async()=>fail('R03B_FETCH_BLOCKED');require('node:dgram').createSocket=()=>fail('R03B_UDP_BLOCKED');
 const load=Module._load;Module._load=function(name,parent,isMain){if(/^(googleapis|@google-cloud\/)/.test(name))fail('R03B_PROVIDER_BLOCKED');
  if((name.startsWith('.')||path.isAbsolute(name))&&Module._resolveFilename(name,parent)===path.join(ROOT,'backend/config/database.js')&&!require.cache[path.join(ROOT,'backend/config/database.js')])fail('R03B_DEFAULT_POOL_BLOCKED');
  return load.call(this,name,parent,isMain);};
 require('dotenv').config=()=>fail('R03B_DOTENV_CONFIG_BLOCKED');
 const read=fs.readFileSync;fs.readFileSync=function(filename,...args){if(path.resolve(String(filename))===path.join(ROOT,'.env'))fail('R03B_REAL_ENV_BLOCKED');return read.call(this,filename,...args);};
 return {allowApi(port){if(!api||forbiddenPorts.has(port)||port===m.port||!Number.isInteger(port))fail('R03B_API_PORT');allowed.add(port);}};
}
async function identity(db,m,user){
 const r=(await db.query("SELECT current_database() database,current_user username,host(inet_server_addr()) host,inet_server_port() port,(SELECT system_identifier::text FROM pg_catalog.pg_control_system()) cluster")).rows[0];
 if(r.database!==m.database||r.username!==user||r.host!==m.host||r.port!==m.port||r.cluster!==m.systemIdentifier)fail('R03B_EFFECTIVE_IDENTITY');return r;
}
function guardedPool(pool,m,user,diagnostic=()=>{}){
 async function connect(){const c=await pool.connect();try{await identity(c,m,user);}catch(e){c.release();throw e;}
  return {async query(sql,params){const text=typeof sql==='string'?sql:sql.text;
    try{if(!/^\s*(?:SELECT|WITH|BEGIN|COMMIT|ROLLBACK|SET)\b/i.test(text))await identity(c,m,user);return await c.query(sql,params);}catch(e){diagnostic({code:/^[A-Z0-9]{5}$/.test(e.code||'')?e.code:'R03B_SQL_ERROR',verb:(text.match(/^\s*(\w+)/)||[])[1]});throw e;}},release:()=>c.release()};
 }
 return {connect,async query(...args){const c=await connect();try{return await c.query(...args);}finally{c.release();}},end:()=>pool.end()};
}
function labIdentity(m,change={}){return(row,c)=>{if(!row||row.database!==(change.database||c.DB_NAME)||row.username!==c.DB_USER||row.port!==m.port||!['127.0.0.1','127.0.0.1/32'].includes(row.address)||row.schema!=='public'||String(row.version)!=='180003')fail('PG_IDENTITY');if(!row.cluster_allowed)fail('PG_CLUSTER');};}
function pgOptions(m,c){validateManifest(m);return {host:m.host,port:m.port,database:m.database,user:c.DB_USER,password:c.DB_PASSWORD,max:4,connectionTimeoutMillis:5000,query_timeout:10000,options:'-c search_path=public,pg_catalog -c timezone=UTC -c statement_timeout=10000 -c lock_timeout=3000',application_name:'release03b_lab'};}
module.exports={ROOT,S,forbiddenPorts,oldClusters,fail,validateManifest,readManifest,loadConfig,barrier,identity,guardedPool,labIdentity,pgOptions};
