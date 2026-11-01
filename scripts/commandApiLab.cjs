const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),net=require('node:net'),assert=require('node:assert/strict');
const base=require('./standaloneDev.cjs'),P=require('../backend/config/commandApiPolicy'),S=require('../backend/config/standalonePolicy');
const {request}=require('./revisionApiLab.cjs');
async function main(){
    const [mode,dir,...extra]=process.argv.slice(2),launch={...process.env};
    if(!['Verify','Stop'].includes(mode)||!path.isAbsolute(dir||'')||extra.length)throw Error('COMMAND_API_ARGUMENTS');
    require('../backend/config/desktopPolicy').cleanEnvironment();
    if(mode==='Stop'){base.control(P.readPlan(path.join(dir,'manifest.json')).manifest,'stop');return;}
    let m,child,observer;
    const report={phase:'2C.3B',completed:false,loopbackOnly:true,syntheticOnly:true,singleTransaction:true,physicalTwoComputerTest:false,automaticWriteRetries:false,checks:[],failures:[],transactionProofs:[]};
    console.log('COMMAND_API_LAB '+dir);
    async function stop(){if(child&&child.exitCode===null){const ended=require('node:events').once(child,'exit');child.kill();await ended;}child=null;}
    try{
        m=await base.prepare(dir,{profile:P.ENVIRONMENT,revisionAudit:require('./revisionApiFixtures.cjs').seed});
        const plan=P.readPlan(path.join(dir,'manifest.json'));S.verifyLocalCluster(m);
        const connect=net.Socket.prototype.connect;
        net.Socket.prototype.connect=function(...args){const values=Array.isArray(args[0])?args[0]:args,v=values[0],h=typeof v==='object'?v.host:values[1],p=typeof v==='object'?v.port:v;if(h!=='127.0.0.1'||![m.pgPort,m.httpPort].includes(Number(p)))throw Error('COMMAND_TEST_NETWORK_BLOCKED');return connect.apply(this,args);};
        require('node:dgram').createSocket=()=>{throw Error('COMMAND_TEST_NETWORK_BLOCKED');};global.fetch=()=>{throw Error('COMMAND_TEST_NETWORK_BLOCKED');};
        const {Client}=require('pg');observer=new Client({host:'127.0.0.1',port:m.pgPort,database:m.database,user:plan.config.DB_USER,password:plan.config.DB_PASSWORD,connectionTimeoutMillis:5000,query_timeout:5000});await observer.connect();
        await P.verify({connect:async()=>({query:observer.query.bind(observer),release(){}})},plan);
        Object.assign(report,{database:m.database,pgPort:m.pgPort,httpPort:m.httpPort,dataGeneration:m.dataGeneration,profile:m.environment});
        const env=require('../backend/config/desktopPolicy').cleanEnvironment();delete env.ELECTRON_RUN_AS_NODE;
        async function start(probe){
            const entry=path.join(__dirname,probe?'commandApiServerProbe.cjs':'../backend/commandApi.js');
            child=cp.spawn(process.execPath,probe?[entry,plan.filename]:[entry,'--manifest',plan.filename],{env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
            child.on('message',message=>{if(message.type==='transaction-proof')report.transactionProofs.push(message);});
            let out='',err='';child.stderr.on('data',v=>err+=v);
            await new Promise((yes,no)=>{const timer=setTimeout(()=>no(Error('COMMAND_START_TIMEOUT '+err.slice(-500))),45000);child.once('error',no);child.once('exit',()=>{clearTimeout(timer);no(Error('COMMAND_EARLY_EXIT '+err.slice(-1200)));});child.stdout.on('data',v=>{out+=v;if(out.includes(probe?'COMMAND_API_PROBE_READY':'COMMAND_API_READY')){clearTimeout(timer);yes();}});});
        }
        await start(true);report.checks.push('Entrypoint verifica manifiesto, dos claves privadas, identidad, esquema 020, ACL y durabilidad antes de escuchar');
        const fixtures=JSON.parse(fs.readFileSync(path.join(dir,'api-fixtures.json'))),credentials=JSON.parse(fs.readFileSync(path.join(dir,'test-user.json')));
        const ask=(...args)=>request(m.httpPort,...args);
        const discard=(method,url,body,token,headers)=>new Promise((yes,no)=>{
            const data=JSON.stringify(body),q=require('node:http').request({host:'127.0.0.1',port:m.httpPort,method,path:url,agent:false,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data),Authorization:'Bearer '+token,...headers}},res=>{res.destroy();yes();});q.once('error',no);q.end(data);
        });
        const restart=await require('./commandApiCases.cjs').run({request:ask,discard,observer,fixtures,credentials,report});
        assert.equal(report.writerCoverage.length,25);assert.ok(report.writerCoverage.every(r=>r.confirmed&&r.replayed&&r.missingKey===400&&r.missingPreconditions===428));
        const proof=report.transactionProofs.find(p=>p.key===report.concurrentKey);assert.ok(proof);assert.equal(proof.audits.length,1);
        for(const point of [proof.business,...proof.audits,proof.command]){assert.equal(point.transaction,proof.command.transaction);assert.equal(point.pid,proof.command.pid);}
        report.checks.push('SQL real del probe verifica mismo pg_backend_pid y transacción principal en negocio, auditoría y registro de comando');
        await stop();await assert.rejects(ask('GET',restart.url,undefined,restart.token));
        await start(false);
        const recovered=await ask('GET','/api/comandos/'+restart.key,undefined,restart.token,restart.headers);
        assert.equal(recovered.status,200,JSON.stringify(recovered));assert.equal(recovered.body.comando.estado,'confirmado');
        const replay=await ask(restart.method,restart.url,restart.body,restart.token,restart.headers);
        assert.equal(replay.status,200,JSON.stringify(replay));assert.equal(replay.headers['idempotency-replayed'],'true');assert.deepEqual(replay.body,restart.receipt);
        const count=(await observer.query('SELECT count(*)::int n FROM bitacora WHERE id_reservacion=$1',[restart.reservation])).rows[0].n;assert.equal(count,restart.auditCount);
        report.checks.push('Reinicio de entrada normal conserva generación, claves, resultado durable y replay sin nueva auditoría');
        report.completed=true;
    }catch(e){report.failures.push({message:e.message,stack:e.stack?.split('\n').slice(1,5)});throw e;}
    finally{
        await stop();await observer?.end().catch(()=>{});process.env=launch;if(m)base.control(m,'stop');
        report.postgresStopped=!fs.existsSync(path.join(dir,'data/postmaster.pid'));
        fs.writeFileSync(path.join(dir,'command-api-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
    }
}
if(require.main===module)main().catch(e=>{console.error('COMMAND_API_LAB_FAILED '+(e.code||e.message));process.exitCode=1;});
