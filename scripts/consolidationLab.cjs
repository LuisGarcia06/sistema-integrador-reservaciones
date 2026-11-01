'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),cp=require('node:child_process');
const S=require('./unifiedAdmin.cjs'),P=require('../backend/config/unifiedPolicy'),out=path.join(__dirname,'../docs/local-fase-2e1');
async function main(){
 process.env=require('../backend/config/desktopPolicy').cleanEnvironment();delete process.env.ELECTRON_RUN_AS_NODE;
 const [cDirectory,directory,...extra]=process.argv.slice(2);if(extra.length||!path.isAbsolute(cDirectory||'')||!path.isAbsolute(directory||''))throw Error('CONSOLIDATION_ARGUMENTS');
 const report={phase:'2E.1-C-original',completed:false,checks:[],failures:[],electronRuns:[],backendEvents:[],syntheticOnly:true,externalIntegrations:false},secrets=[];let service,electron,m,logs='';
 const stopApi=async()=>{if(service){const s=service;service=null;await s.close();logs+=s.output;}};const stopElectron=async()=>{if(electron&&electron.exitCode===null){const e=electron;electron=null;const ended=require('node:events').once(e,'exit');e.kill();await ended;}};
 console.log('CONSOLIDATION_LAB '+directory);
 try{await require('./prepareConsolidation.cjs').prepare(directory,cDirectory,async h=>{
  try{m=h.manifest;report.identity={directory,cluster:m.cluster,database:m.database,pgPort:m.pgPort,httpPort:m.httpPort,generation:m.dataGeneration};report.parentConnections=h.parentConnections;secrets.push(h.credentials.password,h.sqlPassword,h.initial.config.DB_PASSWORD,h.initial.config.JWT_SECRET);
  service=await require('./firstAccessAdmin.cjs').start({...h.firstProfile,db:h.admin});const login=await h.request(m.httpPort,'POST','/api/auth/login',h.credentials),session=await h.request(m.httpPort,'GET','/api/auth/sesion',undefined,login.body.token);assert.equal(login.status,200);assert.equal(session.status,200);secrets.push(login.body.token);await stopApi();
  let profile=S.createProfile(h.firstProfile,{login,session});secrets.push(profile.plan.key,profile.plan.commandKey);
  const b={phase:'2E.1-B-same-cluster',completed:false,checks:['Bootstrap legítimo y primer login/sesión023 verificados antes de B en este mismo clúster'],httpCalls:[],transactionProofs:[],rollbacks:[],failures:[],events:[]};
  const startApi=()=>S.start({...profile,db:h.admin,probe:true,onEvent:e=>report.backendEvents.push(e)});service=await S.start({...profile,db:h.admin,probe:true,onEvent:e=>b.events.push(e)});
  const state=await require('./unifiedBackendCases.cjs').run({...h,plan:profile.plan,report:b,secrets,events:b.events,arm:fault=>service.request({type:'arm',fault}),restart:async()=>{await stopApi();service=await S.start({...profile,db:h.admin,probe:true,onEvent:e=>b.events.push(e)});}});b.completed=true;b.allOtherChecksPassed=true;report.backend=b;await stopApi();
  // Probar que editar sólo el flag no permite abrir la UI antes de la constancia B.
  const backendBytes=fs.readFileSync(profile.plan.filename);fs.writeFileSync(profile.plan.filename,JSON.stringify({...profile.plan.manifest,activation:'electron-original'}));try{assert.throws(()=>P.readPlan(profile.plan.filename));}finally{fs.writeFileSync(profile.plan.filename,backendBytes);}report.checks.push('La UI rechaza activación por mero flag sin prueba backend firmada');
  profile=S.promote(profile,b);const gateFile=path.join(directory,'unified-backend-proof.json'),gate=fs.readFileSync(gateFile);fs.writeFileSync(gateFile,JSON.stringify({...JSON.parse(gate),signature:'AAAA'}));try{assert.throws(()=>P.readPlan(profile.plan.filename));}finally{fs.writeFileSync(gateFile,gate);}report.checks.push('Puerta C liga B a código/clúster/generación/esquema y rechaza firma manipulada');
  for(let n=0;n<3;n++){const normalized={date:'2039-05-20',customer_name:'Aviso conjunto sintético '+n,pax:2,id_tour:state.ids.tours,turno:'Mañana',pickup_place:'Hotel aviso',pickup_time:'07:10',start_time:'08:00'};await h.admin.query("INSERT INTO eventos_integracion(provider,external_event_id,external_booking_id,event_type,review_status,application_status,normalized_data,source_received_at,created_at,updated_at) VALUES ('getyourguide',$1,$2,'new_booking','pending_review','not_applied',$3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",['SYN-UNIFIED-NOTICE-'+n,'GYGUNIFIED'+String(n).padStart(5,'0'),JSON.stringify(normalized)]);}
  service=await startApi();
  const businessHash=async()=>{const hash=crypto.createHash('sha256');for(const table of [...require('../backend/config/desktopSchema').TABLES,'comandos_idempotentes'])hash.update((await h.admin.query(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text value FROM public.${table} t`)).rows[0].value);return hash.digest('hex');};
  async function runElectron(mode){
   const env=require('../backend/config/desktopPolicy').cleanEnvironment();delete env.ELECTRON_RUN_AS_NODE;let final,lastClientPid;
   electron=cp.spawn(require('electron'),['.','--ctsk-mode=unified023-lab','--ctsk-unified-manifest='+profile.plan.filename,'--ctsk-unified-test-driver'],{cwd:m.root,env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});const child=electron;
   child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);
   child.on('message',async message=>{try{
    if(message.type==='ctsk-client-state'){if(message.status==='ready')lastClientPid=message.pid;return;}
    if(message.type==='ctsk-backend-challenge'){let response;try{response=await service?.request({type:'backend-identity',nonce:message.nonce});}catch{}if(child.connected)child.send({type:'ctsk-backend-proof',id:message.id,response});return;}
    if(message.type==='original-electron-ready'){child.send({type:'driver-input',mode,origin:'http://127.0.0.1:'+m.httpPort,credentials:h.credentials,fixtures:{ids:state.ids,users:state.users},output:directory});return;}
    if(message.type==='driver-secret'){secrets.push(message.value);return;}
    if(message.type==='driver-progress'){report.checks.push(message.check);fs.writeFileSync(path.join(out,'consolidation-progress.json'),JSON.stringify({identity:report.identity,checks:report.checks},null,2));return;}
    if(message.type==='driver-completed'){final=message.report;return;}
    if(message.type==='driver-rpc'){
     let data;const p=message.payload||{};
     if(message.action==='arm'){await service.request({type:'arm',fault:p.fault});data={armed:true};}
     else if(message.action==='state')data={hash:await businessHash()};
     else if(message.action==='proof'){const command=(await h.admin.query('SELECT * FROM comandos_idempotentes WHERE clave=$1',[p.key])).rows[0],audits=(await h.admin.query('SELECT * FROM bitacora WHERE id_bitacora=ANY($1::int[])',[command?.ids_bitacora||[]])).rows;data={command,audits};}
     else if(message.action==='restart'){await stopApi();service=await startApi();const deadline=Date.now()+20000;while(lastClientPid!==service.child.pid&&Date.now()<deadline)await new Promise(r=>setTimeout(r,25));if(lastClientPid!==service.child.pid)throw Error('ORIGINAL_CLIENT_RECONNECT_TIMEOUT');data={restarted:true};}
     else if(message.action==='credentials-updated'){secrets.push(p.password);h.credentials.password=p.password;data={updated:true};}
     else if(message.action==='hold-read-arm'){data=await service.request({type:'hold-read-arm',url:p.url});}
     else if(message.action==='hold-status')data=await service.request({type:'hold-status'});
     else if(message.action==='release-write')data=await service.request({type:'release-write'});
     else if(message.action==='release-read'){data=await service.request({type:'release-read'});}
     else throw Error('DRIVER_RPC_NOT_ALLOWED');
     if(child.connected)child.send({type:'driver-reply',id:message.id,ok:true,data});
    }
   }catch(e){if(child.connected)child.send({type:'driver-reply',id:message.id,ok:false,code:e.code||'DRIVER_PRIVATE_FAILURE'});}});
   await new Promise((yes,no)=>{const timer=setTimeout(()=>{child.kill();no(Error('ORIGINAL_ELECTRON_TIMEOUT'));},1200000);child.once('error',no);child.once('exit',code=>{clearTimeout(timer);code===0&&final?.completed?yes():no(Error('ORIGINAL_ELECTRON_FAILED'));});});electron=null;report.electronRuns.push(final);return final;
  }
  await runElectron('full');const before=await businessHash();await stopApi();service=await startApi();await runElectron('restart');assert.equal(await businessHash(),before);report.checks.push('Reinicio real backend y Electron conserva datos, auditorías y comandos confirmados');
  await h.admin.query('SET ROLE ctsk_standalone_runtime');try{await require('../backend/config/credentialSchema').verify(h.admin,m.dataGeneration);}finally{await h.admin.query('RESET ROLE');}
  const audited=(await h.admin.query('SELECT count(*)::int n FROM bitacora')).rows[0].n;report.finalCounts={audits:audited,commands:(await h.admin.query('SELECT count(*)::int n FROM comandos_idempotentes')).rows[0].n};
  const dumps=JSON.stringify({report,audits:(await h.admin.query('SELECT * FROM bitacora')).rows,ledger:(await h.admin.query('SELECT * FROM comandos_idempotentes')).rows});for(const secret of secrets)assert.ok(!dumps.includes(secret),'CONSOLIDATION_PUBLIC_SECRET');assert.ok(report.parentConnections.every(c=>c.host==='127.0.0.1'&&[m.pgPort,m.httpPort].includes(c.port)));assert.ok(report.backendEvents.filter(e=>e.type==='connection').every(e=>e.host==='127.0.0.1'&&e.port===m.pgPort));report.completed=true;
  }finally{await stopElectron();await stopApi();}
 });}catch(e){report.failures.push({code:e.code||e.message,stack:e.stack?.split('\n').filter(l=>/^\s+at /.test(l)).slice(0,6)});throw e;}
 finally{await stopElectron();await stopApi();if(m&&fs.existsSync(path.join(m.dataDirectory,'postmaster.pid')))require('./standaloneDev.cjs').control(m,'stop');report.postgresStopped=m?!fs.existsSync(path.join(m.dataDirectory,'postmaster.pid')):true;for(const secret of secrets)assert.ok(!logs.includes(secret),'CONSOLIDATION_LOG_SECRET');if(m){const pg=fs.readFileSync(path.join(directory,'postgres.log'),'utf8');for(const secret of secrets)assert.ok(!pg.includes(secret),'CONSOLIDATION_PG_SECRET');}report.secretScanPassed=true;fs.writeFileSync(path.join(directory,'consolidation-server.log'),logs);fs.writeFileSync(path.join(directory,'consolidation-verification.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(out,'consolidation-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({completed:report.completed,checks:report.checks.length,failures:report.failures,postgresStopped:report.postgresStopped}));}
}
if(require.main===module)main().catch(e=>{console.error('CONSOLIDATION_FAILED '+(e.code||e.message));process.exitCode=1;});module.exports={main};
