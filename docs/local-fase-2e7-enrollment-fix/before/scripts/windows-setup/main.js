'use strict';
const {app,BrowserWindow,ipcMain,dialog}=require('electron');
const path=require('node:path'),cp=require('node:child_process');
const P=require('./policy.cjs');
const ROOT=path.resolve(__dirname,'../..');
let win,busy=false,verified=false;
const supported=process.platform==='win32'&&process.arch==='x64'&&Number(require('node:os').release().split('.')[2])>=22000;
if(supported){const profile=path.join(app.getPath('appData'),'ctsk-setup026-candidate04-ui');require('node:fs').mkdirSync(profile,{recursive:true});app.setPath('userData',profile);}
function run(action,ack){return new Promise(resolve=>{
 const child=cp.spawn(path.join(ROOT,'node.exe'),[path.join(__dirname,'worker.cjs')],{cwd:ROOT,env:process.env,windowsHide:true,stdio:['pipe','pipe','pipe']});
 let output='',settled=false;const timer=setTimeout(()=>{child.kill();finish({ok:false,error:{code:'INTERRUPTED_REVIEW',message:'La etapa excedió el tiempo de espera. Conserva su estado y revisa la consola.'}});},35*60000);
 function finish(value){if(settled)return;settled=true;clearTimeout(timer);resolve(value);}
 child.stdout.on('data',b=>{output=(output+b.toString('utf8')).slice(-65536);});
 // Salida no estructurada de procesos: nunca volcar a consola, DOM ni archivos.
 child.stderr.on('data',()=>{});
 child.once('error',()=>finish({ok:false,error:P.publicError(Error('START_FAILED'))}));
 child.once('close',(code,signal)=>{try{const lines=output.trim().split(/\r?\n/);const result=JSON.parse(lines.at(-1));if(typeof result.ok!=='boolean'||signal||(result.ok&&code!==0))throw Error();finish(result);}catch{finish({ok:false,error:P.publicError(Error('START_FAILED'))});}});
 child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({action,ack}));
 });}
function trusted(event){return win&&!win.isDestroyed()&&event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame&&event.senderFrame.url===require('node:url').pathToFileURL(path.join(__dirname,'ui/index.html')).href;}
ipcMain.handle('setup:action',async(event,input)=>{
 if(!trusted(event)||!input||!['status',...P.STEPS].includes(input.action)||typeof input.ack!=='boolean')return {ok:false,error:P.publicError(Error('START_FAILED'))};
 if(busy)return {ok:false,error:P.publicError(Error('BUSY'))};
 if(input.action==='directories'&&!verified)return {ok:false,error:P.publicError(Error('PREVIOUS_STEP_REQUIRED'))};
 busy=true;try{const result=await run(input.action,input.ack);if(input.action==='verify')verified=result.ok&&result.result?.verified===true;if(result.ok&&input.action!=='status'){const status=await run('status',false);if(status.ok)result.steps=status.result.steps;}return result;}finally{busy=false;}
});
const fatal=e=>{dialog.showErrorBox('Configuración experimental 026',P.publicError(e).message);if(!busy)app.quit();};
process.on('uncaughtException',fatal);process.on('unhandledRejection',fatal);
app.whenReady().then(()=>{
 if(!supported)P.fail('VM_WINDOWS11_REQUIRED');
 require('./integrity.cjs').verify(ROOT);
 if(!app.requestSingleInstanceLock()){app.quit();return;}
 win=new BrowserWindow({width:1080,height:820,minWidth:860,minHeight:650,show:false,webPreferences:{preload:path.join(__dirname,'preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,webviewTag:false}});
 win.setMenuBarVisibility(false);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
 win.webContents.session.setPermissionRequestHandler((_w,_p,cb)=>cb(false));win.webContents.session.setPermissionCheckHandler(()=>false);
 win.webContents.on('render-process-gone',()=>dialog.showErrorBox('Asistente interrumpido','Se perdió la interfaz. Las etapas no se repetirán automáticamente. Conserva las consolas abiertas.'));
 win.on('close',e=>{if(busy){e.preventDefault();dialog.showErrorBox('Operación en curso','Espera el resultado de la etapa. Si se interrumpe Windows, el estado quedará pendiente de revisión.');}});
 win.once('ready-to-show',()=>win.show());win.loadFile(path.join(__dirname,'ui/index.html')).catch(fatal);
}).catch(fatal);
app.on('window-all-closed',()=>app.quit());
