// Entrada de pruebas: SIEMPRE prepara un clúster nuevo; no admite un manifiesto existente.
const fs=require('node:fs'),path=require('node:path');
const base=require('./standaloneDev.cjs'),P=require('../backend/config/standalonePolicy');
async function main(){
    const launchEnvironment={...process.env};
    const [mode,dir,...extra]=process.argv.slice(2);
    if(!['Baseline','Verify'].includes(mode)||!path.isAbsolute(dir||'')||extra.length)throw Error('OPERATIONAL_LAB_ARGUMENTS');
    const m=await base.prepare(dir),report={mode,completed:false,loopbackOnly:true,syntheticOnly:true,checks:[],failures:[],database:m.database,pgPort:m.pgPort,unusedHttpPort:m.httpPort};
    console.log('OPERATIONAL_LAB '+dir);
    let pool,observer;
    try{
        const plan=P.readDatabasePlan(path.join(dir,'manifest.json'));P.verifyLocalCluster(m);
        P.blockNetwork(m.pgPort); // Antes de conectar: cero proveedores, LAN u otros puertos PostgreSQL.
        require('../backend/config/desktopConfiguration').initialize(plan.config);
        pool=require('../backend/config/database');
        const {Client}=require('pg');observer=new Client({host:P.HOST,port:m.pgPort,database:m.database,user:plan.config.DB_USER,password:plan.config.DB_PASSWORD,connectionTimeoutMillis:5000,query_timeout:5000});
        await observer.connect();
        await require('../backend/config/desktopPostgres').verifyPostgresWithIdentity(pool,plan.config,(r,c)=>P.validateIdentity(r,c,m));
        await require('./operationalCases.cjs').run({pool,observer,report,protectedMode:mode==='Verify'});
        report.completed=true;
    }catch(error){report.failures.push({code:error.code||error.name,message:error.message.slice(0,450),stack:error.stack?.split('\n').slice(1,4)});throw error;}
    finally{
        await observer?.end().catch(()=>{});await pool?.end().catch(()=>{});
        process.env=launchEnvironment;
        base.control(m,'stop');report.postgresStopped=!fs.existsSync(path.join(m.dataDirectory,'postmaster.pid'));
        fs.writeFileSync(path.join(dir,'operational-verification.json'),JSON.stringify(report,null,2));
        const {trace,...summary}=report;console.log(JSON.stringify(summary));
    }
}
if(require.main===module)main().catch(e=>{console.error('OPERATIONAL_LAB_FAILED '+(e.code||e.message));process.exitCode=1;});
