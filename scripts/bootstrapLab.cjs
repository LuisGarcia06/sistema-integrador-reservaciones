'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const base=require('./standaloneDev.cjs'),B=require('../backend/config/standalonePolicy'),P=require('../backend/config/bootstrapPolicy'),KEY=require('../backend/config/operationalTransactions').KEY;
async function main(){
  const [mode,cDirectory,...directories]=process.argv.slice(2);
  if(mode==='Stop'){const plan=P.readPlan(path.join(cDirectory,'bootstrap-manifest.json'));base.control(plan.manifest,'stop');return;}
  if(mode!=='Verify'||directories.length!==3||![cDirectory,...directories].every(path.isAbsolute)||new Set(directories).size!==3)throw Error('BOOTSTRAP_LAB_ARGUMENTS');
  const c=P.verifyC(cDirectory),summary={phase:'2D.9B.3-D',completed:false,cValidatedBeforeD:true,cProof:c,groups:[],checks:[],failures:[],firstHttpLogin:{executed:false,reason:'No se fabrica prueba A ni se agregan Usuarios para abrir un perfil HTTP sobre instalación limpia. bcrypt/rol/version se verifican localmente.'}};
  const secrets=[],secret=()=>{const value=crypto.randomBytes(20).toString('hex');secrets.push(value);return value;};
  const input=()=>{const password=secret();return {nombre:'Administrador inicial sintético',correo:'FIRST@BOOTSTRAP.EXAMPLE.TEST',password,confirmacion:password};};
  const assertNoSecrets=text=>{for(const value of secrets)assert.ok(!text.includes(value),'D_SECRET_EXPOSED');assert.ok(!/\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}/.test(text),'D_HASH_EXPOSED');assert.ok(!/eyJhbGciOiJIUzI1Ni/.test(text),'D_JWT_EXPOSED');};
  const env=require('../backend/config/desktopPolicy').cleanEnvironment();delete env.ELECTRON_RUN_AS_NODE;
  const pass=(group,name)=>{group.checks.push(name);summary.checks.push(name);console.log('BOOTSTRAP_OK '+name);};
  try{
    for(let groupIndex=0;groupIndex<directories.length;groupIndex++){
      const directory=directories[groupIndex],group={kind:['concurrency','rollbacks','existing-user'][groupIndex],directory,completed:false,checks:[],proofs:[],connections:[],failures:[]};summary.groups.push(group);let m,runtime,logs='';const children=new Set();
      try{
        await base.prepare(directory,{profile:'empty-bootstrap-lab',bootstrapAudit:async({admin,plan:initial,sqlPassword})=>{
          secrets.push(sqlPassword,initial.config.DB_PASSWORD,initial.config.JWT_SECRET);
          m={...initial.manifest,version:12,environment:P.ENVIRONMENT,purpose:P.PURPOSE,schemaVersion:'023',dataGeneration:crypto.randomUUID(),sqlPrincipal:P.SQL_PRINCIPAL,cDirectory,cProofDigest:c.digest,code:P.fingerprint(initial.manifest.root),configDigest:'0'.repeat(64)};m.configDigest=P.configDigest(m);P.validateManifest(m,m.root);B.verifyLocalCluster(m);
          assert.notEqual(m.cluster,c.cluster);assert.equal(fs.existsSync(path.join(directory,'test-user.json')),false);assert.equal((await admin.query('SELECT count(*)::int n FROM usuarios')).rows[0].n,0);
          const identity=async()=>{const r=(await admin.query('SELECT current_database() db,inet_server_port() port,(SELECT system_identifier::text FROM pg_control_system()) cluster')).rows[0];assert.equal(r.db,m.database);assert.equal(r.port,m.pgPort);assert.equal(r.cluster,m.cluster);};
          const apply=async(file,expected,exact)=>{await identity();const sql=fs.readFileSync(path.join(m.root,file),'utf8').replace(/\r\n/g,'\n');if(expected)assert.equal(B.sha(sql),expected);if(exact)assert.equal(sql,exact);await admin.query('SET ROLE ctsk_standalone_owner');try{await admin.query(sql);}catch(e){await admin.query('ROLLBACK').catch(()=>{});throw e;}finally{await admin.query('RESET ROLE');}};
          await apply('database/migrations/019_revisiones_registros_lab.sql',null,require('../backend/config/revisionSchemaContract').MIGRATION_SQL);
          await apply('database/migrations/020_comandos_idempotentes_lab.sql',require('../backend/config/commandSchemaContract').MIGRATION_SHA);
          const comment=(await admin.query("SELECT format('COMMENT ON TABLE public.comandos_idempotentes IS %L',$1::text) sql",[m.dataGeneration])).rows[0].sql;await admin.query(comment);
          for(const contract of ['auditSchemaContract','adminAuditSchemaContract','credentialSchemaContract']){const k=require('../backend/config/'+contract);await apply(k.FILE,k.MIGRATION_SHA);}
          runtime=new(require('pg').Client)({host:'127.0.0.1',port:m.pgPort,database:m.database,user:m.runtime,password:initial.config.DB_PASSWORD,connectionTimeoutMillis:5000,query_timeout:10000});runtime.on('error',()=>{});await runtime.connect();await require('../backend/config/credentialSchema').verify(runtime,m.dataGeneration);
          const manifestFile=path.join(directory,'bootstrap-manifest.json');fs.writeFileSync(manifestFile,JSON.stringify(m,null,2),{flag:'wx'});const plan=P.readPlan(manifestFile);
          const counts=async()=>(await admin.query('SELECT (SELECT count(*)::int FROM usuarios) users,(SELECT count(*)::int FROM inicializacion_sistema) constances,(SELECT count(*)::int FROM bitacora) audits,(SELECT count(*)::int FROM comandos_idempotentes) commands')).rows[0];
          const empty=async()=>assert.deepEqual(await counts(),{users:0,constances:0,audits:0,commands:0});
          await empty();pass(group,'Instalacion '+group.kind+': esquema023 exacto, roles tecnicos y cero Usuarios/constancias sin fixtures administrativas');
          function launch(options={}){
            const child=cp.spawn(process.execPath,[path.join(__dirname,'bootstrapProbe.cjs'),manifestFile],{env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});children.add(child);const events=[],waiters=[];let result,lost=false;
            const attempt=options.attempt||crypto.randomUUID(),payload={type:'input',sqlPassword,input:options.input||(!options.inspect?input():undefined),attempt,...options};
            child.stdout.on('data',v=>logs+=v);child.stderr.on('data',v=>logs+=v);
            child.on('message',message=>{events.push(message);if(message.type==='ready')child.send(payload);if(message.type==='result')result=message;if(message.type==='output-lost')lost=true;if(message.type==='connection')group.connections.push({host:message.host,port:message.port});for(const w of waiters.filter(w=>w.type===message.type))w.resolve(message);});
            const done=new Promise((yes,no)=>{const timer=setTimeout(()=>{child.kill();no(Error('D_CHILD_TIMEOUT'));},90000);child.once('error',no);child.once('exit',code=>{clearTimeout(timer);children.delete(child);const record={attempt,code,result,lost,proofs:events.filter(e=>e.type==='sql-proof')};group.proofs.push(record);yes(record);});});
            void done.catch(()=>{});
            return {child,attempt,payload,events,done,wait:type=>{const prior=events.find(e=>e.type===type);return prior?Promise.resolve(prior):Promise.race([new Promise(resolve=>waiters.push({type,resolve})),done.then(record=>{throw Error('D_EVENT_NOT_EMITTED_'+type+'_'+(record.result?.code||record.code));})]);}};
          }
          const rejected=async(options,codes)=>{const r=await launch(options).done;assert.equal(r.result?.ok,false,'D_REJECTION_REQUIRED');assert.ok(codes.includes(r.result.code),'D_REJECTION_CODE');return r;};
          const checkInitialized=async(initialInput,attempt)=>{
            const user=(await admin.query('SELECT u.*,u.version_credenciales::text cv,r.nombre rol FROM usuarios u JOIN roles r USING(id_rol)')).rows;assert.equal(user.length,1);secrets.push(user[0].password);assert.equal(user[0].rol,'Administrador');assert.equal(user[0].estado,true);assert.equal(user[0].alcance_plataformas,'all');assert.equal(user[0].cv,'1');assert.equal(user[0].correo,'first@bootstrap.example.test');assert.equal(require('bcryptjs').getRounds(user[0].password),12);assert.ok(await require('bcryptjs').compare(initialInput.password,user[0].password));
            const record=(await admin.query('SELECT * FROM inicializacion_sistema')).rows;assert.equal(record.length,1);assert.equal(record[0].id_inicializacion,attempt);assert.equal(record[0].id_usuario_inicial,user[0].id_usuario);assert.equal(record[0].generacion_datos,m.dataGeneration);assert.equal(record[0].cluster_id,m.cluster);assert.equal(record[0].huella_herramienta,m.code);assert.equal(record[0].principal_sql,P.SQL_PRINCIPAL);assert.equal(record[0].version_esquema_inicial,23);assert.ok(record[0].instante instanceof Date);assert.deepEqual(await counts(),{users:1,constances:1,audits:0,commands:0});return record[0];
          };
          if(groupIndex===0){
            const firstInput=input(),secondInput=input(),first=launch({input:firstInput,faults:['hold','lost-output']});await first.wait('held');const second=launch({input:secondInput});await second.wait('waiting-for-lock');
            let waiting=false;for(let n=0;n<50;n++){const locks=(await admin.query("SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND classid=$1::oid AND objid=$2::oid AND NOT granted",KEY)).rows[0].n;if(locks){waiting=true;break;}await new Promise(r=>setTimeout(r,10));}assert.ok(waiting,'D_CONCURRENT_LOCK_REQUIRED');
            await runtime.query('BEGIN');await runtime.query("SET LOCAL lock_timeout='100ms'");let blocked;try{await runtime.query("INSERT INTO usuarios(id_rol,nombre,correo,password,estado,alcance_plataformas) SELECT id_rol,'No crear','blocked@bootstrap.example.test','PRIVATE_NON_CREDENTIAL',true,'all' FROM roles WHERE nombre='Administrador'");}catch(e){blocked=e.code;}finally{await runtime.query('ROLLBACK');}assert.equal(blocked,'55P03');group.nonCooperativeInsertBlocked=true;first.child.send({type:'release'});
            const [one,two]=await Promise.all([first.done,second.done]);assert.equal(one.code,0);assert.equal(one.lost,true);assert.equal(one.result,undefined);assert.equal(two.result?.ok,false);assert.equal(two.result.code,'BOOTSTRAP_ALREADY_INITIALIZED');const record=await checkInitialized(firstInput,first.attempt);group.constance=record;
            const proof=one.proofs;assert.deepEqual(proof.map(p=>p.phase),['user','constance','commit']);assert.equal(new Set(proof.map(p=>p.transaction)).size,1);assert.equal(new Set(proof.map(p=>p.pid)).size,1);assert.equal(new Set(proof.map(p=>p.client)).size,1);
            pass(group,'Dos procesos reales: un primer Administrador y singleton en la misma transaccion/PID; segundo inicializador rechazado');
            pass(group,'Bloqueo de tabla impide INSERT runtime no cooperativo mientras se inicializa, sin Usuario adicional');
            const inspected=await launch({inspect:true,attempt:first.attempt}).done;assert.equal(inspected.result?.ok,true);assert.equal(inspected.result.result.id_inicializacion,record.id_inicializacion);
            pass(group,'Salida perdida despues de COMMIT se resuelve por consulta local de constancia/UUID, sin reintentar creacion');
            await rejected({},['BOOTSTRAP_ALREADY_INITIALIZED']);await rejected({inspect:true,attempt:crypto.randomUUID()},['BOOTSTRAP_ATTEMPT_DIFFERENT']);
            pass(group,'Segundo intento y consulta de UUID ajeno rechazados; bcrypt12/version1/rol activo/all confirmados sin JWT ni Bitacora ficticia');
          }else if(groupIndex===1){
            for(const fault of ['before-user','after-user','constance','after-constance']){const before=await counts();await rejected({faults:[fault]},fault==='constance'?['23514']:fault==='before-user'?['42P01']:['PRIVATE_AFTER_USER','PRIVATE_AFTER_CONSTANCE']);assert.deepEqual(await counts(),before);await empty();pass(group,'Fallo '+fault+' revierte Usuario y constancia completamente');}
            const samples=['1234567',' '.repeat(8),'\u00a0'.repeat(8),'a'.repeat(73),'1234567\0','1234567\ud800'];
            for(const password of samples){const sample=input();sample.password=password;sample.confirmacion=password;await rejected({input:sample},['PASSWORD_INVALIDO']);await empty();}
            const mismatch=input();mismatch.confirmacion=secret();await rejected({input:mismatch},['BOOTSTRAP_CONFIRMATION_MISMATCH']);const ambiguous=input();ambiguous.correo='Á@bootstrap.example.test';await rejected({input:ambiguous},['EMAIL_NORMALIZATION_REVIEW_REQUIRED']);await empty();pass(group,'Politica023 Unicode/bytes/NUL/blancos/confirmacion/correo ambivalente rechaza antes de crear sin alterar secretos');
            const original=fs.readFileSync(manifestFile),bad={...m,cluster:'8000000000000000001'};bad.configDigest=P.configDigest(bad);fs.writeFileSync(manifestFile,JSON.stringify(bad,null,2));try{await rejected({},['BOOTSTRAP_IDENTITY_MISMATCH']);}finally{fs.writeFileSync(manifestFile,original);}await empty();pass(group,'Identidad de cluster incorrecta se rechaza sobre conexion exclusiva al cluster nuevo propio');
            await admin.query("DELETE FROM roles WHERE nombre='Administrador'");await rejected({},['BOOTSTRAP_FUNCTIONAL_ROLES_REQUIRED']);await admin.query("INSERT INTO roles(nombre,descripcion) VALUES ('Administrador','Restauracion de fixture tecnica vacia')");await empty();pass(group,'Falta de rol funcional bloquea; herramienta no inventa roles');
            await rejected({runtime:true,runtimePassword:initial.config.DB_PASSWORD},['42501','BOOTSTRAP_IDENTITY_MISMATCH']);let denied;try{await runtime.query('INSERT INTO inicializacion_sistema(singleton) VALUES (1)');}catch(e){denied=e.code;}assert.equal(denied,'42501');await empty();pass(group,'Runtime no puede asumir inicializacion privilegiada ni escribir singleton');
            const successfulInput=input(),successful=await launch({input:successfulInput}).done;assert.equal(successful.result?.ok,true);await checkInitialized(successfulInput,successful.attempt);pass(group,'Instalacion sigue limpia tras fallos y permite inicializacion legitima unica posterior');
          }else{
            const password=secret(),hash=await require('bcryptjs').hash(password,12);secrets.push(hash);await admin.query("INSERT INTO usuarios(id_rol,nombre,correo,password,estado,alcance_plataformas) SELECT id_rol,'Fixture importada sin constancia','existing@bootstrap.example.test',$1,true,'all' FROM roles WHERE nombre='Administrador'",[hash]);
            group.intentionalCounterexampleFixture=true;await rejected({},['BOOTSTRAP_USERS_EXIST']);assert.deepEqual(await counts(),{users:1,constances:0,audits:0,commands:0});pass(group,'Usuario existente sin constancia bloquea bootstrap; no se convierte en instalacion limpia');
            await admin.query('UPDATE usuarios SET estado=false');await rejected({},['BOOTSTRAP_USERS_EXIST']);assert.deepEqual(await counts(),{users:1,constances:0,audits:0,commands:0});assert.equal((await admin.query('SELECT password FROM usuarios')).rows[0].password,hash);pass(group,'Todos los Administradores inactivos tambien bloquean; no es un bypass de recuperacion');
          }
          await require('../backend/config/credentialSchema').verify(runtime,m.dataGeneration);group.finalCounts=await counts();group.cluster=m.cluster;group.database=m.database;group.pgPort=m.pgPort;group.httpPort=m.httpPort;group.completed=true;
        }});
      }catch(e){group.failures.push({code:e.code||e.message});throw e;}
      finally{
        for(const child of children)if(child.exitCode===null){const ended=require('node:events').once(child,'exit');child.kill();await ended;}
        await runtime?.end().catch(()=>{});if(m&&fs.existsSync(path.join(directory,'data/postmaster.pid')))base.control(m,'stop');group.postgresStopped=!fs.existsSync(path.join(directory,'data/postmaster.pid'));
        assert.ok(group.connections.every(c=>c.host==='127.0.0.1'&&c.port===m.pgPort));assertNoSecrets(logs+JSON.stringify(group));if(fs.existsSync(path.join(directory,'postgres.log')))assertNoSecrets(fs.readFileSync(path.join(directory,'postgres.log'),'utf8'));
        group.secretScanPassed=true;fs.writeFileSync(path.join(directory,'bootstrap-server.log'),logs);fs.writeFileSync(path.join(directory,'bootstrap-verification.json'),JSON.stringify(group,null,2));console.log(JSON.stringify({directory,completed:group.completed,checks:group.checks.length,postgresStopped:group.postgresStopped}));
      }
    }
    summary.completed=true;
  }catch(e){summary.failures.push({code:e.code||e.message});throw e;}
  finally{assertNoSecrets(JSON.stringify(summary));fs.writeFileSync(path.join(__dirname,'../docs/local-fase-2d9b3/d-verification.json'),JSON.stringify(summary,null,2));}
}
if(require.main===module)main().catch(e=>{console.error('BOOTSTRAP_LAB_FAILED '+(e.code||e.message));process.exitCode=1;});
module.exports={main};
