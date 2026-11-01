'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{EventEmitter}=require('node:events');
const Startup=require('../../electron/enterprise026Startup');
const root=path.resolve(__dirname,'../..');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function clientHarness(options={}){
 const logs=[],dialogs=[],events={},calls=[],windows=[];let quit=0,stopped=0;
 class Window extends EventEmitter{constructor(settings){super();this.settings=settings;this.webContents=new EventEmitter();this.webContents.session={webRequest:{onBeforeRequest(){}},setPermissionRequestHandler(){},setPermissionCheckHandler(){}};this.webContents.setWindowOpenHandler=()=>{};this.webContents.executeJavaScript=async()=>{};windows.push(this);}setMenuBarVisibility(){}maximize(){}show(){}isDestroyed(){return false;}async loadURL(){calls.push('loadURL');if(options.loadError)throw Error('private-path');}}
 const app={getPath:()=> 'C:\\Temp',setPath(){},whenReady:()=>Promise.resolve(),requestSingleInstanceLock:()=>true,commandLine:{appendSwitch(){}},quit(){quit++;},on:(name,fn)=>{events[name]=fn;}};
 const electron={app,BrowserWindow:Window,dialog:{showMessageBox:async value=>{dialogs.push(value);if(options.dialogWait)await options.dialogWait;}},ipcMain:{handle(){}},session:{fromPartition:()=>({})}};
 const args=options.argv||['electron.exe','--ctsk-descriptor=C:\\Synthetic\\client026.json','--ctsk-trust=C:\\Synthetic\\authority026.json'];
 vm.runInNewContext(fs.readFileSync(path.join(root,'electron/enterprise026Main.js'),'utf8'),{
  __dirname:'C:\\Synthetic\\app\\electron',process:{argv:args,env:options.env||{},on(){}},console:{log:s=>logs.push(s),error:s=>logs.push(s)},URL,
  require(id){if(id==='electron')return electron;if(id==='node:path')return path.win32;if(id==='node:fs/promises')return {};
   if(id==='node:fs')return {statSync(){if(options.missing)throw Object.assign(Error('secret'),{code:'ENOENT'});return {isFile:()=>true};}};
   if(id==='../shared/release026')return {confineModules(){}};
   if(id==='./enterprise026Startup')return Startup;
   if(id==='./enterprise026ClientPolicy')return {readClient(){calls.push('readClient');if(options.policyError)throw Error(options.policyError);return {directory:'C:\\Synthetic',origin:'https://127.0.0.1:43210',port:43210,installationId:'synthetic'};}};
   if(id==='./enterprise026Tls')return {installTrust(){calls.push('installTrust');}};
   if(id==='./enterprise026Backend')return {async connect(c){calls.push('connect');if(options.connectError)throw Object.assign(Error('secret'),{code:options.connectError});await c.onReady();return {stop(){stopped++;}};}};
   if(id.startsWith('.'))throw Error('UNEXPECTED_IMPORT:'+id);return require(id);
  }
 });return {logs,dialogs,calls,windows,get quit(){return quit;},get stopped(){return stopped;}};
}
for(const [label,options,code] of [
 ['sin argumentos',{argv:['electron.exe']},'PUBLIC_DESCRIPTOR_REQUIRED'],
 ['sin aprovisionamiento',{missing:true},'CLIENT_CONFIGURATION_REQUIRED'],
 ['ACL no acreditada',{policyError:'CONFIG_ACL'},'CONFIG_ACL'],
 ['autoridad vencida',{policyError:'ENROLLMENT_AUTHORITY'},'ENROLLMENT_AUTHORITY'],
 ['integridad inválida',{policyError:'RELEASE_INTEGRITY'},'RELEASE_INTEGRITY'],
 ['servidor apagado',{connectError:'ECONNREFUSED'},'ECONNREFUSED'],
 ['certificado rechazado',{connectError:'CERT_HAS_EXPIRED'},'START_FAILED'],
 ['bandera insegura',{argv:['electron.exe','--no-sandbox']},'UNSAFE_FLAGS'],
 ['entorno ajeno',{env:{DB_NAME:'sian_kaan_reservaciones'}},'ENV_CONFLICT']
])test('cliente muestra causa y no ventana principal: '+label,async()=>{
 const h=clientHarness(options);await tick();assert.equal(h.windows.length,0);assert.equal(h.dialogs.length,1);assert.ok(h.dialogs[0].detail.includes(code));assert.ok(h.logs.includes('CLIENT026_REJECTED '+code));assert.ok(!h.logs.includes('CLIENT026_READY'));assert.equal(h.quit,1);assert.ok(!JSON.stringify(h.dialogs).includes('secret'));
});
test('el cierre espera que el usuario lea el mensaje de configuración pendiente',async()=>{
 let release;const wait=new Promise(r=>{release=r;});const h=clientHarness({missing:true,dialogWait:wait});await tick();assert.equal(h.quit,0);assert.equal(h.dialogs[0].type,'info');release();await tick();assert.equal(h.quit,1);
});
test('READY exige inscripción, confianza TLS, identidad del backend y carga de página',async()=>{
 const h=clientHarness();await tick();assert.deepEqual(h.calls,['readClient','installTrust','connect','loadURL']);assert.ok(h.logs.includes('CLIENT026_READY'));assert.equal(h.windows.length,1);const p=h.windows[0].settings.webPreferences;assert.equal(p.sandbox,true);assert.equal(p.contextIsolation,true);assert.equal(p.nodeIntegration,false);assert.equal(p.webSecurity,true);assert.equal(h.quit,0);
});
test('una carga fallida no anuncia READY y detiene la conexión propia',async()=>{
 const h=clientHarness({loadError:true});await tick();assert.ok(!h.logs.includes('CLIENT026_READY'));assert.ok(h.logs.includes('CLIENT026_REJECTED CLIENT_PAGE_LOAD_FAILED'));assert.equal(h.stopped,1);
});
test('caída del renderer queda diferenciada de falta de configuración',async()=>{
 const h=clientHarness();await tick();h.windows[0].webContents.emit('render-process-gone');await tick();assert.ok(h.logs.includes('CLIENT026_REJECTED CLIENT_RENDERER_GONE'));assert.equal(h.stopped,1);
});
test('errores públicos no exponen texto desconocido ni credenciales',()=>{
 const info=Startup.errorInfo(Error('password=private C:\\Users\\private'));assert.equal(info.code,'START_FAILED');assert.ok(!JSON.stringify(info).includes('password='));
});
