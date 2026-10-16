// ACCESS-SCOPE-04A: crea una instancia PostgreSQL exclusiva, nunca usa .env.
// No instala servicios ni modifica la instancia configurada de la empresa.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const request = require('supertest');

const ROOT = path.resolve(__dirname, '..');
const BIN = process.env.ACCESS_SCOPE_PG_BIN || 'C:\\Program Files\\PostgreSQL\\18\\bin';
const RUN = crypto.randomBytes(6).toString('hex');
const LAB_ROOT = path.join(ROOT, '.access-scope-lab', RUN);
const DATA = path.join(LAB_ROOT, 'data');
const DB = 'access_scope_04a_' + RUN + '_test';
const USER = 'access_scope_lab';
const PASSWORD = crypto.randomBytes(32).toString('hex');
const TEST_PASSWORD = 'AccessScopeSynthetic!123';
const FECHA = '2027-01-15';
const report = { run: RUN, current_database_modified: false, migration: '016_alcance_plataformas_usuarios.sql', checks: [], failures: [], environment: {}, backups: {} };
let port, started = false, pool, systemId;
const clients = [];
const normalize = (value) => path.resolve(value).replaceAll('\\', '/').toLowerCase();
const identifier = (value) => { if (!/^access_scope_04a_[a-f0-9]{12}(?:_restore|_fresh|_atomic)?_test$/.test(value)) throw Error('Nombre de laboratorio invalido'); return '"' + value + '"'; };
const connection = (database) => ({ host: '127.0.0.1', port, user: USER, password: PASSWORD, database, connectionTimeoutMillis: 5000 });
function binary(name, args, pgDatabase) {
 const result = cp.spawnSync(path.join(BIN, name + '.exe'), args, {
  windowsHide: true, encoding: 'utf8', timeout: 30000,
  env: { ...process.env, PGPASSWORD: PASSWORD, PGHOST: '127.0.0.1', PGPORT: String(port), PGUSER: USER, PGDATABASE: pgDatabase || 'postgres' }
 });
 if (result.status !== 0) throw Error(name + ': ' + (result.stderr || result.error || result.stdout));
 return result.stdout;
}
async function verify(db, name) {
 const identity = (await db.query(`SELECT current_database() AS database_name, current_user AS connection_user,
  host(inet_server_addr()) AS address, inet_server_port() AS port, current_schema() AS schema,
  current_setting('data_directory') AS data_directory, current_setting('server_version') AS version,
  system_identifier::text AS system_identifier FROM pg_control_system()`)).rows[0];
 assert.equal(identity.database_name, name); assert.equal(identity.connection_user, USER);
 assert.equal(identity.address, '127.0.0.1'); assert.equal(identity.port, port);
 assert.equal(normalize(identity.data_directory), normalize(DATA));
 if (systemId) assert.equal(identity.system_identifier, systemId); else systemId = identity.system_identifier;
 return identity;
}
async function connect(name) {
 const client = new Client(connection(name)); await client.connect(); clients.push(client);
 await verify(client, name); return client;
}
async function check(name, fn) {
 try { await fn(); report.checks.push(name); console.log('PASS ' + name); }
 catch (error) { report.failures.push({ name, code: error.code || null, message: error.message }); console.error('FAIL ' + name + ': ' + error.message); }
}
async function expectPgError(db, sql, params, code) {
 await assert.rejects(db.query(sql, params), (error) => error.code === code);
}
async function availablePort() {
 const server = net.createServer(); await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
 const value = server.address().port; await new Promise((resolve) => server.close(resolve)); return value;
}
async function main() {
 if (!normalize(LAB_ROOT).startsWith(normalize(path.join(ROOT, '.access-scope-lab')) + '/')) throw Error('Directorio fuera del laboratorio');
 for (const name of ['initdb', 'pg_ctl', 'pg_dump', 'pg_restore']) if (!fs.existsSync(path.join(BIN, name + '.exe'))) throw Error('Herramienta PostgreSQL ausente: ' + name);
 fs.mkdirSync(LAB_ROOT, { recursive: true });
 const pwfile = path.join(LAB_ROOT, 'initdb-password.tmp'); fs.writeFileSync(pwfile, PASSWORD + '\n', { mode: 0o600 });
 port = await availablePort();
 try { binary('initdb', ['-D', DATA, '-U', USER, '--encoding=UTF8', '--locale=C', '--auth=scram-sha-256', '--pwfile=' + pwfile]); }
 finally { fs.unlinkSync(pwfile); }
 try { binary('pg_ctl', ['-D', DATA, '-l', path.join(LAB_ROOT, 'postgres.log'), '-o', '-p ' + port + ' -h 127.0.0.1', '-w', 'start']); }
 finally { started = fs.existsSync(path.join(DATA, 'postmaster.pid')); }
 const admin = await connect('postgres');
 report.environment = { ...await verify(admin, 'postgres'), laboratory_root: LAB_ROOT, database_name: DB };
 fs.writeFileSync(path.join(LAB_ROOT, 'identity.json'), JSON.stringify(report.environment, null, 2));
 await verify(admin, 'postgres'); await admin.query('CREATE DATABASE ' + identifier(DB));
 const db = await connect(DB);
 const schema = fs.readFileSync(path.join(ROOT, 'database/schema.sql'), 'utf8').replace(/\r\n/g, '\n');
 const migration = fs.readFileSync(path.join(ROOT, 'database/migrations/016_alcance_plataformas_usuarios.sql'), 'utf8');
 report.migration_sha256 = crypto.createHash('sha256').update(migration).digest('hex');
 const oldSchema = schema
  .replace("    alcance_plataformas VARCHAR(20) NOT NULL DEFAULT 'selected',\n", '')
  .replace(/REFERENCES roles\(id_rol\),\n\n    CONSTRAINT chk_usuarios_alcance_plataformas\n        CHECK \(alcance_plataformas IN \('all', 'selected'\)\)/, 'REFERENCES roles(id_rol)')
  .replace(/CREATE TABLE usuario_plataformas_visibles \([\s\S]*?\n\);\n/, '');
 assert(!oldSchema.includes('CREATE TABLE usuario_plataformas_visibles'));
 assert(!oldSchema.includes("alcance_plataformas VARCHAR"));
 await verify(db, DB); await db.query(oldSchema);
 const roleRows = (await db.query("INSERT INTO roles(nombre) VALUES ('Administrador'), ('Consulta') RETURNING id_rol, nombre")).rows;
 const roles = Object.fromEntries(roleRows.map((row) => [row.nombre, row.id_rol]));
 const platformRows = (await db.query("INSERT INTO plataformas(nombre) VALUES ('FareHarbor sintetico'), ('GetYourGuide sintetico'), ('Externa sintetica') RETURNING id_plataforma, nombre")).rows;
 const [FH, GYG, EXT] = platformRows.map((row) => row.id_plataforma);
 const hash = await bcrypt.hash(TEST_PASSWORD, 10);
 const users = {};
 for (const [key, rol] of [['admin','Administrador'], ['admin2','Administrador'], ['all','Consulta'], ['selected','Consulta'], ['empty','Consulta']]) {
  users[key] = (await db.query('INSERT INTO usuarios(id_rol,nombre,correo,password,estado) VALUES ($1,$2,$3,$4,true) RETURNING id_usuario', [roles[rol], 'Sintetico ' + key, key + '@example.test', hash])).rows[0].id_usuario;
 }
 const originalUsers = (await db.query('SELECT id_usuario,id_rol,nombre,correo,password,estado FROM usuarios ORDER BY id_usuario')).rows;
 const tourIds = [];
 for(let i=0;i<14;i++) tourIds.push((await db.query('INSERT INTO tours(nombre,descripcion,activo) VALUES ($1,$2,true) RETURNING id_tour', ['Tour sintetico ' + i, 'Solo laboratorio'])).rows[0].id_tour);
 const pais = (await db.query("INSERT INTO paises(nombre) VALUES ('Pais sintetico') RETURNING id_pais")).rows[0].id_pais;
 const reservations=[];
 for(let i=0;i<42;i++) {
  const visible=i<30; const plataforma=visible ? (i%2 ? FH : GYG) : EXT;
  const fecha=i===0?'2020-01-05':FECHA; const estado=i===1?'Cancelada':'Pendiente';
  const row=(await db.query(`INSERT INTO reservaciones(codigo,fecha,id_tour,id_pais,id_plataforma,nombre_cliente,pax,pickup_place,pickup_time,turno,precio_total,estado,fecha_registro,ultima_actualizacion)
   VALUES ($1,$2,$3,$4,$5,$6,$7,'Hotel sintetico','08:00','Mañana',100,$8,$9,$9) RETURNING id_reservacion`,
   [(visible?'VISIBLE-':'OCULTA-')+i,fecha,tourIds[visible?i%5:5+(i-30)%6],pais,plataforma,visible?'Cliente visible '+i:'Cliente oculto',visible?2:10,estado,visible?'2027-01-01':'2028-01-01'])).rows[0];
  reservations.push({ ...row, visible, plataforma, codigo:(visible?'VISIBLE-':'OCULTA-')+i });
 }
 const reservationBefore=(await db.query('SELECT * FROM reservaciones ORDER BY id_reservacion')).rows;
 const backup=path.join(LAB_ROOT,'before-016.dump');
 await verify(db, DB); binary('pg_dump',['--format=custom','--no-owner','--file='+backup,'--dbname='+DB],DB);
 report.backups.before_migration={ path: backup, sha256: crypto.createHash('sha256').update(fs.readFileSync(backup)).digest('hex') };
 await verify(db, DB); await db.query(migration);
 await check('Migracion 016 conserva todos los usuarios, roles y hashes',async()=>{
  assert.deepEqual((await db.query('SELECT id_usuario,id_rol,nombre,correo,password,estado FROM usuarios ORDER BY id_usuario')).rows,originalUsers);
  assert((await db.query('SELECT alcance_plataformas FROM usuarios')).rows.every(row=>row.alcance_plataformas==='all'));
  assert.deepEqual((await db.query('SELECT * FROM reservaciones ORDER BY id_reservacion')).rows,reservationBefore);
 });
 await check('Default selected, NOT NULL y CHECK real',async()=>{
  const inserted=(await db.query("INSERT INTO usuarios(id_rol,nombre,correo,password,estado) VALUES ($1,'Default sintetico','default@example.test',$2,true) RETURNING alcance_plataformas",[roles.Consulta,hash])).rows[0];
  assert.equal(inserted.alcance_plataformas,'selected');
  await expectPgError(db,'UPDATE usuarios SET alcance_plataformas=$1 WHERE id_usuario=$2',['otro',users.all],'23514');
  await expectPgError(db,'UPDATE usuarios SET alcance_plataformas=NULL WHERE id_usuario=$1',[users.all],'23502');
 });
 await check('FK y PK compuesta impiden asignaciones inexistentes o duplicadas',async()=>{
  await db.query('INSERT INTO usuario_plataformas_visibles VALUES ($1,$2)',[users.selected,FH]);
  await expectPgError(db,'INSERT INTO usuario_plataformas_visibles VALUES ($1,$2)',[users.selected,FH],'23505');
  await expectPgError(db,'INSERT INTO usuario_plataformas_visibles VALUES ($1,$2)',[users.selected,999999],'23503');
  await expectPgError(db,'INSERT INTO usuario_plataformas_visibles VALUES ($1,$2)',[999999,FH],'23503');
 });
 const restoreName=DB.replace('_test','_restore_test');
 await verify(admin,'postgres'); await admin.query('CREATE DATABASE '+identifier(restoreName));
 binary('pg_restore',['--no-owner','--exit-on-error','--dbname='+restoreName,backup],restoreName);
 const restore=await connect(restoreName);
 await check('Recuperacion probada desde respaldo pre-016 en otra base aislada',async()=>{
  assert.deepEqual((await restore.query('SELECT id_usuario,id_rol,nombre,correo,password,estado FROM usuarios ORDER BY id_usuario')).rows,originalUsers);
  assert.deepEqual((await restore.query('SELECT * FROM reservaciones ORDER BY id_reservacion')).rows,reservationBefore);
  assert.equal((await restore.query("SELECT COUNT(*)::int AS total FROM information_schema.columns WHERE table_name='usuarios' AND column_name='alcance_plataformas'")).rows[0].total,0);
 });
 report.backups.restore_database=restoreName;
 const freshName=DB.replace('_test','_fresh_test');
 await verify(admin,'postgres');await admin.query('CREATE DATABASE '+identifier(freshName));const fresh=await connect(freshName);await fresh.query(schema);
 await check('Esquema completo incluye 016; aplicar tambien migracion falla sin cambios',async()=>{
  await assert.rejects(fresh.query(migration),err=>err.code==='42701');await fresh.query('ROLLBACK');
  assert.equal((await fresh.query("SELECT column_default FROM information_schema.columns WHERE table_name='usuarios' AND column_name='alcance_plataformas'")).rows[0].column_default,"'selected'::character varying");
  assert((await fresh.query("SELECT to_regclass('public.usuario_plataformas_visibles') AS tabla")).rows[0].tabla);
 });
 const atomicName=DB.replace('_test','_atomic_test');
 await verify(admin,'postgres');await admin.query('CREATE DATABASE '+identifier(atomicName));const atomic=await connect(atomicName);await atomic.query(oldSchema);
 await atomic.query('CREATE TABLE usuario_plataformas_visibles(id_usuario integer,id_plataforma integer)');
 await check('Fallo intermedio de migracion revierte ALTER y default dentro de BEGIN',async()=>{
  await assert.rejects(atomic.query(migration),err=>err.code==='42P07');await atomic.query('ROLLBACK');
  assert.equal((await atomic.query("SELECT COUNT(*)::int AS total FROM information_schema.columns WHERE table_name='usuarios' AND column_name='alcance_plataformas'")).rows[0].total,0);
 });
 // Backend real, conexion centralizada apuntando SOLO al cluster verificado.
 const emptyConfig=path.join(LAB_ROOT,'backend-test.env');fs.writeFileSync(emptyConfig,'# Configuracion de laboratorio; secretos solo en memoria\n');
 Object.assign(process.env,{APP_CONFIG_PATH:emptyConfig,DB_HOST:'127.0.0.1',DB_PORT:String(port),DB_NAME:DB,DB_USER:USER,DB_PASSWORD:PASSWORD,JWT_SECRET:crypto.randomBytes(32).toString('hex'),NODE_ENV:'test',GETYOURGUIDE_GMAIL_SYNC_ENABLED:'false'});
 delete process.env.PGOPTIONS;
 pool=require('../backend/config/database');await verify(pool,DB);
 const express=require('express');const api=express();api.use(express.json());
 // Solo routers internos: no webhooks ni arranque de workers/integraciones.
 for(const name of ['auth','reservaciones','dashboard','usuarios','daily','operaciones','transportes','paises','plataformas','tours','guias','operadores','vehiculos','bitacora','eventosIntegracion']) api.use('/api/'+(name==='eventosIntegracion'?'eventos-integracion':name),require('../backend/routes/'+name+'.routes'));
 const usuariosService=require('../backend/services/usuarios.service');
 const alcanceService=require('../backend/services/alcanceReservaciones.service');
 const actor={id_usuario:users.admin,rol:'Administrador'};
 await usuariosService.actualizarUsuarioParcial(users.selected,{alcance_plataformas:'selected',platform_ids:[FH,GYG]},actor);
 await usuariosService.actualizarUsuarioParcial(users.empty,{alcance_plataformas:'selected',platform_ids:[]},actor);
 const tokens={};
 for(const key of ['admin','all','selected','empty'])await check('Login real '+key,async()=>{
  const res=await request(api).post('/api/auth/login').send({correo:key+'@example.test',password:TEST_PASSWORD});
  assert.equal(res.status,200);tokens[key]=res.body.token;
  assert.equal(res.body.usuario.alcance_plataformas,['admin','all'].includes(key)?'all':'selected');
 });
 const get=(url,key='selected')=>request(api).get(url).set('Authorization','Bearer '+tokens[key]);
 const patchUser=(id,body)=>request(api).patch('/api/usuarios/'+id).set('Authorization','Bearer '+tokens.admin).send(body);

 for(const key of ['admin','all','selected','empty'])await check('Listado y alcance real '+key,async()=>{
  const res=await get('/api/reservaciones',key);assert.equal(res.status,200);
  assert.equal(res.body.total,{admin:42,all:42,selected:30,empty:0}[key]);
  if(key==='selected')assert(res.body.datos.every(row=>[FH,GYG].includes(row.id_plataforma)));
  if(key==='empty')assert.deepEqual(res.body.datos,[]);
 });
 for(const [name,query,total] of [
  ['codigo oculto','codigo='+reservations[30].codigo,0],['nombre oculto','nombre=oculto',0],
  ['plataforma prohibida','id_plataforma='+EXT,0],['nombre visible y fecha','nombre=visible&fecha='+FECHA,29],
  ['fecha historica','fecha_desde=2019-01-01&fecha_hasta=2020-12-31',1],
  ['filtros combinados','nombre=oculto&estado=Pendiente&id_plataforma='+EXT+'&fecha_desde=2027-01-01&fecha_hasta=2027-12-31',0]
 ])await check('Filtro real '+name,async()=>{const res=await get('/api/reservaciones?'+query);assert.equal(res.status,200);assert.equal(res.body.total,total);});
 await check('IDs ocultos e inexistentes devuelven mismo 404, visible 200',async()=>{
  const hidden=await get('/api/reservaciones/'+reservations[30].id_reservacion),absent=await get('/api/reservaciones/999999');
  assert.equal(hidden.status,404);assert.equal(absent.status,404);assert.deepEqual(hidden.body,absent.body);
  assert.equal((await get('/api/reservaciones/'+reservations[0].id_reservacion)).status,200);
 });
 await check('Paginacion COUNT y resumen por tour solo autorizados',async()=>{
  const first=await get('/api/reservaciones?page=1&limit=25&include_resumen_tours=1'),second=await get('/api/reservaciones?page=2&limit=25&include_resumen_tours=1');
  assert.equal(first.status,200);assert.equal(second.status,200);
  assert.equal(first.body.pagination.total,30);assert.equal(first.body.pagination.totalPages,2);assert.equal(first.body.data.length,25);assert.equal(second.body.data.length,5);
  assert.equal(first.body.meta.resumen_tours.reduce((sum,row)=>sum+row.total,0),30);
  assert(first.body.meta.resumen_tours.every(row=>tourIds.slice(0,5).includes(row.id_tour)));
  const empty=await get('/api/reservaciones?page=1&limit=25&include_resumen_tours=1','empty');assert.equal(empty.body.pagination.total,0);assert.deepEqual(empty.body.meta.resumen_tours,[]);
 });
 for(const key of ['admin','all','selected','empty'])await check('Dashboard real '+key,async()=>{
  const res=await get('/api/dashboard/resumen?fecha='+FECHA,key);assert.equal(res.status,200);
  const restricted=key==='selected'||key==='empty';assert.equal(res.body.metricas.reservaciones_vigentes,restricted?(key==='empty'?0:28):40);
  assert.equal(res.body.metricas.pax_vigentes,restricted?(key==='empty'?0:56):176);
  if(restricted){assert.equal(res.body.alcance_parcial,true);assert.deepEqual(res.body.alertas,{});assert.deepEqual(res.body.salidas_hoy,[]);assert(!('grupos_preparados' in res.body.metricas));assert(res.body.reservaciones_recientes.every(row=>[FH,GYG].includes(row.id_plataforma)));}
 });
 await check('Catalogos reales permitidos y plataformas seleccionadas',async()=>{
  assert.equal((await get('/api/tours')).status,200);assert.equal((await get('/api/paises')).status,200);
  const selected=await get('/api/plataformas');assert.deepEqual(selected.body.datos.map(row=>row.id_plataforma).sort(),[FH,GYG].sort());
  const empty=await get('/api/plataformas','empty');assert.equal(empty.body.total,0);
 });
 for(const url of ['/api/daily?fecha='+FECHA,'/api/daily/operativo?fecha='+FECHA,'/api/daily/observaciones?fecha='+FECHA,
  '/api/operaciones','/api/operaciones/sugeridas?fecha='+FECHA,'/api/operaciones/1','/api/transportes','/api/transportes/1',
  '/api/eventos-integracion','/api/eventos-integracion/1','/api/eventos-integracion/1/diff','/api/usuarios','/api/bitacora','/api/guias','/api/vehiculos','/api/operadores'])await check('403 selected '+url,async()=>assert.equal((await get(url)).status,403));
 for(const url of ['/api/daily?fecha='+FECHA,'/api/operaciones','/api/transportes','/api/eventos-integracion'])await check('Compatibilidad Consulta all '+url,async()=>assert.equal((await get(url,'all')).status,200));
 await check('Consulta no escribe reservas ni su propio alcance',async()=>{
  assert.equal((await request(api).post('/api/reservaciones').set('Authorization','Bearer '+tokens.selected).send({})).status,403);
  assert.equal((await request(api).patch('/api/usuarios/'+users.selected).set('Authorization','Bearer '+tokens.selected).send({alcance_plataformas:'all'})).status,403);
 });
 await check('Crear Consulta selected, vacio y eleccion explicita con SQL real',async()=>{
  for(const ids of [[FH],[]]){const res=await request(api).post('/api/usuarios').set('Authorization','Bearer '+tokens.admin).send({nombre:'Usuario sintetico',correo:'nuevo-'+ids.length+'@example.test',password:TEST_PASSWORD,id_rol:roles.Consulta,alcance_plataformas:'selected',platform_ids:ids});assert.equal(res.status,201);assert.deepEqual(res.body.datos.platform_ids,ids);}
  const missing=await request(api).post('/api/usuarios').set('Authorization','Bearer '+tokens.admin).send({nombre:'Sin modo',correo:'sin-modo@example.test',password:TEST_PASSWORD,id_rol:roles.Consulta});assert.equal(missing.status,400);
 });
 await check('Cambiar all-selected-all y reemplazar plataformas',async()=>{
  assert.equal((await patchUser(users.all,{alcance_plataformas:'selected',platform_ids:[FH]})).status,200);
  assert.equal((await get('/api/reservaciones','all')).body.total,15);
  assert.equal((await patchUser(users.all,{platform_ids:[GYG]})).status,200);
  assert.deepEqual((await get('/api/auth/sesion','all')).body.usuario.platform_ids,[GYG]);
  assert.equal((await patchUser(users.all,{alcance_plataformas:'all',platform_ids:[]})).status,200);
  assert.equal((await get('/api/reservaciones','all')).body.total,42);
 });
 await check('Duplicados y plataformas inexistentes no cambian permisos',async()=>{
  const before=await usuariosService.obtenerUsuarioPorId(users.selected);
  assert.equal((await patchUser(users.selected,{platform_ids:[FH,FH]})).status,400);
  assert.equal((await patchUser(users.selected,{platform_ids:[999999]})).status,400);
  assert.deepEqual(await usuariosService.obtenerUsuarioPorId(users.selected),before);
 });
 await check('Rollback real tras fallo durante reemplazo de asignaciones',async()=>{
  const before=await usuariosService.obtenerUsuarioPorId(users.all);
  await db.query("CREATE FUNCTION access_scope_test_fail() RETURNS trigger LANGUAGE plpgsql AS $scope_lab$ BEGIN RAISE EXCEPTION 'Fallo controlado de laboratorio'; END; $scope_lab$");
  await db.query('CREATE TRIGGER access_scope_test_fail BEFORE INSERT ON usuario_plataformas_visibles FOR EACH ROW EXECUTE FUNCTION access_scope_test_fail()');
  try{await assert.rejects(usuariosService.actualizarUsuarioParcial(users.all,{nombre:'No conservar',alcance_plataformas:'selected',platform_ids:[FH]},actor),error=>error.code==='P0001');}
  finally{await db.query('DROP TRIGGER access_scope_test_fail ON usuario_plataformas_visibles');await db.query('DROP FUNCTION access_scope_test_fail()');}
  assert.deepEqual(await usuariosService.obtenerUsuarioPorId(users.all),before);
 });
 await check('Cambio de rol exige alcance y protecciones administrativas persisten',async()=>{
  assert.equal((await patchUser(users.admin2,{id_rol:roles.Consulta})).status,400);
  assert.equal((await patchUser(users.admin2,{id_rol:roles.Consulta,alcance_plataformas:'selected',platform_ids:[]})).status,200);
  assert.equal((await patchUser(users.admin,{estado:false})).status,409);
  await assert.rejects(usuariosService.actualizarUsuarioParcial(users.admin,{estado:false},{id_usuario:999999}),error=>error.statusCode===409);
  assert.equal((await patchUser(users.admin2,{id_rol:roles.Administrador})).status,200);
 });
 await check('Revocacion de plataformas y desactivacion con el mismo JWT',async()=>{
  assert.equal((await patchUser(users.selected,{platform_ids:[]})).status,200);
  assert.equal((await get('/api/reservaciones')).body.total,0);
  assert.deepEqual((await get('/api/auth/sesion')).body.usuario.platform_ids,[]);
  assert.equal((await patchUser(users.selected,{estado:false})).status,200);assert.equal((await get('/api/auth/sesion')).status,403);
  assert.equal((await patchUser(users.selected,{estado:true,platform_ids:[FH,GYG]})).status,200);
 });
 await check('Error real de PostgreSQL no concede all',async()=>{
  await db.query('ALTER TABLE usuario_plataformas_visibles RENAME TO access_scope_missing_test');
  try{
   assert.equal((await get('/api/reservaciones')).status,500);assert.equal((await get('/api/reservaciones','admin')).status,500);
   assert.equal((await get('/api/auth/sesion')).status,500);
  }finally{await db.query('ALTER TABLE access_scope_missing_test RENAME TO usuario_plataformas_visibles');}
  assert.deepEqual(await alcanceService.obtenerAlcanceReservacionesUsuario(users.empty),{all:false,platform_ids:[]});
 });
 await check('Administrador crea modifica cancela reserva con auditoria real',async()=>{
  const payload={fecha:'2030-02-10',id_tour:tourIds[12],id_pais:pais,id_plataforma:EXT,nombre_cliente:'Cliente administrativo sintetico',pax:2,ninos:0,pickup_place:'Hotel sintetico',pickup_time:'08:00',turno:'Mañana',precio_total:100,estado:'Pendiente'};
  const created=await request(api).post('/api/reservaciones').set('Authorization','Bearer '+tokens.admin).send(payload);assert.equal(created.status,201);
  const id=created.body.datos.id_reservacion;
  assert.equal((await request(api).patch('/api/reservaciones/'+id).set('Authorization','Bearer '+tokens.admin).send({nombre_cliente:'Cliente editado sintetico'})).status,200);
  assert.equal((await request(api).patch('/api/reservaciones/'+id+'/cancelar').set('Authorization','Bearer '+tokens.admin).send({motivo_cancelacion:'Prueba sintetica'})).status,200);
  assert.equal((await db.query('SELECT estado FROM reservaciones WHERE id_reservacion=$1',[id])).rows[0].estado,'Cancelada');
  assert.equal((await db.query('SELECT COUNT(*)::int AS total FROM bitacora WHERE id_reservacion=$1',[id])).rows[0].total,3);
 });
 await check('Capacidad real cuenta todas las plataformas sin alterar limites 12 y 24',async()=>{
  const capacidad=require('../backend/services/capacidad.service');
  // La capacidad operativa cuenta reservas asignadas: preparar dos grupos
  // sinteticos de 10 PAX, cada uno dentro del limite de 12.
  for(const [grupo,index] of [[1,30],[2,36]]) {
   const op=(await db.query("INSERT INTO operaciones_tour(fecha,id_tour,hora_inicio,turno,numero_grupo,estado) VALUES ($1,$2,'08:00','Mañana',$3,'Activa') RETURNING id_operacion_tour",[FECHA,tourIds[5],grupo])).rows[0].id_operacion_tour;
   const tr=(await db.query("INSERT INTO transportes_operacion(id_operacion_tour,estado) VALUES ($1,'Activa') RETURNING id_transporte_operacion",[op])).rows[0].id_transporte_operacion;
   await db.query('UPDATE reservaciones SET id_transporte_operacion=$1 WHERE id_reservacion=$2',[tr,reservations[index].id_reservacion]);
  }
  assert.equal((await get('/api/reservaciones?id_tour='+tourIds[5])).body.total,0);
  const total=await capacidad.calcularPaxTourTurno(db,{fecha:FECHA,id_tour:tourIds[5],turno:'Mañana'});
  assert.equal(total,20);assert.equal(capacidad.validarMaximoTourTurno(24),null);assert(capacidad.validarMaximoTourTurno(25));
  assert.equal(capacidad.validarMaximoOperacion(12),null);assert(capacidad.validarMaximoOperacion(13));
  assert.equal((await request(api).post('/api/vehiculos').set('Authorization','Bearer '+tokens.admin).send({identificador:'Vehiculo sintetico',capacidad:13})).status,400);
 });
 report.schema=(await db.query("SELECT column_name,column_default,is_nullable FROM information_schema.columns WHERE table_name='usuarios' AND column_name='alcance_plataformas'")).rows;
 report.constraints=(await db.query("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='usuario_plataformas_visibles'::regclass OR (conrelid='usuarios'::regclass AND conname='chk_usuarios_alcance_plataformas') ORDER BY conname")).rows;
 report.fixture={existing_users:originalUsers.length,reservations_before_migration:42,platforms:platformRows.map(row=>row.nombre),personal_data_copied:false};
 await verify(db,DB);
 const afterBackup=path.join(LAB_ROOT,'after-016.dump');binary('pg_dump',['--format=custom','--no-owner','--file='+afterBackup,'--dbname='+DB],DB);
 report.backups.after_migration={path:afterBackup,sha256:crypto.createHash('sha256').update(fs.readFileSync(afterBackup)).digest('hex')};

}
main().catch(error=>{report.failures.push({name:'Preparacion/ejecucion',code:error.code||null,message:error.message});console.error(error.message);}).finally(async()=>{
 if(pool)await pool.end();
 for(const client of clients)await client.end();
 if(started){try{binary('pg_ctl',['-D',DATA,'-w','stop','-m','fast']);report.cluster_stopped=true;}catch(error){report.failures.push({name:'Detener laboratorio',message:error.message});}}
 if(fs.existsSync(LAB_ROOT))fs.writeFileSync(path.join(LAB_ROOT,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:report.checks.length,failed:report.failures.length,report:path.join(LAB_ROOT,'report.json'),database:DB,port,cluster_stopped:report.cluster_stopped}));
 if(report.failures.length)process.exitCode=1;
});
