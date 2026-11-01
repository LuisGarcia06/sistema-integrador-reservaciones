'use strict';
// Ensayo privado: recibe exclusivamente el plan sintético ya verificado por 023/024.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const P=require('../backend/config/preproductionPolicy'),B=require('./preproductionBackup.cjs');
async function run({admin,plan,credentials,clientFile,secrets,report,output}){
 const events=[],runs=[];let service,child,logs='',ready=0,state;
 const request=require('./revisionApiLab.cjs').request;
 const start=async()=>service=await require('./preproductionServer.cjs').start(plan,admin,{probe:true,onEvent:e=>{events.push(e);if(e.type==='connection')report.connections.push(e);}});
 const stop=async()=>{if(service){const s=service;service=null;await s.close();logs+=s.output;}};
 async function electron(mode){
  const env=require('../backend/config/desktopPolicy').cleanEnvironment();delete env.ELECTRON_RUN_AS_NODE;let result;
  const args=mode==='candidate'?[path.join(plan.manifest.root,'docs/local-fase-2e4/client-harness.cjs'),'--ctsk-preproduction-client='+clientFile]:['.','--ctsk-mode=preproduction023-local','--ctsk-preproduction-client='+clientFile,mode==='full'||mode==='restart'?'--ctsk-preproduction-full-driver':'--ctsk-preproduction-first-driver'];
  child=cp.spawn(require('electron'),args,{cwd:plan.manifest.root,env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});const current=child;
  current.stdout.on('data',x=>logs+=x);current.stderr.on('data',x=>logs+=x);
  current.on('message',async m=>{try{
   if(m.type==='ctsk-client-state'){ready++;return;}
   if(m.type==='original-electron-ready'){current.send({type:'driver-input',mode,origin:'http://127.0.0.1:'+plan.manifest.httpPort,credentials,fixtures:state?{ids:state.ids,users:state.users}:undefined,output});return;}
   if(m.type==='driver-secret'){secrets.push(m.value);return;}
   if(m.type==='driver-completed'){result=m.report;return;}
   if(m.type!=='driver-rpc')return;let data;const p=m.payload||{};
   if(m.action==='arm')data=await service.request({type:'arm',fault:p.fault});
   else if(m.action==='proof'){const command=(await admin.query('SELECT * FROM comandos_idempotentes WHERE clave=$1',[p.key])).rows[0];data={command,audits:(await admin.query('SELECT * FROM bitacora WHERE id_bitacora=ANY($1::int[])',[command?.ids_bitacora||[]])).rows};}
   else if(m.action==='state')data={hash:P.sha(JSON.stringify((await B.snapshot(admin)).rows))};
   else if(m.action==='restart'){await stop();await start();const n=ready,end=Date.now()+20000;while(ready<=n&&Date.now()<end)await new Promise(r=>setTimeout(r,30));assert.ok(ready>n);data={restarted:true};}
   else if(m.action==='credentials-updated'){credentials.password=p.password;secrets.push(p.password);data={updated:true};}
   else if(m.action==='hold-read-arm')data=await service.request({type:'hold-read-arm',url:p.url});
   else if(['hold-status','release-write','release-read'].includes(m.action))data=await service.request({type:m.action});
   else throw Error('PILOT_PRIVATE_ACTION');if(current.connected)current.send({type:'driver-reply',id:m.id,ok:true,data});
  }catch(e){if(current.connected)current.send({type:'driver-reply',id:m.id,ok:false,code:e.code||'PILOT_PRIVATE_FAILED'});}});
  await new Promise((yes,no)=>{const timer=setTimeout(()=>{current.kill();no(Error('PILOT_ELECTRON_TIMEOUT'));},900000);current.once('error',no);current.once('exit',code=>{clearTimeout(timer);code===0&&result?.completed?yes():no(Error('PILOT_ELECTRON_FAILED'));});});child=null;runs.push(result);
 }
 try{
  assert.equal((await admin.query('SELECT count(*)::int n FROM usuarios')).rows[0].n,1);
  await start();await electron('first');
  const business={checks:[],httpCalls:[],transactionProofs:[],rollbacks:[],events};
  state=await require('./unifiedBackendCases.cjs').run({admin,plan,credentials,report:business,secrets,events,request,arm:fault=>service.request({type:'arm',fault}),restart:async()=>{await stop();await start();}});
  const login=await request(plan.manifest.httpPort,'POST','/api/auth/login',credentials);assert.equal(login.status,200);const token=login.body.token;secrets.push(token);
  const headers={'X-CTSK-Protocol':P.PROTOCOL,'X-CTSK-Data-Generation':plan.manifest.dataGeneration};
  const month=[];
  for(let day=1;day<=30;day++){
   const body={fecha:'2097-11-'+String(day).padStart(2,'0'),id_tour:state.ids.tours,id_pais:state.ids.paises,id_plataforma:state.ids.plataformas,nombre_cliente:'Primer mes día '+day,observaciones:day===1?'Referencia externa FareHarbor: PILOT-FH-EXTERNAL-001':'Captura manual sintética',pax:2,ninos:1,pickup_place:'Hotel sintético',pickup_time:'07:05',turno:'Mañana',precio_total:1200,deposito:200,saldo:1000,estado:'Pendiente'},url='/api/reservaciones';
   const pre=await request(plan.manifest.httpPort,'POST','/api/precondiciones',{metodo:'POST',ruta:url,datos:body},token,headers);assert.equal(pre.status,200);
   const r=await request(plan.manifest.httpPort,'POST',url,body,token,{...headers,'If-Match':pre.body.etag,'If-Operational-Match':pre.body.contexto,'Idempotency-Key':crypto.randomUUID()});assert.equal(r.status,200);month.push({day,fecha:body.fecha,status:r.status});
  }
  // Avisos de muestra para el recorrido existente; no son recepción ni llamadas a proveedores.
  for(let n=0;n<3;n++)await admin.query("INSERT INTO eventos_integracion(provider,external_event_id,external_booking_id,event_type,review_status,application_status,normalized_data,source_received_at,created_at,updated_at) VALUES ('getyourguide',$1,$2,'new_booking','pending_review','not_applied',$3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",['SYN-PILOT-MANUAL-'+n,'PILOT-MANUAL-'+n,JSON.stringify({date:'2039-05-20',customer_name:'Aviso manual sintético '+n,pax:2,id_tour:state.ids.tours,turno:'Mañana',pickup_place:'Punto',pickup_time:'07:10',start_time:'08:00'})]);
  await electron('full');await electron('candidate');const snapshot=await B.snapshot(admin);await stop();await start();await electron('restart');assert.deepEqual(await B.snapshot(admin),snapshot);
  const sync=(await admin.query("SELECT provider,first_activation_at,confirmed_through,automation_enabled FROM integracion_sync_estado WHERE source='automation024' ORDER BY provider")).rows;
  assert.equal(sync.length,2);assert.ok(sync.every(r=>r.first_activation_at===null&&r.confirmed_through===null&&!r.automation_enabled));assert.equal((await admin.query('SELECT count(*)::int n FROM reservas_integracion_link')).rows[0].n,0);
  report.manualMonth={completed:true,virtualDays:month,calendar:'2097-11; fechas de servicio sintéticas, sin alterar el reloj del sistema',firstLogin:'Electron original antes de login HTTP',business,electron:runs,disabledState:sync,stateBeforeActivation:snapshot};
  const manualRows=(await admin.query('SELECT to_jsonb(r) data FROM reservaciones r ORDER BY id_reservacion')).rows.map(r=>r.data);report.manualMonth.manualRows=manualRows;
  fs.writeFileSync(path.join(output,'manual-month.json'),JSON.stringify(report.manualMonth,null,2));
 }finally{if(child&&child.exitCode===null){const end=new Promise(r=>child.once('exit',r));child.kill();await end;}await stop();fs.writeFileSync(path.join(output,'manual-month-server.log'),logs);for(const s of secrets)assert.ok(!logs.includes(s),'PILOT_LOG_SECRET');}
}
module.exports={run};
