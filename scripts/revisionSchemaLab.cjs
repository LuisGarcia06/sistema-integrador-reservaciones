const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=require('./standaloneDev.cjs'),P=require('../backend/config/standalonePolicy'),RP=require('../backend/config/revisionLabPolicy');
async function probe(plan) {
    P.verifyLocalCluster(plan.manifest);
    const {Pool}=require('pg');
    const pool=new Pool({host:P.HOST,port:plan.manifest.pgPort,database:plan.config.DB_NAME,user:plan.config.DB_USER,password:plan.config.DB_PASSWORD,connectionTimeoutMillis:5000,query_timeout:5000});
    try{await RP.verify(pool,plan);}finally{await pool.end();}
}
async function main() {
    const [mode,dir,...extra]=process.argv.slice(2);
    if(!['Verify','Stop','RenewGeneration'].includes(mode)||!path.isAbsolute(dir||'')||extra.length)throw Error('REVISION_LAB_ARGUMENTS');
    const launch={...process.env};require('../backend/config/desktopPolicy').cleanEnvironment();
    if(mode==='Stop'){const plan=RP.readPlan(path.join(dir,'manifest.json'));base.control(plan.manifest,'stop');console.log('REVISION_LAB_STOPPED');return;}
    if(mode==='RenewGeneration'){const plan=RP.renewGeneration(path.join(dir,'manifest.json'));console.log('REVISION_GENERATION '+plan.manifest.dataGeneration);return;}
    const report={phase:'2C.2B.1',profile:RP.ENVIRONMENT,completed:false,syntheticOnly:true,loopbackOnly:true,noHttpServer:true,checks:[],failures:[]};
    let m,stopped=false;
    console.log('REVISION_LAB '+dir);
    try {
        m=await base.prepare(dir,{profile:RP.ENVIRONMENT,revisionAudit:async context=>{
            Object.assign(report,{database:context.plan.manifest.database,pgPort:context.plan.manifest.pgPort,unusedHttpPort:context.plan.manifest.httpPort,dataGeneration:context.plan.manifest.dataGeneration});
            // Además de la barrera del aprovisionador, prohibir UDP/fetch antes de importar servicios.
            P.blockNetwork(context.plan.manifest.pgPort);
            await require('./revisionSchemaCases.cjs').run({...context,report});
        }});
        assert.equal(report.operational?.checks.length,13,'MANDATORY_SCHEMA_AND_OPERATIONAL_CASES_MUST_RUN');
        assert.ok(report.checks.length>=30,'MANDATORY_SCHEMA_CASES_MUST_RUN');
        process.env=launch;
        P.blockNetwork(m.pgPort); // prepare ya retiró su barrera temporal de sockets.
        const filename=path.join(dir,'manifest.json'),before=RP.readPlan(filename);
        await assert.rejects(async()=>RP.renewGeneration(filename),e=>e.code==='REVISION_LAB_MUST_BE_STOPPED');
        report.checks.push('generation renewal rejected while PostgreSQL is running');
        base.control(m,'stop');stopped=true;RP.assertStopped(m);base.control(m,'start');stopped=false;
        const after=RP.readPlan(filename);assert.equal(after.manifest.dataGeneration,before.manifest.dataGeneration);await probe(after);
        report.checks.push('normal PostgreSQL restart preserves data generation and strict schema');
        base.control(m,'stop');stopped=true;
        const renewed=RP.renewGeneration(filename);assert.notEqual(renewed.manifest.dataGeneration,before.manifest.dataGeneration);assert.notEqual(renewed.digest,before.digest);
        assert.equal(renewed.manifest.configDigest,before.manifest.configDigest);report.dataGeneration=renewed.manifest.dataGeneration;
        report.checks.push('stopped lab generation renewal changes UUID without touching data or config');
        report.completed=true;
    } catch(error) {
        report.failures.push({code:error.code||error.name,message:error.message.slice(0,400),stack:error.stack?.split('\n').slice(1,5)});throw error;
    } finally {
        process.env=launch;
        if(m&&!stopped)base.control(m,'stop');
        report.postgresStopped=!fs.existsSync(path.join(dir,'data/postmaster.pid'));
        fs.writeFileSync(path.join(dir,'revision-verification.json'),JSON.stringify(report,null,2));
        const {operational,...summary}=report;console.log(JSON.stringify({...summary,operationalChecks:operational?.checks.length||0}));
    }
}
if(require.main===module)main().catch(e=>{console.error('REVISION_LAB_FAILED '+(e.code||e.message));process.exitCode=1;});
module.exports={probe};
