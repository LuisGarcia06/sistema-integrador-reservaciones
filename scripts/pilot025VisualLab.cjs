'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),net=require('node:net');
const base=require('./standaloneDev.cjs'),root=path.resolve(__dirname,'../docs/local-fase-2e5/packages/server'),S=require(path.join(root,'scripts/preproductionSetup.cjs')),P=require(path.join(root,'backend/config/preproductionPolicy'));
async function main(){
 process.env=require('../backend/config/desktopPolicy').cleanEnvironment();delete process.env.ELECTRON_RUN_AS_NODE;
 const [directory,clientDir,...extra]=process.argv.slice(2);if(extra.length||![directory,clientDir].every(x=>path.isAbsolute(x||'')))throw Error('VISUAL_NEW_DIRECTORIES');
 const report={completed:false,phase:'2E.5-focused-visual',clusters:[],clients:[clientDir],connections:[]},secrets=[],native=net.Socket.prototype.connect;
 console.log('INTEGRATION024_SOURCE '+directory);
 try{await base.prepare(directory,{profile:'empty-bootstrap-lab',bootstrapAudit:async({admin,plan:initial,sqlPassword})=>{
  report.clusters.push(initial.manifest);secrets.push(sqlPassword,initial.config.DB_PASSWORD);
  const allowed=new Set([initial.manifest.pgPort,initial.manifest.httpPort]);net.Socket.prototype.connect=function(...args){const a=Array.isArray(args[0])?args[0]:args,t=a[0],host=typeof t==='object'?t.host:a[1],port=Number(typeof t==='object'?t.port:t);if(host!=='127.0.0.1'||!allowed.has(port))throw Error('VISUAL_EXTERNAL_BLOCKED');report.connections.push({host,port});return native.apply(this,args);};
  let plan=S.create({...initial,manifest:{...initial.manifest,root}});await S.migrate(admin,plan.manifest);
  for(const contract of [require('../backend/config/integration024Contract'),require('../backend/config/manualReferences025Contract')]){const sql=fs.readFileSync(path.join(root,contract.FILE),'utf8').replace(/\r\n/g,'\n');assert.equal(P.sha(sql),contract.SHA);await admin.query('SET ROLE ctsk_standalone_owner');try{await admin.query(sql);}finally{await admin.query('RESET ROLE');}}
  const credentials={correo:'visual025@example.test',password:crypto.randomBytes(24).toString('base64url')};secrets.push(credentials.password,plan.config.JWT_SECRET,plan.key,plan.commandKey,plan.signingKey);
  const attempt=crypto.randomUUID(),created=await require(path.join(root,'backend/services/credentialBootstrap.service')).initialize(admin,plan,{nombre:'Administrador visual capturado',correo:credentials.correo,password:credentials.password,confirmacion:credentials.password},attempt),C=require('../backend/config/integration024Contract'),R=require('../backend/config/manualReferences025Contract');
  plan=S.persist({...plan,filename:undefined,digest:undefined,authContract:undefined,manifest:{...plan.manifest,state:'initialized',bootstrapOrigin:{attempt,user:created.id_usuario,cluster:initial.manifest.cluster,code:plan.manifest.code},integration024:{purpose:C.PURPOSE,migration:C.SHA},manualReferences025:{purpose:R.PURPOSE,migration:R.SHA}}});const clientFile=S.client(plan,clientDir);await S.verifyInstallation(admin,plan);
  await require('./pilot025Cases.cjs').run({admin,plan,password:sqlPassword,credentials,clientFile,report,secrets});report.code=plan.manifest.code;
 }});report.completed=true;
 }finally{net.Socket.prototype.connect=native;for(const m of report.clusters)if(fs.existsSync(path.join(m.dataDirectory,'postmaster.pid')))base.control(m,'stop');report.postgresStopped=report.clusters.every(m=>!fs.existsSync(path.join(m.dataDirectory,'postmaster.pid')));assert.ok(secrets.every(s=>!JSON.stringify(report).includes(s)));report.secretScanPassed=true;fs.writeFileSync(path.resolve(__dirname,'../docs/local-fase-2e5/attempt-visual-1-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({completed:report.completed,stopped:report.postgresStopped}));}
}
main().catch(e=>{console.error('VISUAL025_FAILED '+(e.code||e.message));process.exitCode=1;});
