// Electron real desde fuentes; sin crear cluster, usuarios o reservaciones.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {Client}=require('pg'),g=require('./devDb02.cjs'),d=require('./devDb03.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),j=JSON.stringify;
const report={checks:[],failures:[],profiles:[],real_electron:true,real_http:true,real_postgres:true,source_entrypoint:true,packaged:false};
let child,inspector,db,mainId,adminId,stage='input',revoked=false,originalScope,credentials;
function ensure(value,code){if(!value)g.fail('DEV03_'+code);}
class Inspector{
 constructor(ws){this.ws=ws;this.id=0;this.pending=new Map();this.events=[];ws.addEventListener('message',ev=>{const m=JSON.parse(String(ev.data));if(m.id){const p=this.pending.get(m.id);if(p){this.pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error('DEV03_INSPECTOR_PROTOCOL')):p.resolve(m.result);}}else this.events.push(m);});ws.addEventListener('close',()=>{for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('DEV03_INSPECTOR_CLOSED'));}this.pending.clear();});}
 send(method,params={}){return new Promise((resolve,reject)=>{const id=++this.id,timer=setTimeout(()=>{this.pending.delete(id);reject(Error('DEV03_INSPECTOR_TIMEOUT'));},25000);this.pending.set(id,{resolve,reject,timer});this.ws.send(j({id,method,params}));});}
 async event(method){for(let i=0;i<150;i++){const n=this.events.findIndex(e=>e.method===method);if(n>=0)return this.events.splice(n,1)[0].params;await sleep(100);}g.fail('DEV03_PAUSE_TIMEOUT');}
 async eval(expression){const r=await this.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails){let detail=String(r.exceptionDetails.exception?.description||r.exceptionDetails.text||'').split('\n')[0];for(const secret of [credentials?.password,...(credentials?.users||[]).map(u=>u.password)])if(secret)detail=detail.split(secret).join('[redacted]');throw Object.assign(new Error('DEV03_INSPECTOR_EVAL_FAILED'),{code:'DEV03_INSPECTOR_EVAL_FAILED',safe_detail:detail.slice(0,220)});}return r.result.value;}
 close(){this.ws.close();}
}
async function freePort(){const s=net.createServer();await new Promise((ok,no)=>{s.once('error',no);s.listen(0,'127.0.0.1',ok);});const port=s.address().port;await new Promise(r=>s.close(r));return port;}
async function connect(port){for(let i=0;i<150;i++){ensure(child.exitCode===null,'ELECTRON_EXIT_BEFORE_DEBUGGER');try{const list=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();const ws=new WebSocket(list[0].webSocketDebuggerUrl);await new Promise((ok,no)=>{ws.addEventListener('open',ok,{once:true});ws.addEventListener('error',no,{once:true});});return new Inspector(ws);}catch{}await sleep(100);}g.fail('DEV03_DEBUGGER_CONNECTION_TIMEOUT');}
const ref=id=>"globalThis.__dev03Req('electron').BrowserWindow.fromId("+id+")";
async function e(source,id=mainId){let expression=true;try{new Function('return ('+source+')');}catch{expression=false;}const script='(async()=>{'+(expression?'return ('+source+');':source)+'})()';return inspector.eval(ref(id)+'.webContents.executeJavaScript('+j(script)+',true)');}
async function wait(condition,label,id=mainId,ms=12000){const end=Date.now()+ms;while(Date.now()<end){if(await e(condition,id))return;await sleep(90);}g.fail('DEV03_UI_TIMEOUT_'+label);}
async function check(name,fn){stage=name;await fn();report.checks.push({name,passed:true});console.log('PASS '+name);}
async function api(url,method='GET',body,id=mainId){return e(`(async()=>{const r=await fetch(${j(url)},{method:${j(method)},headers:{Authorization:'Bearer '+App.auth.obtenerToken(),'Content-Type':'application/json'},body:${body===undefined?'undefined':j(j(body))}});return {status:r.status,body:await r.json()};})()`,id);}
async function login(index,id=mainId){const user=credentials.users[index];await e('App.auth.cerrarSesion()',id);await wait("!!document.getElementById('login-correo')",'LOGIN_FORM',id);await e(`document.getElementById('login-correo').value=${j(user.correo)};document.getElementById('login-password').value=${j(user.password)};document.getElementById('login-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));`,id);await wait("App.auth.estaAutenticado() && !!document.querySelector('.dashboard-metric-card')",'LOGIN_'+index,id);const u=await e('App.auth.obtenerUsuario()',id);ensure(u.correo===user.correo,'WRONG_SESSION');return u;}
async function route(name,condition,id=mainId){await e("App.router.navigate("+j(name)+")",id);if(condition)await wait(condition,'ROUTE_'+name,id);}
async function capture(name){
 for(let attempt=0;attempt<3;attempt++){
  try{const base64=await inspector.eval('(async()=>{const image=await '+ref(mainId)+'.webContents.capturePage();return image.toPNG().toString("base64");})()');fs.writeFileSync(path.join(d.LAB,name+'.png'),Buffer.from(base64,'base64'));return true;}
  catch(error){if(attempt===2){report.warnings=report.warnings||[];report.warnings.push({name:'CAPTURE_'+name,code:'CHROMIUM_CAPTURE_UNAVAILABLE'});return false;}await sleep(500);}
 }
}
async function restoreScope(){if(!revoked||!db||!originalScope)return;await db.query('BEGIN');try{await g.verifyIdentity(db,{username:d.ROLE});await db.query('UPDATE usuarios SET alcance_plataformas=$2 WHERE id_usuario=$1',[originalScope.id_usuario,originalScope.alcance_plataformas]);await db.query('DELETE FROM usuario_plataformas_visibles WHERE id_usuario=$1',[originalScope.id_usuario]);for(const id of originalScope.platform_ids)await db.query('INSERT INTO usuario_plataformas_visibles VALUES($1,$2)',[originalScope.id_usuario,id]);await db.query('COMMIT');revoked=false;}catch(err){await db.query('ROLLBACK');throw err;}}
async function stop(){
 if(inspector){try{await inspector.eval("globalThis.__dev03Req('electron').app.quit()");}catch{}try{inspector.close();}catch{}}
 if(child&&child.exitCode===null){await Promise.race([new Promise(r=>child.once('close',r)),sleep(7000)]);if(child.exitCode===null&&!child.killed)child.kill();}
 if(db)await db.end();
}
async function run(){
 let text='';for await(const chunk of process.stdin){text+=chunk;if(text.length>32768)g.fail('DEV03_INPUT_TOO_LARGE');}credentials=JSON.parse(text);text='';
 ensure(credentials.username===d.ROLE&&credentials.users?.length===4,'CREDENTIALS_INVALID');
 const cfg=g.readConfig();ensure(cfg.DB_USER===d.ROLE,'CONFIG_USER');
 await g.assertPortFree();db=new Client({host:'localhost',port:5432,database:g.DATABASE,user:d.ROLE,password:credentials.password});await db.connect();await g.verifyIdentity(db,{username:d.ROLE});await g.rejectPrivilegedRole(db);
 const fixture=JSON.parse(fs.readFileSync(path.join(g.LAB,'initialization.json'))),reservation=code=>fixture.reservations.find(r=>r.codigo===code),platform=name=>fixture.platforms.find(p=>p.nombre===name).id_plataforma;
 originalScope=(await db.query("SELECT id_usuario,alcance_plataformas,ARRAY(SELECT id_plataforma FROM usuario_plataformas_visibles v WHERE v.id_usuario=u.id_usuario ORDER BY id_plataforma) AS platform_ids FROM usuarios u WHERE correo=$1",['consulta.selected.dev@example.test'])).rows[0];
 const port=await freePort(),env=g.cleanEnvironment(cfg,credentials);
 child=cp.spawn(require('electron'),['--inspect-brk=127.0.0.1:'+port,'.'],{cwd:g.ROOT,env,stdio:['ignore','pipe','pipe'],windowsHide:true});
 report.electron_pid=child.pid;child.stdout.resume();child.stderr.resume();
 inspector=await connect(port);await inspector.send('Debugger.enable');await inspector.send('Runtime.runIfWaitingForDebugger');const paused=await inspector.event('Debugger.paused');
 const bootstrap=`(()=>{const req=process.getBuiltinModule('module').createRequire(${j(path.join(g.ROOT,'package.json'))});globalThis.__dev03Req=req;globalThis.__dev03Network={blocked:0};const {app,dialog}=req('electron');const mod=req('node:child_process'),spawn=mod.spawn;mod.spawn=function(...args){const c=spawn.apply(this,args);if(String(args[1]?.[0]||'').includes('backendDevDb02.cjs'))globalThis.__dev03Backend=c;return c;};dialog.showErrorBox=()=>{globalThis.__dev03StartupError=true;};app.on('web-contents-created',(_event,wc)=>{wc.session.webRequest.onBeforeRequest((details,cb)=>{const u=new URL(details.url);const allowed=['data:','devtools:','about:'].includes(u.protocol)||(u.protocol==='http:'&&u.hostname==='127.0.0.1'&&u.port==='3000');if(!allowed)globalThis.__dev03Network.blocked++;cb({cancel:!allowed});});});return true;})()`;
 const boot=await inspector.send('Debugger.evaluateOnCallFrame',{callFrameId:paused.callFrames[0].callFrameId,expression:bootstrap,returnByValue:true});ensure(!boot.exceptionDetails,'BOOTSTRAP');await inspector.send('Debugger.resume');
 stage='startup';for(let i=0;i<220;i++){const state=await inspector.eval("(()=>{if(globalThis.__dev03StartupError)return {failed:true};const electron=globalThis.__dev03Req('electron');if(!electron.app.isReady())return {};const C=electron.BrowserWindow;if(!C||typeof C.getAllWindows!=='function')return {};const w=C.getAllWindows()[0];return w&&!w.webContents.isLoading()&&w.webContents.getURL().includes('/app/')?{id:w.id}:{};})()");ensure(!state.failed,'STARTUP_REJECTED');if(state.id){mainId=state.id;break;}await sleep(100);}ensure(mainId,'WINDOW_NOT_READY');
 await check('SOURCE_ELECTRON_AND_OWN_BACKEND',async()=>{const runtime=await inspector.eval("(()=>{const app=globalThis.__dev03Req('electron').app;return {packaged:app.isPackaged,backend_pid:globalThis.__dev03Backend?.pid,role:process.env.DB_USER,database:process.env.DB_NAME,electron:process.versions.electron};})()");ensure(!runtime.packaged&&runtime.backend_pid&&runtime.role===d.ROLE&&runtime.database===g.DATABASE,'OWN_BACKEND_IDENTITY');Object.assign(report,runtime);});
 await check('HTTP_HEALTH',async()=>{const r=await fetch('http://127.0.0.1:3000/');ensure(r.status===200&&(await r.text()).trim()==='API del Sistema Integrador de Reservaciones funcionando','HEALTH');});
 await check('LOGIN_SCREEN_AND_SECURITY',async()=>{await wait("!!document.getElementById('login-form')",'INITIAL_LOGIN');const p=await inspector.eval(ref(mainId)+'.webContents.getLastWebPreferences()');ensure(p.sandbox&&p.contextIsolation&&!p.nodeIntegration&&p.webSecurity,'WEB_PREFERENCES');ensure(await inspector.eval(ref(mainId)+'.isVisible()'),'LOGIN_WINDOW_VISIBLE');await capture('login');});
 for(let index=0;index<4;index++){
  await check('PROFILE_'+index+'_LOGIN_SESSION_DASHBOARD',async()=>{
   const user=await login(index),session=await api('/api/auth/sesion');ensure(session.status===200&&session.body.usuario.correo===credentials.users[index].correo,'SESSION');
   const list=await api('/api/reservaciones'),dash=await api('/api/dashboard/resumen?fecha='+fixture.test_date),expected=index<2?6:index===2?4:0;
   ensure(list.status===200&&list.body.total===expected,'LIST_TOTAL');
   const oracle=(await db.query("SELECT count(*)::int n,COALESCE(sum(r.pax),0)::int pax FROM reservaciones r WHERE r.fecha=$1 AND r.estado=ANY($2::varchar[]) AND ($3::boolean OR r.id_plataforma=ANY($4::int[]))",[fixture.test_date,['Pendiente','Confirmada','Activa'],index<2,index===2?originalScope.platform_ids:[]])).rows[0];
   ensure(dash.status===200&&dash.body.metricas.reservaciones_vigentes===oracle.n&&dash.body.metricas.pax_vigentes===oracle.pax,'DASHBOARD_ORACLE');
   const menu=await e("Array.from(document.querySelectorAll('.nav-link')).map(n=>n.dataset.routeId)");
   if(index===0){ensure(menu.includes('usuarios')&&menu.includes('bitacora'),'ADMIN_MENU');ensure((await api('/api/usuarios')).status===200,'ADMIN_USERS');ensure((await api('/api/plataformas')).body.datos.length===4,'ADMIN_PLATFORMS');}
   if(index===1){ensure(menu.includes('historial')&&!menu.includes('usuarios'),'CONSULTA_ALL_MENU');ensure((await api('/api/usuarios')).status===403,'ALL_CANNOT_ADMIN');}
   if(index>=2){ensure(j(menu)===j(['dashboard','reservaciones']),'RESTRICTED_MENU');ensure((await api('/api/daily/operativo?fecha='+fixture.test_date)).status===403,'DAILY_FORBIDDEN');ensure((await api('/api/usuarios')).status===403,'USERS_FORBIDDEN');ensure((await api('/api/reservaciones/'+reservation('DEV-EXT-001').id_reservacion)).status===404,'HIDDEN_DETAIL');}
   if(index>0)ensure((await api('/api/reservaciones','POST',{})).status===403,'CONSULTA_WRITE');
   report.profiles.push({correo:user.correo,rol:user.rol,scope:user.alcance_plataformas,login:true,session_status:session.status,reservations:list.body.total,metrics:dash.body.metricas,menu});
  });
  await check('PROFILE_'+index+'_UI_LIST_AND_LOGOUT',async()=>{
   const expected=index<2?6:index===2?4:0;await route('reservaciones',"document.getElementById('reservaciones-message')?.innerText.includes("+j(expected+' reservaciones')+")");
   if(index>=2){ensure(!await e("document.getElementById('reservaciones-tbody').innerText.includes('DEV-EXT-001')||document.getElementById('reservaciones-tbody').innerText.includes('DEV-WA-001')"),'NO_HIDDEN_DOM');}
   if(index===2)await capture('selected-reservaciones');if(index===3)await capture('selected-empty');
   await e('App.auth.cerrarSesion()');await wait("!!document.getElementById('login-form')&&!App.auth.estaAutenticado()",'LOGOUT');
   ensure(await e("!App.auth.obtenerToken()&&!document.body.innerText.includes('Cliente Sintetico')"),'SESSION_DOM_CLEAN');
  });
 }
 await login(2);
 await check('FILTERS_PAGINATION_AND_DETAILS',async()=>{
  const filter=await api('/api/reservaciones?codigo=DEV-GYG-001');ensure(filter.status===200&&filter.body.total===1,'CODE_FILTER');
  const foreign=await api('/api/reservaciones?id_plataforma='+platform('Externa'));ensure(foreign.status===200&&foreign.body.total===0,'FOREIGN_FILTER');
  const first=await api('/api/reservaciones?page=1&limit=25'),second=await api('/api/reservaciones?page=2&limit=25');ensure(first.status===200&&second.status===200&&first.body.pagination.total===4&&first.body.pagination.totalPages===1&&first.body.data.length===4&&second.body.data.length===0,'PAGINATION');ensure(new Set(first.body.data.map(r=>r.id_reservacion)).size===4,'PAGINATION_UNIQUE');ensure((await api('/api/reservaciones?page=1&limit=2')).status===400,'INVALID_PAGE_LIMIT');
  ensure((await api('/api/reservaciones/'+reservation('DEV-GYG-HIST').id_reservacion)).status===200,'HISTORICAL_DETAIL');
  ensure((await api('/api/reservaciones/2147483647')).status===404,'MISSING_DETAIL');
  await route('reservaciones',"!!document.getElementById('reservaciones-codigo')");
  await e("document.getElementById('reservaciones-codigo').value='DEV-GYG-001';document.getElementById('reservaciones-filtros').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));");
  await wait("document.getElementById('reservaciones-message').innerText.includes('1 reservaciones')",'UI_FILTER');
 });
 await check('PROVIDERS_DISABLED',async()=>{ensure((await api('/api/eventos-integracion')).status===503,'PROVIDER_ROUTE');});
 adminId=await inspector.eval(`(()=>{const {BrowserWindow}=globalThis.__dev03Req('electron');const w=new BrowserWindow({show:false,width:1366,height:768,webPreferences:{preload:${j(path.join(g.ROOT,'electron/preload.js'))},partition:'dev-db03-admin-independent',sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,webviewTag:false}});w.loadURL('http://127.0.0.1:3000/app/');return w.id;})()`);
 await wait("!!document.getElementById('login-form')",'ADMIN_SECONDARY',adminId);await login(0,adminId);
 await check('LIVE_REVOCATION_AND_SESSION_CLEANUP',async()=>{
  revoked=true;const change=await api('/api/usuarios/'+originalScope.id_usuario,'PATCH',{alcance_plataformas:'selected',platform_ids:[platform('GetYourGuide')]},adminId);ensure(change.status===200,'REVOKE');
  ensure((await api('/api/reservaciones/'+reservation('DEV-FH-001').id_reservacion)).status===404,'REVOKED_DETAIL');
  await e('App.auth.refrescarSesion()');await route('reservaciones',"document.getElementById('reservaciones-message')?.innerText.includes('2 reservaciones')");
  ensure(await e("!document.getElementById('reservaciones-tbody').innerText.includes('DEV-FH')&&!Array.from(document.getElementById('reservaciones-plataforma').options).some(o=>o.text==='FareHarbor')"),'REVOKED_DOM_CLEAN');
  const restore=await api('/api/usuarios/'+originalScope.id_usuario,'PATCH',{alcance_plataformas:originalScope.alcance_plataformas,platform_ids:originalScope.platform_ids},adminId);ensure(restore.status===200,'RESTORE_SCOPE');revoked=false;
  await e('App.auth.refrescarSesion()');ensure((await api('/api/reservaciones')).body.total===4,'RESTORED_VISIBILITY');
  await e('App.auth.cerrarSesion()');await wait("!!document.getElementById('login-form')",'FINAL_LOGOUT');
 });
 report.network=await inspector.eval('globalThis.__dev03Network');
 ensure(report.network.blocked===0,'UNEXPECTED_EXTERNAL_REQUEST');
 report.completed=true;
}
(async()=>{try{await run();}catch(err){report.failures.push({stage,code:/^[A-Z0-9_]+$/.test(err.code||'')?err.code:'DEV03_E2E_FAILED',detail:err.safe_detail});process.exitCode=1;}finally{
 try{await restoreScope();}catch{report.failures.push({stage:'cleanup',code:'DEV03_SCOPE_RESTORE_FAILED'});process.exitCode=1;}
 await stop();if(credentials){credentials.password='';credentials.users?.forEach(u=>u.password='');}
 report.processes_stopped=Boolean(!child||child.exitCode!==null||child.killed);
 d.save('electron.json',report);console.log('DEV-DB-03 Electron: '+report.checks.length+' comprobaciones aprobadas; '+report.failures.length+' fallos.');if(report.failures.length)console.log(j(report.failures));
}})();

