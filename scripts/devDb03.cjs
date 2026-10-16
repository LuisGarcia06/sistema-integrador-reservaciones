// DEV-DB-03: un unico rol autorizado, permisos exclusivamente en desarrollo.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const {Client}=require('pg'),g=require('./devDb02.cjs');
const ROLE='sian_kaan_dev_app',LAB=path.join(g.ROOT,'.access-scope-lab','dev-db-03');
const VAULT=path.join(g.LAB,'postgres-dev.credentials.clixml');
const INSERT=['usuarios','tours','paises','plataformas','vehiculos','operadores','guias','operaciones_tour','transportes_operacion','reservaciones','daily_observaciones','bitacora','usuario_plataformas_visibles'];
const UPDATE=['usuarios','tours','vehiculos','operadores','guias','operaciones_tour','transportes_operacion','reservaciones','daily_observaciones'];
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const save=(name,data)=>{fs.mkdirSync(LAB,{recursive:true});fs.writeFileSync(path.join(LAB,name),JSON.stringify(data,null,2)+'\n');};
function maintenance(){const c=require('dotenv').parse(fs.readFileSync(path.join(g.ROOT,'.env')));return {host:'localhost',port:5432,user:c.DB_USER,password:c.DB_PASSWORD};}
function client(database,credentials,readonly=true){return new Client({host:'localhost',port:5432,database,...credentials,application_name:'DEV-DB-03',connectionTimeoutMillis:5000,options:readonly?'-c default_transaction_read_only=on -c statement_timeout=10000':'-c statement_timeout=10000'});}
async function primarySnapshot(){
 const db=client('sian_kaan_reservaciones',maintenance());try{await db.connect();await db.query('BEGIN READ ONLY');
 const columns=(await db.query("SELECT table_schema,table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
 const acl=(await db.query("SELECT n.nspname,c.relname,c.relkind,c.relacl::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE left(n.nspname,3)<>'pg_' AND n.nspname<>'information_schema' ORDER BY 1,2")).rows;
 const schemas=(await db.query("SELECT nspname,nspacl::text FROM pg_namespace WHERE left(nspname,3)<>'pg_' AND nspname<>'information_schema' ORDER BY 1")).rows;
 const database=(await db.query("SELECT datname,datacl::text,datdba FROM pg_database WHERE datname=current_database()")).rows;
 const constraints=(await db.query("SELECT t.relname,c.conname,pg_get_constraintdef(c.oid) definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY 1,2")).rows;
 const counts={};for(const r of acl.filter(r=>r.nspname==='public'&&['r','p'].includes(r.relkind))){if(!/^[a-z_]+$/.test(r.relname))g.fail('PRIMARY_IDENTIFIER_REVIEW_REQUIRED');counts[r.relname]=(await db.query('SELECT count(*)::text n FROM public."'+r.relname+'"')).rows[0].n;}
 await db.query('ROLLBACK');return {structure_acl_sha256:digest(JSON.stringify({columns,acl,schemas,database,constraints})),counts_sha256:digest(JSON.stringify(counts)),env_sha256:digest(fs.readFileSync(path.join(g.ROOT,'.env')))};
 }finally{await db.end();}
}
async function preflight(db){
 await g.verifyIdentity(db);await g.verifySchema(db);
 if((await db.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[ROLE])).rowCount)g.fail('DEV_ROLE_ALREADY_EXISTS_REVIEW_REQUIRED');
 const counts=(await db.query('SELECT (SELECT count(*)::int FROM usuarios) users,(SELECT count(*)::int FROM reservaciones) reservations,(SELECT count(*)::int FROM usuario_plataformas_visibles) assignments')).rows[0];
 if(counts.users!==4||counts.reservations!==6||counts.assignments!==2)g.fail('DEV_FIXTURE_CHANGED_REVIEW_REQUIRED');
 return counts;
}
async function provision(password, method='psql'){
 if(typeof password!=='string'||password.length<24||Buffer.byteLength(password)>72||/[\r\n]/.test(password))g.fail('DEV_ROLE_PASSWORD_INVALID');
 const cfg=maintenance(),db=client(g.DATABASE,cfg);let sequences;
 try{await db.connect();await db.query('BEGIN READ ONLY');await preflight(db);
 sequences=[];for(const table of INSERT.filter(t=>t!=='usuario_plataformas_visibles')){const r=(await db.query("SELECT pg_get_serial_sequence($1,$2) seq",['public.'+table,table==='daily_observaciones'?'id_daily_observacion':{usuarios:'id_usuario',tours:'id_tour',paises:'id_pais',plataformas:'id_plataforma',vehiculos:'id_vehiculo',operadores:'id_operador',guias:'id_guia',operaciones_tour:'id_operacion_tour',transportes_operacion:'id_transporte_operacion',reservaciones:'id_reservacion',bitacora:'id_bitacora'}[table]])).rows[0].seq;if(!/^public\.[a-z_]+$/.test(r||''))g.fail('DEV_SEQUENCE_NOT_REVIEWED');sequences.push(r);}
 await db.query('ROLLBACK');}finally{await db.end();}
 const before=await primarySnapshot();save('protected-before.json',before);
 const pre=JSON.parse(fs.readFileSync(path.join(LAB,'preflight.json')));
 if(pre.primary.tablePublic.length||pre.primary.columnPublic.length||pre.primary.publicDefiners.length)g.fail('PUBLIC_ENTERPRISE_ACCESS');
 const guard=`DO $guard$ BEGIN
 IF current_database()<>'sian_kaan_reservaciones_dev' OR inet_server_port()<>5432
 OR inet_server_addr() NOT IN (inet '::1',inet '127.0.0.1') OR current_schema() IS DISTINCT FROM 'public'
 OR (SELECT system_identifier::text FROM pg_control_system())<>'7632825987452064788'
 THEN RAISE EXCEPTION 'DEV_IDENTITY_MISMATCH'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sian_kaan_dev_app') THEN RAISE EXCEPTION 'DEV_ROLE_ALREADY_EXISTS'; END IF;
 END $guard$;`;
 const commands=[guard,'CREATE ROLE '+ROLE+' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS','\\password '+ROLE,
 'GRANT CONNECT ON DATABASE '+g.DATABASE+' TO '+ROLE,'GRANT USAGE ON SCHEMA public TO '+ROLE,
 'GRANT SELECT ON TABLE '+g.TABLES.map(t=>'public.'+t).join(',')+' TO '+ROLE,
 'GRANT INSERT ON TABLE '+INSERT.map(t=>'public.'+t).join(',')+' TO '+ROLE,
 'GRANT UPDATE (id_plataforma) ON TABLE public.plataformas TO '+ROLE,
 'GRANT UPDATE ON TABLE '+UPDATE.map(t=>'public.'+t).join(',')+' TO '+ROLE,
 'GRANT DELETE ON TABLE public.usuario_plataformas_visibles TO '+ROLE,
 'GRANT USAGE ON SEQUENCE '+sequences.join(',')+' TO '+ROLE];
 if(method==='scram') {
  const admin=client(g.DATABASE,cfg,false);
  try {
   await admin.connect();await admin.query('BEGIN');await preflight(admin);
   // Configuracion solo de esta transaccion: ningun parametro sensible en logs.
   await admin.query("SET LOCAL log_statement='none'");
   await admin.query('SET LOCAL log_parameter_max_length=0');
   await admin.query('SET LOCAL log_parameter_max_length_on_error=0');
   await admin.query(commands[1]);
   const salt=crypto.randomBytes(16),iterations=4096;
   const salted=crypto.pbkdf2Sync(password,salt,iterations,32,'sha256');
   const clientKey=crypto.createHmac('sha256',salted).update('Client Key').digest();
   const stored=crypto.createHash('sha256').update(clientKey).digest('base64');
   const server=crypto.createHmac('sha256',salted).update('Server Key').digest('base64');
   let verifier='SCRAM-SHA-256$'+iterations+':'+salt.toString('base64')+'$'+stored+':'+server;
   await admin.query("SELECT set_config('dev.db03_scram',$1,true)",[verifier]);
   await admin.query(`DO $password$ BEGIN EXECUTE format('ALTER ROLE %I PASSWORD %L','sian_kaan_dev_app',current_setting('dev.db03_scram')); END $password$`);
   await admin.query("SELECT set_config('dev.db03_scram','',true)");
   verifier='';salted.fill(0);clientKey.fill(0);
   for(const command of commands.slice(3))await admin.query(command);
   await admin.query('COMMIT');
  }catch(e){await admin.query('ROLLBACK').catch(()=>{});throw e;}finally{await admin.end();}
 } else {
 const args=['-X','-w','--host=localhost','--port=5432','--username='+cfg.user,'--dbname='+g.DATABASE,'--set=ON_ERROR_STOP=1','--set=VERBOSITY=sqlstate','--single-transaction'];
 for(const command of commands)args.push('--command',command);
 // psql gestiona el prompt oculto y cifra con SCRAM. Las dos respuestas solo viajan por stdin.
 const env={...g.cleanEnvironment({}, {username:cfg.user,password:cfg.password}),PGPASSWORD:cfg.password,PGCLIENTENCODING:'UTF8'};
 const result=cp.spawnSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',args,{input:password+'\n'+password+'\n',env,windowsHide:true,encoding:'utf8',timeout:20000});
 if(result.status!==0){save('provision-error.json',{status:result.status,code:result.error?.code||'PSQL_ROLE_PROVISION_FAILED'});g.fail('PSQL_ROLE_PROVISION_FAILED');}
 }
 save('grants.json',{role:ROLE,login:true,superuser:false,createdb:false,createrole:false,replication:false,bypassrls:false,inherit:false,memberships:[],database:g.DATABASE,schema:'public',select:g.TABLES,insert:INSERT,update:UPDATE,delete:['usuario_plataformas_visibles'],sequence_usage:sequences,update_columns:{plataformas:['id_plataforma']},column_update_reason:'SELECT FOR KEY SHARE en validacion transaccional de asignaciones',password_method:method==='scram'?'parameterized_scram_authorized':'psql_password_private_stdin_scram'});
 const isolation=await verifyIsolation(password);if(!isolation.passed)g.fail('DEV_ISOLATION_FAILED');
 const text=fs.readFileSync(g.CONFIG,'utf8');if(!/^DB_USER=/m.test(text))fs.writeFileSync(g.CONFIG,text.trimEnd()+'\nDB_USER='+ROLE+'\n');else if(!text.includes('DB_USER='+ROLE))g.fail('DEV_CONFIG_USER_REVIEW_REQUIRED');
 const after=await primarySnapshot();save('protected-after.json',after);
 if(JSON.stringify(before)!==JSON.stringify(after))g.fail('PRIMARY_STATE_CHANGED');
 console.log('DEV-DB-03: rol limitado creado; password SCRAM verificado por autenticacion real; permisos solo en desarrollo; aislamiento comprobado.');
}
async function verifyIsolation(password){
 const credentials={user:ROLE,password},db=client(g.DATABASE,credentials);const report={role:ROLE,checks:[],other_databases:[]};
 const check=(name,ok)=>{report.checks.push({name,passed:Boolean(ok)});if(!ok)g.fail('DEV_ISOLATION_'+name);};
 try{await db.connect();await db.query('BEGIN READ ONLY');report.identity=await g.verifyIdentity(db,{username:ROLE});await g.rejectPrivilegedRole(db);await g.verifySchema(db);
 const role=(await db.query('SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];check('ROLE_ATTRIBUTES',role.rolcanlogin&&!role.rolsuper&&!role.rolcreatedb&&!role.rolcreaterole&&!role.rolreplication&&!role.rolbypassrls);
 check('NO_MEMBERSHIPS',(await db.query('SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)')).rowCount===0);
 check('NO_OWNED_DATABASES',(await db.query('SELECT 1 FROM pg_database WHERE datdba=(SELECT oid FROM pg_roles WHERE rolname=current_user)')).rowCount===0);
 check('NO_CREATE_SCHEMA',!(await db.query("SELECT has_schema_privilege(current_user,'public','CREATE') v")).rows[0].v);
 check('NO_CREATE_DATABASE_OBJECTS',!(await db.query('SELECT has_database_privilege(current_user,current_database(),$1) v',['CREATE'])).rows[0].v);
 const counts=(await db.query('SELECT (SELECT count(*)::int FROM usuarios) users,(SELECT count(*)::int FROM reservaciones) reservations')).rows[0];check('SYNTHETIC_READ',counts.users===4&&counts.reservations===6);
 const databases=(await db.query("SELECT datname FROM pg_database WHERE datallowconn AND NOT datistemplate AND datname<>$1 ORDER BY datname",[g.DATABASE])).rows;
 await db.query('ROLLBACK');
 // Escrituras reales de prueba, revertidas. Ningun fixture es eliminado.
 await db.query('BEGIN READ WRITE');await g.verifyIdentity(db,{username:ROLE});
 await db.query("INSERT INTO daily_observaciones(fecha,observaciones) VALUES($1,$2)",['2099-12-31','Prueba sintetica transaccional DEV-DB-03']);check('INSERT_WITH_SEQUENCE',true);
 check('UPDATE_RESERVATION',(await db.query('UPDATE reservaciones SET observaciones=observaciones WHERE codigo=$1',['DEV-GYG-001'])).rowCount===1);
 const ids=(await db.query("SELECT u.id_usuario,p.id_plataforma FROM usuarios u CROSS JOIN plataformas p WHERE u.correo=$1 AND p.nombre=$2",['consulta.empty.dev@example.test','FareHarbor'])).rows[0];
 await db.query('INSERT INTO usuario_plataformas_visibles VALUES($1,$2)',[ids.id_usuario,ids.id_plataforma]);check('DELETE_ASSIGNMENT',(await db.query('DELETE FROM usuario_plataformas_visibles WHERE id_usuario=$1 AND id_plataforma=$2',[ids.id_usuario,ids.id_plataforma])).rowCount===1);await db.query('ROLLBACK');
 for(const {datname} of databases){
  const c=client(datname,credentials);let entry={database:datname,connected:false};
  try{await c.connect();entry.connected=true;await c.query('BEGIN READ ONLY');
   const data=(await c.query(`SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE left(n.nspname,3)<>'pg_' AND n.nspname<>'information_schema' AND c.relkind IN ('r','p','v','m','f') AND (has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))`)).rows;
   const sequences=(await c.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE left(n.nspname,3)<>'pg_' AND n.nspname<>'information_schema' AND c.relkind='S' AND has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE')`)).rows;
   const elevated=(await c.query(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prosecdef AND left(n.nspname,3)<>'pg_' AND n.nspname<>'information_schema' AND has_function_privilege(current_user,p.oid,'EXECUTE')`)).rows;
   entry.accessible_application_relations=data.length;entry.accessible_sequences=sequences.length;entry.executable_security_definers=elevated.length;
   check('NO_FOREIGN_DATA_'+datname,data.length===0&&sequences.length===0&&elevated.length===0);
   if(datname==='sian_kaan_reservaciones'){
    entry.public_connect=(await c.query('SELECT has_database_privilege(current_user,current_database(),$1) v',['CONNECT'])).rows[0].v;
    for(const table of ['usuarios','reservaciones']){
     await c.query('SAVEPOINT denied_read');let code;
     try{await c.query('SELECT 1 FROM public.'+table+' LIMIT 0');}catch(e){code=e.code;}
     await c.query('ROLLBACK TO SAVEPOINT denied_read');check('PRIMARY_READ_DENIED_'+table,code==='42501');
    }
   }
   await c.query('ROLLBACK');
  }catch(e){if(!entry.connected&&['42501','28000'].includes(e.code))entry.connection_denied=e.code;else throw e;}finally{await c.end();}
  report.other_databases.push(entry);
 }
 report.passed=true;save('isolation.json',report);return report;
 }finally{await db.query('ROLLBACK').catch(()=>{});await db.end();}
}
async function input(){let text='';for await(const chunk of process.stdin){text+=chunk;if(text.length>32768)g.fail('DEV_INPUT_TOO_LARGE');}return JSON.parse(text);}
if(require.main===module)(async()=>{const data=await input();if(process.argv[2]==='provision')await provision(data.password);else if(process.argv[2]==='provision-scram')await provision(data.password,'scram');else if(process.argv[2]==='final-state'){
 const c=client(g.DATABASE,{user:ROLE,password:data.password});
 try{await c.connect();await c.query('BEGIN READ ONLY');const identity=await g.verifyIdentity(c,{username:ROLE});await g.verifySchema(c);await g.rejectPrivilegedRole(c);
 const counts=(await c.query('SELECT (SELECT count(*)::int FROM usuarios) users,(SELECT count(*)::int FROM reservaciones) reservations,(SELECT count(*)::int FROM usuario_plataformas_visibles) assignments,(SELECT count(*)::int FROM daily_observaciones) daily_observations')).rows[0];
 const role=(await c.query('SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
 const users=(await c.query('SELECT u.correo,u.alcance_plataformas,ARRAY(SELECT p.nombre FROM usuario_plataformas_visibles v JOIN plataformas p USING(id_plataforma) WHERE v.id_usuario=u.id_usuario ORDER BY p.nombre) plataformas FROM usuarios u ORDER BY u.id_usuario')).rows;
 const privileges=(await c.query(`SELECT c.relname,has_table_privilege(current_user,c.oid,'SELECT') AS select,has_table_privilege(current_user,c.oid,'INSERT') AS insert,has_table_privilege(current_user,c.oid,'UPDATE') AS update,has_table_privilege(current_user,c.oid,'DELETE') AS delete,has_table_privilege(current_user,c.oid,'TRUNCATE') AS truncate FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname`)).rows;
 if(counts.users!==4||counts.reservations!==6||counts.assignments!==2||counts.daily_observations!==0||users.find(u=>u.correo==='consulta.selected.dev@example.test').plataformas.join(',')!=='FareHarbor,GetYourGuide')g.fail('DEV_FINAL_FIXTURE_MISMATCH');
 for(const r of privileges)if(!r.select||r.insert!==INSERT.includes(r.relname)||r.update!==UPDATE.includes(r.relname)||r.delete!==(r.relname==='usuario_plataformas_visibles')||r.truncate)g.fail('DEV_FINAL_GRANT_MISMATCH');
 await c.query('ROLLBACK');save('final-state.json',{identity,role,counts,users,privileges,selected_scope_restored:true});console.log('DEV-DB-03: estado final 4 usuarios, 6 reservas, 2 asignaciones; rol y permisos minimos confirmados.');
 }finally{await c.end();}
 }else if(process.argv[2]==='isolation')await verifyIsolation(data.password);else if(process.argv[2]==='complete'){
 await verifyIsolation(data.password);
 const text=fs.readFileSync(g.CONFIG,'utf8');if(!/^DB_USER=/m.test(text))fs.writeFileSync(g.CONFIG,text.trimEnd()+'\nDB_USER='+ROLE+'\n');else if(!text.includes('DB_USER='+ROLE))g.fail('DEV_CONFIG_USER_REVIEW_REQUIRED');
 const before=JSON.parse(fs.readFileSync(path.join(LAB,'protected-before.json'))),after=await primarySnapshot();save('protected-after.json',after);
 if(JSON.stringify(before)!==JSON.stringify(after))g.fail('PRIMARY_STATE_CHANGED');console.log('DEV-DB-03: aislamiento autenticado aprobado; configuracion independiente lista.');
 }else g.fail('DEV_COMMAND_INVALID');})().catch(e=>{console.error('DEV-DB-03 detenido:',/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'DEV_ROLE_SETUP_FAILED');process.exitCode=1;});
module.exports={ROLE,LAB,VAULT,INSERT,UPDATE,primarySnapshot,verifyIsolation,client,save};

