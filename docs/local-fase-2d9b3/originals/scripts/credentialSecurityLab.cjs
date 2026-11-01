'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const base=require('./standaloneDev.cjs'),B=require('../backend/config/standalonePolicy'),P=require('../backend/config/credentialSecurityPolicy');
const {request}=require('./revisionApiLab.cjs');
async function main(){
    const [mode,dir,...extra]=process.argv.slice(2);
    if(!['VerifyA','Verify','Stop'].includes(mode)||!path.isAbsolute(dir||'')||extra.length)throw Error('CREDENTIAL_SECURITY_ARGUMENTS');
    if(mode==='Stop'){base.control(P.readPlan(path.join(dir,'security-a-manifest.json')).manifest,'stop');return;}
    const report={phase:'2D.9B.2D',completed:false,checks:[],failures:[],transactionProofs:[],syntheticOnly:true,loopbackOnly:true,passwordChangesOnlyPrivate023:true,automaticRetries:false};
    let manifest,child,observer;let secretCheck=()=>{};const events=[],acks=new Map();let output='',errors='';
    const net=require('node:net'),originalConnect=net.Socket.prototype.connect;
    const tracedConnect=function(...args){const v=Array.isArray(args[0])?args[0]:args,t=v[0];report.connections??=[];report.connections.push({host:typeof t==='object'?t.host:v[1],port:Number(typeof t==='object'?t.port:t)});return originalConnect.apply(this,args);};
    net.Socket.prototype.connect=tracedConnect;
    async function stop(){if(child&&child.exitCode===null){const ended=require('node:events').once(child,'exit');child.kill();await ended;}child=null;}
    async function start(plan){
        const env=require('../backend/config/desktopPolicy').cleanEnvironment();delete env.ELECTRON_RUN_AS_NODE;
        child=cp.spawn(process.execPath,[path.join(__dirname,'credentialSecurityProbe.cjs'),plan.filename],{env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
        child.on('message',m=>{events.push(m);if(m.type==='armed'||m.type==='recent-result'){acks.get(m.id)?.(m);acks.delete(m.id);}});
        let ready='';child.stderr.on('data',v=>errors+=v);
        await new Promise((yes,no)=>{const timer=setTimeout(()=>no(Error('SECURITY_START_TIMEOUT '+errors.slice(-500))),45000);child.once('exit',()=>{clearTimeout(timer);no(Error('SECURITY_EARLY_EXIT '+errors.slice(-500)));});child.stdout.on('data',v=>{output+=v;ready+=v;if(ready.includes('CREDENTIAL_SECURITY_PROBE_READY')){clearTimeout(timer);yes();}});});
    }
    const arm=fault=>new Promise((yes,no)=>{const id=crypto.randomUUID(),timer=setTimeout(()=>{acks.delete(id);no(Error('ARM_TIMEOUT'));},3000);acks.set(id,()=>{clearTimeout(timer);yes();});child.send({type:'arm',fault,id});});
    console.log('CREDENTIAL_SECURITY_LAB '+dir);
    try{
        await base.prepare(dir,{profile:'command-api-lab',revisionAudit:async({admin,plan,fixtures})=>{
            manifest=plan.manifest;B.verifyLocalCluster(manifest);B.blockNetwork(manifest.pgPort);
            const predecessorHashes=Object.fromEntries(['manifest.json','runtime.env','preconditions.key','commands.key'].map(file=>[file,B.sha(fs.readFileSync(path.join(dir,file)))]));
            await require('./revisionApiFixtures.cjs').seed({admin,plan,fixtures});
            await admin.query("UPDATE usuarios SET alcance_plataformas='all' WHERE correo='consulta@standalone.example.test'");
            for(const [email,name,assigned]of [['selected@standalone.example.test','Consulta selected sintetica',true],['empty@standalone.example.test','Consulta selected vacia sintetica',false]]){
                const id=(await admin.query("INSERT INTO usuarios(id_rol,nombre,correo,password,estado,alcance_plataformas) SELECT id_rol,$1,$2,password,true,'selected' FROM usuarios WHERE correo='consulta@standalone.example.test' RETURNING id_usuario",[name,email])).rows[0].id_usuario;
                if(assigned)await admin.query('INSERT INTO usuario_plataformas_visibles(id_usuario,id_plataforma) VALUES ($1,$2)',[id,fixtures.platform]);
            }
            const securityFixtures=await require('./credentialSecurityFixtures.cjs').seed({admin,plan,fixtures:JSON.parse(fs.readFileSync(path.join(dir,'api-fixtures.json')))});
            const config={...plan.config,APP_ENVIRONMENT:P.ENVIRONMENT,DB_SCHEMA_VERSION:P.SCHEMA};
            const {Client}=require('pg');observer=new Client({host:B.HOST,port:manifest.pgPort,database:manifest.database,user:config.DB_USER,password:config.DB_PASSWORD,connectionTimeoutMillis:5000,query_timeout:10000});
            // prepare detiene su cluster si el callback falla. Un cierre del socket
            // observador no debe ocultar el error original ni impedir nuestro finally.
            observer.on('error',e=>{report.observerErrors??=[];report.observerErrors.push(e.code||'OBSERVER_CONNECTION_CLOSED');});await observer.connect();
            await require('../backend/config/commandApiPolicy').verify({connect:async()=>({query:observer.query.bind(observer),release(){}})},plan);
            const actor=(await admin.query("SELECT id_usuario FROM usuarios WHERE correo='administrador@standalone.example.test'")).rows[0].id_usuario;
            await admin.query("INSERT INTO bitacora(id_usuario,id_reservacion,accion,descripcion,fecha) VALUES ($1,$2,'CREAR','Historia sintetica previa a 021',CURRENT_TIMESTAMP),($1,NULL,'INTEGRACION_PAUSADA',NULL,CURRENT_TIMESTAMP)",[actor,fixtures.records[0].reservaciones]);
            const historic=(await admin.query('SELECT to_jsonb(b) fila FROM bitacora b ORDER BY id_bitacora')).rows;
            async function migrate(contract){
                const sql=fs.readFileSync(path.join(manifest.root,contract.FILE),'utf8').replace(/\r\n/g,'\n');assert.equal(B.sha(sql),contract.MIGRATION_SHA);
                const identity=(await admin.query('SELECT current_database() db,inet_server_port() port,(SELECT system_identifier::text FROM pg_control_system()) cluster')).rows[0];
                assert.equal(identity.db,manifest.database);assert.equal(identity.port,manifest.pgPort);assert.equal(identity.cluster,manifest.cluster);
                await admin.query('BEGIN');try{await admin.query('SET LOCAL ROLE ctsk_standalone_owner');await admin.query(sql);await admin.query('COMMIT');}catch(e){await admin.query('ROLLBACK');throw e;}
            }
            await migrate(require('../backend/config/auditSchemaContract'));await require('../backend/config/auditSchema').verifySchema(observer);
            const old=require('../backend/config/auditSchemaPolicy'),priorConfig=Object.fromEntries(old.KEYS.map(k=>[k,k==='APP_ENVIRONMENT'?old.ENVIRONMENT:k==='DB_SCHEMA_VERSION'?old.SCHEMA:plan.config[k]]));
            const schemaManifest={version:5,environment:old.ENVIRONMENT,purpose:old.PURPOSE,schemaVersion:'021',dataGeneration:manifest.dataGeneration,root:manifest.root,directory:manifest.directory,dataDirectory:manifest.dataDirectory,host:manifest.host,pgPort:manifest.pgPort,httpPort:manifest.httpPort,database:manifest.database,runtime:manifest.runtime,cluster:manifest.cluster,code:old.fingerprint(manifest.root),configDigest:B.sha(Object.entries(priorConfig).map(([k,v])=>k+'='+v).join('\n')+'\n')};
            const legacyReport={checks:[]};await require('./auditSchemaCases.cjs').run({admin,runtime:observer,plan:{manifest:schemaManifest,config:priorConfig},fixtures,actor,historic,report:legacyReport});
            report.predecessor021Checks=legacyReport.checks.length;
            const preserved=(await observer.query('SELECT to_jsonb(b) fila FROM bitacora b ORDER BY id_bitacora')).rows;
            await require('../backend/config/auditSchema').verifySchema(observer);await migrate(require('../backend/config/adminAuditSchemaContract'));
            await require('../backend/config/adminAuditSchema').verifyLedger(observer,manifest.dataGeneration);await require('../backend/config/adminAuditSchema').verifySchema(observer);
            const refs=['id_usuario_afectado','id_tour','id_guia','id_operador','id_vehiculo','id_pais','id_plataforma'];
            assert.deepEqual((await observer.query('SELECT to_jsonb(b)-$1::text[] fila FROM bitacora b ORDER BY id_bitacora',[refs])).rows,preserved);
            report.checks.push('020/021 verificados antes de 022; historicos y formato 2 conservados exactamente');
            const CP=require('../backend/security/credentialPolicy');
            await admin.query('BEGIN');try{
                await admin.query("INSERT INTO usuarios(id_rol,nombre,correo,password,estado,alcance_plataformas) SELECT id_rol,nombre,upper(correo),password,estado,alcance_plataformas FROM usuarios WHERE id_usuario=$1",[actor]);
                await assert.rejects(()=>CP.emailPreflight(admin),e=>e.code==='EMAIL_IDENTITY_AMBIGUOUS');
            }finally{await admin.query('ROLLBACK');}
            await admin.query('BEGIN');try{
                await admin.query('UPDATE usuarios SET correo=$1 WHERE id_usuario=$2',['Á@security.example.test',securityFixtures.ids.loginRace]);
                await assert.rejects(()=>CP.emailPreflight(admin),e=>e.code==='EMAIL_NORMALIZATION_REVIEW_REQUIRED');
            }finally{await admin.query('ROLLBACK');}
            report.checks.push('Preflight anterior a 023 rechaza duplicados normalizados y discrepancia JavaScript/PostgreSQL sin corregir cuentas');
            report.emailPreflight=await CP.emailPreflight(observer);
            await migrate(require('../backend/config/credentialSchemaContract'));
            const securityInventory=await require('../backend/config/credentialSchema').inspect(observer);
            fs.writeFileSync(path.join(dir,'credential-schema-inventory.json'),JSON.stringify(securityInventory,null,2));
            require('../backend/config/credentialSchema').validate(securityInventory);
            const key=crypto.randomBytes(32).toString('hex'),commandKey=crypto.randomBytes(32).toString('hex');
            const next={...manifest,version:10,milestone:'A',aProof:'0'.repeat(64),environment:P.ENVIRONMENT,purpose:P.PURPOSE,schemaVersion:P.SCHEMA,protocol:P.PROTOCOL,etagKeyDigest:B.sha(key),commandKeyDigest:B.sha(commandKey),code:P.fingerprint(manifest.root)};
            const bytes=Object.entries(config).map(([k,v])=>k+'='+v).join('\n')+'\n';next.configDigest=B.sha(bytes);P.validateManifest(next,next.root);P.validateConfig(config,next);
            for(const [file,data]of [['security-preconditions.key',key],['security-commands.key',commandKey],['security-runtime.env',bytes],['security-a-manifest.json',JSON.stringify(next,null,2)]])fs.writeFileSync(path.join(dir,file),data,{flag:'wx'});
            manifest=next;const apiPlan=P.readPlan(path.join(dir,'security-a-manifest.json'));
            net.Socket.prototype.connect=function(...args){const v=Array.isArray(args[0])?args[0]:args,t=v[0],host=typeof t==='object'?t.host:v[1],port=Number(typeof t==='object'?t.port:t);if(host!==B.HOST||![manifest.pgPort,manifest.httpPort].includes(port))throw Error('SECURITY_TEST_NETWORK_BLOCKED');return tracedConnect.apply(this,args);};
            require('node:dgram').createSocket=()=>{throw Error('SECURITY_TEST_NETWORK_BLOCKED');};global.fetch=async()=>{throw Error('SECURITY_TEST_NETWORK_BLOCKED');};
            await P.verify({connect:async()=>({query:observer.query.bind(observer),release(){}})},apiPlan);
            Object.assign(report,{directory:dir,database:manifest.database,cluster:manifest.cluster,pgPort:manifest.pgPort,httpPort:manifest.httpPort,dataGeneration:manifest.dataGeneration});
            await start(apiPlan);report.checks.push('Entrada 023 verifica esquema estricto, identidad, privilegios y archivos propios antes de escuchar HTTP loopback');
            const f=securityFixtures,credentials=JSON.parse(fs.readFileSync(path.join(dir,'test-user.json')));
            const caseResult=await require('./credentialSecurityACases.cjs').run({request:async(...args)=>{try{const r=await request(manifest.httpPort,...args);report.httpCalls??=[];report.httpCalls.push({method:args[0],url:args[1],status:r.status});return r;}catch(e){report.httpCalls??=[];report.httpCalls.push({method:args[0],url:args[1],status:null,error:e.code||e.name});throw e;}},observer,admin,fixtures:f,credentials,report,arm,events,restart:async()=>{await stop();await start(apiPlan);},releaseLogin:()=>child.send({type:'release'}),recent:token=>new Promise((yes,no)=>{const id=crypto.randomUUID(),timer=setTimeout(()=>{acks.delete(id);no(Error('RECENT_TIMEOUT'));},5000);acks.set(id,m=>{clearTimeout(timer);yes(m.status);});child.send({type:'recent',id,token});}),config});
            secretCheck=caseResult.assertNoSecrets;
            await stop();
            const rejectStartup=async(entry='credentialSecurityApi.js')=>{
                const env=require('../backend/config/desktopPolicy').cleanEnvironment();delete env.ELECTRON_RUN_AS_NODE;
                const r=cp.spawnSync(process.execPath,[path.join(manifest.root,'backend',entry),'--manifest',apiPlan.filename],{env,windowsHide:true,encoding:'utf8',timeout:20000});
                assert.ok(r.status!==0&&r.status!==null,'INCOMPATIBLE_STARTUP_ACCEPTED');
                const socket=net.createServer();await new Promise((yes,no)=>{socket.once('error',no);socket.listen({host:B.HOST,port:manifest.httpPort,exclusive:true},yes);});await new Promise(yes=>socket.close(yes));
                report.checks.push('Rechazo antes de escuchar: '+entry+' '+r.stderr.trim().slice(0,110));
            };
            for(const entry of ['commandApi.js','auditApi.js','adminAuditApi.js','userAuditApi.js'])await rejectStartup(entry);
            await admin.query('ALTER TABLE bitacora DISABLE TRIGGER ctsk_admin_audit_command_022');try{await rejectStartup();}finally{await admin.query('ALTER TABLE bitacora ENABLE ALWAYS TRIGGER ctsk_admin_audit_command_022');}
            for(const [file,mutate]of [['security-a-manifest.json',b=>JSON.stringify({...JSON.parse(b),code:'0'.repeat(64)})],['security-runtime.env',b=>b.replace('DB_SCHEMA_VERSION=023','DB_SCHEMA_VERSION=022')],['security-commands.key',()=>crypto.randomBytes(32).toString('hex')]]){
                const target=path.join(dir,file),original=fs.readFileSync(target,'utf8');fs.writeFileSync(target,mutate(original));try{await rejectStartup();}finally{fs.writeFileSync(target,original);}
            }
            await P.verify({connect:async()=>({query:observer.query.bind(observer),release(){}})},apiPlan);
            assert.deepEqual(Object.fromEntries(Object.keys(predecessorHashes).map(file=>[file,B.sha(fs.readFileSync(path.join(dir,file)))])),predecessorHashes);
            report.checks.push('Manifiesto/configuracion/claves de aprovisionamiento conservados sin reetiquetar; contrato 022 exacto al terminar');
            assert.ok(report.connections.every(c=>c.host===B.HOST&&[manifest.pgPort,manifest.httpPort].includes(c.port)));
            report.backendConnections=events.filter(e=>e.type==='connection');assert.ok(report.backendConnections.length);assert.ok(report.backendConnections.every(c=>c.host===B.HOST&&c.port===manifest.pgPort));
            report.milestoneA={completed:true,checks:report.checks.length,stage:'A',writersEnabled:false};
            const proof={body:{completed:true,cluster:manifest.cluster,generation:manifest.dataGeneration,code:manifest.code,schema:require('../backend/config/credentialSchemaContract').CATALOG_SHA,checks:report.checks.length}};
            proof.signature=crypto.createHmac('sha256',Buffer.from(apiPlan.commandKey,'hex')).update(JSON.stringify(proof.body)).digest('hex');
            fs.writeFileSync(path.join(dir,'security-a-proof.json'),JSON.stringify(proof,null,2),{flag:'wx'});
            if(mode==='Verify'){
                assert.equal(report.milestoneA.completed,true);assert.equal(report.aCompleted,true);
                const beforeB=report.checks.length;
                const bManifest={...manifest,milestone:'B',aProof:B.sha(fs.readFileSync(path.join(dir,'security-a-proof.json')))};
                fs.writeFileSync(path.join(dir,'security-b-manifest.json'),JSON.stringify(bManifest,null,2),{flag:'wx'});
                const bFile=path.join(dir,'security-b-manifest.json');
                fs.writeFileSync(bFile,JSON.stringify({...bManifest,aProof:'0'.repeat(64)},null,2));
                try{assert.throws(()=>P.readPlan(bFile),/CREDENTIAL_MILESTONE_A_REQUIRED/);}finally{fs.writeFileSync(bFile,JSON.stringify(bManifest,null,2));}
                const bPlan=P.readPlan(path.join(dir,'security-b-manifest.json'));await P.verify({connect:async()=>({query:observer.query.bind(observer),release(){}})},bPlan);
                const preservedBeforeB=(await observer.query('SELECT to_jsonb(b) fila FROM bitacora b ORDER BY id_bitacora')).rows;
                const cutoff=(await observer.query('SELECT COALESCE(max(id_bitacora),0) n FROM bitacora')).rows[0].n;
                await start(bPlan);
                const bResult=await require('./credentialSecurityBCases.cjs').run({request:async(...args)=>{
                    try{const r=await request(manifest.httpPort,...args);report.bHttpCalls??=[];report.bHttpCalls.push({method:args[0],url:args[1],status:r.status});return r;}
                    catch(e){report.bHttpCalls??=[];report.bHttpCalls.push({method:args[0],url:args[1],status:null,error:e.code||e.name});throw e;}
                },observer,admin,fixtures:f,credentials,report,arm,events,restart:async()=>{await stop();await start(bPlan);},config});
                const aSecretCheck=secretCheck;secretCheck=text=>{aSecretCheck(text);bResult.assertNoSecrets(text);};
                const pgLog=fs.readFileSync(path.join(dir,'postgres.log'),'utf8');secretCheck(pgLog);
                assert.ok(!/\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}/.test(pgLog),'POSTGRES_HASH_EXPOSED');
                report.postgresLogSecretScanPassed=true;
                await stop();
                assert.deepEqual((await observer.query('SELECT to_jsonb(b) fila FROM bitacora b WHERE id_bitacora<=$1 ORDER BY id_bitacora',[cutoff])).rows,preservedBeforeB);
                await P.verify({connect:async()=>({query:observer.query.bind(observer),release(){}})},bPlan);
                assert.equal((await admin.query('SELECT count(*)::int n FROM inicializacion_sistema')).rows[0].n,0);
                report.milestoneB={completed:true,checks:report.checks.length-beforeB,stage:'B',aProofVerified:true,writers:['POST /api/usuarios','PATCH /api/usuarios/:id','PATCH /api/usuarios/:id/password'],priorAuditRowsUnchanged:true,bootstrapRows:0};
            }
            report.backendConnections=events.filter(e=>e.type==='connection');
            assert.ok(report.backendConnections.every(c=>c.host===B.HOST&&c.port===manifest.pgPort));
            assert.ok(report.connections.every(c=>c.host===B.HOST&&[manifest.pgPort,manifest.httpPort].includes(c.port)));
            report.allStagesNetworkVerified=true;
            await observer.end();observer=null;
        }});
        assert.ok(report.checks.length>=20,'MANDATORY_ADMIN_CATALOG_CASES');report.completed=true;
    }catch(e){report.failures.push({code:e.code||e.name,message:e.message.slice(0,900),stack:e.stack?.split('\n').slice(1,5)});throw e;}
    finally{
        await stop();await observer?.end();if(manifest&&fs.existsSync(path.join(dir,'data/postmaster.pid')))base.control(manifest,'stop');
        report.postgresStopped=!fs.existsSync(path.join(dir,'data/postmaster.pid'));net.Socket.prototype.connect=originalConnect;
        secretCheck(output+'\n'+errors+JSON.stringify(report));
        report.serverLogsSecretScanPassed=true;
        fs.writeFileSync(path.join(dir,'security-server.log'),output+'\n'+errors);fs.writeFileSync(path.join(dir,'security-verification.json'),JSON.stringify(report,null,2));
        console.log(JSON.stringify({directory:dir,completed:report.completed,checks:report.checks.length,failures:report.failures,postgresStopped:report.postgresStopped}));
    }
}
if(require.main===module)main().catch(e=>{console.error('CREDENTIAL_SECURITY_LAB_FAILED '+(e.code||e.message));process.exitCode=1;});
module.exports={main};
