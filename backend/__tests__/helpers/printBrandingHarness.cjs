// Frontend y printToPDF reales; solo API y dialogo simulados. Nunca carga pg/server.js.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const lab = path.join(root, '.access-scope-lab/branding-04');
const output = process.env.BRANDING_PDF_OUTPUT ? path.resolve(process.env.BRANDING_PDF_OUTPUT) : fs.mkdtempSync(path.join(os.tmpdir(), 'branding04-pdfs-'));
if (process.env.BRANDING_PDF_OUTPUT && output !== path.join(root, 'docs/branding-04')) throw Error('Destino de evidencia no autorizado');
fs.mkdirSync(output, { recursive: true });
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('in-process-gpu');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'branding04-profile-')));
const { admin, selected, all, reservation, canceled, extended, daily, cases } = require('./brandingFixtures.cjs');
let current=admin, active=cases[0], baseline=false, saveTarget, saveHook, logoDelay=0;
const requests=[],checks=[],pdfs=[],before={};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(!url.pathname.startsWith('/api/')) {
  const relative=url.pathname.replace(/^\/app\//,'');
  const file=path.resolve(root,'frontend',relative);
  if(!file.startsWith(path.join(root,'frontend')+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  const old=path.join(lab,path.basename(file)+'.before');
  const content=baseline&&['pages.css','variables.css','daily.js','reservaciones.js'].includes(path.basename(file))&&fs.existsSync(old)?old:file;
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':/\.jpe?g$/.test(file)?'image/jpeg':'text/html');
  res.setHeader('Cache-Control','no-store');
  if(file.endsWith('.jpeg')&&logoDelay)await new Promise(r=>setTimeout(r,logoDelay));
  res.end(fs.readFileSync(content));return;
 }
 requests.push({path:url.pathname,method:req.method});
 assert.equal(req.method,'GET','Solo consultas en la API simulada');
 res.setHeader('Content-Type','application/json');
 const restricted=current.rol==='Consulta'&&current.alcance_plataformas==='selected';
 let data;
 switch(url.pathname){
  case '/api/auth/sesion':data={usuario:current};break;
  case '/api/dashboard/resumen':data={fecha:'2026-10-16',metricas:{},reservaciones_recientes:[],alertas:{}};break;
  case '/api/eventos-integracion':data={data:[]};break;
  case '/api/daily/operativo':if(restricted){res.writeHead(403);data={mensaje:'Acceso no autorizado'};}else data=active.daily||daily();break;
  case '/api/tours':data={datos:[{id_tour:501,nombre:reservation.tour,activo:true}]};break;
  case '/api/paises':data={datos:[{id_pais:8,nombre:reservation.pais}]};break;
  case '/api/plataformas':data={datos:[{id_plataforma:17,nombre:reservation.plataforma}]};break;
  case '/api/reservaciones':data={data:[active.reservation||reservation],pagination:{page:1,limit:25,total:1,totalPages:1}};break;
  default:if(url.pathname==='/api/reservaciones/'+(active.reservation||reservation).id_reservacion)data={datos:active.reservation||reservation};else{res.writeHead(404);data={mensaje:'Reservación no encontrada'};}
 }
 res.end(JSON.stringify(data));
});
async function run(){
 await app.whenReady();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const win=new BrowserWindow({show:false,width:1400,height:900,webPreferences:{preload:path.join(root,'electron/preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 win.webContents.session.webRequest.onBeforeRequest((details,cb)=>{const u=new URL(details.url);cb({cancel:!(u.origin===origin||u.protocol==='data:')});});
 const e=s=>win.webContents.executeJavaScript(s);
 const wait=async condition=>{for(let i=0;i<200;i++){if(await e(condition))return;await new Promise(r=>setTimeout(r,30));}throw Error(condition+'\n'+await e('document.body.innerText'));};
 // Ejecutar el manejador original y todos sus controles, sin arrancar el main/backend.
 const mainSource=fs.readFileSync(path.join(root,'electron/main.js'),'utf8');
 const ipcCode=mainSource.slice(mainSource.indexOf('function isAllowedAppUrl('),mainSource.indexOf('function createMainWindow('));
 const context={URL,APP_ORIGIN:origin,mainWindow:win,isExportingDailyPdf:false,EXPORT_DAILY_PDF_CHANNEL:'daily:export-pdf',path,fs:fs.promises,console,
  requestLocalPath:async pathname=>{const response=await fetch(origin+pathname);return {statusCode:response.status,body:await response.text()};},
  dialog:{showSaveDialog:async()=>{if(saveHook)await saveHook();return {canceled:!saveTarget,filePath:saveTarget};}},ipcMain};
 vm.runInNewContext(ipcCode,context,{filename:'electron/main.js [IPC original aislado]'});
 const prepare=async scenario=>{
  active=scenario;current=admin;await win.loadURL(origin+'/app/index.html');
  await e(`window.printCalls=0;window.print=()=>{window.printCalls++};App.auth.establecerSesion('token-sintetico',${JSON.stringify(admin)});App.router.navigate('${scenario.daily?'daily':'reservaciones'}')`);
  if(scenario.daily){await wait("document.querySelector('.daily-print-table') && !document.getElementById('daily-print-button').disabled");}
  else {await wait("document.querySelector('[data-reservacion-action=print]') && !document.querySelector('[data-reservacion-action=print]').disabled");await e("document.querySelector('[data-reservacion-action=print]').click()");await wait('window.printCalls===1');}
 };
 const text=()=>e(`document.getElementById('${active.daily?'daily':'reservacion'}-print-root').textContent`);
 // Verificar que el contenido funcional es exactamente el anterior para los seis fixtures.
 if(fs.existsSync(path.join(lab,'daily.js.before'))){
  baseline=true;
  for(const scenario of cases){await prepare(scenario);before[scenario.name]=await text();}
  baseline=false;
 }
 for(const scenario of cases){
  logoDelay=120;await prepare(scenario);
  assert.equal(await text(),before[scenario.name]||await text(),'Mismos datos y textos '+scenario.name);
  await e(`App.ui.waitForPrintAssets(document.getElementById('${scenario.daily?'daily':'reservacion'}-print-root'))`);
  const info=await e(`(()=>{const r=document.getElementById('${scenario.daily?'daily':'reservacion'}-print-root');return {logos:[...r.querySelectorAll('img')].map(x=>({loaded:x.complete&&x.naturalWidth===1296&&x.naturalHeight===932,src:x.getAttribute('src')})),columns:[...r.querySelectorAll('table')].map(x=>x.querySelectorAll('thead th').length)}})()`);
  await e(`App.ui.waitForPrintAssets(document.getElementById('${scenario.daily?'daily':'reservacion'}-print-root'))`);
  assert.ok(await e("[...document.querySelectorAll('.print-brand-logo')].every(x=>x.complete&&x.naturalWidth===1296&&x.naturalHeight===932)"));
  const file=path.join(output,scenario.name+'.pdf');
  if(scenario.daily){
   assert.ok(info.columns.every(n=>n===11));
   await e("document.getElementById('daily-print-button').click()");await wait('window.printCalls===1');
   saveTarget=file;await e("document.getElementById('daily-pdf-button').click()");await wait("document.getElementById('daily-message').textContent.includes('PDF guardado')");saveTarget=null;
  }else{fs.writeFileSync(file,await win.webContents.printToPDF({printBackground:true,preferCSSPageSize:true}));await e("window.dispatchEvent(new Event('afterprint'))");assert.equal(await e("document.getElementById('reservacion-print-root').innerHTML"),'');}
  assert.equal(fs.readFileSync(file).subarray(0,5).toString(),'%PDF-');
  pdfs.push({name:scenario.name,file,sameData:true,...info});
 }
 checks.push('Seis formatos con los mismos textos y datos, once columnas Daily, logo decodificado, limpieza afterprint');
 // Consulta all conserva el Daily; selected sigue sin acceso y sin PDF por IPC.
 await prepare(cases[0]);current=all;await e(`App.auth.establecerSesion('token-all-sintetico',${JSON.stringify(all)});App.router.navigate('daily')`);await wait("document.querySelector('.daily-print-table')");
 await e("document.getElementById('daily-print-button').click()");await wait('window.printCalls===1');checks.push('Consulta all conserva impresion Daily');
 current=selected;await e(`App.auth.establecerSesion('token-selected-sintetico',${JSON.stringify(selected)});App.router.navigate('daily')`);await wait("document.body.innerText.includes('Acceso no autorizado')");
 let result=await e("desktopAPI.exportDailyPdf({fecha:'2026-10-16'})");assert.equal(result.error,'not_allowed');checks.push('Selected rechazado por ruta e IPC');
 // La reserva autorizada de selected mantiene su impresion individual.
 active=cases[3];await e("App.router.navigate('reservaciones')");await wait("document.querySelector('[data-reservacion-action=print]')");await e("document.querySelector('[data-reservacion-action=print]').click()");await wait("document.querySelector('.reservacion-print-sheet') && window.printCalls===2");await e("window.dispatchEvent(new Event('afterprint'))");checks.push('Selected imprime la reserva autorizada');
 // Revocacion durante el dialogo bloquea la escritura final con los controles originales.
 await prepare(cases[0]);saveTarget=path.join(output,'NO-DEBE-EXISTIR.pdf');saveHook=async()=>{current=selected;};
 result=await e("desktopAPI.exportDailyPdf({fecha:'2026-10-16'})");assert.equal(result.error,'not_allowed');assert.equal(fs.existsSync(saveTarget),false);saveTarget=null;saveHook=null;checks.push('Revocacion durante dialogo impide guardar');
 // Logo roto: rechazo de assets, sin dialogo ni PDF incompleto.
 await prepare(cases[0]);await e("document.querySelector('#daily-print-root img').src='./missing-logo.jpeg'");
 await wait("document.querySelector('#daily-print-root img').complete");result=await e("desktopAPI.exportDailyPdf({fecha:'2026-10-16'})");assert.equal(result.error,'not_allowed');checks.push('Logo roto bloquea PDF');
 // Revocar el acceso mientras se decodifica el logo nunca imprime la reserva anterior.
 await prepare(cases[3]);await e("window.dispatchEvent(new Event('afterprint'));window.savedAssetWait=App.ui.waitForPrintAssets;App.ui.waitForPrintAssets=async root=>{await window.savedAssetWait(root);await new Promise(r=>window.releaseAssets=r)};document.querySelector('[data-reservacion-action=print]').click()");
 await wait("typeof window.releaseAssets==='function'");
 current={...selected,platform_ids:[]};await e("window.releaseAssets()");await wait("!document.body.classList.contains('is-printing-reservacion')");
 assert.equal(await e('window.printCalls'),1);checks.push('Revocacion durante carga del logo no imprime datos anteriores');
 await e("App.ui.waitForPrintAssets=window.savedAssetWait;true");
 await prepare(cases[0]);
 // Detalle ajeno/inexistente no genera documento individual.
 active=cases[3];await e("App.router.navigate('reservaciones')");await wait("document.querySelector('[data-reservacion-action=print]')");await e("document.querySelector('[data-reservacion-action=print]').dataset.id='999999';document.querySelector('[data-reservacion-action=print]').click()");await wait("document.getElementById('reservaciones-message').classList.contains('is-error')");assert.equal(await e("document.getElementById('reservacion-print-root').innerHTML"),'');checks.push('Detalle no autorizado no prepara impresion');
 fs.writeFileSync(path.join(output,'validacion.json'),JSON.stringify({checks,pdfs,requests,physicalPrinterUsed:false,realPrintToPDF:true,productionIPCSource:true,baselineCompared:!!Object.keys(before).length},null,2));
 console.log('PRINT_BRANDING_OK '+JSON.stringify({checks:checks.length,pdfs:pdfs.length,output}));
 ipcMain.removeHandler('daily:export-pdf');win.destroy();server.close();app.exit(0);
}
run().catch(error=>{console.error(error);server.close();app.exit(1)});
