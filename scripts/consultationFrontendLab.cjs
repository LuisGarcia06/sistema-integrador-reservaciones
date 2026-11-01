const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),net=require('node:net'),assert=require('node:assert/strict');
const base=require('./standaloneDev.cjs'),P=require('../backend/config/commandApiPolicy');
async function main(){
  const [mode,dir,...extra]=process.argv.slice(2),launch={...process.env};if(!['Verify','Stop'].includes(mode)||!path.isAbsolute(dir||'')||extra.length)throw Error('CONSULTATION_ARGUMENTS');
  require('../backend/config/desktopPolicy').cleanEnvironment();if(mode==='Stop'){base.control(P.readPlan(path.join(dir,'manifest.json')).manifest,'stop');return;}
  let m,api,driver,db,ui;const report={phase:'2D.7',completed:false,syntheticOnly:true,loopbackOnly:true,checks:[],failures:[],mutations:[],proofs:[]};console.log('CONSULTATION_FRONTEND_LAB '+dir);
  try{
    m=await base.prepare(dir,{profile:P.ENVIRONMENT,revisionAudit:require('./consultationFrontendFixtures.cjs').seed});const plan=P.readPlan(path.join(dir,'manifest.json'));require('../backend/config/standalonePolicy').verifyLocalCluster(m);
    db=new(require('pg').Client)({host:'127.0.0.1',port:m.pgPort,database:m.database,user:plan.config.DB_USER,password:plan.config.DB_PASSWORD});await db.connect();await P.verify({connect:async()=>({query:db.query.bind(db),release(){}})},plan);
    const fixtures=JSON.parse(fs.readFileSync(path.join(dir,'api-fixtures.json'))),credentials=JSON.parse(fs.readFileSync(path.join(dir,'test-user.json'))),env=require('../backend/config/desktopPolicy').cleanEnvironment();delete env.ELECTRON_RUN_AS_NODE;
    api=cp.spawn(process.execPath,[path.join(__dirname,'consultationFrontendApi.cjs'),plan.filename],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',apiError='';api.stderr.on('data',v=>apiError+=v);
    await new Promise((yes,no)=>{const timer=setTimeout(()=>no(Error('CONSULTATION_API_TIMEOUT')),45000);api.once('error',no);api.once('exit',()=>{clearTimeout(timer);no(Error('CONSULTATION_API_EXIT '+apiError.slice(-500)));});api.stdout.on('data',v=>{out+=v;if(out.includes('COMMAND_API_READY')){clearTimeout(timer);yes();}});});
    ui=await require('./commandFrontendHost.cjs').start(plan,{scope:'consultas-integradas',onReadHeld:value=>driver?.send({type:'read-held',...value})});
    const ports=[m.pgPort,m.httpPort,Number(new URL(ui.origin).port)],connect=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...args){const a=Array.isArray(args[0])?args[0]:args,t=a[0],host=typeof t==='object'?t.host:a[1],port=typeof t==='object'?t.port:t;if(host!=='127.0.0.1'||!ports.includes(Number(port)))throw Error('CONSULTATION_NETWORK_BLOCKED');return connect.apply(this,args);};require('node:dgram').createSocket=()=>{throw Error('CONSULTATION_NETWORK_BLOCKED');};global.fetch=()=>{throw Error('CONSULTATION_NETWORK_BLOCKED');};
    Object.assign(report,{database:m.database,pgPort:m.pgPort,apiPort:m.httpPort,uiPort:ports[2],generation:m.dataGeneration});
    const request=(method,url,body,headers={})=>new Promise((resolve,reject)=>{const bytes=Buffer.from(JSON.stringify(body||{})),q=require('node:http').request({host:'127.0.0.1',port:m.httpPort,path:url,method,headers:{'Content-Type':'application/json','Content-Length':bytes.length,...headers}},r=>{let data='';r.on('data',c=>data+=c);r.on('end',()=>r.statusCode===200?resolve(JSON.parse(data)):reject(Error('CONSULTATION_NATIVE_'+r.statusCode+' '+data.slice(0,200))));});q.on('error',reject);q.end(bytes);});
    async function mutate(method,url,body){
      assert.ok(method==='PATCH'&&/^\/api\/(reservaciones\/[1-9][0-9]*(?:\/cancelar)?|operaciones\/[1-9][0-9]*|transportes\/[1-9][0-9]*|usuarios\/[1-9][0-9]*)$/.test(url)||method==='PUT'&&/^\/api\/daily\/observaciones\?fecha=\d{4}-\d\d-\d\d$/.test(url));
      const login=await request('POST','/api/auth/login',credentials),headers={Authorization:'Bearer '+login.token,'X-CTSK-Protocol':P.PROTOCOL},photo=await request('POST','/api/precondiciones',{metodo:method,ruta:url,datos:{}},headers),key=require('node:crypto').randomUUID();
      const receipt=await request(method,url,body,{...headers,'X-CTSK-Data-Generation':m.dataGeneration,'Idempotency-Key':key,'If-Match':photo.etag,'If-Operational-Match':photo.contexto});report.mutations.push({method,url,key,receipt});return receipt;
    }
    await mutate('PATCH','/api/reservaciones/'+fixtures.consultations.past[0],{habitacion:'AUDITADA',observaciones:'Modificación real sintética'});
    await mutate('PATCH','/api/reservaciones/'+fixtures.consultations.past[1]+'/cancelar',{motivo_cancelacion:'Cancelación sintética 2D.7'});
    const consultaRole=(await db.query("SELECT id_rol FROM roles WHERE nombre='Consulta'")).rows[0].id_rol;
    driver=cp.spawn(require('electron'),[path.join(__dirname,'consultationFrontendDriver.cjs')],{env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});let errors='';driver.stderr.on('data',v=>errors+=v);driver.stdout.on('data',v=>process.stdout.write(v));
    driver.on('message',async message=>{try{
      if(message.type==='ready')driver.send({type:'input',origin:ui.origin,credentials,fixtures,consultaRole,output:dir,generation:m.dataGeneration});
      if(message.type==='hold-read')driver.send({type:'read-armed',id:ui.holdRead(message.url)});
      if(message.type==='release-read'){ui.releaseRead(message.id);driver.send({type:'read-released'});}
      if(message.type==='mutate')driver.send({type:'mutated',receipt:await mutate(message.method,message.url,message.body)});
      if(message.type==='state'){
        const hash=require('node:crypto').createHash('sha256');for(const table of require('../backend/config/desktopSchema').TABLES)hash.update((await db.query(`SELECT COALESCE(jsonb_agg(v ORDER BY v::text),'[]'::jsonb)::text value FROM (SELECT to_jsonb(t) v FROM public.${table} t) s`)).rows[0].value);
        driver.send({type:'state',hash:hash.digest('hex'),audits:(await db.query('SELECT count(*)::int n FROM bitacora')).rows[0].n,commands:(await db.query('SELECT count(*)::int n FROM comandos_idempotentes')).rows[0].n});
      }
      if(message.type==='proof'){const value={type:'proof',audits:(await db.query('SELECT b.*,u.correo FROM bitacora b JOIN usuarios u USING(id_usuario) ORDER BY id_bitacora')).rows,commands:(await db.query('SELECT clave,recurso,estado,ids_bitacora FROM comandos_idempotentes ORDER BY clave')).rows};report.proofs.push(value);driver.send(value);}
      if(message.type==='progress')report.checks.push(message.check);
    }catch(error){driver.send({type:'harness-error',message:error.message});}});
    await new Promise((yes,no)=>{const timer=setTimeout(()=>{driver.kill();no(Error('CONSULTATION_DRIVER_TIMEOUT'));},300000);driver.once('error',no);driver.once('exit',code=>{clearTimeout(timer);code===0?yes():no(Error('CONSULTATION_DRIVER_FAILED '+errors.slice(-2500)));});});
    assert.equal(ui.calls.filter(c=>c.writing).length,0);report.completed=true;
  }catch(error){report.failures.push(error.message);throw error;}
  finally{ui?.release();if(driver&&driver.exitCode===null){const done=require('node:events').once(driver,'exit');driver.kill();await done;}if(api&&api.exitCode===null){const done=require('node:events').once(api,'exit');api.kill();await done;}report.calls=ui?.calls;if(ui)await ui.close();await db?.end().catch(()=>{});process.env=launch;if(m)base.control(m,'stop');report.postgresStopped=!fs.existsSync(path.join(dir,'data/postmaster.pid'));fs.writeFileSync(path.join(dir,'consultation-frontend-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
}
if(require.main===module)main().catch(error=>{console.error('CONSULTATION_FRONTEND_FAILED '+error.message);process.exitCode=1;});
