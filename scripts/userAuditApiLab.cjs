'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const base=require('./standaloneDev.cjs'),B=require('../backend/config/standalonePolicy'),P=require('../backend/config/userAuditApiPolicy');
const {request}=require('./revisionApiLab.cjs');
async function main(){
    const [mode,dir,...extra]=process.argv.slice(2);
    if(!['Verify','Stop'].includes(mode)||!path.isAbsolute(dir||'')||extra.length)throw Error('USER_AUDIT_API_ARGUMENTS');
    if(mode==='Stop'){base.control(P.readPlan(path.join(dir,'user-api-manifest.json')).manifest,'stop');return;}
    const report={phase:'2D.9B.2B',completed:false,checks:[],failures:[],transactionProofs:[],syntheticOnly:true,loopbackOnly:true,noPasswordChanges:true,automaticRetries:false};
    let manifest,child,observer;let secretCheck=()=>{};const events=[],acks=new Map();let output='',errors='';
    const net=require('node:net'),originalConnect=net.Socket.prototype.connect;
    const tracedConnect=function(...args){const v=Array.isArray(args[0])?args[0]:args,t=v[0];report.connections??=[];report.connections.push({host:typeof t==='object'?t.host:v[1],port:Number(typeof t==='object'?t.port:t)});return originalConnect.apply(this,args);};
    net.Socket.prototype.connect=tracedConnect;
    async function stop(){if(child&&child.exitCode===null){const ended=require('node:events').once(child,'exit');child.kill();await ended;}child=null;}
    async function start(plan){
        const env=require('../backend/config/desktopPolicy').cleanEnvironment();delete env.ELECTRON_RUN_AS_NODE;
        child=cp.spawn(process.execPath,[path.join(__dirname,'userAuditApiServerProbe.cjs'),plan.filename],{env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
        child.on('message',m=>{events.push(m);if(m.type==='armed'){acks.get(m.id)?.();acks.delete(m.id);}});
        let ready='';child.stderr.on('data',v=>errors+=v);
        await new Promise((yes,no)=>{const timer=setTimeout(()=>no(Error('USER_API_START_TIMEOUT '+errors.slice(-500))),45000);child.once('exit',()=>{clearTimeout(timer);no(Error('USER_API_EARLY_EXIT '+errors.slice(-500)));});child.stdout.on('data',v=>{output+=v;ready+=v;if(ready.includes('USER_AUDIT_API_PROBE_READY')){clearTimeout(timer);yes();}});});
    }
    const arm=fault=>new Promise((yes,no)=>{const id=crypto.randomUUID(),timer=setTimeout(()=>{acks.delete(id);no(Error('ARM_TIMEOUT'));},3000);acks.set(id,()=>{clearTimeout(timer);yes();});child.send({type:'arm',fault,id});});
    console.log('USER_AUDIT_API_LAB '+dir);
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
            await require('./userAuditFixtures.cjs').seed({admin,plan,fixtures:JSON.parse(fs.readFileSync(path.join(dir,'api-fixtures.json')))});
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
            const key=crypto.randomBytes(32).toString('hex'),commandKey=crypto.randomBytes(32).toString('hex');
            const next={...manifest,version:9,environment:P.ENVIRONMENT,purpose:P.PURPOSE,schemaVersion:P.SCHEMA,protocol:P.PROTOCOL,etagKeyDigest:B.sha(key),commandKeyDigest:B.sha(commandKey),code:P.fingerprint(manifest.root)};
            const bytes=Object.entries(config).map(([k,v])=>k+'='+v).join('\n')+'\n';next.configDigest=B.sha(bytes);P.validateManifest(next,next.root);P.validateConfig(config,next);
            for(const [file,data]of [['user-preconditions.key',key],['user-commands.key',commandKey],['user-api-runtime.env',bytes],['user-api-manifest.json',JSON.stringify(next,null,2)]])fs.writeFileSync(path.join(dir,file),data,{flag:'wx'});
            manifest=next;const apiPlan=P.readPlan(path.join(dir,'user-api-manifest.json'));
            net.Socket.prototype.connect=function(...args){const v=Array.isArray(args[0])?args[0]:args,t=v[0],host=typeof t==='object'?t.host:v[1],port=Number(typeof t==='object'?t.port:t);if(host!==B.HOST||![manifest.pgPort,manifest.httpPort].includes(port))throw Error('USER_API_TEST_NETWORK_BLOCKED');return tracedConnect.apply(this,args);};
            require('node:dgram').createSocket=()=>{throw Error('USER_API_TEST_NETWORK_BLOCKED');};global.fetch=async()=>{throw Error('USER_API_TEST_NETWORK_BLOCKED');};
            await P.verify({connect:async()=>({query:observer.query.bind(observer),release(){}})},apiPlan);
            Object.assign(report,{directory:dir,database:manifest.database,cluster:manifest.cluster,pgPort:manifest.pgPort,httpPort:manifest.httpPort,dataGeneration:manifest.dataGeneration});
            await start(apiPlan);report.checks.push('Entrada 022 verifica esquema estricto, identidad, privilegios y archivos propios antes de escuchar HTTP loopback');
            const f=JSON.parse(fs.readFileSync(path.join(dir,'user-api-fixtures.json'))),credentials=JSON.parse(fs.readFileSync(path.join(dir,'test-user.json')));
            const caseResult=await require('./userAuditApiCases.cjs').run({request:async(...args)=>{try{const r=await request(manifest.httpPort,...args);report.httpCalls??=[];report.httpCalls.push({method:args[0],url:args[1],status:r.status});return r;}catch(e){report.httpCalls??=[];report.httpCalls.push({method:args[0],url:args[1],status:null,error:e.code||e.name});throw e;}},observer,admin,fixtures:f,credentials,report,arm,events,restart:async()=>{await stop();await start(apiPlan);}});
            secretCheck=caseResult.assertNoSecrets;
            await stop();
            const rejectStartup=async(entry='userAuditApi.js')=>{
                const env=require('../backend/config/desktopPolicy').cleanEnvironment();delete env.ELECTRON_RUN_AS_NODE;
                const r=cp.spawnSync(process.execPath,[path.join(manifest.root,'backend',entry),'--manifest',apiPlan.filename],{env,windowsHide:true,encoding:'utf8',timeout:20000});
                assert.ok(r.status!==0&&r.status!==null,'INCOMPATIBLE_STARTUP_ACCEPTED');
                const socket=net.createServer();await new Promise((yes,no)=>{socket.once('error',no);socket.listen({host:B.HOST,port:manifest.httpPort,exclusive:true},yes);});await new Promise(yes=>socket.close(yes));
                report.checks.push('Rechazo antes de escuchar: '+entry+' '+r.stderr.trim().slice(0,110));
            };
            for(const entry of ['commandApi.js','auditApi.js','adminAuditApi.js'])await rejectStartup(entry);
            await admin.query('ALTER TABLE bitacora DISABLE TRIGGER ctsk_admin_audit_command_022');try{await rejectStartup();}finally{await admin.query('ALTER TABLE bitacora ENABLE ALWAYS TRIGGER ctsk_admin_audit_command_022');}
            for(const [file,mutate]of [['user-api-manifest.json',b=>JSON.stringify({...JSON.parse(b),code:'0'.repeat(64)})],['user-api-runtime.env',b=>b.replace('DB_SCHEMA_VERSION=022','DB_SCHEMA_VERSION=021')],['user-commands.key',()=>crypto.randomBytes(32).toString('hex')]]){
                const target=path.join(dir,file),original=fs.readFileSync(target,'utf8');fs.writeFileSync(target,mutate(original));try{await rejectStartup();}finally{fs.writeFileSync(target,original);}
            }
            await P.verify({connect:async()=>({query:observer.query.bind(observer),release(){}})},apiPlan);
            assert.deepEqual(Object.fromEntries(Object.keys(predecessorHashes).map(file=>[file,B.sha(fs.readFileSync(path.join(dir,file)))])),predecessorHashes);
            report.checks.push('Manifiesto/configuracion/claves de aprovisionamiento conservados sin reetiquetar; contrato 022 exacto al terminar');
            assert.ok(report.connections.every(c=>c.host===B.HOST&&[manifest.pgPort,manifest.httpPort].includes(c.port)));
            report.backendConnections=events.filter(e=>e.type==='connection');assert.ok(report.backendConnections.length);assert.ok(report.backendConnections.every(c=>c.host===B.HOST&&c.port===manifest.pgPort));
            await observer.end();observer=null;
        }});
        assert.ok(report.checks.length>=35,'MANDATORY_ADMIN_CATALOG_CASES');report.completed=true;
    }catch(e){report.failures.push({code:e.code||e.name,message:e.message.slice(0,900),stack:e.stack?.split('\n').slice(1,5)});throw e;}
    finally{
        await stop();await observer?.end();if(manifest&&fs.existsSync(path.join(dir,'data/postmaster.pid')))base.control(manifest,'stop');
        report.postgresStopped=!fs.existsSync(path.join(dir,'data/postmaster.pid'));net.Socket.prototype.connect=originalConnect;
        secretCheck(output+'\n'+errors+JSON.stringify(report));
        report.serverLogsSecretScanPassed=true;
        fs.writeFileSync(path.join(dir,'user-api-server.log'),output+'\n'+errors);fs.writeFileSync(path.join(dir,'user-api-verification.json'),JSON.stringify(report,null,2));
        console.log(JSON.stringify({directory:dir,completed:report.completed,checks:report.checks.length,failures:report.failures,postgresStopped:report.postgresStopped}));
    }
}
if(require.main===module)main().catch(e=>{console.error('USER_AUDIT_API_LAB_FAILED '+(e.code||e.message));process.exitCode=1;});
module.exports={main};
