const L=require('./release03bSafety.cjs'),{S}=L,fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
async function run(ctx){
 const {m,admin,runtime,runtimeRaw,report,passed,secrets,barrier,ps,seal}=ctx;
 const role=(await runtime.query('SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolinherit FROM pg_roles WHERE rolname=current_user')).rows[0];assert.ok(Object.values(role).every(v=>v===false));
 assert.deepEqual((await runtime.query('SELECT rolname FROM pg_roles WHERE rolname<>current_user AND pg_has_role(current_user,oid,\'MEMBER\')')).rows,[]);
 await admin.query('CREATE SCHEMA release03b_probe');await admin.query('CREATE TABLE release03b_probe.owned_probe(id integer PRIMARY KEY)');await admin.query('INSERT INTO release03b_probe.owned_probe VALUES(1)');await admin.query('GRANT USAGE ON SCHEMA release03b_probe TO '+S.ident(m.runtime));await admin.query('GRANT SELECT ON release03b_probe.owned_probe TO '+S.ident(m.runtime));
 const denied=[];
 for(const [name,sql] of [
  ['CREATE_TABLE','CREATE TABLE public.r03b_forbidden(id integer)'],['ALTER_TABLE','ALTER TABLE release03b_probe.owned_probe ADD COLUMN forbidden integer'],
  ['DROP','DROP TABLE release03b_probe.owned_probe'],['TRUNCATE','TRUNCATE release03b_probe.owned_probe'],
  ['DELETE_RESERVATIONS','DELETE FROM public.reservaciones WHERE false'],['DELETE_EVENTS','DELETE FROM public.eventos_integracion WHERE false'],
  ['DELETE_AUDIT','DELETE FROM public.bitacora WHERE false'],['TEMP','CREATE TEMP TABLE r03b_forbidden_temp(id integer)'],
  ['GRANT_ROLE','GRANT '+S.ident(m.owner)+' TO '+S.ident(m.runtime)],['ALTER_ROLE','ALTER ROLE '+S.ident(m.owner)+' SUPERUSER'],
  ['DEFAULT_PRIVILEGES','ALTER DEFAULT PRIVILEGES FOR ROLE '+S.ident(m.owner)+' GRANT SELECT ON TABLES TO '+S.ident(m.runtime)]
 ]){
  const c=await runtimeRaw.connect();try{await L.identity(c,m,m.runtime);await c.query('BEGIN');let error;try{await c.query(sql);}catch(e){error=e;}await c.query('ROLLBACK');assert.equal(error?.code,'42501');denied.push({name,code:error.code});}finally{c.release();}
 }
 for(const [name,sql] of [['CREATE_ROLE','CREATE ROLE r03b_forbidden_role'],['CREATE_DATABASE','CREATE DATABASE r03b_forbidden_database']]){await L.identity(runtime,m,m.runtime);await assert.rejects(runtime.query(sql),e=>e.code==='42501');denied.push({name,code:'42501'});}
 const grantsBefore=(await admin.query("SELECT relacl::text acl FROM pg_class WHERE oid='release03b_probe.owned_probe'::regclass")).rows;
 const c=await runtimeRaw.connect();const notices=[];c.on('notice',n=>notices.push(n.code));try{await L.identity(c,m,m.runtime);await c.query('GRANT SELECT ON release03b_probe.owned_probe TO '+S.ident(m.owner));}finally{c.release();}
 assert.deepEqual((await admin.query("SELECT relacl::text acl FROM pg_class WHERE oid='release03b_probe.owned_probe'::regclass")).rows,grantsBefore);assert.ok(notices.length);report.denied={checks:denied,grantWithoutOption:{changed:false,noticeCodes:notices}};
 passed('effective_runtime_denials',report.denied);
 const tables=(await admin.query("SELECT tablename,has_table_privilege($1,format('public.%I',tablename),'SELECT') sel,has_table_privilege($1,format('public.%I',tablename),'INSERT') ins,has_table_privilege($1,format('public.%I',tablename),'UPDATE') upd,has_table_privilege($1,format('public.%I',tablename),'DELETE') del,has_table_privilege($1,format('public.%I',tablename),'TRUNCATE') trunc FROM pg_tables WHERE schemaname='public' ORDER BY tablename",[m.runtime])).rows;
 report.privileges.effectiveTables=tables;assert.ok(tables.every(t=>t.sel&&!t.trunc));assert.deepEqual(tables.filter(t=>t.del).map(t=>t.tablename),['usuario_plataformas_visibles']);
 report.privileges.attributes=role;report.privileges.memberships=[];
 report.privileges.database=(await runtime.query("SELECT has_database_privilege(current_user,current_database(),'CONNECT') AS can_connect,has_database_privilege(current_user,current_database(),'CREATE') AS can_create,has_database_privilege(current_user,current_database(),'TEMP') AS can_temp,has_schema_privilege(current_user,'public','CREATE') AS schema_create")).rows[0];
 assert.deepEqual(report.privileges.database,{can_connect:true,can_create:false,can_temp:false,schema_create:false});
 report.privileges.owners=(await admin.query("SELECT pg_get_userbyid(datdba) database_owner,(SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND pg_get_userbyid(c.relowner)=$1) runtime_owned_relations FROM pg_database WHERE datname=current_database()",[m.runtime])).rows[0];assert.equal(report.privileges.owners.database_owner,m.owner);assert.equal(report.privileges.owners.runtime_owned_relations,0);
 report.privileges.controlFunctions=(await runtime.query("SELECT p.proname,has_function_privilege(current_user,p.oid,'EXECUTE') allowed FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='pg_catalog' AND p.proname LIKE 'pg_control_%' ORDER BY p.proname")).rows;
 assert.deepEqual(report.privileges.controlFunctions.filter(f=>f.allowed).map(f=>f.proname),['pg_control_system']);
 const sequences=(await runtime.query("SELECT c.relname,has_sequence_privilege(current_user,c.oid,'USAGE') AS can_use,has_sequence_privilege(current_user,c.oid,'UPDATE') AS can_set FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S' ORDER BY c.relname")).rows;
 assert.equal(sequences.filter(s=>s.can_use).length,14);assert.ok(sequences.every(s=>!s.can_set));
 for(const sequence of sequences.filter(s=>s.can_use))await runtime.query('SELECT nextval($1::regclass)',['public.'+sequence.relname]);
 report.privileges.sequenceChecks={usage:14,update:0,actualNextvalTests:14,sequenceGapsExpected:true};
 const users={};const roles=Object.fromEntries((await admin.query("SELECT nombre,id_rol FROM roles WHERE nombre IN ('Administrador','Consulta')")).rows.map(r=>[r.nombre,r.id_rol]));
 for(const [label,rol,scope] of [['admin','Administrador','all'],['all','Consulta','all'],['selected','Consulta','selected']]){
  const password=crypto.randomBytes(24).toString('hex'),email='release03b-'+label+'@demo.invalid';
  const r=(await admin.query('INSERT INTO usuarios(id_rol,nombre,correo,password,estado,alcance_plataformas) VALUES($1,$2,$3,$4,true,$5) RETURNING id_usuario',[roles[rol],'Usuario ficticio R03B '+label,email,await require('bcryptjs').hash(password,8),scope])).rows[0];users[label]={id:r.id_usuario,email,password};
 }
 fs.writeFileSync(path.join(m.dir,'synthetic-users.dpapi'),seal(JSON.stringify(users)),{flag:'wx'});
 require('../backend/config/desktopConfiguration').initialize({JWT_SECRET:secrets.jwt,GYG_GMAIL_SYNC_ENABLED:'false'});
 const file=require.resolve('../backend/config/database');require.cache[file]={id:file,filename:file,loaded:true,exports:runtime};
 const originalError=console.error;report.backendDiagnosticCodes=[];console.error=(...args)=>{const error=args.find(a=>a&&typeof a==='object'&&a.code);report.backendDiagnosticCodes.push(/^[A-Z0-9]{5}$/.test(error?.code||'')?error.code:'APPLICATION_ERROR');};
 const app=require('../backend/server');const server=http.createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));barrier.allowApi(server.address().port);
 const tokens={},calls=[];
 async function req(label,method,url,body){return new Promise((resolve,reject)=>{const data=body===undefined?null:JSON.stringify(body);const r=http.request({host:'127.0.0.1',port:server.address().port,path:url,method,headers:{...(tokens[label]?{Authorization:'Bearer '+tokens[label]}:{}),...(data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{})}},res=>{let text='';res.on('data',x=>text+=x);res.on('end',()=>{let b;try{b=JSON.parse(text);}catch{b={};}calls.push({profile:label,method,path:url,status:res.statusCode});resolve({status:res.statusCode,body:b});});});r.on('error',reject);r.end(data);});}
 function status(r,expected,label){if(r.status!==expected){fs.writeFileSync(path.join(m.dir,'api-failure.json'),JSON.stringify({label,status:r.status,expected,keys:Object.keys(r.body),errors:r.body.errores||[],missing:r.body.missing_fields||[]}));L.fail(('R03B_API_'+label+'_'+r.status).toUpperCase());}return r.body.datos||r.body.data||r.body;}
 async function get(label,url){return status(await req(label,'GET',url),200,'GET_'+url.replace(/[^a-zA-Z]/g,'_'));}
 const fixture={users:Object.fromEntries(Object.entries(users).map(([k,v])=>[k,v.id])),date:'2099-06-21'};
 try{
  for(const label of Object.keys(users)){const r=await req(label,'POST','/api/auth/login',{correo:users[label].email,password:users[label].password});status(r,200,'LOGIN');assert.ok(r.body.token);tokens[label]=r.body.token;await get(label,'/api/auth/sesion');}
  for(const [key,url,body] of [
   ['tour','tours',{nombre:'Tour ficticio RELEASE03B',descripcion:'Solo laboratorio',activo:true}],
   ['country','paises',{nombre:'Pais ficticio R03B'}],['platformA','plataformas',{nombre:'R03B Plataforma A'}],['platformB','plataformas',{nombre:'R03B Plataforma B'}],
   ['vehicle12','vehiculos',{identificador:'Unidad ficticia R03B 12',capacidad:12,estado:true}],['vehicle8','vehiculos',{identificador:'Unidad ficticia R03B 8',capacidad:8,estado:true}],
   ['operator','operadores',{nombre:'Operador ficticio R03B',estado:true}],['guide','guias',{nombre:'Guia ficticia R03B',estado:true}]
  ]){const data=status(await req('admin','POST','/api/'+url,body),201,'CATALOG_'+url);fixture[key]=data;await get('admin','/api/'+url);}
  const scopeBody={alcance_plataformas:'selected',platform_ids:[fixture.platformA.id_plataforma]};
  const missing=await req('admin','PATCH','/api/usuarios/'+users.selected.id,scopeBody);assert.equal(missing.status,500);
  const codes=(await admin.query("SELECT has_column_privilege($1,'public.plataformas','id_plataforma','UPDATE') allowed",[m.runtime])).rows[0];assert.equal(codes.allowed,false);
  await admin.query('GRANT UPDATE(id_plataforma) ON public.plataformas TO '+S.ident(m.runtime));
  report.privileges.effectiveColumnCorrection=(await runtime.query("SELECT has_column_privilege(current_user,'public.plataformas','id_plataforma','UPDATE') id_update,has_table_privilege(current_user,'public.plataformas','UPDATE') whole_table_update")).rows[0];assert.deepEqual(report.privileges.effectiveColumnCorrection,{id_update:true,whole_table_update:false});
  status(await req('admin','PATCH','/api/usuarios/'+users.selected.id,scopeBody),200,'USER_SCOPE_AFTER_COLUMN_GRANT');
  report.permissionCorrection={service:'usuarios.service.prepararAlcanceUsuario',statement:'SELECT id_plataforma ... FOR KEY SHARE',initialApiStatus:500,sqlState:'42501',grant:'UPDATE(id_plataforma) ON public.plataformas',tableWideUpdate:false};passed('minimal_permission_correction',report.permissionCorrection);
  const reserve=platform=>({fecha:fixture.date,id_tour:fixture.tour.id_tour,id_pais:fixture.country.id_pais,id_plataforma:platform,nombre_cliente:'Visitante ficticio RELEASE03B',pax:2,ninos:0,pickup_place:'Lobby ficticio',pickup_time:'07:15',turno:'Mañana',precio_total:1000,deposito:100,saldo:900,estado:'Pendiente'});
  fixture.reservation=status(await req('admin','POST','/api/reservaciones',reserve(fixture.platformA.id_plataforma)),201,'CREATE_RESERVATION');
  fixture.otherReservation=status(await req('admin','POST','/api/reservaciones',reserve(fixture.platformB.id_plataforma)),201,'CREATE_OTHER_RESERVATION');
  const rid=fixture.reservation.id_reservacion;
  const beforeRollback=(await runtime.query('SELECT (SELECT count(*)::int FROM reservaciones) reservations,(SELECT count(*)::int FROM bitacora) audit')).rows[0];
  await admin.query('REVOKE INSERT ON public.bitacora FROM '+S.ident(m.runtime));
  try{status(await req('admin','POST','/api/reservaciones',reserve(fixture.platformA.id_plataforma)),500,'ROLLBACK_AUDIT_PERMISSION');}finally{await admin.query('GRANT INSERT ON public.bitacora TO '+S.ident(m.runtime));}
  const afterRollback=(await runtime.query('SELECT (SELECT count(*)::int FROM reservaciones) reservations,(SELECT count(*)::int FROM bitacora) audit')).rows[0];assert.deepEqual(afterRollback,beforeRollback);report.transactionRollback={auditPermissionDenied:true,reservationCountUnchanged:true,auditCountUnchanged:true,sequencesMayAdvance:true};
  status(await req('admin','PATCH','/api/reservaciones/'+rid,{observaciones:'Cambio ficticio auditado R03B'}),200,'UPDATE_RESERVATION');
  await get('admin','/api/reservaciones/'+rid);await get('admin','/api/reservaciones?fecha='+fixture.date);
  fixture.operation=status(await req('admin','POST','/api/operaciones',{fecha:fixture.date,id_tour:fixture.tour.id_tour,turno:'Mañana',numero_grupo:1,hora_inicio:'07:15',id_guia:fixture.guide.id_guia}),201,'CREATE_OPERATION');
  fixture.transport=status(await req('admin','POST','/api/transportes',{id_operacion_tour:fixture.operation.id_operacion_tour,estado:'Activo'}),201,'CREATE_TRANSPORT');
  status(await req('admin','PATCH','/api/reservaciones/'+rid+'/transporte',{id_transporte_operacion:fixture.transport.id_transporte_operacion}),200,'ASSIGN_RESERVATION');
  status(await req('admin','PATCH','/api/transportes/'+fixture.transport.id_transporte_operacion,{id_vehiculo:fixture.vehicle12.id_vehiculo,id_operador:fixture.operator.id_operador}),200,'ASSIGN_VEHICLE');
  status(await req('admin','PATCH','/api/transportes/'+fixture.transport.id_transporte_operacion,{id_vehiculo:fixture.vehicle8.id_vehiculo}),200,'CHANGE_VEHICLE');
  for(const url of ['/api/dashboard/resumen?fecha='+fixture.date,'/api/daily/operativo?fecha='+fixture.date,'/api/bitacora','/api/reservaciones?fecha_hasta='+fixture.date,'/api/operaciones?fecha='+fixture.date,'/api/transportes?fecha='+fixture.date])await get('admin',url);
  const events=require('../backend/services/eventosIntegracion.service');
  async function event(label,provider='getyourguide',date='2099-06-21'){const r=await events.registrarEventoIntegracion({provider,external_event_id:'R03B-'+label,external_booking_id:'R03B-book-'+label,event_type:'new_booking',review_status:'pending_review',normalized_data:provider==='getyourguide'?{date,pax:2,customer_name:'Visitante ficticio GYG R03B',customer_phone:'0000000000',pickup_place:'Lobby ficticio',price:1000}:{booking:{display_id:'R03B-EXPIRED'},availability:{start_at:'2020-01-05T07:15:00-05:00',item:{name:'Actividad ficticia R03B'}},customers:{total:2}}},runtime);return r.event;}
  fixture.applyEvent=await event('apply');fixture.archiveEvent=await event('archive','fareharbor','2020-01-05');
  status(await req('admin','PATCH','/api/eventos-integracion/'+fixture.applyEvent.id_evento_integracion+'/revision',{accion:'approve',nota:'Aprobacion exclusivamente ficticia'}),200,'APPROVE_EVENT');
  const applied=status(await req('admin','POST','/api/eventos-integracion/'+fixture.applyEvent.id_evento_integracion+'/aplicar',{completar:{id_tour:fixture.tour.id_tour,id_pais:fixture.country.id_pais,pickup_time:'08:00',turno:'Mañana'}}),201,'APPLY_EVENT');
  const linked=(await runtime.query('SELECT id_reservacion FROM reservas_integracion_link WHERE provider=$1 AND external_booking_id=$2',['getyourguide',fixture.applyEvent.external_booking_id])).rows;assert.equal(linked.length,1);assert.ok(!ctx.keys.reservaciones.some(k=>k.id_reservacion===linked[0].id_reservacion));
  status(await req('admin','PATCH','/api/eventos-integracion/'+fixture.archiveEvent.id_evento_integracion+'/archivo',{motivo:'Actividad ficticia transcurrida R03B'}),200,'ARCHIVE_EVENT');
  const summary=await get('admin','/api/eventos-integracion/resumen');assert.ok(!summary.events.some(e=>[fixture.applyEvent.id_evento_integracion,fixture.archiveEvent.id_evento_integracion].includes(e.id_evento_integracion)));
  await get('admin','/api/eventos-integracion?archived=true');
  for(const label of ['all','selected']){
   const visible=await get(label,'/api/reservaciones');const rows=Array.isArray(visible)?visible:visible.data;assert.ok(Array.isArray(rows));
   if(label==='selected'){assert.ok(rows.every(r=>r.id_plataforma===fixture.platformA.id_plataforma));status(await req(label,'GET','/api/reservaciones/'+fixture.otherReservation.id_reservacion),404,'SELECTED_OTHER_DETAIL');}
   status(await req(label,'PATCH','/api/reservaciones/'+rid,{observaciones:'No permitido'}),403,'READONLY_RESERVATION');
   status(await req(label,'PATCH','/api/eventos-integracion/'+fixture.archiveEvent.id_evento_integracion+'/archivo',{motivo:'No permitido'}),403,'READONLY_ARCHIVE');
  }
  await get('all','/api/eventos-integracion/resumen');await get('all','/api/eventos-integracion');
  for(const method of ['GET','HEAD']){const r=await req('selected',method,'/api/eventos-integracion/resumen');status(r,403,'SELECTED_SUMMARY');assert.ok(!r.body.counts&&!r.body.datos);}
  status(await req('selected','GET','/api/eventos-integracion'),403,'SELECTED_EVENTS');status(await req('selected','GET','/api/operaciones'),403,'SELECTED_OPERATIONS');
  const audit=(await runtime.query('SELECT count(*)::int n FROM bitacora WHERE id_reservacion=$1',[rid])).rows[0].n;assert.ok(audit>=2);
  report.functional={apiCalls:calls,fixtureIds:{reservation:rid,otherReservation:fixture.otherReservation.id_reservacion,operation:fixture.operation.id_operacion_tour,transport:fixture.transport.id_transporte_operacion,appliedEvent:fixture.applyEvent.id_evento_integracion,archivedEvent:fixture.archiveEvent.id_evento_integracion,newLinkedReservation:linked[0].id_reservacion},auditRowsForFixture:audit,realApplication:true,realArchive:true,scopeAllReadOnly:true,selectedRestricted:true};
  passed('real_api_functionality_and_scope',{calls:calls.length,auditRows:audit,allOriginalRowsExcludedFromWrites:true});
 }finally{console.error=originalError;server.closeAllConnections();await new Promise(r=>server.close(r));}
 await require('./release03bElectronDriver.cjs').run({...ctx,users,fixture});
}
module.exports={run};
