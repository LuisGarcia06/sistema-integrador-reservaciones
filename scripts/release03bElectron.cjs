const L=require('./release03bSafety.cjs'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),http=require('node:http'),assert=require('node:assert/strict'),{once}=require('node:events');
if(process.argv[2]!=='--release03b-electron')L.fail('R03B_EXPLICIT_ELECTRON_REQUIRED');
const m=L.readManifest(process.argv[3]),scenario=process.argv[4]||'normal-close',barrier=L.barrier(m,{api:true});
const {app,BrowserWindow}=require('electron');app.disableHardwareAcceleration();app.commandLine.appendSwitch('in-process-gpu');app.commandLine.appendSwitch('disable-background-networking');
// El harness termina después de registrar evidencia; la última ventana no lo anticipa.
app.on('window-all-closed',()=>{});
app.setPath('userData',fs.mkdtempSync(path.join(m.dir,'electron-'+scenario+'-')));
let backend,child,actualPort,window,unexpected=false,stage='input';
async function closeBackend(){if(child?.exitCode===null&&child.signalCode===null){const closed=once(child,'exit');backend?.stop();await closed;}}
async function main(){
 if(!process.send||!process.connected)L.fail('R03B_INPUT_IPC_REQUIRED');
 const payload=await new Promise(resolve=>{process.once('message',resolve);process.send({type:'release03b-input-ready'});});
 const {users}=payload;if(!users?.admin||!users?.all||!users?.selected)L.fail('R03B_INPUT_INVALID');
 stage='app-ready';
 await app.whenReady();
 const result={scenario,realElectron:true,realPostgres:true,port3000Used:false};
 try{
  stage='owned-backend';const {startOwnedBackend}=require('../electron/ownedBackend');
  backend=await startOwnedBackend({execPath:process.execPath,root:L.ROOT,configPath:path.join(m.dir,scenario==='privileged'?'privileged.env':'runtime.env'),sourceEnv:L.S.env(),timeout:45000,
   loadConfig:f=>L.loadConfig(m,f),onExit:()=>{unexpected=true;window?.destroy();},
   spawnProcess(exe,_args,options){child=cp.spawn(exe,[path.join(L.ROOT,'scripts/release03bChild.cjs'),'--release03b-child',path.join(m.dir,'manifest.json'),scenario],options);child.on('message',msg=>{if(msg.type==='ready')actualPort=msg.laboratoryPort;});return child;}
  });
  if(!['normal-close','unexpected-exit'].includes(scenario))L.fail('R03B_NEGATIVE_ACCEPTED');
  assert.ok(actualPort&&!L.forbiddenPorts.has(actualPort));barrier.allowApi(actualPort);const origin='http://127.0.0.1:'+actualPort;
  stage='window';window=new BrowserWindow({show:false,width:1200,height:850,webPreferences:{preload:path.join(L.ROOT,'electron/preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  window.webContents.session.webRequest.onBeforeRequest((details,cb)=>{let allowed=false;try{allowed=new URL(details.url).origin===origin;}catch{}cb({cancel:!allowed});});window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.session.setPermissionRequestHandler((_w,_p,cb)=>cb(false));window.webContents.session.setPermissionCheckHandler(()=>false);
  await window.loadURL(origin+'/app/index.html');
  const execute=code=>window.webContents.executeJavaScript(code);
  const wait=async code=>{for(let i=0;i<150;i++){if(await execute(code))return;await new Promise(r=>setTimeout(r,30));}L.fail('R03B_UI_TIMEOUT');};
  await wait('Boolean(window.App && App.auth && App.router)');
  const profiles=[];
  for(const label of ['admin','all','selected']){
   await execute(`App.auth.cerrarSesion();true`);
   const credentials=users[label];
   await execute(`App.auth.iniciarSesion(${JSON.stringify(credentials.email)},${JSON.stringify(credentials.password)}).then(()=>{App.router.navigate('reservaciones');return true;})`);
   await wait("Boolean(document.querySelector('#app-header') && App.auth.estaAutenticado())");
   await wait("location.hash==='#/reservaciones' && !!document.getElementById('reservaciones-fecha')");
   const state=await execute(`({role:App.auth.obtenerUsuario().rol,scope:App.auth.obtenerUsuario().alcance_plataformas,notifications:!!document.getElementById('notification-toggle')})`);
   assert.equal(state.scope,label==='selected'?'selected':'all');
   const notificationState=await execute(`({permitted:!App.auth.esConsultaRestringida(),summary:App.notificaciones?.obtenerResumen()?.counts||null})`);
   if(label==='selected'){assert.equal(notificationState.permitted,false);assert.equal(notificationState.summary,null);assert.equal(state.notifications,false);}
   else assert.equal(state.notifications,true);
   profiles.push({profile:label,scope:state.scope,selectedHasNoSummary:label==='selected'?notificationState.summary===null:undefined});
  }
  result.profiles=profiles;result.backendPid=child.pid;result.httpPort=actualPort;result.identityVerifiedByPrivateIPC=true;
  if(scenario==='unexpected-exit'){const stopped=once(child,'exit');child.kill();await stopped;await new Promise(setImmediate);assert.equal(unexpected,true);assert.equal(window.isDestroyed(),true);result.unexpectedExitHandled=true;}
  else {await closeBackend();result.normalClose=true;window.destroy();}
  result.status='passed';result.childStopped=child.exitCode!==null||child.signalCode!==null;
 }catch(error){
  const expected={'wrong-pid':'IPC_INVALID','wrong-nonce':'IPC_INVALID','wrong-code':'CODE_CHANGED','wrong-db':'PG_IDENTITY','wrong-cluster':'PG_CLUSTER','schema-incomplete':'SCHEMA_INVALID','privileged':'PG_ROLE'}[scenario];
  if(!expected||error.code!==expected)throw error;
  result.status='passed';result.rejectedCode=error.code;await closeBackend();result.childStopped=child.exitCode!==null;result.windowOpened=false;
 }finally{await closeBackend();if(window&&!window.isDestroyed())window.destroy();}
 process.stdout.write('RELEASE03B_ELECTRON_RESULT '+JSON.stringify(result)+'\n',()=>app.exit(0));
}
main().catch(async error=>{await closeBackend().catch(()=>{});fs.writeFileSync(path.join(m.dir,'electron-diagnostic-'+scenario+'.json'),JSON.stringify({stage,code:error.code||error.name,locations:String(error.stack||'').split('\n').filter(s=>s.trim().startsWith('at ')).slice(0,4)}));console.error('RELEASE03B_ELECTRON_FAILED '+(/^[A-Z0-9_]+$/.test(error.code||'')?error.code:error.name));app.exit(1);});
