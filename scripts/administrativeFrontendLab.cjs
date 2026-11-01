'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const P=require('../backend/config/administrativeFrontendPolicy'),B=require('../backend/config/standalonePolicy');
async function run({dir,admin,observer:db,manifest:m,apiPlan,credentials,fixtures,report:outer}){
  const report={phase:'2D.9B.3-C',completed:false,checks:[],failures:[],events:[],proofs:[],syntheticOnly:true};
  // Fixture operativa privada C, previa a abrir HTTP: dos PAX activos reales
  // para comprobar la regla original de reduccion de capacidad, sin tocar historia.
  await admin.query('BEGIN');try{
    await admin.query('SELECT pg_advisory_xact_lock($1::int,$2::int)',require('../backend/config/operationalTransactions').KEY);
    const vehicle=(await admin.query('SELECT id_vehiculo FROM vehiculos WHERE capacidad=12 ORDER BY id_vehiculo LIMIT 1')).rows[0].id_vehiculo;
    const op=(await admin.query("INSERT INTO operaciones_tour(fecha,id_tour,hora_inicio,turno,numero_grupo,estado) VALUES ('2099-09-01',$1,'07:00','Mañana',1,'Preparada') RETURNING id_operacion_tour",[fixtures.tour])).rows[0].id_operacion_tour;
    const tr=(await admin.query("INSERT INTO transportes_operacion(id_operacion_tour,id_vehiculo,estado) VALUES ($1,$2,'Preparado') RETURNING id_transporte_operacion",[op,vehicle])).rows[0].id_transporte_operacion;
    await admin.query("INSERT INTO reservaciones(codigo,fecha,id_tour,id_pais,id_plataforma,nombre_cliente,pax,ninos,pickup_place,pickup_time,turno,precio_total,deposito,saldo,estado,id_transporte_operacion,fecha_registro,ultima_actualizacion) VALUES ('SYN-C-CAP','2099-09-01',$1,$2,$3,'Fixture capacidad C',2,0,'Punto sintético','07:00','Mañana',1000,200,800,'Programada',$4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",[fixtures.tour,fixtures.country,fixtures.platform,tr]);
    await admin.query('COMMIT');report.capacityFixture={activePax:2,newSyntheticOperation:true,historicalRelationsModified:false};
  }catch(e){await admin.query('ROLLBACK');throw e;}
  const config={...apiPlan.config,APP_ENVIRONMENT:P.ENVIRONMENT},bytes=Object.entries(config).map(([k,v])=>k+'='+v).join('\n')+'\n';
  const manifest={...m,version:11,environment:P.ENVIRONMENT,purpose:P.PURPOSE,protocol:P.PROTOCOL,milestone:'C',aProof:B.sha(fs.readFileSync(path.join(dir,'security-a-proof.json'))),configDigest:B.sha(bytes)};
  for(const [file,value]of [['administrative-frontend-runtime.env',bytes],['administrative-frontend-preconditions.key',apiPlan.key],['administrative-frontend-commands.key',apiPlan.commandKey],['administrative-frontend-manifest.json',JSON.stringify(manifest,null,2)]])fs.writeFileSync(path.join(dir,file),value,{flag:'wx'});
  const plan=P.readPlan(path.join(dir,'administrative-frontend-manifest.json'));await P.verify({connect:async()=>({query:db.query.bind(db),release(){}})},plan);
  const secrets=[credentials.password,config.DB_PASSWORD,config.JWT_SECRET,plan.key,plan.commandKey,...Object.values(fixtures.secrets),...(await db.query('SELECT password FROM usuarios')).rows.map(r=>r.password)];
  const assertNoSecrets=text=>{for(const value of secrets)assert.ok(!text.includes(value),'C_SECRET_EXPOSED');};
  let api,driver,ui,logs='';const pending=new Map();const env=require('../backend/config/desktopPolicy').cleanEnvironment();delete env.ELECTRON_RUN_AS_NODE;
  const stop=async child=>{if(child&&child.exitCode===null){const end=require('node:events').once(child,'exit');child.kill();await end;}};
  async function start(){api=cp.spawn(process.execPath,[path.join(__dirname,'administrativeFrontendProbe.cjs'),plan.filename],{env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});api.on('message',m=>{if(m.type==='armed'){pending.get(m.id)?.();pending.delete(m.id);}else report.events.push(m);});api.stderr.on('data',v=>logs+=v);await new Promise((yes,no)=>{let text='';const timer=setTimeout(()=>no(Error('C_API_START_TIMEOUT')),45000);api.once('exit',()=>{clearTimeout(timer);no(Error('C_API_START_FAILED'));});api.stdout.on('data',v=>{logs+=v;text+=v;if(text.includes('ADMINISTRATIVE_FRONTEND_PROBE_READY')){clearTimeout(timer);yes();}});});}
  try{
    await start();ui=await require('./commandFrontendHost.cjs').start(plan,{scope:'administracion-integrada',onHeld:key=>driver?.send({type:'write-held',key}),onReadHeld:value=>driver?.send({type:'read-held',...value})});
    Object.assign(report,{directory:dir,cluster:m.cluster,database:m.database,generation:m.dataGeneration,pgPort:m.pgPort,apiPort:m.httpPort,uiPort:Number(new URL(ui.origin).port)});
    const baseline=(await db.query('SELECT to_jsonb(b) row FROM bitacora b ORDER BY id_bitacora')).rows,cutoff=(await db.query('SELECT max(id_bitacora) n FROM bitacora')).rows[0].n;
    driver=cp.spawn(require('electron'),[path.join(__dirname,'administrativeFrontendDriver.cjs')],{env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});driver.stderr.on('data',v=>logs+=v);driver.stdout.on('data',v=>process.stdout.write(v));
    driver.on('message',async message=>{try{const send=(type,extra={})=>driver?.connected&&driver.send({type,...extra});
      if(message.type==='ready')send('input',{origin:ui.origin,credentials,fixtures:{platform:fixtures.platform,hidden:fixtures.hidden,roles:fixtures.roles},generation:m.dataGeneration,output:dir});
      if(message.type==='secret')secrets.push(message.value);
      if(message.type==='arm'){ui.arm(message.mode);send('armed');}
      if(message.type==='release'){ui.release();send('released');}
      if(message.type==='aged-auth'){
        const actor=(await db.query('SELECT id_usuario,version_credenciales::text cv FROM usuarios WHERE correo=$1',[credentials.correo])).rows[0];
        const CP=require('../backend/security/credentialPolicy'),token=require('jsonwebtoken').sign({cv:actor.cv,dg:m.dataGeneration,token_use:'access',iat:Math.floor(Date.now()/1000)-301},config.JWT_SECRET,{algorithm:'HS256',issuer:CP.ISSUER,audience:CP.AUDIENCE,subject:String(actor.id_usuario),expiresIn:28800});secrets.push(token);send('aged-auth-ready',{token});
      }
      if(message.type==='capacity-target')send('capacity-target-ready',{target:(await db.query("SELECT tr.id_vehiculo,COALESCE(sum(r.pax),0)::int pax FROM transportes_operacion tr JOIN reservaciones r ON r.id_transporte_operacion=tr.id_transporte_operacion AND r.estado<>'Cancelada' WHERE tr.id_vehiculo IS NOT NULL GROUP BY tr.id_transporte_operacion,tr.id_vehiculo HAVING sum(r.pax)>1 ORDER BY sum(r.pax) DESC LIMIT 1")).rows[0]});
      if(message.type==='hold-read')send('read-armed',{id:ui.holdRead(message.url)});
      if(message.type==='release-read'){ui.releaseRead(message.id);send('read-released');}
      if(message.type==='fault'){const id=crypto.randomUUID();await new Promise((yes,no)=>{const timer=setTimeout(()=>no(Error('C_ARM_TIMEOUT')),5000);pending.set(id,()=>{clearTimeout(timer);yes();});api.send({type:'arm',id,fault:message.fault});});send('fault-ready');}
      if(message.type==='restart'){await ui.pause();try{await stop(api);ui.resetConnections();await start();}finally{ui.resume();}send('restarted');}
      if(message.type==='proof'){const command=(await db.query('SELECT * FROM comandos_idempotentes WHERE clave=$1',[message.key])).rows[0],audits=(await db.query('SELECT * FROM bitacora WHERE comando_clave=$1',[message.key])).rows;const value={key:message.key,command,audits,writes:ui.calls.filter(c=>c.writing&&c.key===message.key).length};assertNoSecrets(JSON.stringify(value));report.proofs.push(value);send('proof',value);}
      if(message.type==='state'){const h=crypto.createHash('sha256');for(const table of [...require('../backend/config/desktopSchema').TABLES,'comandos_idempotentes'])h.update((await db.query(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text value FROM public.${table} t`)).rows[0].value);send('state',{hash:h.digest('hex')});}
      if(message.type==='deactivate'){assert.equal(message.mail,'segundo@standalone.example.test');await admin.query('UPDATE usuarios SET estado=false WHERE correo=$1',[message.mail]);send('deactivated');}
      if(message.type==='incompatible'){await admin.query('INSERT INTO usuario_plataformas_visibles(id_usuario,id_plataforma) VALUES ($1,$2)',[message.id,fixtures.hidden]);send('incompatible-ready');}
      if(message.type==='last-admin'){await admin.query("UPDATE usuarios SET estado=false WHERE id_rol=$1 AND id_usuario<>$2",[fixtures.roles.Administrador,message.id]);send('last-admin-ready');}
      if(message.type==='progress'){report.checks.push(message.check);}
    }catch(e){driver?.send({type:'harness-error',code:e.code||'C_HARNESS_FAILURE'});}});
    await new Promise((yes,no)=>{const timer=setTimeout(()=>{driver.kill();no(Error('C_ELECTRON_TIMEOUT'));},600000);driver.once('error',no);driver.once('exit',code=>{clearTimeout(timer);code===0?yes():no(Error('C_ELECTRON_FAILED'));});});
    assert.deepEqual((await db.query('SELECT to_jsonb(b) row FROM bitacora b WHERE id_bitacora<=$1 ORDER BY id_bitacora',[cutoff])).rows,baseline);
    const audits=(await db.query('SELECT * FROM bitacora WHERE version_auditoria=3')).rows;report.transactionProofs=[];
    for(const audit of audits){const ledger=report.events.find(e=>e.type==='sql-proof'&&e.phase==='ledger'&&e.key===audit.comando_clave);assert.ok(ledger,'C_LEDGER_PROOF_REQUIRED');const group=report.events.filter(e=>e.type==='sql-proof'&&e.transaction===ledger.transaction&&e.pid===ledger.pid);assert.ok(group.some(e=>e.phase==='business'));assert.equal(group.filter(e=>e.phase==='audit').length,1);assert.ok(group.every(e=>e.client===ledger.client));report.transactionProofs.push({key:audit.comando_clave,pid:ledger.pid,transaction:ledger.transaction,client:ledger.client,phases:group.map(e=>e.phase)});}
    const methods=new Set(ui.calls.filter(c=>c.writing&&c.status===200).map(c=>c.method+' '+c.url.replace(/\/[0-9]+/g,'/:id')));assert.equal(methods.size,13,'C_THIRTEEN_WRITERS_REQUIRED');report.writers=[...methods].sort();
    assert.ok(report.events.filter(e=>e.type==='connection').every(e=>e.host==='127.0.0.1'&&e.port===m.pgPort));report.backendNetworkVerified=true;
    await P.verify({connect:async()=>({query:db.query.bind(db),release(){}})},plan);assert.equal((await admin.query('SELECT count(*)::int n FROM inicializacion_sistema')).rows[0].n,0);
    secrets.push(...(await db.query('SELECT password FROM usuarios')).rows.map(r=>r.password));assertNoSecrets(JSON.stringify({audits,ledger:(await db.query('SELECT * FROM comandos_idempotentes')).rows}));assertNoSecrets(fs.readFileSync(path.join(dir,'postgres.log'),'utf8'));report.completed=true;report.secretScanPassed=true;
  }catch(e){report.failures.push({code:e.code||e.message});throw e;}
  finally{ui?.release();await stop(driver);await stop(api);report.calls=ui?.calls;await ui?.close();assertNoSecrets(logs+JSON.stringify(report));fs.writeFileSync(path.join(dir,'administrative-frontend.log'),logs);fs.writeFileSync(path.join(dir,'administrative-frontend-verification.json'),JSON.stringify(report,null,2));outer.cResult={completed:report.completed,checks:report.checks.length};}
  const body={completed:true,code:manifest.code,cluster:manifest.cluster,generation:manifest.dataGeneration,schema:require('../backend/config/credentialSchemaContract').CATALOG_SHA,checks:report.checks.length,reportDigest:B.sha(fs.readFileSync(path.join(dir,'administrative-frontend-verification.json')))};
  const proof={body,signature:crypto.createHmac('sha256',Buffer.from(plan.commandKey,'hex')).update(JSON.stringify(body)).digest('hex')};
  fs.writeFileSync(path.join(dir,'administrative-frontend-proof.json'),JSON.stringify(proof,null,2),{flag:'wx'});
  return {checks:report.checks.length,assertNoSecrets};
}
module.exports={run};
