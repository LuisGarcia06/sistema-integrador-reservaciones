'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const base=require('./standaloneDev.cjs'),B=require('../backend/config/standalonePolicy'),P=require('../backend/config/auditApiPolicy');
const {request}=require('./revisionApiLab.cjs');
async function main(){
    const [mode,dir,...extra]=process.argv.slice(2);if(!['Verify','Stop'].includes(mode)||!path.isAbsolute(dir||'')||extra.length)throw Error('AUDIT_API_ARGUMENTS');
    if(mode==='Stop'){const p=P.readPlan(path.join(dir,'manifest.json'));base.control(p.manifest,'stop');return;}
    const report={phase:'2D.8B.2',completed:false,checks:[],failures:[],transactionProofs:[],syntheticOnly:true,loopbackOnly:true,automaticRetries:false,uiModified:false};
    let manifest,child,observer;const events=[],acks=new Map();let output='',errors='';
    const net=require('node:net'),originalConnect=net.Socket.prototype.connect;
    const tracedConnect=function(...args){const v=Array.isArray(args[0])?args[0]:args,t=v[0];report.connections??=[];report.connections.push({host:typeof t==='object'?t.host:v[1],port:Number(typeof t==='object'?t.port:t)});return originalConnect.apply(this,args);};
    net.Socket.prototype.connect=tracedConnect;
    async function stop(){if(child&&child.exitCode===null){const ended=require('node:events').once(child,'exit');child.kill();await ended;}child=null;}
    async function start(plan){
        const env=require('../backend/config/desktopPolicy').cleanEnvironment();delete env.ELECTRON_RUN_AS_NODE;
        child=cp.spawn(process.execPath,[path.join(__dirname,'auditApiServerProbe.cjs'),plan.filename],{env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
        child.on('message',m=>{events.push(m);if(m.type==='armed'){acks.get(m.id)?.();acks.delete(m.id);}});
        child.stderr.on('data',v=>errors+=v);
        await new Promise((yes,no)=>{let out='';const timer=setTimeout(()=>no(Error('AUDIT_API_START_TIMEOUT '+errors.slice(-400))),45000);child.once('exit',()=>{clearTimeout(timer);no(Error('AUDIT_API_EARLY_EXIT '+errors.slice(-400)));});child.stdout.on('data',v=>{output+=v;out+=v;if(out.includes('AUDIT_API_PROBE_READY')){clearTimeout(timer);yes();}});});
    }
    async function arm(fault){const id=require('node:crypto').randomUUID();await new Promise((yes,no)=>{const timer=setTimeout(()=>no(Error('PRIVATE_IPC_TIMEOUT')),5000);acks.set(id,()=>{clearTimeout(timer);yes();});child.send({type:'arm',id,fault});});}
    console.log('AUDIT_API_LAB '+dir);
    try{
        await base.prepare(dir,{profile:'command-api-lab',revisionAudit:async({admin,plan,fixtures})=>{
            manifest=plan.manifest;
            fixtures.auditTour=(await admin.query("INSERT INTO tours(nombre,descripcion,activo) VALUES ('Otro tour de auditoria sintetico','Solo laboratorio',true) RETURNING id_tour")).rows[0].id_tour;
            await require('./revisionApiFixtures.cjs').seed({admin,plan,fixtures});
            await admin.query("UPDATE usuarios SET alcance_plataformas='all' WHERE correo='consulta@standalone.example.test'");
            await admin.query("INSERT INTO usuarios(id_rol,nombre,correo,password,estado,alcance_plataformas) SELECT id_rol,'Consulta seleccionada sintetica','selected@standalone.example.test',password,true,'selected' FROM usuarios WHERE correo='consulta@standalone.example.test'");
            await admin.query("INSERT INTO usuario_plataformas_visibles(id_usuario,id_plataforma) SELECT id_usuario,$1 FROM usuarios WHERE correo='selected@standalone.example.test'",[fixtures.platform]);
            await admin.query('UPDATE reservaciones SET id_transporte_operacion=$1 WHERE id_reservacion=$2',[fixtures.records[0].transportes_operacion,fixtures.records[0].reservaciones]);
            const sql=fs.readFileSync(path.join(manifest.root,require('../backend/config/auditSchemaContract').FILE),'utf8').replace(/\r\n/g,'\n');
            assert.equal(B.sha(sql),require('../backend/config/auditSchemaContract').MIGRATION_SHA);
            // Identidad confirmada por prepare/commandApiPolicy ANTES de esta extension.
            await admin.query('BEGIN');try{await admin.query('SET LOCAL ROLE ctsk_standalone_owner');await admin.query(sql);await admin.query('COMMIT');}catch(e){await admin.query('ROLLBACK');throw e;}
            const next={...manifest,version:6,environment:P.ENVIRONMENT,purpose:P.PURPOSE,schemaVersion:P.SCHEMA,protocol:P.PROTOCOL,code:P.fingerprint(manifest.root)};
            const config={...plan.config,APP_ENVIRONMENT:P.ENVIRONMENT,DB_SCHEMA_VERSION:P.SCHEMA};
            const bytes=Object.entries(config).map(([k,v])=>k+'='+v).join('\n')+'\n';next.configDigest=B.sha(bytes);P.validateManifest(next,next.root);P.validateConfig(config,next);
            fs.writeFileSync(path.join(dir,'runtime.env'),bytes);fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(next,null,2));manifest=next;
            const auditPlan=P.readPlan(path.join(dir,'manifest.json'));B.verifyLocalCluster(manifest);
            const connect=tracedConnect;
            require('node:net').Socket.prototype.connect=function(...args){const v=Array.isArray(args[0])?args[0]:args,t=v[0],host=typeof t==='object'?t.host:v[1],port=Number(typeof t==='object'?t.port:t);if(host!==B.HOST||![manifest.pgPort,manifest.httpPort].includes(port))throw Error('AUDIT_API_TEST_NETWORK_BLOCKED');return connect.apply(this,args);};
            require('node:dgram').createSocket=()=>{throw Error('AUDIT_API_TEST_NETWORK_BLOCKED');};global.fetch=async()=>{throw Error('AUDIT_API_TEST_NETWORK_BLOCKED');};
            const {Client}=require('pg');observer=new Client({host:B.HOST,port:manifest.pgPort,database:manifest.database,user:config.DB_USER,password:config.DB_PASSWORD,connectionTimeoutMillis:5000,query_timeout:8000});await observer.connect();
            await P.verify({connect:async()=>({query:observer.query.bind(observer),release(){}})},auditPlan);
            Object.assign(report,{directory:dir,database:manifest.database,cluster:manifest.cluster,pgPort:manifest.pgPort,httpPort:manifest.httpPort,dataGeneration:manifest.dataGeneration});
            await start(auditPlan);report.checks.push('Entrada nueva verifica identidad, codigo, claves, privilegios y 021 antes de escuchar en loopback');
            const f=JSON.parse(fs.readFileSync(path.join(dir,'api-fixtures.json'))),credentials=JSON.parse(fs.readFileSync(path.join(dir,'test-user.json')));
            await require('./auditApiCases.cjs').run({request:async(...args)=>{try{const r=await request(manifest.httpPort,...args);report.httpCalls??=[];report.httpCalls.push({method:args[0],url:args[1],status:r.status});return r;}catch(e){report.httpCalls??=[];report.httpCalls.push({method:args[0],url:args[1],status:null,error:e.code||e.name});throw e;}},observer,admin,fixtures:f,credentials,report,arm,events,restart:async()=>{await stop();await start(auditPlan);}});
            await stop();
            const rejectStartup=async(entry='auditApi.js')=>{
                const env=require('../backend/config/desktopPolicy').cleanEnvironment();delete env.ELECTRON_RUN_AS_NODE;
                const result=cp.spawnSync(process.execPath,[path.join(manifest.root,'backend',entry),'--manifest',auditPlan.filename],{env,windowsHide:true,encoding:'utf8',timeout:15000});
                assert.ok(result.status!==0&&result.status!==null,'INCOMPATIBLE_STARTUP_ACCEPTED');
                const socket=net.createServer();await new Promise((yes,no)=>{socket.once('error',no);socket.listen({host:B.HOST,port:manifest.httpPort,exclusive:true},yes);});await new Promise(yes=>socket.close(yes));
                report.checks.push('Arranque incompatible rechazado antes de escuchar: '+entry+' '+result.stderr.trim().slice(0,110));
            };
            await rejectStartup('commandApi.js');
            await admin.query('ALTER TABLE bitacora DISABLE TRIGGER ctsk_audit_command_021');
            try{await rejectStartup();}finally{await admin.query('ALTER TABLE bitacora ENABLE ALWAYS TRIGGER ctsk_audit_command_021');}
            const configFile=path.join(dir,'runtime.env'),manifestFile=path.join(dir,'manifest.json'),keyFile=path.join(dir,'commands.key');
            for(const [file,mutate]of [[manifestFile,b=>JSON.stringify({...JSON.parse(b),code:'0'.repeat(64)})],[configFile,b=>b.replace('DB_SCHEMA_VERSION=021','DB_SCHEMA_VERSION=020')],[keyFile,()=>require('node:crypto').randomBytes(32).toString('hex')]]){
                const original=fs.readFileSync(file,'utf8');fs.writeFileSync(file,mutate(original));try{await rejectStartup();}finally{fs.writeFileSync(file,original);}
            }
            await P.verify({connect:async()=>({query:observer.query.bind(observer),release(){}})},auditPlan);
            await stop();await observer.end();observer=null;
        }});
        assert.ok(report.checks.length>=27,'MANDATORY_AUDIT_API_CASES');report.completed=true;
    }catch(e){report.failures.push({code:e.code||e.name,message:e.message.slice(0,900),stack:e.stack?.split('\n').slice(1,5)});throw e;}
    finally{
        await stop();await observer?.end();
        if(manifest&&fs.existsSync(path.join(dir,'data/postmaster.pid')))base.control(manifest,'stop');
        report.postgresStopped=!fs.existsSync(path.join(dir,'data/postmaster.pid'));
        net.Socket.prototype.connect=originalConnect;
        fs.writeFileSync(path.join(dir,'audit-api-server.log'),output+'\n'+errors);fs.writeFileSync(path.join(dir,'audit-api-verification.json'),JSON.stringify(report,null,2));
        console.log(JSON.stringify(report));
    }
}
if(require.main===module)main().catch(e=>{console.error('AUDIT_API_LAB_FAILED '+(e.code||e.message));process.exitCode=1;});
module.exports={main};
