// Inicializacion autorizada DEV-DB-02. No ejecuta migraciones ni crea roles.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process'),{Client}=require('pg'),dotenv=require('dotenv');
const g=require('./devDb02.cjs');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const cfg=dotenv.parse(fs.readFileSync(path.join(g.ROOT,'.env')));
const connection=database=>({host:'localhost',port:5432,database,user:cfg.DB_USER,password:cfg.DB_PASSWORD,connectionTimeoutMillis:5000,application_name:'DEV-DB-02-initialization'});
async function primarySnapshot(){
 const c=new Client({...connection('sian_kaan_reservaciones'),options:'-c default_transaction_read_only=on -c statement_timeout=10000'});
 try{await c.connect();await c.query('BEGIN READ ONLY');
 if((await c.query('SELECT current_database() AS name')).rows[0].name!=='sian_kaan_reservaciones')g.fail('PRIMARY_READONLY_IDENTITY');
 const columns=(await c.query("SELECT table_schema,table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
 const constraints=(await c.query("SELECT c.conname,t.relname,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY t.relname,c.conname")).rows;
 const objects=(await c.query(g.OBJECTS_SQL)).rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 await c.query('ROLLBACK');return digest(JSON.stringify({columns,constraints,objects}));
 }finally{await c.end();}
}
async function main(){
 const schema=fs.readFileSync(path.join(g.ROOT,'database/schema.sql'),'utf8'),seeds=fs.readFileSync(path.join(g.ROOT,'database/seeds.sql'),'utf8');
 if(digest(schema)!=='0dfebe782bf2d2e359ef5c04235e194800e4da70c2fafadae2066c1a81c83a27'||digest(seeds)!=='59a9d2884173ae24d5931efba9345a97a59931a842be776036890064318a9245')g.fail('REVIEWED_SQL_CHANGED');
 if(fs.existsSync(g.CONFIG))g.fail('DEV_CONFIG_ALREADY_EXISTS');
 const envHash=digest(fs.readFileSync(path.join(g.ROOT,'.env'))),c=new Client({...connection(g.DATABASE),options:'-c default_transaction_read_only=on'});
 let identity;try{await c.connect();await c.query('BEGIN READ ONLY');identity=await g.verifyIdentity(c,{empty:true,username:cfg.DB_USER});await c.query('ROLLBACK');}finally{await c.end();}
 const before=await primarySnapshot();g.writeJson('before.json',{identity,primary_schema_sha256:before,env_sha256:envHash});
 const sql=`SELECT current_user = :'expected_user' AS correct_user \\gset
\\if :correct_user
\\else
\\quit 3
\\endif
DO $dev$
BEGIN
 IF current_database()<>'sian_kaan_reservaciones_dev' OR inet_server_port()<>5432
 OR inet_server_addr() NOT IN (inet '::1',inet '127.0.0.1')
 OR current_schema() IS DISTINCT FROM 'public'
 OR current_setting('server_version') NOT LIKE '18.3%'
 OR (SELECT system_identifier::text FROM pg_control_system())<>'7632825987452064788'
 THEN RAISE EXCEPTION 'DEV_IDENTITY_MISMATCH'; END IF;
 IF EXISTS (${g.OBJECTS_SQL}) THEN RAISE EXCEPTION 'DEV_DATABASE_NOT_EMPTY'; END IF;
END $dev$;
SELECT current_database(),current_user,inet_server_addr(),inet_server_port(),current_schema();
SET LOCAL search_path=public;
${schema}
${seeds}
`;
 const psql=spawnSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','--host=localhost','--port=5432','--dbname='+g.DATABASE,'--username='+cfg.DB_USER,'--no-password','--set=ON_ERROR_STOP=1','--set=VERBOSITY=sqlstate','--set=expected_user='+cfg.DB_USER,'--single-transaction','--file=-'],{input:sql,encoding:'utf8',windowsHide:true,env:{...g.cleanEnvironment({},{username:cfg.DB_USER,password:cfg.DB_PASSWORD}),PGPASSWORD:cfg.DB_PASSWORD,PGCLIENTENCODING:'UTF8'},timeout:30000});
 if(psql.status!==0){g.writeJson('initialization-error.json',{stage:'psql',status:psql.status,error_code:psql.error?.code||null});g.fail('PSQL_INITIALIZATION_FAILED');}
 fs.writeFileSync(path.join(g.LAB,'schema-seeds.txt'),psql.stdout);
 const db=new Client(connection(g.DATABASE));let report;
 try{await db.connect();await db.query('BEGIN');identity=await g.verifyIdentity(db,{username:cfg.DB_USER});const schemaCheck=await g.verifySchema(db);
 for(const table of ['usuarios','tours','reservaciones']){if((await db.query('SELECT count(*)::int AS n FROM public.'+table)).rows[0].n)g.fail('DEV_FIXTURE_NOT_EMPTY');}
 const roles=(await db.query('SELECT id_rol,nombre FROM roles ORDER BY nombre')).rows;
 const platforms=(await db.query('SELECT id_plataforma,nombre FROM plataformas ORDER BY nombre')).rows;
 if(JSON.stringify(roles.map(r=>r.nombre))!==JSON.stringify(['Administrador','Consulta'])||JSON.stringify(platforms.map(r=>r.nombre))!==JSON.stringify(['Externa','FareHarbor','GetYourGuide','WhatsApp Business']))g.fail('DEV_SEEDS_MISMATCH');
 const countries=(await db.query('SELECT id_pais,nombre FROM paises')).rows;if(countries.length!==1||countries[0].nombre!=='No especificado')g.fail('DEV_COUNTRY_MISMATCH');
 const tour=(await db.query("INSERT INTO tours(nombre,descripcion,activo) VALUES($1,$2,true) RETURNING id_tour,nombre",['Tour DEV-DB-01','Tour ficticio exclusivo de desarrollo'])).rows[0];
 const date='2026-10-15', specs=[['DEV-GYG-001','GetYourGuide',date,2,'Pendiente'],['DEV-FH-001','FareHarbor',date,3,'Pendiente'],['DEV-WA-001','WhatsApp Business',date,4,'Pendiente'],['DEV-EXT-001','Externa',date,2,'Pendiente'],['DEV-GYG-HIST','GetYourGuide','2020-01-05',1,'Pendiente'],['DEV-FH-CAN','FareHarbor',date,1,'Cancelada']];
 const reservations=[];const validator=require('../backend/validators/reservaciones.validator');
 for(const [codigo,platform,fecha,pax,estado] of specs){
  const p=platforms.filter(r=>r.nombre===platform);if(p.length!==1)g.fail('DEV_PLATFORM_AMBIGUOUS');
  const input={fecha,id_tour:tour.id_tour,id_pais:countries[0].id_pais,id_plataforma:p[0].id_plataforma,nombre_cliente:'Cliente Sintetico '+codigo,pax,ninos:0,pickup_place:'Hotel Sintetico DEV',pickup_time:'08:00',turno:'Ma\u00f1ana',precio_total:100,deposito:0,saldo:100,estado:'Pendiente'};
  if(validator.validarDatosReservacion(input).errores.length)g.fail('DEV_FIXTURE_VALIDATION_FAILED');
  const r=(await db.query(`INSERT INTO reservaciones(codigo,fecha,id_tour,id_pais,id_plataforma,nombre_cliente,pax,ninos,pickup_place,pickup_time,turno,precio_total,deposito,saldo,estado,motivo_cancelacion,observaciones,fecha_registro,ultima_actualizacion)
   VALUES($1,$2,$3,$4,$5,$6,$7,0,$8,$9,$10,100,0,100,$11,$12,$13,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
   RETURNING id_reservacion,codigo,fecha::text,pax,estado`,[codigo,fecha,input.id_tour,input.id_pais,input.id_plataforma,input.nombre_cliente,pax,input.pickup_place,input.pickup_time,input.turno,estado,estado==='Cancelada'?'Cancelacion sintetica de prueba':null,'Datos ficticios DEV-DB-02'])).rows[0];
  reservations.push({...r,plataforma:platform,id_plataforma:p[0].id_plataforma});
 }
 const metrics=(await db.query("SELECT count(*)::int AS reservaciones_vigentes,sum(pax)::int AS pax_vigentes FROM reservaciones WHERE fecha=$1 AND estado=ANY($2::varchar[])",[date,['Pendiente','Confirmada','Activa']])).rows[0];
 await db.query('COMMIT');report={identity,schema:schemaCheck,roles,platforms,countries,tour,reservations,test_date:date,dashboard_all:metrics,users_status:'PENDING_INTERACTIVE_PASSWORDS'};
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{await db.end();}
 const after=await primarySnapshot();report.primary_schema_sha256_before=before;report.primary_schema_sha256_after=after;report.primary_schema_unchanged=before===after;report.env_unchanged=envHash===digest(fs.readFileSync(path.join(g.ROOT,'.env')));
 fs.mkdirSync(path.join(g.LAB,'electron-profile'),{recursive:true});
 fs.writeFileSync(g.CONFIG,'DB_HOST=localhost\nDB_PORT=5432\nDB_NAME='+g.DATABASE+'\nJWT_SECRET='+crypto.randomBytes(32).toString('hex')+'\nGYG_GMAIL_SYNC_ENABLED=false\n',{flag:'wx'});
 g.writeJson('initialization.json',report);
 if(!report.primary_schema_unchanged||!report.env_unchanged)g.fail('PROTECTED_STATE_CHANGED');
 console.log('DEV-DB-02: esquema y seeds confirmados; 18 tablas, 6 reservaciones sinteticas. Usuarios pendientes de captura interactiva.');
}
if(require.main===module)main().catch(e=>{console.error('DEV-DB-02 detenido:',/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'INITIALIZATION_FAILED');process.exitCode=1;});
module.exports={primarySnapshot};

