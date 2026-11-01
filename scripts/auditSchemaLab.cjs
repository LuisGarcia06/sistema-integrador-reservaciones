'use strict';
// No HTTP, Electron, services ni .env. Aprovisionamiento 020 NUEVO y extension 021.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=require('./standaloneDev.cjs'),P=require('../backend/config/standalonePolicy');
const A=require('../backend/config/auditSchemaPolicy'),S=require('../backend/config/auditSchema');
async function main(){
    const [mode,dir,...extra]=process.argv.slice(2);
    if(!['Verify','Stop'].includes(mode)||!path.isAbsolute(dir||'')||extra.length)throw Error('AUDIT_LAB_ARGUMENTS');
    if(mode==='Stop'){const p=A.readPlan(path.join(dir,'manifest.json'));base.control(p.manifest,'stop');return;}
    const report={phase:'2D.8B.1',completed:false,syntheticOnly:true,noHttpServer:true,noElectron:true,noBusinessServiceWriters:true,checks:[],connections:[],failures:[]};
    const net=require('node:net'),original=net.Socket.prototype.connect;
    net.Socket.prototype.connect=function(...args){const v=Array.isArray(args[0])?args[0]:args,t=v[0];report.connections.push({host:t&&typeof t==='object'?t.host:v[1],port:Number(t&&typeof t==='object'?t.port:t)});return original.apply(this,args);};
    let manifest;
    console.log('AUDIT_SCHEMA_LAB '+dir);
    try{
        await base.prepare(dir,{profile:'command-api-lab',revisionAudit:async({admin,plan,fixtures})=>{
            manifest=plan.manifest;P.blockNetwork(manifest.pgPort);
            Object.assign(report,{directory:dir,database:manifest.database,cluster:manifest.cluster,pgPort:manifest.pgPort,unusedHttpPort:manifest.httpPort,dataGeneration:manifest.dataGeneration});
            P.verifyLocalCluster(manifest);
            const {Client}=require('pg'),runtime=new Client({host:P.HOST,port:manifest.pgPort,database:manifest.database,user:plan.config.DB_USER,password:plan.config.DB_PASSWORD,connectionTimeoutMillis:5000,query_timeout:8000});
            await runtime.connect();
            try{
                const pool={connect:async()=>({query:runtime.query.bind(runtime),release(){}})};
                await require('../backend/config/commandApiPolicy').verify(pool,plan);
                report.checks.push('020 verificado con politicas anteriores intactas antes de migrar');
                const actor=(await admin.query("SELECT id_usuario FROM usuarios WHERE correo='administrador@standalone.example.test'")).rows[0].id_usuario;
                await admin.query("INSERT INTO bitacora(id_usuario,id_reservacion,accion,descripcion,fecha) VALUES ($1,$2,'CREAR','Historico sintetico antes de 021',CURRENT_TIMESTAMP),($1,NULL,'INTEGRACION_PAUSADA','Historico sintetico sin reservacion',CURRENT_TIMESTAMP),($1,$2,'MODIFICAR',NULL,CURRENT_TIMESTAMP)",[actor,fixtures.records[0].reservaciones]);
                const historic=(await admin.query('SELECT to_jsonb(b) fila FROM bitacora b ORDER BY id_bitacora')).rows;
                const identity=(await admin.query("SELECT current_database() db,inet_server_port() port,(SELECT system_identifier::text FROM pg_control_system()) cluster")).rows[0];
                assert.equal(identity.db,manifest.database);assert.equal(identity.port,manifest.pgPort);assert.equal(identity.cluster,manifest.cluster);
                const sql=fs.readFileSync(path.join(manifest.root,A.FILE),'utf8').replace(/\r\n/g,'\n');
                assert.equal(P.sha(sql),A.MIGRATION_SHA,'AUDIT_MIGRATION_CHANGED');
                await admin.query('BEGIN');
                try{await admin.query('SET LOCAL ROLE ctsk_standalone_owner');await admin.query(sql);await admin.query('COMMIT');}
                catch(e){await admin.query('ROLLBACK');throw e;}
                report.checks.push('021 aplicado atomicamente por owner tras comprobar identidad del cluster 020 nuevo');
                const next={version:5,environment:A.ENVIRONMENT,purpose:A.PURPOSE,schemaVersion:A.SCHEMA,dataGeneration:manifest.dataGeneration,root:manifest.root,directory:manifest.directory,dataDirectory:manifest.dataDirectory,host:manifest.host,pgPort:manifest.pgPort,httpPort:manifest.httpPort,database:manifest.database,runtime:manifest.runtime,cluster:manifest.cluster,code:A.fingerprint(manifest.root),configDigest:'0'.repeat(64)};
                const config=Object.fromEntries(A.KEYS.map(k=>[k,k==='APP_ENVIRONMENT'?A.ENVIRONMENT:k==='DB_SCHEMA_VERSION'?A.SCHEMA:plan.config[k]]));
                const bytes=Object.entries(config).map(([k,v])=>k+'='+v).join('\n')+'\n';next.configDigest=P.sha(bytes);A.validateManifest(next,next.root);A.validateConfig(config,next);
                // Sustituir SOLO los archivos recien creados de ESTE laboratorio;
                // ninguna entrada HTTP anterior puede usar su manifiesto 020.
                fs.writeFileSync(path.join(dir,'runtime.env'),bytes);fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(next,null,2));manifest=next;
                const inventory=await S.inspect(runtime);fs.writeFileSync(path.join(dir,'audit-schema-inventory.json'),JSON.stringify(inventory,null,2));
                report.catalogDigest=S.digest(inventory);
                const auditPlan=A.readPlan(path.join(dir,'manifest.json'));await A.verify(runtime,auditPlan);
                await require('./auditSchemaCases.cjs').run({admin,runtime,plan:auditPlan,fixtures,actor,historic,report});
                await A.verify(runtime,auditPlan);
                report.checks.push('Contrato 021 y contratos base 019/020 intactos al terminar');
            }finally{await runtime.end();}
        }});
        assert.ok(report.checks.length>=30,'MANDATORY_AUDIT_CASES');
        assert.ok(report.connections.every(c=>c.host===P.HOST&&c.port===manifest.pgPort),'FOREIGN_CONNECTION');
        report.completed=true;
    }catch(error){report.failures.push({code:error.code||error.name,message:error.message.slice(0,350),stack:error.stack?.split('\n').slice(1,4)});throw error;}
    finally{
        if(manifest&&fs.existsSync(path.join(dir,'data/postmaster.pid')))base.control(manifest,'stop');
        report.postgresStopped=!fs.existsSync(path.join(dir,'data/postmaster.pid'));
        net.Socket.prototype.connect=original;
        fs.writeFileSync(path.join(dir,'audit-verification.json'),JSON.stringify(report,null,2));
        console.log(JSON.stringify(report));
    }
}
if(require.main===module)main().catch(e=>{console.error('AUDIT_SCHEMA_FAILED '+(e.code||e.message));process.exitCode=1;});
module.exports={main};
