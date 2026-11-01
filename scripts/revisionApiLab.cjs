const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),http=require('node:http'),net=require('node:net'),assert=require('node:assert/strict');
const base=require('./standaloneDev.cjs'),P=require('../backend/config/revisionApiPolicy'),S=require('../backend/config/standalonePolicy');
function request(port,method,url,body,token,headers={}){
    return new Promise((yes,no)=>{
        const data=body===undefined?null:JSON.stringify(body),all={...(data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{}),...(token?{Authorization:'Bearer '+token}:{}),...headers};
        for(const k of Object.keys(all))if(all[k]===undefined)delete all[k];
        const q=http.request({host:'127.0.0.1',port,path:url,method,headers:all,agent:false,timeout:12000},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>{let value;try{value=JSON.parse(text);}catch{value=text;}yes({status:res.statusCode,body:value,headers:res.headers});});});q.once('error',no);q.once('timeout',()=>q.destroy(Error('HTTP_TEST_TIMEOUT')));q.end(data);
    });
}
async function main(){
    const [mode,dir,...extra]=process.argv.slice(2),launch={...process.env};
    if(!['Verify','Stop'].includes(mode)||!path.isAbsolute(dir||'')||extra.length)throw Error('REVISION_API_ARGUMENTS');
    require('../backend/config/desktopPolicy').cleanEnvironment();
    if(mode==='Stop'){const plan=P.readPlan(path.join(dir,'manifest.json'));base.control(plan.manifest,'stop');return;}
    let m,child,observer;const report={phase:'2C.2B.2',completed:false,loopbackOnly:true,syntheticOnly:true,checks:[],failures:[],httpWritesRetriedAutomatically:false};
    console.log('REVISION_API_LAB '+dir);
    try{
        m=await base.prepare(dir,{profile:P.ENVIRONMENT,revisionAudit:require('./revisionApiFixtures.cjs').seed});
        const plan=P.readPlan(path.join(dir,'manifest.json'));S.verifyLocalCluster(m);
        const connect=net.Socket.prototype.connect;
        net.Socket.prototype.connect=function(...args){const values=Array.isArray(args[0])?args[0]:args,v=values[0],h=typeof v==='object'?v.host:values[1],p=typeof v==='object'?v.port:v;if(h!=='127.0.0.1'||![m.pgPort,m.httpPort].includes(Number(p)))throw Error('API_TEST_NETWORK_BLOCKED');return connect.apply(this,args);};
        require('node:dgram').createSocket=()=>{throw Error('API_TEST_NETWORK_BLOCKED');};global.fetch=async()=>{throw Error('API_TEST_NETWORK_BLOCKED');};
        const {Client}=require('pg');observer=new Client({host:'127.0.0.1',port:m.pgPort,database:m.database,user:plan.config.DB_USER,password:plan.config.DB_PASSWORD,connectionTimeoutMillis:5000,query_timeout:5000});await observer.connect();
        await P.verify({connect:async()=>({query:observer.query.bind(observer),release(){}})},plan);
        Object.assign(report,{database:m.database,pgPort:m.pgPort,httpPort:m.httpPort,dataGeneration:m.dataGeneration,profile:m.environment});
        const env=require('../backend/config/desktopPolicy').cleanEnvironment();delete env.ELECTRON_RUN_AS_NODE;
        child=cp.spawn(process.execPath,[path.join(__dirname,'revisionApiServerProbe.cjs'),plan.filename],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
        let out='',err='';child.stderr.on('data',v=>err+=v);
        await new Promise((yes,no)=>{const timer=setTimeout(()=>no(Error('API_START_TIMEOUT '+err.slice(-700))),45000);child.once('exit',()=>{clearTimeout(timer);no(Error('API_EARLY_EXIT '+err.slice(-700)));});child.stdout.on('data',v=>{out+=v;if(out.includes('REVISION_API_PROBE_READY')){clearTimeout(timer);yes();}});});
        report.checks.push('new loopback entry validates manifest, private key, PostgreSQL identity, schema and privileges before listening');
        const fixtures=JSON.parse(fs.readFileSync(path.join(dir,'api-fixtures.json'))),credentials=JSON.parse(fs.readFileSync(path.join(dir,'test-user.json')));
        const discard=(method,url,body,token,headers)=>new Promise((yes,no)=>{
            const data=JSON.stringify(body),q=http.request({host:'127.0.0.1',port:m.httpPort,method,path:url,agent:false,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data),Authorization:'Bearer '+token,...headers}},res=>{res.destroy();yes({responseDiscarded:true});});q.once('error',no);q.end(data);
        });
        await require('./revisionApiCases.cjs').run({request:(...args)=>request(m.httpPort,...args),discard,observer,fixtures,credentials,report});
        assert.ok(report.checks.length>=25,'MANDATORY_API_CASES_MUST_RUN');assert.equal(report.writerCoverage?.length,25,'ALL_WRITERS_MUST_BE_TESTED');
        const login=await request(m.httpPort,'POST','/api/auth/login',credentials),token=login.body.token,url='/api/reservaciones/'+fixtures.records[0].reservaciones;
        const before=await request(m.httpPort,'GET',url,undefined,token),body={habitacion:before.body.datos.habitacion};
        const pre=await request(m.httpPort,'POST','/api/precondiciones',{metodo:'PATCH',ruta:url,datos:body},token,{'X-CTSK-Protocol':P.PROTOCOL});assert.equal(pre.status,200);
        const exited=require('node:events').once(child,'exit');child.kill();await exited;child=null;
        await assert.rejects(request(m.httpPort,'GET',url,undefined,token));
        child=cp.spawn(process.execPath,[path.join(__dirname,'../backend/revisionApi.js'),'--manifest',plan.filename],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
        let readyText='',restartError='';child.stderr.on('data',v=>restartError+=v);
        await new Promise((yes,no)=>{const timer=setTimeout(()=>no(Error('NORMAL_ENTRY_TIMEOUT '+restartError.slice(-500))),45000);child.once('exit',()=>{clearTimeout(timer);no(Error('NORMAL_ENTRY_EXIT '+restartError.slice(-500)));});child.stdout.on('data',v=>{readyText+=v;if(readyText.includes('REVISION_API_READY')){clearTimeout(timer);yes();}});});
        const after=await request(m.httpPort,'GET',url,undefined,token);assert.equal(after.status,200);assert.equal(after.headers.etag,before.headers.etag);
        assert.equal((await request(m.httpPort,'PATCH',url,body,token,{'X-CTSK-Protocol':P.PROTOCOL,'If-Match':pre.body.etag,'If-Operational-Match':pre.body.contexto})).status,200);
        report.checks.push('normal CLI entry restarts independently; generation, key, JWT, strong ETag and unchanged no-op preconditions persist');
        report.completed=true;
    }catch(e){report.failures.push({code:e.code||e.name,message:e.message.slice(0,900),stack:e.stack?.split('\n').slice(1,5)});throw e;}
    finally{
        if(child&&child.exitCode===null){const ended=require('node:events').once(child,'exit');child.kill();await ended;}
        await observer?.end().catch(()=>{});process.env=launch;if(m)base.control(m,'stop');
        report.postgresStopped=!fs.existsSync(path.join(dir,'data/postmaster.pid'));
        fs.writeFileSync(path.join(dir,'revision-api-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
    }
}
if(require.main===module)main().catch(e=>{console.error('REVISION_API_LAB_FAILED '+(e.code||e.message));process.exitCode=1;});
module.exports={request};
