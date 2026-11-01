const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),net=require('node:net'),assert=require('node:assert/strict');
const base=require('./standaloneDev.cjs'),P=require('../backend/config/commandApiPolicy');
async function main(){
  const [mode,dir,...extra]=process.argv.slice(2),launch={...process.env};
  if(!['Verify','Stop'].includes(mode)||!path.isAbsolute(dir||'')||extra.length)throw Error('TRANSPORT_FRONTEND_ARGUMENTS');
  require('../backend/config/desktopPolicy').cleanEnvironment();
  if(mode==='Stop'){base.control(P.readPlan(path.join(dir,'manifest.json')).manifest,'stop');return;}
  let m,api,driver,db,ui,locked=false;
  const report={phase:'2D.5',completed:false,syntheticOnly:true,loopbackOnly:true,physicalLanTest:false,checks:[],failures:[],proofs:[],transactions:[]};
  console.log('TRANSPORT_FRONTEND_LAB '+dir);
  async function stopApi(){if(api&&api.exitCode===null){const ended=require('node:events').once(api,'exit');api.kill();await ended;}api=null;}
  try{
    m=await base.prepare(dir,{profile:P.ENVIRONMENT,revisionAudit:require('./transportFrontendFixtures.cjs').seed});
    const plan=P.readPlan(path.join(dir,'manifest.json'));require('../backend/config/standalonePolicy').verifyLocalCluster(m);
    db=new(require('pg').Client)({host:'127.0.0.1',port:m.pgPort,database:m.database,user:plan.config.DB_USER,password:plan.config.DB_PASSWORD});await db.connect();
    await P.verify({connect:async()=>({query:db.query.bind(db),release(){}})},plan);
    const fixtures=JSON.parse(fs.readFileSync(path.join(dir,'api-fixtures.json'))),credentials=JSON.parse(fs.readFileSync(path.join(dir,'test-user.json')));
    const env=require('../backend/config/desktopPolicy').cleanEnvironment();delete env.ELECTRON_RUN_AS_NODE;
    async function startApi(){
      api=cp.spawn(process.execPath,[path.join(__dirname,'transportFrontendProbe.cjs'),plan.filename],{env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});let out='',err='';api.stderr.on('data',v=>err+=v);
      api.on('message',message=>{if(message.type==='transaction-proof')report.transactions.push(message);else if(message.type==='transport-fault-ready')driver?.send(message);});
      await new Promise((yes,no)=>{const timer=setTimeout(()=>no(Error('TRANSPORT_API_TIMEOUT '+err.slice(-500))),45000);api.once('error',no);api.once('exit',()=>{clearTimeout(timer);no(Error('TRANSPORT_API_EXIT '+err.slice(-500)));});api.stdout.on('data',v=>{out+=v;if(out.includes('COMMAND_API_READY')){clearTimeout(timer);yes();}});});
    }
    await startApi();ui=await require('./commandFrontendHost.cjs').start(plan,{scope:'transportes-integrados',onHeld:key=>driver?.send({type:'held',key})});
    const ports=[m.pgPort,m.httpPort,Number(new URL(ui.origin).port)],connect=net.Socket.prototype.connect;
    net.Socket.prototype.connect=function(...args){const a=Array.isArray(args[0])?args[0]:args,t=a[0],host=typeof t==='object'?t.host:a[1],port=typeof t==='object'?t.port:t;if(host!=='127.0.0.1'||!ports.includes(Number(port)))throw Error('TRANSPORT_NETWORK_BLOCKED');return connect.apply(this,args);};
    require('node:dgram').createSocket=()=>{throw Error('TRANSPORT_NETWORK_BLOCKED');};global.fetch=()=>{throw Error('TRANSPORT_NETWORK_BLOCKED');};
    Object.assign(report,{database:m.database,pgPort:m.pgPort,apiPort:m.httpPort,uiPort:ports[2],generation:m.dataGeneration});
    const consultaRole=(await db.query("SELECT id_rol FROM roles WHERE nombre='Consulta'")).rows[0].id_rol;
    driver=cp.spawn(require('electron'),[path.join(__dirname,'transportFrontendDriver.cjs')],{env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});let errors='';driver.stderr.on('data',v=>errors+=v);driver.stdout.on('data',v=>process.stdout.write(v));
    const request=(method,url,body,headers={})=>new Promise((resolve,reject)=>{const bytes=Buffer.from(JSON.stringify(body||{}));const q=require('node:http').request({host:'127.0.0.1',port:m.httpPort,path:url,method,headers:{'Content-Type':'application/json','Content-Length':bytes.length,...headers}},r=>{let data='';r.on('data',c=>data+=c);r.on('end',()=>r.statusCode===200?resolve(JSON.parse(data)):reject(Error('FIXTURE_CHANGE_'+r.statusCode+' '+data.slice(0,200))));});q.once('error',reject);q.end(bytes);});
    driver.on('message',async message=>{try{
      if(message.type==='ready')driver.send({type:'input',origin:ui.origin,credentials,fixtures,consultaRole,output:dir,generation:m.dataGeneration});
      if(message.type==='arm'){ui.arm(message.mode);driver.send({type:'armed'});}
      if(message.type==='release'){ui.release();driver.send({type:'released'});}
      if(message.type==='restart'){await ui.pause();try{await stopApi();ui.resetConnections();await startApi();}finally{ui.resume();}driver.send({type:'restarted'});report.backendRestarted=true;}
      if(message.type==='transport-fault')api.send(message);
      if(message.type==='lock'){await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock($1::int,$2::int)',require('../backend/config/operationalTransactions').KEY);locked=true;driver.send({type:'locked'});}
      if(message.type==='unlock'){await db.query('ROLLBACK');locked=false;driver.send({type:'unlocked'});}
      if(message.type==='fixture-change'){
        assert.ok(/^\/api\/(reservaciones|transportes|operaciones|vehiculos|operadores|usuarios)\/[1-9][0-9]*$/.test(message.url));
        const login=await request('POST','/api/auth/login',credentials),headers={Authorization:'Bearer '+login.token,'X-CTSK-Protocol':P.PROTOCOL};
        const photo=await request('POST','/api/precondiciones',{metodo:'PATCH',ruta:message.url,datos:{}},headers);
        await request('PATCH',message.url,message.body,{...headers,'X-CTSK-Data-Generation':m.dataGeneration,'Idempotency-Key':require('node:crypto').randomUUID(),'If-Match':photo.etag,'If-Operational-Match':photo.contexto});driver.send({type:'fixture-changed'});
      }
      if(message.type==='state'){
        const hash=require('node:crypto').createHash('sha256');for(const table of require('../backend/config/desktopSchema').TABLES)hash.update((await db.query(`SELECT COALESCE(jsonb_agg(v ORDER BY v::text),'[]'::jsonb)::text value FROM (SELECT to_jsonb(t) v FROM public.${table} t) s`)).rows[0].value);driver.send({type:'state',hash:hash.digest('hex')});
      }
      if(message.type==='proof'){
        const operations=(await db.query('SELECT * FROM operaciones_tour WHERE fecha=$1 AND id_tour=$2 AND turno=$3 AND numero_grupo=$4',[message.date,message.tour,message.shift||'Mañana',message.group||1])).rows;
        const rows=(await db.query('SELECT estado,ids_bitacora,id_recurso FROM comandos_idempotentes WHERE clave=$1',[message.key])).rows;
        const transports=(await db.query('SELECT id_transporte_operacion,id_vehiculo,id_operador FROM transportes_operacion WHERE id_operacion_tour=ANY($1::int[])',[operations.map(op=>op.id_operacion_tour)])).rows;
        const writes=ui.calls.filter(c=>c.writing&&c.key===message.key),value={type:'proof',key:message.key,operations,commands:rows,transports,writes:writes.filter(c=>c.label!=='blocked-before-upstream').length,hashes:[...new Set(writes.map(c=>c.bodyHash).filter(Boolean))],auditCount:(await db.query('SELECT count(*)::int n FROM bitacora')).rows[0].n};report.proofs.push(value);driver.send(value);
      }
      if(message.type==='progress')report.checks.push(message.check);
    }catch(error){driver.send({type:'harness-error',message:error.message});}});
    await new Promise((yes,no)=>{const timer=setTimeout(()=>{driver.kill();no(Error('TRANSPORT_DRIVER_TIMEOUT'));},300000);driver.once('error',no);driver.once('exit',code=>{clearTimeout(timer);code===0?yes():no(Error('TRANSPORT_DRIVER_FAILED '+errors.slice(-2500)));});});
    assert.ok(ui.calls.filter(c=>c.writing).every(c=>(c.method==='POST'&&c.url==='/api/transportes'||c.method==='PATCH'&&/^\/api\/transportes\/[1-9][0-9]*$/.test(c.url))&&c.key&&(c.label==='blocked-before-upstream'||c.protocol===P.PROTOCOL&&c.generation===m.dataGeneration&&c.hasEtag&&c.hasContext)));
    assert.ok(ui.calls.filter(c=>c.writing&&c.method==='POST'&&c.status===200).every(c=>ui.calls.some(p=>p.creationPreview&&p.creationRoute==='/api/transportes'&&p.dataHash===c.bodyHash)));
    assert.ok(report.transactions.length>0&&report.transactions.every(p=>p.business.xid===p.command.xid&&p.business.pid===p.command.pid));report.completed=true;
  }catch(error){report.failures.push(error.message);throw error;}
  finally{
    ui?.release();if(driver&&driver.exitCode===null){const ended=require('node:events').once(driver,'exit');driver.kill();await ended;}await stopApi();report.calls=ui?.calls;if(ui)await ui.close();if(locked)await db?.query('ROLLBACK').catch(()=>{});await db?.end().catch(()=>{});process.env=launch;if(m)base.control(m,'stop');report.postgresStopped=!fs.existsSync(path.join(dir,'data/postmaster.pid'));fs.writeFileSync(path.join(dir,'transport-frontend-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }
}
if(require.main===module)main().catch(error=>{console.error('TRANSPORT_FRONTEND_FAILED '+error.message);process.exitCode=1;});
