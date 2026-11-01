const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {Client,Pool}=require('pg'),root=path.resolve(__dirname,'..'),output=path.join(root,'docs/centro-avisos-horarios');
async function main(){
 const cfg=require('dotenv').parse(fs.readFileSync(path.join(root,'.env')));assert.equal(cfg.DB_NAME,'sian_kaan_reservaciones');assert.equal(cfg.DB_USER,'postgres');
 const name='ctsk_timing_lab_'+crypto.randomBytes(6).toString('hex'),options={host:'127.0.0.1',port:5432,user:cfg.DB_USER,password:cfg.DB_PASSWORD,database:'postgres',options:'-c timezone=UTC -c statement_timeout=10000'};
 const admin=new Client(options);let db,created=false;const checks=[],check=(label,value)=>{assert(value,label);checks.push(label);};
 try{
  await admin.connect();assert.equal((await admin.query('SELECT system_identifier::text id FROM pg_control_system()')).rows[0].id,'7632825987452064788');assert.match(name,/^ctsk_timing_lab_[a-f0-9]{12}$/);
  await admin.query('CREATE DATABASE "'+name+'" TEMPLATE template0');created=true;db=new Pool({...options,database:name});
  await db.query(fs.readFileSync(path.join(root,'database/schema.sql'),'utf8').split('\n-- MIGRACION 018:')[0]);await db.query(fs.readFileSync(path.join(root,'database/migrations/018_publicacion_integraciones.sql'),'utf8'));
  require.cache[require.resolve('../backend/config/database')]={id:require.resolve('../backend/config/database'),filename:require.resolve('../backend/config/database'),loaded:true,exports:db};
  const service=require('../backend/services/centroAvisos.service');
  async function event(code,data,original,received,type='new_booking',provider='getyourguide'){
   return (await db.query(`INSERT INTO eventos_integracion(provider,external_event_id,external_booking_id,event_type,normalized_data,source_received_at,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id_evento_integracion`,[provider,crypto.randomBytes(8).toString('hex'),code,type,data,original,received])).rows[0].id_evento_integracion;
  }
  const a=await event('GYGTIMINGA',{date:'2026-10-22',start_time:'10:30',pickup_time:'09:15'},'2026-10-21 10:00','2026-10-21 10:01');
  await event('GYGTIMINGA',{date:'2026-10-22',start_time:'10:30',pickup_time:'09:15'},'2026-10-21 11:00','2026-10-21 11:01','modification');
  await event('GYGTIMINGA',{date:'2025-05-01',start_time:'07:00'},'2025-04-01 07:00','2026-10-21 16:45');
  await event('GYGTIMINGB',{date:'2026-10-22',start_time:'09:00'},'2026-10-21 13:00','2026-10-21 16:46');
  const uuid='11111111-2222-4333-8444-555555555555';
  await event(uuid,{booking:{uuid},availability:{start_at:'2026-10-22T02:00:00Z'},pickup:{pickup:{time:'18:45'}}},'2026-10-21 14:00','2026-10-21 14:01','new_booking','fareharbor');
  await event('GYGDATEONLY',{date:'2026-10-22'},'2026-10-21 13:01','2026-10-21 13:02');
  await event('GYGSPANISH',{date:'22 de octubre de 2026, 08:00'},'2026-10-21 09:00','2026-10-21 09:01');
  await event('GYGENGLISH',{date:'October 22, 2026 8:30 AM'},'2026-10-21 09:10','2026-10-21 09:11');
  await event('GYGCONFLICTTIME',{date:'22 de octubre de 2026, 08:00',start_time:'09:30'},'2026-10-21 12:00','2026-10-21 12:01');
  await event('GYGCONFLICTDATE',{date:'2026-10-22',start_time:'08:00'},'2026-10-21 12:30','2026-10-21 12:31');
  await event('GYGCONFLICTDATE',{date:'2026-10-23',start_time:'08:00'},'2026-10-21 12:30','2026-10-21 12:32','modification');
  await event('GYGUNKNOWN',{date:'fecha desconocida',start_time:'25:99',pickup_time:'no confiable'},null,'2026-10-21 17:00');
  await event('GYGCANCEL',{date:'2026-10-25',start_time:'07:00'},'2026-10-21 08:00','2026-10-21 08:01');
  await event('GYGCANCEL',{},'2026-10-21 09:00','2026-10-21 09:01','cancellation');
  const list=f=>service.listarCentro(service.validarConsulta({tab:'pendientes',date:'2026-10-21',...f}),{},db);
  const indicators=await service.obtenerIndicadores('2026-10-21',db);
  check('Indicadores del Resumen usan la misma fecha validada sin columnas ambiguas',indicators.pendientes===14&&indicators.sin_revisar===14&&indicators.urgentes===9&&indicators.sin_fecha===3);
  let result=await list({sort:'newest'});let rows=result.data;
  check('Más recientes usa última incorporación PostgreSQL, no fecha del mensaje',rows[0].external_booking_id==='GYGUNKNOWN'&&rows[1].external_booking_id==='GYGTIMINGB'&&rows[2].external_booking_id==='GYGTIMINGA');
  result=await list({sort:'oldest'});check('Más antiguas invierte última recepción del grupo',result.data.at(-1).external_booking_id==='GYGUNKNOWN');
  result=await list({sort:'service'});check('Orden por fecha y hora real antes de recepción',result.data[0].provider==='fareharbor'&&result.data[1].external_booking_id==='GYGSPANISH'&&result.data[2].external_booking_id==='GYGENGLISH');
  const group=rows.find(e=>e.external_booking_id==='GYGTIMINGA');
  check('Correo antiguo recuperado no reemplaza cronología externa vigente',group.service_date==='2026-10-22'&&group.service_time==='10:30:00'&&group.event_type==='modification'&&group.event_count===3);
  check('Primera y última recepción independientes de último evento externo',Date.parse(group.first_received_at)===Date.parse('2026-10-21T15:01:00Z')&&Date.parse(group.last_received_at)===Date.parse('2026-10-21T21:45:00Z')&&Date.parse(group.source_received_at)===Date.parse('2026-10-21T16:00:00Z'));
  check('Inicio y pickup son campos distintos',group.service_time==='10:30:00'&&group.pickup_time==='09:15:00');
  const fare=rows.find(e=>e.provider==='fareharbor');check('FareHarbor convierte fecha y hora a Cancún',fare.service_date==='2026-10-21'&&fare.service_time==='21:00:00'&&fare.pickup_time==='18:45:00');
  check('FareHarbor no presenta recepción del webhook como fecha original',fare.source_timestamp_kind==='webhook_received'&&fare.chronology_unverified);
  check('Fecha sin hora conserva horario por confirmar',rows.find(e=>e.external_booking_id==='GYGDATEONLY').service_time===null);
  const conflictTime=rows.find(e=>e.external_booking_id==='GYGCONFLICTTIME'),conflictDate=rows.find(e=>e.external_booking_id==='GYGCONFLICTDATE');
  check('Fuentes de hora incompatibles se señalan y no se inventa hora',conflictTime.time_conflict&&conflictTime.service_time===null);
  check('Fechas incompatibles con idéntica cronología no determinan servicio ni urgencia',conflictDate.date_conflict&&conflictDate.service_date===null&&!conflictDate.urgent);
  check('Datos ilegibles quedan pendientes sin hora ni pickup',rows.find(e=>e.external_booking_id==='GYGUNKNOWN').service_date===null&&rows.find(e=>e.external_booking_id==='GYGUNKNOWN').pickup_time===null);
  await event('GYGONLYKNOWNHOUR',{start_time:'08:00',pickup_time:'07:00'},'2026-10-21 10:00','2026-10-21 10:01');
  const onlyHour=(await list({q:'GYGONLYKNOWNHOUR'})).data[0];check('Hora explícita confiable sin fecha se muestra sin inventar día',onlyHour.service_date===null&&onlyHour.service_time==='08:00:00'&&onlyHour.pickup_time==='07:00:00');
  check('Cancelación sin fecha conserva último dato válido identificado',rows.find(e=>e.external_booking_id==='GYGCANCEL').schedule_from_previous&&rows.find(e=>e.external_booking_id==='GYGCANCEL').service_date==='2026-10-25');
  const history=await service.historialGrupo(a,{page:1,limit:25},db);
  check('Historial distingue recepción reciente y mensaje histórico',history.data.at(-1).service_date==='2025-05-01'&&Date.parse(history.data.at(-1).created_at)>Date.parse(history.data[0].created_at));
  const today=service.fechaCancun();await event('GYGPROXIMITY',{date:today},'2026-10-21 12:00','2026-10-21 12:01');
  check('Proximidad HOY usa calendario Cancún real',(await list({q:'GYGPROXIMITY'})).data[0].proximity==='today');
  await event('GYGPICKUPCONFLICT',{date:'2026-10-22',start_time:'08:00',pickup_time:'06:00'},'2026-10-21 10:00','2026-10-21 10:01');
  await event('GYGPICKUPCONFLICT',{date:'2026-10-22',start_time:'08:00',pickup_time:'07:00'},'2026-10-21 10:00','2026-10-21 10:02','modification');
  const pickupConflict=(await list({q:'GYGPICKUPCONFLICT'})).data[0];check('Pickup contradictorio se confirma por separado sin ocultar inicio válido',pickupConflict.pickup_conflict&&pickupConflict.pickup_time===null&&pickupConflict.service_time==='08:00:00');
  await event('GYGSAMEORIGINAL',{date:'2026-10-22',start_time:'08:00'},'2026-10-21 10:00','2026-10-21 10:01');
  await event('GYGSAMEORIGINAL',{date:'2026-10-22',start_time:'09:00'},'2026-10-21 10:00','2026-10-21 10:02','modification');
  check('Dos inicios distintos sin secuencia externa requieren verificación',(await list({q:'GYGSAMEORIGINAL'})).data[0].time_conflict&&(await list({q:'GYGSAMEORIGINAL'})).data[0].service_time===null);
  await event('GYGINVALIDCLOCK',{date:'2026-10-22',start_time:'25:00'},'2026-10-21 10:00','2026-10-21 10:01');
  check('Hora explícita inválida no se convierte en hora real',(await list({q:'GYGINVALIDCLOCK'})).data[0].time_unverified&&(await list({q:'GYGINVALIDCLOCK'})).data[0].service_time===null);
  await event('GYGMIDNIGHT',{date:'October 22, 2026 12:00 AM'},'2026-10-21 10:00','2026-10-21 10:01');
  await event('GYGNOON',{date:'October 22, 2026 12:00 PM'},'2026-10-21 10:00','2026-10-21 10:01');
  check('Medianoche y mediodía se interpretan sin invertir AM/PM',(await list({q:'GYGMIDNIGHT'})).data[0].service_time==='00:00:00'&&(await list({q:'GYGNOON'})).data[0].service_time==='12:00:00');
  await event('GYGMISSINGORIGINAL',{date:'2026-10-22'},null,'2026-10-21 10:00');await event('GYGMISSINGORIGINAL',{date:'2026-10-23'},null,'2026-10-21 11:00');
  check('Sin cronología original no se resuelve una contradicción con recepción',(await list({q:'GYGMISSINGORIGINAL'})).data[0].date_conflict&&(await list({q:'GYGMISSINGORIGINAL'})).data[0].chronology_unverified);
  const following=new Date(today+'T12:00:00Z');following.setUTCDate(following.getUTCDate()+1);await event('GYGTOMORROW',{date:following.toISOString().slice(0,10)},'2026-10-21 10:00','2026-10-21 10:01');following.setUTCDate(following.getUTCDate()+1);await event('GYGUPCOMING',{date:following.toISOString().slice(0,10)},'2026-10-21 10:00','2026-10-21 10:01');
  check('MAÑANA y PRÓXIMAMENTE usan fecha de servicio en calendario Cancún',(await list({q:'GYGTOMORROW'})).data[0].proximity==='tomorrow'&&(await list({q:'GYGUPCOMING'})).data[0].proximity==='upcoming');
  await event(uuid,{booking:{uuid},availability:{start_at:'2026-10-23T14:00:00Z'}},'2026-10-21 15:00','2026-10-21 15:01','modification','fareharbor');
  check('Cambios FareHarbor incompatibles sin fecha externa exigen verificación',(await list({provider:'fareharbor'})).data[0].date_conflict);
  await db.query("UPDATE integracion_sync_estado SET avisos_activados=false WHERE source='publicacion' AND provider='getyourguide'");
  const beforePause=await service.obtenerIndicadores('2026-10-21',db);
  await event('GYGRETAINED',{date:'2026-10-21',start_time:'06:00'},'2026-10-21 18:00','2026-10-21 18:01');
  check('Evento retenido no participa en ningún orden ni fecha del grupo',(await list({q:'GYGRETAINED',sort:'newest'})).pagination.total===0&&(await list({q:'GYGRETAINED',sort:'service'})).pagination.total===0);
  await event('GYGTIMINGA',{date:'2026-10-30',start_time:'08:00'},'2026-10-21 18:00','2026-10-21 18:01','modification');
  const published=(await list({q:'GYGTIMINGA'})).data[0];check('Actualización retenida tampoco filtra horarios ni recepción al grupo publicado',published.service_date==='2026-10-22'&&published.event_count===3&&Date.parse(published.last_received_at)===Date.parse('2026-10-21T21:45:00Z'));
  check('Nuevos horarios retenidos tampoco cambian indicadores',JSON.stringify(await service.obtenerIndicadores('2026-10-21',db))===JSON.stringify(beforePause));
  await db.query("UPDATE integracion_sync_estado SET avisos_activados=true WHERE source='publicacion' AND provider='getyourguide'");
  await db.query(`INSERT INTO eventos_integracion(provider,external_event_id,external_booking_id,event_type,normalized_data,source_received_at,created_at)
    SELECT 'getyourguide','timing-volume-'||n,'GYGVOLUME'||n,'new_booking',jsonb_build_object('date','2026-11-01','start_time',CASE WHEN n%2=0 THEN '08:00' ELSE '09:00' END),timestamp '2026-10-21 12:00',timestamp '2026-10-21 13:00' FROM generate_series(1,1000)n`);
  for(const sort of ['newest','oldest','service']){
   const first=await list({q:'GYGVOLUME',sort,page:1}),second=await list({q:'GYGVOLUME',sort,page:2});
   check('Desempates estables entre páginas: '+sort,first.pagination.total===1000&&first.data.length===25&&second.data.length===25&&!first.data.some(a=>second.data.some(b=>a.id_evento_integracion===b.id_evento_integracion)));
  }
  check('Orden compatible con plataforma, tipo, revisión, rango y urgencia',(await list({sort:'newest',provider:'getyourguide',event_type:'modification',review_status:'pending_review',from:'2026-10-22',to:'2026-10-22',urgent:'true',q:'GYGTIMINGA'})).pagination.total===1);
  await db.query("INSERT INTO roles(nombre) VALUES ('Administrador'),('Consulta'); INSERT INTO usuarios(id_rol,nombre,correo,password,estado,alcance_plataformas) VALUES(1,'Aislado','a@example.invalid','sintetico',true,'all'),(2,'Lectura','b@example.invalid','sintetico',true,'all'),(2,'Limitado','c@example.invalid','sintetico',true,'selected')");
  process.env.JWT_SECRET='centro-timing-lab-clave-sintetica';const express=require('express'),request=require('supertest'),jwt=require('jsonwebtoken'),app=express();app.use('/api/eventos-integracion',require('../backend/routes/eventosIntegracion.routes'));
  const get=(id,sort)=>request(app).get('/api/eventos-integracion/centro?sort='+sort).set('Authorization','Bearer '+jwt.sign({id_usuario:id},process.env.JWT_SECRET));
  check('Roles existentes respetados con nuevos horarios y orden',(await get(1,'service')).status===200&&(await get(2,'oldest')).status===200&&(await get(3,'newest')).status===403);
  check('SQL inyectado en selector se rechaza',(await get(1,'newest;DROP%20TABLE')).status===400);
  const report={status:'PASSED',checks,productionWrites:false,disposableDatabase:name,migrations:false};fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'postgres-lab.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{if(db)await db.end();if(created){assert.match(name,/^ctsk_timing_lab_[a-f0-9]{12}$/);await admin.query('DROP DATABASE "'+name+'" WITH(FORCE)');}await admin.end();}
}
main().catch(e=>{console.error('TIMING_LAB_FAILED',e.code||e.name,e.message?.slice(0,220),e.stack?.split('\n').find(l=>l.includes('centroAvisosTimingLab')));process.exitCode=1;});
