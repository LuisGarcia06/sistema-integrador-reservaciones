'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const base=require('./standaloneDev.cjs'),B=require('../backend/config/standalonePolicy'),BP=require('../backend/config/bootstrapPolicy');
async function prepare(directory,cDirectory,work){
 const c=BP.verifyC(cDirectory),net=require('node:net'),originalConnect=net.Socket.prototype.connect,parentConnections=[];let m;
 net.Socket.prototype.connect=function(...args){const a=Array.isArray(args[0])?args[0]:args,t=a[0];parentConnections.push({host:typeof t==='object'?t.host:a[1],port:Number(typeof t==='object'?t.port:t)});return originalConnect.apply(this,args);};
 try{return await base.prepare(directory,{profile:'empty-bootstrap-lab',bootstrapAudit:async({admin,plan:initial,sqlPassword})=>{
 m={...initial.manifest,version:12,environment:BP.ENVIRONMENT,purpose:BP.PURPOSE,schemaVersion:'023',dataGeneration:crypto.randomUUID(),sqlPrincipal:BP.SQL_PRINCIPAL,cDirectory,cProofDigest:c.digest,code:BP.fingerprint(initial.manifest.root),configDigest:'0'.repeat(64)};m.configDigest=BP.configDigest(m);assert.notEqual(m.cluster,c.cluster);
 async function apply(file,hash,exact){const sql=fs.readFileSync(path.join(m.root,file),'utf8').replace(/\r\n/g,'\n');if(hash)assert.equal(B.sha(sql),hash);if(exact)assert.equal(sql,exact);const id=(await admin.query('SELECT current_database() db,inet_server_port() port,(SELECT system_identifier::text FROM pg_control_system()) cluster')).rows[0];assert.equal(id.db,m.database);assert.equal(id.port,m.pgPort);assert.equal(id.cluster,m.cluster);await admin.query('SET ROLE ctsk_standalone_owner');try{await admin.query(sql);}finally{await admin.query('RESET ROLE');}}
 await apply('database/migrations/019_revisiones_registros_lab.sql',null,require('../backend/config/revisionSchemaContract').MIGRATION_SQL);await apply('database/migrations/020_comandos_idempotentes_lab.sql',require('../backend/config/commandSchemaContract').MIGRATION_SHA);await admin.query((await admin.query("SELECT format('COMMENT ON TABLE public.comandos_idempotentes IS %L',$1::text) sql",[m.dataGeneration])).rows[0].sql);for(const name of ['auditSchemaContract','adminAuditSchemaContract','credentialSchemaContract']){const k=require('../backend/config/'+name);await apply(k.FILE,k.MIGRATION_SHA);}
 assert.equal((await admin.query('SELECT count(*)::int n FROM usuarios')).rows[0].n,0);assert.equal(fs.existsSync(path.join(directory,'test-user.json')),false);const file=path.join(directory,'bootstrap-manifest.json');fs.writeFileSync(file,JSON.stringify(m,null,2),{flag:'wx'});const bootstrapPlan=BP.readPlan(file);
 let password=crypto.randomBytes(24).toString('base64url');const credentials={correo:'first@unified.example.test',password};const record=await require('../backend/services/credentialBootstrap.service').initialize(admin,bootstrapPlan,{nombre:'Administrador inicial sintético',correo:credentials.correo,password,confirmacion:password},crypto.randomUUID());password=null;
 const firstProfile=require('./firstAccessAdmin.cjs').createProfile(bootstrapPlan,initial.config,record),net=require('node:net'),original=net.Socket.prototype.connect;
 net.Socket.prototype.connect=function(...args){const a=Array.isArray(args[0])?args[0]:args,t=a[0],h=typeof t==='object'?t.host:a[1],p=Number(typeof t==='object'?t.port:t);if(h!==B.HOST||![m.pgPort,m.httpPort].includes(p))throw Error('UNIFIED_LAB_NETWORK_BLOCKED');parentConnections.push({host:h,port:p});return originalConnect.call(this,...args);};
 require('node:dgram').createSocket=()=>{throw Error('UNIFIED_LAB_NETWORK_BLOCKED');};global.fetch=async()=>{throw Error('UNIFIED_LAB_NETWORK_BLOCKED');};
 // Reemplazar la barrera de puerto único por la matriz explícita del mismo clúster.
 const {request}=require('./revisionApiLab.cjs');
 // Ninguna conexión HTTP sale del loopback y puerto verificados.
 await work({admin,initial,bootstrapPlan,firstProfile,credentials,sqlPassword,parentConnections,manifest:m,request});
 }});}finally{if(m&&fs.existsSync(path.join(m.dataDirectory,'postmaster.pid')))base.control(m,'stop');net.Socket.prototype.connect=originalConnect;}
}
module.exports={prepare};
