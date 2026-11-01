const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),net=require('node:net'),assert=require('node:assert/strict');
const base=require('./standaloneDev.cjs'),P=require('../backend/config/commandApiPolicy');
async function main(){
  const [mode,dir,...extra]=process.argv.slice(2),launch={...process.env};
  if(!['Verify','Stop'].includes(mode)||!path.isAbsolute(dir||'')||extra.length)throw Error('RESERVATION_FRONTEND_ARGUMENTS');
  require('../backend/config/desktopPolicy').cleanEnvironment();
  if(mode==='Stop'){base.control(P.readPlan(path.join(dir,'manifest.json')).manifest,'stop');return;}
  let m,api,driver,observer,ui,locked=false;
  const report={phase:'2D.3',completed:false,syntheticOnly:true,loopbackOnly:true,physicalLanTest:false,connectionCloseRequired:false,checks:[],failures:[],proofs:[]};
  console.log('RESERVATION_FRONTEND_LAB '+dir);
  async function stopApi(){if(api&&api.exitCode===null){const ended=require('node:events').once(api,'exit');api.kill();await ended;}api=null;}
  try{
    m=await base.prepare(dir,{profile:P.ENVIRONMENT,revisionAudit:require('./reservationCreationFixtures.cjs').seed});
    const plan=P.readPlan(path.join(dir,'manifest.json'));require('../backend/config/standalonePolicy').verifyLocalCluster(m);
    const {Client}=require('pg');observer=new Client({host:'127.0.0.1',port:m.pgPort,database:m.database,user:plan.config.DB_USER,password:plan.config.DB_PASSWORD});await observer.connect();
    await P.verify({connect:async()=>({query:observer.query.bind(observer),release(){}})},plan);
    const fixtures=JSON.parse(fs.readFileSync(path.join(dir,'api-fixtures.json'))),credentials=JSON.parse(fs.readFileSync(path.join(dir,'test-user.json')));
    const env=require('../backend/config/desktopPolicy').cleanEnvironment();delete env.ELECTRON_RUN_AS_NODE;
    async function startApi(){
      api=cp.spawn(process.execPath,[path.join(__dirname,'reservationCreationProbe.cjs'),plan.filename],{env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
      api.on('message',message=>{if(['creation-fault-ready','creation-fault-status'].includes(message.type))driver?.send(message);});
      let out='',err='';api.stderr.on('data',v=>err+=v);
      await new Promise((yes,no)=>{const timer=setTimeout(()=>no(Error('COMMAND_UI_API_TIMEOUT '+err.slice(-500))),45000);api.once('error',no);api.once('exit',()=>{clearTimeout(timer);no(Error('COMMAND_UI_API_EXIT '+err.slice(-500)));});api.stdout.on('data',v=>{out+=v;if(out.includes('COMMAND_API_READY')){clearTimeout(timer);yes();}});});
    }
    await startApi();
    ui=await require('./commandFrontendHost.cjs').start(plan,{scope:'reservaciones-integradas',onHeld:key=>driver?.send({type:'held',key})});
    const allowed=[m.pgPort,m.httpPort,Number(new URL(ui.origin).port)],connect=net.Socket.prototype.connect;
    net.Socket.prototype.connect=function(...args){const a=Array.isArray(args[0])?args[0]:args,t=a[0],h=typeof t==='object'?t.host:a[1],p=typeof t==='object'?t.port:t;if(h!=='127.0.0.1'||!allowed.includes(Number(p)))throw Error('COMMAND_UI_NETWORK_BLOCKED');return connect.apply(this,args);};
    require('node:dgram').createSocket=()=>{throw Error('COMMAND_UI_NETWORK_BLOCKED');};global.fetch=()=>{throw Error('COMMAND_UI_NETWORK_BLOCKED');};
    const extraIds={};for(const [name,sql]of Object.entries({guia:'SELECT id_guia id FROM guias LIMIT 1',operador:'SELECT id_operador id FROM operadores LIMIT 1',usuario:"SELECT id_usuario id FROM usuarios WHERE correo='segundo@standalone.example.test'",consultaRole:"SELECT id_rol id FROM roles WHERE nombre='Consulta'"}))extraIds[name]=(await observer.query(sql)).rows[0].id;
    Object.assign(report,{database:m.database,pgPort:m.pgPort,apiPort:m.httpPort,uiPort:Number(new URL(ui.origin).port),generation:m.dataGeneration,profile:m.environment});
    driver=cp.spawn(require('electron'),[path.join(__dirname,'reservationFrontendDriver.cjs')],{env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
    let err='';driver.stderr.on('data',v=>err+=v);driver.stdout.on('data',v=>process.stdout.write(v));
    driver.on('message',async msg=>{
      try{
        if(msg.type==='ready')driver.send({type:'input',origin:ui.origin,credentials,fixtures,extraIds,output:dir,generation:m.dataGeneration});
        if(msg.type==='creation-fault'||msg.type==='creation-fault-status')api.send(msg);
        if(msg.type==='arm'){ui.arm(msg.mode);driver.send({type:'armed'});}
        if(msg.type==='recovery-error'){ui.recoveryError();driver.send({type:'recovery-error-ready'});}
        if(msg.type==='release'){ui.release();driver.send({type:'released'});}
        if(msg.type==='restart'){await ui.pause();try{await stopApi();ui.resetConnections();await startApi();}finally{ui.resume();}driver.send({type:'restarted'});report.backendRestarted=true;}
        if(msg.type==='lock'){await observer.query('BEGIN');await observer.query('SELECT pg_advisory_xact_lock($1::int,$2::int)',require('../backend/config/operationalTransactions').KEY);locked=true;driver.send({type:'locked'});}
        if(msg.type==='unlock'){await observer.query('ROLLBACK');locked=false;driver.send({type:'unlocked'});}
        if(msg.type==='fixture-change'){
          const request=(method,url,body,headers={})=>new Promise((resolve,reject)=>{
            const bytes=Buffer.from(JSON.stringify(body||{}));
            const q=require('node:http').request({host:'127.0.0.1',port:m.httpPort,path:url,method,headers:{'Content-Type':'application/json','Content-Length':bytes.length,...headers}},r=>{
              let data='';r.on('data',c=>data+=c);r.on('end',()=>r.statusCode===200?resolve(JSON.parse(data)):reject(Error('FIXTURE_CHANGE_'+r.statusCode+' '+data.slice(0,300))));
            });q.once('error',reject);q.end(bytes);
          });
          assert.ok(/^\/api\/(vehiculos|usuarios)\/[1-9][0-9]*$/.test(msg.url));
          const admin=await request('POST','/api/auth/login',credentials);
          const headers={Authorization:'Bearer '+admin.token,'X-CTSK-Protocol':P.PROTOCOL};
          const photo=await request('POST','/api/precondiciones',{metodo:'PATCH',ruta:msg.url,datos:{}},headers);
          await request('PATCH',msg.url,msg.body,{...headers,'X-CTSK-Data-Generation':m.dataGeneration,'Idempotency-Key':require('node:crypto').randomUUID(),'If-Match':photo.etag,'If-Operational-Match':photo.contexto});
          driver.send({type:'fixture-changed'});
        }
        if(msg.type==='creation-counts'){
          const rows=(await observer.query('SELECT id_reservacion,codigo,id_plataforma FROM reservaciones WHERE nombre_cliente=$1 ORDER BY id_reservacion',[msg.name])).rows;
          const ledger=(await observer.query('SELECT count(*)::int n FROM comandos_idempotentes WHERE clave=$1',[msg.key])).rows[0].n;
          const audits=(await observer.query('SELECT b.id_usuario,b.id_reservacion,b.descripcion FROM bitacora b JOIN reservaciones r USING(id_reservacion) WHERE r.nombre_cliente=$1 ORDER BY b.id_bitacora',[msg.name])).rows;
          const writes=ui.calls.filter(c=>c.writing&&c.key===msg.key),previews=ui.calls.filter(c=>c.creationPreview).map(c=>c.dataHash);
          const value={type:'creation-counts',key:msg.key,name:msg.name,rows,commands:ledger,audits,requests:writes.length,upstreamWrites:writes.filter(c=>c.label!=='blocked-before-upstream').length,bodyHashes:[...new Set(writes.map(c=>c.bodyHash).filter(Boolean))],bodyHadMatchingPreview:writes.every(c=>!c.bodyHash||previews.includes(c.bodyHash))};
          report.creationProofs=report.creationProofs||[];report.creationProofs.push(value);driver.send(value);
        }
        if(msg.type==='business-state'){

          const hash=require('node:crypto').createHash('sha256');
          for(const table of require('../backend/config/desktopSchema').TABLES)hash.update((await observer.query(`SELECT COALESCE(jsonb_agg(v ORDER BY v::text),'[]'::jsonb)::text value FROM (SELECT to_jsonb(t) v FROM public.${table} t) s`)).rows[0].value);
          const state=hash.digest('hex');driver.send({type:'business-state',state});
        }
        if(msg.type==='counts'){

          const audit=(await observer.query('SELECT count(*)::int n FROM bitacora WHERE id_reservacion=$1',[msg.id])).rows[0].n;
          const commands=(await observer.query('SELECT count(*)::int n FROM comandos_idempotentes WHERE clave=$1',[msg.key])).rows[0].n;
          const writes=ui.calls.filter(c=>c.writing&&c.key===msg.key),value={type:'counts',id:msg.id,key:msg.key,audit,commands,upstreamWrites:writes.filter(c=>c.label!=='blocked-before-upstream').length,requests:writes.length,bodyHashes:[...new Set(writes.map(c=>c.bodyHash).filter(Boolean))],replayed:writes.filter(c=>c.replayed).length,transportPax:(await observer.query("SELECT COALESCE(sum(CASE WHEN estado='Cancelada' THEN 0 ELSE pax END),0)::int n FROM reservaciones WHERE id_transporte_operacion=(SELECT id_transporte_operacion FROM reservaciones WHERE id_reservacion=$1)",[msg.id])).rows[0].n,auditRows:(await observer.query('SELECT id_usuario,accion,descripcion FROM bitacora WHERE id_reservacion=$1 ORDER BY id_bitacora',[msg.id])).rows};
          report.proofs.push(value);driver.send(value);
        }
        if(msg.type==='action-proof'){report.actionProofs=report.actionProofs||[];report.actionProofs.push(msg.proof);}
        if(msg.type==='checks')report.checks=msg.checks;
        if(msg.type==='progress')report.checks.push(msg.check);
      }catch(e){driver.send({type:'harness-error',message:e.message});}
    });
    await new Promise((yes,no)=>{const timer=setTimeout(()=>{driver.kill();no(Error('COMMAND_UI_DRIVER_TIMEOUT'));},360000);driver.once('error',no);driver.once('exit',code=>{clearTimeout(timer);code===0?yes():no(Error('COMMAND_UI_DRIVER_FAILED '+err.slice(-1800)));});});
    const calls=ui.calls;
    assert.ok(calls.some((c,i)=>c.clientPort&&calls.slice(0,i).some(p=>p.clientPort===c.clientPort)),'REAL_BROWSER_KEEP_ALIVE_MUST_BE_EXERCISED');
    report.httpKeepAliveExercised=true;
    report.coverage={adapted:['POST /api/reservaciones','PATCH /api/reservaciones/:id','PATCH /api/reservaciones/:id/cancelar','PATCH /api/reservaciones/:id/transporte'],blocked:['otros módulos','otras altas y password']};assert.ok(calls.filter(c=>c.writing).every(c=>(c.method==='POST'&&c.url==='/api/reservaciones'||c.method==='PATCH'&&/^\/api\/reservaciones\/[1-9][0-9]*(?:\/(?:cancelar|transporte))?$/.test(c.url))&&c.key&&(c.label==='blocked-before-upstream'||c.protocol===P.PROTOCOL&&c.generation===m.dataGeneration&&c.hasEtag&&c.hasContext)));assert.ok(calls.filter(c=>c.writing&&c.method==='POST'&&c.status===200).every(c=>calls.some(p=>p.creationPreview&&p.dataHash===c.bodyHash)));report.completed=true;
  }catch(e){report.failures.push(e.message);throw e;}
  finally{
    ui?.release();if(driver&&driver.exitCode===null){const ended=require('node:events').once(driver,'exit');driver.kill();await ended;}await stopApi();
    report.calls=ui?.calls;if(ui)await ui.close();if(locked)await observer?.query('ROLLBACK').catch(()=>{});await observer?.end().catch(()=>{});process.env=launch;if(m)base.control(m,'stop');
    report.postgresStopped=!fs.existsSync(path.join(dir,'data/postmaster.pid'));
    fs.writeFileSync(path.join(dir,'reservation-frontend-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }
}
if(require.main===module)main().catch(e=>{console.error('RESERVATION_FRONTEND_FAILED '+e.message);process.exitCode=1;});
