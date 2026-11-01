'use strict';
// SOLO esquema: prepara un cluster nuevo; nunca importa servicios, HTTP o Electron.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=require('./standaloneDev.cjs'),P=require('../backend/config/standalonePolicy');
const A=require('../backend/config/adminAuditSchemaPolicy'),S=require('../backend/config/adminAuditSchema');
async function main(){
    const [mode,dir,...extra]=process.argv.slice(2);
    if(!['Verify','Stop'].includes(mode)||!path.isAbsolute(dir||'')||extra.length)throw Error('ADMIN_AUDIT_LAB_ARGUMENTS');
    if(mode==='Stop'){base.control(A.readPlan(path.join(dir,'admin-audit-manifest.json')).manifest,'stop');return;}
    const report={phase:'2D.9B.1',completed:false,syntheticOnly:true,noHttpServer:true,noElectron:true,noBusinessServiceWriters:true,noPasswordChanges:true,checks:[],connections:[],failures:[]};
    const net=require('node:net'),original=net.Socket.prototype.connect;
    net.Socket.prototype.connect=function(...args){const v=Array.isArray(args[0])?args[0]:args,t=v[0];report.connections.push({host:t&&typeof t==='object'?t.host:v[1],port:Number(t&&typeof t==='object'?t.port:t)});return original.apply(this,args);};
    let manifest;
    console.log('ADMIN_AUDIT_SCHEMA_LAB '+dir);
    try{
        await base.prepare(dir,{profile:'command-api-lab',revisionAudit:async({admin,plan,fixtures})=>{
            manifest=plan.manifest;P.blockNetwork(manifest.pgPort);P.verifyLocalCluster(manifest);
            Object.assign(report,{directory:dir,database:manifest.database,cluster:manifest.cluster,pgPort:manifest.pgPort,unusedHttpPort:manifest.httpPort,dataGeneration:manifest.dataGeneration});
            const files=['manifest.json','runtime.env'],predecessorHashes=Object.fromEntries(files.map(f=>[f,P.sha(fs.readFileSync(path.join(dir,f)))]));
            const runtime=new(require('pg').Client)({host:P.HOST,port:manifest.pgPort,database:manifest.database,user:plan.config.DB_USER,password:plan.config.DB_PASSWORD,connectionTimeoutMillis:5000,query_timeout:10000});
            await runtime.connect();
            try{
                await require('../backend/config/commandApiPolicy').verify({connect:async()=>({query:runtime.query.bind(runtime),release(){}})},plan);
                const actor=(await admin.query("SELECT id_usuario FROM usuarios WHERE correo='administrador@standalone.example.test'")).rows[0].id_usuario;
                await admin.query("INSERT INTO bitacora(id_usuario,id_reservacion,accion,descripcion,fecha) VALUES ($1,$2,'CREAR','Historia sintetica previa a 021',CURRENT_TIMESTAMP),($1,NULL,'INTEGRACION_PAUSADA',NULL,CURRENT_TIMESTAMP)",[actor,fixtures.records[0].reservaciones]);
                const historic=(await admin.query('SELECT to_jsonb(b) fila FROM bitacora b ORDER BY id_bitacora')).rows;
                const predecessor=require('../backend/config/auditSchemaContract');
                async function migrate(contract){
                    const sql=fs.readFileSync(path.join(manifest.root,contract.FILE),'utf8').replace(/\r\n/g,'\n');assert.equal(P.sha(sql),contract.MIGRATION_SHA);
                    const identity=(await admin.query("SELECT current_database() db,inet_server_port() port,(SELECT system_identifier::text FROM pg_control_system()) cluster")).rows[0];
                    assert.equal(identity.db,manifest.database);assert.equal(identity.port,manifest.pgPort);assert.equal(identity.cluster,manifest.cluster);
                    await admin.query('BEGIN');try{await admin.query('SET LOCAL ROLE ctsk_standalone_owner');await admin.query(sql);await admin.query('COMMIT');}catch(error){await admin.query('ROLLBACK');throw error;}
                }
                await migrate(predecessor);await require('../backend/config/auditSchema').verifySchema(runtime);
                // Ejecutar los casos originales 021 ANTES de la extension, sin tocar sus verificadores/manifiestos.
                const priorPolicy=require('../backend/config/auditSchemaPolicy');
                const priorConfig=Object.fromEntries(priorPolicy.KEYS.map(k=>[k,k==='APP_ENVIRONMENT'?priorPolicy.ENVIRONMENT:k==='DB_SCHEMA_VERSION'?priorPolicy.SCHEMA:plan.config[k]]));
                const schema021Manifest={version:5,environment:priorPolicy.ENVIRONMENT,purpose:priorPolicy.PURPOSE,schemaVersion:'021',dataGeneration:manifest.dataGeneration,root:manifest.root,directory:manifest.directory,dataDirectory:manifest.dataDirectory,host:manifest.host,pgPort:manifest.pgPort,httpPort:manifest.httpPort,database:manifest.database,runtime:manifest.runtime,cluster:manifest.cluster,code:priorPolicy.fingerprint(manifest.root),configDigest:P.sha(Object.entries(priorConfig).map(([k,v])=>k+'='+v).join('\n')+'\n')};
                priorPolicy.validateManifest(schema021Manifest,manifest.root);priorPolicy.validateConfig(priorConfig,schema021Manifest);
                // Contexto de prueba 021 en memoria; no modifica el manifiesto 020 de aprovisionamiento.
                const legacyReport={checks:[]};await require('./auditSchemaCases.cjs').run({admin,runtime,plan:{manifest:schema021Manifest,config:priorConfig},fixtures,actor,historic,report:legacyReport});
                await require('../backend/config/auditSchema').verifySchema(runtime);report.predecessor021=legacyReport;
                const preserved=(await runtime.query('SELECT to_jsonb(b) fila FROM bitacora b ORDER BY id_bitacora')).rows;
                report.checks.push('020 y 021 originales verificados; casos SQL 021 anteriores aprobados antes de 022');
                await migrate(A);
                report.checks.push('022 aplicada atomicamente por owner despues de verificar identidad del cluster nuevo y contrato 021');
                const next={version:7,environment:A.ENVIRONMENT,purpose:A.PURPOSE,schemaVersion:A.SCHEMA,dataGeneration:manifest.dataGeneration,root:manifest.root,directory:manifest.directory,dataDirectory:manifest.dataDirectory,host:manifest.host,pgPort:manifest.pgPort,httpPort:manifest.httpPort,database:manifest.database,runtime:manifest.runtime,cluster:manifest.cluster,code:A.fingerprint(manifest.root),configDigest:'0'.repeat(64)};
                const config=Object.fromEntries(A.KEYS.map(k=>[k,k==='APP_ENVIRONMENT'?A.ENVIRONMENT:k==='DB_SCHEMA_VERSION'?A.SCHEMA:plan.config[k]]));
                const bytes=Object.entries(config).map(([k,v])=>k+'='+v).join('\n')+'\n';next.configDigest=P.sha(bytes);A.validateManifest(next,next.root);A.validateConfig(config,next);
                // Archivos PROPIOS del perfil; los manifiestos/configuraciones de aprovisionamiento no se reescriben.
                fs.writeFileSync(path.join(dir,'admin-audit-runtime.env'),bytes,{flag:'wx'});fs.writeFileSync(path.join(dir,'admin-audit-manifest.json'),JSON.stringify(next,null,2),{flag:'wx'});manifest=next;
                const inventory=await S.inspect(runtime);fs.writeFileSync(path.join(dir,'admin-audit-schema-inventory.json'),JSON.stringify(inventory,null,2));
                report.catalogDigest=S.digest(inventory);report.functionsDigest=S.digest(inventory.functions);
                const adminPlan=A.readPlan(path.join(dir,'admin-audit-manifest.json'));await A.verify(runtime,adminPlan);
                await require('./adminAuditSchemaCases.cjs').run({admin,runtime,plan:adminPlan,fixtures,actor,preserved,report});
                await A.verify(runtime,adminPlan);
                assert.deepEqual(Object.fromEntries(files.map(f=>[f,P.sha(fs.readFileSync(path.join(dir,f)))])),predecessorHashes);
                report.checks.push('Manifiesto y configuracion predecesores conservados; manifiesto 022 propio y contrato final exacto');
            }finally{await runtime.end();}
        }});
        assert.ok(report.checks.length>=60,'MANDATORY_ADMIN_AUDIT_CASES');
        assert.ok(report.connections.every(c=>c.host===P.HOST&&c.port===manifest.pgPort),'FOREIGN_CONNECTION');report.completed=true;
    }catch(error){report.failures.push({code:error.code||error.name,message:error.message.slice(0,650),stack:error.stack?.split('\n').slice(1,5)});throw error;}
    finally{
        if(manifest&&fs.existsSync(path.join(dir,'data/postmaster.pid')))base.control(manifest,'stop');
        report.postgresStopped=!fs.existsSync(path.join(dir,'data/postmaster.pid'));net.Socket.prototype.connect=original;
        fs.writeFileSync(path.join(dir,'admin-audit-verification.json'),JSON.stringify(report,null,2));
        console.log(JSON.stringify({completed:report.completed,checks:report.checks.length,failures:report.failures,catalogDigest:report.catalogDigest,functionsDigest:report.functionsDigest,postgresStopped:report.postgresStopped}));
    }
}
if(require.main===module)main().catch(error=>{console.error('ADMIN_AUDIT_SCHEMA_FAILED '+(error.code||error.message));process.exitCode=1;});
module.exports={main};
