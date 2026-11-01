const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..'),output=path.join(root,'docs/centro-avisos');
app.disableHardwareAcceleration();app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'ctsk-centro-ui-')));
const actors=[null,{id_usuario:1,nombre:'Reservas aisladas',rol:'Administrador',alcance_plataformas:'all',platform_ids:[]},{id_usuario:2,nombre:'Visualización aislada',rol:'Consulta',alcance_plataformas:'all',platform_ids:[]},{id_usuario:3,nombre:'Consulta limitada',rol:'Consulta',alcance_plataformas:'selected',platform_ids:[1]}];
const calls=[],checks=[],errors=[];let win,changed=false;
const group=(id,day,type='new_booking')=>({id_evento_integracion:id,provider:'getyourguide',external_booking_id:'GYGUI'+String(id).padStart(5,'0'),event_type:type,review_status:'pending_review',application_status:'not_applied',service_date:day,event_count:3,pendientes:3,urgent:day==='2026-10-21',source_received_at:'2026-10-21T19:00:00Z'});
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(!url.pathname.startsWith('/api/')){const file=path.resolve(root,'frontend','.'+url.pathname);if(!file.startsWith(path.join(root,'frontend')+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.jpg')?'image/jpeg':'text/html');return res.end(fs.readFileSync(file));}
 res.setHeader('Content-Type','application/json');const actor=actors[Number((req.headers.authorization||'').replace('Bearer user-',''))];if(!actor){res.statusCode=401;return res.end('{}');}
 calls.push({path:url.pathname,query:Object.fromEntries(url.searchParams),method:req.method,actor:actor.id_usuario});let data;
 if(url.pathname==='/api/auth/sesion')data={usuario:actor};
 else if(url.pathname==='/api/dashboard/resumen')data={fecha:url.searchParams.get('fecha'),metricas:{reservaciones_vigentes:changed?3:2,pax_vigentes:changed?18:14,grupos_preparados:1,grupos_pendientes:1},avisos:{pendientes:40,urgentes:3,sin_revisar:36,historicos:30,sin_fecha:4},alertas:{},reservaciones_recientes:[],salidas_hoy:[]};
 else if(url.pathname==='/api/eventos-integracion/resumen')data={datos:{environment_id:'6'.repeat(24),generated_at:new Date().toISOString(),counts:{pending:0,actionable:0,requires_archive:0,requires_schedule_review:0},events:[]}};
 else if(url.pathname==='/api/eventos-integracion/centro'){
   const q=url.searchParams,tab=q.get('tab'),page=Number(q.get('page')||1),id=page===2?26:1;
   let rows=[group(id,tab==='historico'?'2025-05-01':tab==='pendientes'?null:'2026-10-21')];
   if(q.get('q')==='NOEXISTE')rows=[];
   data={data:rows,pagination:{total:rows.length?40:0,page,limit:25,totalPages:rows.length?2:0}};
 }else if(/^\/api\/eventos-integracion\/centro\/\d+\/historial$/.test(url.pathname))data={data:[group(1,'2026-10-21'),group(2,'2026-10-22','modification'),group(3,'2026-10-22','cancellation')],pagination:{page:1,total:3,limit:25,totalPages:1}};
 else if(/^\/api\/eventos-integracion\/\d+$/.test(url.pathname))data={datos:{...group(1,'2026-10-21'),normalized_data:{date:'2026-10-21',customer_name:'Laboratorio'},application_preview:{missingFields:['pickup_time'],reservationData:{fecha:'2026-10-21'}},created_at:'2026-10-21T19:10:00Z'}};
 else if(url.pathname==='/api/reservaciones')data={data:[],pagination:{total:0,totalPages:0,page:1,limit:25},resumen_tours:[]};
 else data={datos:[]};res.end(JSON.stringify(data));
});
async function main(){
 await app.whenReady();await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 win=new BrowserWindow({show:false,width:1366,height:900,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 win.webContents.on('console-message',e=>{if(String(e.message).includes('Uncaught'))errors.push(e.message);});
 win.webContents.session.webRequest.onBeforeRequest((d,cb)=>cb({cancel:!(d.url.startsWith(origin+'/')||d.url.startsWith('data:'))}));
 await win.loadURL(origin+'/index.html');const js=async code=>{try{return await win.webContents.executeJavaScript(code);}catch(e){throw Error(code.slice(0,240)+' : '+e.message);}};
 async function wait(expression){for(let i=0;i<200;i++){if(await js('Boolean('+expression+')'))return;await new Promise(r=>setTimeout(r,25));}throw Error(expression);}
 async function waitCall(predicate){for(let i=0;i<200;i++){if(predicate(calls))return;await new Promise(r=>setTimeout(r,25));}throw Error('Solicitud esperada no recibida');}
 async function click(selector){await js(`document.querySelector(${JSON.stringify(selector)}).click()`);}
 async function session(id){await js(`App.auth.establecerSesion('user-${id}',${JSON.stringify(actors[id])});App.router.navigate('dashboard')`);await wait("document.getElementById('dashboard-live-summary')");}
 await session(1);await wait("document.querySelectorAll('[data-centro-group]').length===1");
 assert.equal(await js("document.querySelectorAll('.dashboard-metric-card').length"),4);assert.equal(await js("document.querySelectorAll('.dashboard-notice-grid button').length"),3);checks.push('Cuatro tarjetas y tres indicadores con datos del backend');
 await click('[data-centro-tab=pendientes]');await wait("document.querySelector('[data-centro-group]')?.textContent.includes('sin determinar')");checks.push('Pendientes incluye fecha no reconocible');
 await click('[data-centro-tab=historico]');await wait("document.querySelector('[data-centro-group]')?.textContent.includes('01/05/2025')");checks.push('Histórico accesible sin archivar ni modificar eventos');
 await click('[data-centro-tab=prioritarios]');await wait("document.querySelector('[data-centro-group]')?.textContent.includes('21/10/2026')");
 await js("document.querySelector('[data-centro-group]').open=true");await wait("document.querySelectorAll('[data-centro-review]').length===3");checks.push('Grupo expandible muestra nueva modificación y cancelación individuales');
 await click('[data-centro-review]');await wait("document.getElementById('dashboard-integration-dialog-host').textContent.includes('Laboratorio')");
 await click('[data-dialog-action=close]');checks.push('Consulta individual reutiliza revisión manual existente');
 await click('[data-centro-page="1"]');await wait("document.querySelector('[data-centro-group]')?.textContent.includes('GYGUI00026')");checks.push('Paginación solicita segunda página del backend');
 await js("document.querySelector('#centro-filters [name=q]').value='NOEXISTE';document.getElementById('centro-filters').requestSubmit()");await wait("document.getElementById('centro-results').textContent.includes('No hay avisos')");
 assert.equal(calls.filter(c=>c.path.endsWith('/centro')).at(-1).query.q,'NOEXISTE');checks.push('Búsqueda llega parametrizada al backend y maneja vacío');
 await click('#centro-clear');await wait("document.querySelector('[data-centro-group]')");
 await click('[data-dashboard-avisos=urgentes]');await wait("document.querySelector('#centro-filters [name=urgent]').value==='true'");await wait("document.querySelector('[data-centro-group]')");
 await waitCall(c=>c.filter(x=>x.path.endsWith('/centro')).at(-1).query.urgent==='true');checks.push('Indicador urgente abre Centro con filtro correspondiente');
 await js("document.querySelector('#centro-filters [name=q]').value='GYGUI';document.getElementById('centro-filters').requestSubmit()");await wait("document.querySelector('[data-centro-group]')");
 await js("App.router.navigate('reservaciones')");await wait("location.hash==='#/reservaciones'");await js("App.router.navigate('dashboard')");await wait("document.getElementById('centro-filters')");assert.equal(await js("document.querySelector('#centro-filters [name=q]').value"),'GYGUI');checks.push('Navegar conserva filtros del Centro dentro de la sesión');
 changed=true;await js("window.dispatchEvent(new Event('datosactualizados'))");await wait("document.querySelector('.dashboard-metric-card .metric-value').textContent==='3'");assert.equal(await js("document.querySelector('#centro-filters [name=q]').value"),'GYGUI');checks.push('Cambios operativos actualizan métricas sin reinicio y conservan filtros');
 await js("document.getElementById('dashboard-fecha').value='2026-10-22';document.getElementById('dashboard-fecha').dispatchEvent(new Event('change'))");await wait("document.querySelector('.dashboard-today')?.textContent.includes('22 de octubre')");await wait("document.querySelector('[data-centro-group]')");
 await waitCall(c=>c.filter(x=>x.path.endsWith('/centro')).at(-1).query.date==='2026-10-22');checks.push('Cambiar fecha actualiza resumen y clasificación');
 for(const width of [1366,1024,600]){win.setContentSize(width,900);await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');assert.equal(await js('document.documentElement.scrollWidth<=innerWidth'),true,'overflow '+width);fs.writeFileSync(path.join(output,'centro-'+width+'.png'),(await win.webContents.capturePage()).toPNG());await js("document.getElementById('dashboard-integration-section').scrollIntoView({block:'start'})");await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');fs.writeFileSync(path.join(output,'centro-panel-'+width+'.png'),(await win.webContents.capturePage()).toPNG());}checks.push('Interfaz sin desbordamiento a 1366, 1024 y 600 px');
 await session(2);await wait("document.querySelector('[data-centro-group]')");await js("document.querySelector('[data-centro-group]').open=true");await wait("document.querySelector('[data-centro-review]')");await click('[data-centro-review]');await wait("document.getElementById('dashboard-integration-dialog-host').textContent.includes('Laboratorio')");assert.equal(await js("Array.from(document.querySelectorAll('[data-dialog-action]')).some(b=>!['close'].includes(b.dataset.dialogAction))"),false);checks.push('Visualización consulta avisos sin acciones de escritura');
 await session(3);assert.equal(await js("Boolean(document.getElementById('centro-filters'))"),false);assert.equal(await js("document.querySelectorAll('.dashboard-notice-grid button').length"),0);checks.push('Consulta limitada sin Centro global ni indicadores externos');
 await js("App.auth.limpiarSesion();App.router.navigate('login')");await wait("!document.getElementById('dashboard-live-summary')");await session(1);await wait("document.getElementById('centro-filters')");assert.equal(await js("document.querySelector('#centro-filters [name=q]').value"),'');checks.push('Cierre de sesión limpia datos y filtros');
 assert.deepEqual(errors,[]);assert(calls.every(c=>c.method==='GET'));const result={status:'PASSED',checks,mockApi:true,realPostgres:false};fs.writeFileSync(path.join(output,'electron-ui.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
main().catch(e=>{console.error('CENTRO_UI_FAILED',e.message);process.exitCode=1;}).finally(()=>{win?.destroy();server.close();app.quit();});
