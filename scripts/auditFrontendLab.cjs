'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const base=require('./standaloneDev.cjs'),B=require('../backend/config/standalonePolicy'),P=require('../backend/config/auditApiPolicy');
async function main(){
  const originalConnect=require('node:net').Socket.prototype.connect;
  const [mode,dir,...extra]=process.argv.slice(2),launch={...process.env};
  if(!['Verify','Stop'].includes(mode)||!path.isAbsolute(dir||'')||extra.length)throw Error('AUDIT_FRONTEND_ARGUMENTS');
  if(mode==='Stop'){base.control(P.readPlan(path.join(dir,'manifest.json')).manifest,'stop');return;}
  const report={phase:'2D.8B.3',completed:false,syntheticOnly:true,loopbackOnly:true,automaticRetries:false,checks:[],failures:[],events:[],proofs:[]};
  let m,api,driver,db,ui;const acks=new Map();let apiLog='';
  const stopChild=async child=>{if(child&&child.exitCode===null){const ended=require('node:events').once(child,'exit');child.kill();await ended;}};
  console.log('AUDIT_FRONTEND_LAB '+dir);
  try{
    await base.prepare(dir,{profile:'command-api-lab',revisionAudit:async input=>{
      m=input.plan.manifest;const admin=input.admin;
      await require('./dailyFrontendFixtures.cjs').seed(input);
      await admin.query("INSERT INTO usuarios(id_rol,nombre,correo,password,estado,alcance_plataformas) SELECT id_rol,'Consulta sin plataformas','empty@standalone.example.test',password,true,'selected' FROM usuarios WHERE correo='consulta@standalone.example.test'");
      const legacy=(await admin.query("INSERT INTO bitacora(id_usuario,id_reservacion,accion,descripcion,fecha) SELECT u.id_usuario,r.id_reservacion,'MODIFICAR','Historia sintetica <script> anterior a 021','2020-01-01T12:00:00Z' FROM usuarios u CROSS JOIN reservaciones r WHERE u.correo='administrador@standalone.example.test' ORDER BY r.id_reservacion LIMIT 1 RETURNING id_bitacora,id_reservacion")).rows[0];
      const sql=fs.readFileSync(path.join(m.root,require('../backend/config/auditSchemaContract').FILE),'utf8').replace(/\r\n/g,'\n');
      assert.equal(B.sha(sql),require('../backend/config/auditSchemaContract').MIGRATION_SHA);
      await admin.query('BEGIN');try{await admin.query('SET LOCAL ROLE ctsk_standalone_owner');await admin.query(sql);await admin.query('COMMIT');}catch(error){await admin.query('ROLLBACK');throw error;}
      const config={...input.plan.config,APP_ENVIRONMENT:P.ENVIRONMENT,DB_SCHEMA_VERSION:P.SCHEMA};
      m={...m,version:6,environment:P.ENVIRONMENT,purpose:P.PURPOSE,schemaVersion:P.SCHEMA,protocol:P.PROTOCOL,code:P.fingerprint(m.root)};
      const bytes=Object.entries(config).map(([k,v])=>k+'='+v).join('\n')+'\n';m.configDigest=B.sha(bytes);
      P.validateManifest(m,m.root);P.validateConfig(config,m);fs.writeFileSync(path.join(dir,'runtime.env'),bytes);fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(m,null,2));
      const plan=P.readPlan(path.join(dir,'manifest.json'));B.verifyLocalCluster(m);
      db=new(require('pg').Client)({host:'127.0.0.1',port:m.pgPort,database:m.database,user:config.DB_USER,password:config.DB_PASSWORD});await db.connect();
      db.on('error',error=>{apiLog+='\nOBSERVER: '+error.message;});
      await P.verify({connect:async()=>({query:db.query.bind(db),release(){}})},plan);
      const env=require('../backend/config/desktopPolicy').cleanEnvironment();delete env.ELECTRON_RUN_AS_NODE;
      async function startApi(){
        api=cp.spawn(process.execPath,[path.join(__dirname,'auditFrontendProbe.cjs'),plan.filename],{env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
        api.on('message',message=>{if(message.type==='armed'){acks.get(message.id)?.();acks.delete(message.id);}else report.events.push(message);});
        api.stderr.on('data',v=>apiLog+=v);
        await new Promise((yes,no)=>{let out='';const timer=setTimeout(()=>no(Error('AUDIT_FRONTEND_API_TIMEOUT '+apiLog.slice(-500))),45000);api.once('error',no);api.once('exit',()=>{clearTimeout(timer);no(Error('AUDIT_FRONTEND_API_EXIT '+apiLog.slice(-500)));});api.stdout.on('data',v=>{out+=v;if(out.includes('AUDIT_API_PROBE_READY')){clearTimeout(timer);yes();}});});
      }
      await startApi();ui=await require('./commandFrontendHost.cjs').start(plan,{scope:'auditoria-integrada',onHeld:key=>driver?.send({type:'held',key}),onReadHeld:value=>driver?.send({type:'read-held',...value})});
      const ports=[m.pgPort,m.httpPort,Number(new URL(ui.origin).port)],connect=originalConnect;
      require('node:net').Socket.prototype.connect=function(...args){const v=Array.isArray(args[0])?args[0]:args,t=v[0],host=typeof t==='object'?t.host:v[1],port=Number(typeof t==='object'?t.port:t);report.connections??=[];report.connections.push({host,port});if(host!=='127.0.0.1'||!ports.includes(port))throw Error('AUDIT_FRONTEND_NETWORK_BLOCKED');return connect.apply(this,args);};
      require('node:dgram').createSocket=()=>{throw Error('AUDIT_FRONTEND_NETWORK_BLOCKED');};global.fetch=()=>{throw Error('AUDIT_FRONTEND_NETWORK_BLOCKED');};
      Object.assign(report,{directory:dir,database:m.database,cluster:m.cluster,pgPort:m.pgPort,apiPort:m.httpPort,uiPort:ports[2],generation:m.dataGeneration,legacy});
      const fixtures=JSON.parse(fs.readFileSync(path.join(dir,'api-fixtures.json'))),credentials=JSON.parse(fs.readFileSync(path.join(dir,'test-user.json')));
      driver=cp.spawn(require('electron'),[path.join(__dirname,'auditFrontendDriver.cjs')],{env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});let driverErrors='';driver.stderr.on('data',v=>driverErrors+=v);driver.stdout.on('data',v=>process.stdout.write(v));
      driver.on('message',async message=>{try{
        const send=(type,value={})=>driver.send({type,...value});
        if(message.type==='ready')send('input',{origin:ui.origin,credentials,fixtures,generation:m.dataGeneration,output:dir,legacy});
        if(message.type==='arm'){ui.arm(message.mode);send('armed');}
        if(message.type==='release'){ui.release();send('released');}
        if(message.type==='fault'){const id=crypto.randomUUID();await new Promise((yes,no)=>{const timer=setTimeout(()=>no(Error('ARM_TIMEOUT')),5000);acks.set(id,()=>{clearTimeout(timer);yes();});api.send({type:'arm',id,fault:message.fault});});send('fault-ready');}
        if(message.type==='restart'){await ui.pause();try{await stopChild(api);ui.resetConnections();await startApi();}finally{ui.resume();}send('restarted');}
        if(message.type==='hold-read')send('read-armed',{id:ui.holdRead(message.url)});
        if(message.type==='release-read'){ui.releaseRead(message.id);send('read-released');}
        if(message.type==='revoke'){
          assert.ok(['segundo@standalone.example.test','operacion@standalone.example.test','daily-pdf@standalone.example.test'].includes(message.mail));
          await admin.query("UPDATE usuarios SET id_rol=(SELECT id_rol FROM roles WHERE nombre='Consulta'),alcance_plataformas='selected' WHERE correo=$1",[message.mail]);send('revoked');
        }
        if(message.type==='rename'){
          await admin.query("UPDATE usuarios SET nombre='Nombre nuevo sintetico' WHERE correo='administrador@standalone.example.test'");send('renamed');
        }
        if(message.type==='state'){
          const h=crypto.createHash('sha256');for(const table of [...require('../backend/config/desktopSchema').TABLES,'comandos_idempotentes'])h.update((await db.query(`SELECT COALESCE(jsonb_agg(v ORDER BY v::text),'[]'::jsonb)::text value FROM (SELECT to_jsonb(t) v FROM public.${table} t) s`)).rows[0].value);send('state',{hash:h.digest('hex')});
        }
        if(message.type==='proof'){
          const commands=(await db.query('SELECT clave,estado,ids_bitacora,id_recurso FROM comandos_idempotentes WHERE clave=$1',[message.key])).rows;
          const audits=(await db.query('SELECT * FROM bitacora WHERE comando_clave=$1',[message.key])).rows;
          const writes=ui.calls.filter(c=>c.writing&&c.key===message.key&&c.label!=='blocked-before-upstream');
          const value={key:message.key,commands,audits,writes:writes.length,hashes:[...new Set(writes.map(c=>c.bodyHash))]};report.proofs.push(value);send('proof',value);
        }
        if(message.type==='progress')report.checks.push(message.check);
      }catch(error){driver.send({type:'harness-error',message:error.message});}});
      await new Promise((yes,no)=>{const timer=setTimeout(()=>{driver.kill();no(Error('AUDIT_FRONTEND_DRIVER_TIMEOUT'));},420000);driver.once('error',no);driver.once('exit',code=>{clearTimeout(timer);code===0?yes():no(Error('AUDIT_FRONTEND_DRIVER_FAILED '+driverErrors.slice(-3500)));});});
      const committed=(await db.query("SELECT clave,ids_bitacora FROM comandos_idempotentes WHERE estado='confirmado'")).rows;
      report.transactionProofs=committed.filter(c=>c.ids_bitacora.length).map(c=>{
        const ledger=report.events.find(e=>e.phase==='ledger'&&e.key===c.clave);assert.ok(ledger);
        const group=report.events.filter(e=>e.transaction===ledger.transaction&&e.pid===ledger.pid&&e.type==='sql-proof');assert.ok(group.some(e=>e.phase==='business')&&group.some(e=>e.phase==='audit'));assert.ok(group.every(e=>e.client===ledger.client));
        return {key:c.clave,ids:c.ids_bitacora,client:ledger.client,pid:ledger.pid,transaction:ledger.transaction,phases:group.map(e=>e.phase)};
      });
      report.counts=(await db.query("SELECT (SELECT count(*)::int FROM bitacora WHERE version_auditoria=2) audits,(SELECT count(*)::int FROM comandos_idempotentes) commands")).rows[0];
      assert.ok(report.transactionProofs.length>=6);assert.ok(ui.calls.filter(c=>c.writing).every(c=>require('../backend/config/auditFrontendPolicy').allowHttp(c.method,c.url)));
      await P.verify({connect:async()=>({query:db.query.bind(db),release(){}})},plan);report.schemaVerifiedAfter=true;report.completed=true;
    }});
  }catch(error){report.failures.push({message:error.message,stack:error.stack});throw error;}
  finally{
    ui?.release();await stopChild(driver);await stopChild(api);report.calls=ui?.calls;await ui?.close();await db?.end().catch(()=>{});process.env=launch;
    if(m&&fs.existsSync(path.join(dir,'data/postmaster.pid')))base.control(m,'stop');report.postgresStopped=!fs.existsSync(path.join(dir,'data/postmaster.pid'));
    fs.writeFileSync(path.join(dir,'audit-frontend-api.log'),apiLog);fs.writeFileSync(path.join(dir,'audit-frontend-verification.json'),JSON.stringify(report,null,2));
    require('node:net').Socket.prototype.connect=originalConnect;
    console.log(JSON.stringify({completed:report.completed,checks:report.checks.length,failures:report.failures,postgresStopped:report.postgresStopped}));
  }
}
if(require.main===module)main().catch(error=>{console.error('AUDIT_FRONTEND_LAB_FAILED '+error.message);process.exitCode=1;});
module.exports={main};
