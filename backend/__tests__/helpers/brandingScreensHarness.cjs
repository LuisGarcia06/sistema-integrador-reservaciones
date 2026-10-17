// Frontend real, API exclusivamente sintetica y sin servidor/DB del producto.
const {app,BrowserWindow}=require('electron');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {admin,selected,all,reservation,canceled,daily}=require('./brandingFixtures.cjs');
const root=path.resolve(__dirname,'../../..');
const output=process.env.BRANDING_SCREENS_OUTPUT?path.resolve(process.env.BRANDING_SCREENS_OUTPUT):fs.mkdtempSync(path.join(os.tmpdir(),'branding05-screens-'));
if(process.env.BRANDING_SCREENS_OUTPUT&&output!==path.join(root,'docs/branding-05'))throw Error('Destino de evidencia no autorizado');
fs.mkdirSync(output,{recursive:true});
app.disableHardwareAcceleration();app.commandLine.appendSwitch('in-process-gpu');app.commandLine.appendSwitch('force-device-scale-factor','1');app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'branding05-profile-')));
let user=admin;const requests=[],measurements=[],checks=[],errors=[];
const platforms=[{id_plataforma:17,nombre:'Canal sintético'},{id_plataforma:83,nombre:'Canal alterno sintético'}];
const users=[{...admin,id_rol:10,correo:'admin@example.test',estado:true},{...selected,id_rol:20,correo:'consulta@example.test',estado:true}];
const rows=Array.from({length:29},(_,i)=>({...reservation,id_reservacion:101+i,codigo:'SYN-B05-'+String(101+i),nombre_cliente:'Cliente sintético '+(i+1),fecha:i<3?'2020-01-05':'2026-10-16',estado:i===2?'Cancelada':'Programada',id_plataforma:i%2?83:17,plataforma:i%2?'Canal alterno sintético':'Canal sintético'}));
const operation={id_operacion_tour:1,id_tour:501,tour:reservation.tour,fecha:'2026-10-16',turno:'Mañana',numero_grupo:1,hora_inicio:'07:15:00',id_guia:1,guia:'Guía sintético',estado:'Preparada'};
const vehicle={id_vehiculo:1,identificador:'Vehículo sintético 1',nombre:'Vehículo sintético 1',placas:'SYN-001',color:'Blanco',capacidad:12,activo:true,estado:true};
const transport={...daily().operaciones[0].transportes[0],id_operacion_tour:1,id_vehiculo:1,id_operador:1,placas:vehicle.placas,color:'Blanco'};
const dailyData={...daily(),operaciones:[{...daily().operaciones[0],...operation,transportes:[transport]}]};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(!url.pathname.startsWith('/api/')){
  const file=path.resolve(root,'frontend','.'+url.pathname);
  if(!file.startsWith(path.join(root,'frontend')+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':/\.jpe?g$/.test(file)?'image/jpeg':'text/html');res.end(fs.readFileSync(file));return;
 }
 assert.equal(req.method,'GET','Solo GET contra el simulador');requests.push({path:url.pathname,query:url.search});
 res.setHeader('Content-Type','application/json');const restricted=user.rol==='Consulta'&&user.alcance_plataformas==='selected';let data;
 switch(url.pathname){
 case '/api/auth/sesion':data={usuario:user};break;
 case '/api/dashboard/resumen':data={fecha:'2026-10-16',alcance_parcial:restricted,metricas:{reservaciones_vigentes:7,pax_vigentes:19,grupos_preparados:1,grupos_pendientes:1},alertas:{},reservaciones_recientes:rows.filter(r=>!restricted||r.id_plataforma===17).slice(0,3),salidas_hoy:[]};break;
 case '/api/eventos-integracion':data={data:[]};break;
 case '/api/usuarios':data={datos:users};break;
 case '/api/usuarios/roles':data={datos:[{id_rol:10,nombre:'Administrador'},{id_rol:20,nombre:'Consulta'}]};break;
 case '/api/tours':data={datos:[{id_tour:501,nombre:reservation.tour,activo:true}]};break;
 case '/api/paises':data={datos:[{id_pais:8,nombre:'País sintético'}]};break;
 case '/api/plataformas':data={datos:restricted?platforms.slice(0,1):platforms};break;
 case '/api/guias':data={datos:[{id_guia:1,nombre:'Guía sintético',telefono:'0000000001',activo:true}]};break;
 case '/api/operadores':data={datos:[{id_operador:1,nombre:'Operador sintético',telefono:'0000000002',activo:true}]};break;
 case '/api/vehiculos':data={datos:[vehicle]};break;
 case '/api/operaciones/sugeridas':data={datos:[{...operation,pax_total:7,reservaciones_total:3,grupos_necesarios:1,grupos_preparados:1}],reservaciones_sin_turno:0};break;
 case '/api/operaciones':data={datos:[operation]};break;
 case '/api/transportes':data={datos:[transport]};break;
 case '/api/daily/operativo':if(restricted){res.writeHead(403);data={mensaje:'Acceso no autorizado'};}else data=dailyData;break;
 case '/api/bitacora':data={total:2,datos:[{id_bitacora:1,fecha:'2026-10-16T10:00:00Z',usuario:'Administrador sintético',usuario_correo:'admin@example.test',accion:'CREAR',id_reservacion:101,codigo_reservacion:'SYN-B05-101',descripcion:'Registro sintético para validar presentación de auditoría.'},{id_bitacora:2,fecha:'2026-10-16T10:15:00Z',usuario:'Administrador sintético',accion:'CANCELAR',id_reservacion:103,codigo_reservacion:'SYN-B05-103',descripcion:'Cancelación sintética para revisión visual.'}]};break;
 case '/api/reservaciones':{
  let visible=rows.filter(r=>!restricted||r.id_plataforma===17);
  if(url.searchParams.has('fecha_hasta'))visible=visible.filter(r=>r.fecha<=url.searchParams.get('fecha_hasta'));
  if(url.searchParams.get('codigo'))visible=visible.filter(r=>r.codigo===url.searchParams.get('codigo'));
  if(url.searchParams.get('nombre'))visible=visible.filter(r=>r.nombre_cliente.toLowerCase().includes(url.searchParams.get('nombre').toLowerCase()));
  const page=Number(url.searchParams.get('page')||1),limit=Number(url.searchParams.get('limit')||25);
  data={data:visible.slice((page-1)*limit,page*limit),pagination:{page,limit,total:visible.length,totalPages:Math.ceil(visible.length/limit)},resumen_tours:[]};break;
 }
 default:{const id=Number(url.pathname.split('/').pop());const row=rows.find(r=>r.id_reservacion===id&&(!restricted||r.id_plataforma===17));if(url.pathname.startsWith('/api/reservaciones/')&&row)data={datos:row};else{res.writeHead(404);data={mensaje:'No encontrado en simulador'};}}
 }
 res.end(JSON.stringify(data));
});
async function run(){
 await app.whenReady();await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const win=new BrowserWindow({show:false,width:1366,height:768,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 win.webContents.on('console-message',(_event,...args)=>{if(args[0]===3)errors.push(String(args[1]));});
 win.webContents.session.webRequest.onBeforeRequest((details,cb)=>{const u=new URL(details.url);const allowed=u.origin===origin||u.protocol==='data:';if(!allowed)errors.push('Red externa bloqueada');cb({cancel:!allowed});});
 const e=async s=>{try{return await win.webContents.executeJavaScript(s);}catch(error){throw Error(s+': '+error.message);}};
 const wait=async condition=>{for(let i=0;i<180;i++){if(await e("Boolean("+condition+")"))return;await new Promise(r=>setTimeout(r,30));}throw Error('DOM: '+condition+'\n'+await e('document.body.innerText'));};
 const route=async name=>{await e(`location.hash==='#/${name}'?App.router.renderRoute():App.router.navigate('${name}')`);await wait(`location.hash==='#/${name}' && ![...document.querySelectorAll('[aria-busy=true]')].some(x=>x.getBoundingClientRect().width)`);await new Promise(r=>setTimeout(r,110));};
 const capture=async(name)=>{
  await e('scrollTo(0,0);new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const m=await e(`(()=>{const d=document.documentElement,root=document.getElementById('page-root');const visible=x=>x.getBoundingClientRect().width>0;return {viewport:[innerWidth,innerHeight],documentWidth:d.scrollWidth,rootWidth:root.clientWidth,rootScroll:root.scrollWidth,sidebar:document.querySelector('.sidebar')?.getBoundingClientRect().width,font:getComputedStyle(document.body).fontFamily,errors:[...document.querySelectorAll('.is-error')].filter(visible).map(x=>x.textContent),tables:[...document.querySelectorAll('table')].filter(visible).map(t=>({className:t.className,width:t.getBoundingClientRect().width,parentWidth:t.parentElement.clientWidth,parentOverflow:getComputedStyle(t.parentElement).overflowX})),dialog:[...document.querySelectorAll('[role=dialog]')].filter(visible).map(x=>({width:x.getBoundingClientRect().width,height:x.getBoundingClientRect().height,scroll:x.scrollHeight})),overflowElements:[...root.querySelectorAll('input,select,textarea,form')].filter(visible).filter(x=>x.getBoundingClientRect().right>innerWidth+1).map(x=>({tag:x.tagName,id:x.id,right:x.getBoundingClientRect().right}))}})()`);
  measurements.push({name,...m});
  fs.writeFileSync(path.join(output,name+'.png'),(await win.webContents.capturePage()).toPNG());
  assert.ok(m.documentWidth<=m.viewport[0],name+': desborde global '+JSON.stringify(m));
  assert.equal(m.overflowElements.length,0,name+': controles fuera de ventana '+JSON.stringify(m.overflowElements));
  assert.equal(m.errors.length,0,name+': error inesperado '+m.errors.join(','));
 };
 const close=async id=>{await e(`document.getElementById('${id}').click()`);};
 for(const [width,height] of [[1366,768],[1024,640]]){
  win.setContentSize(width,height);user=admin;await win.loadURL(origin+'/index.html');await wait("document.getElementById('login-form')");await capture('login-'+width);
  await e(`App.auth.establecerSesion('token-sintetico',${JSON.stringify(admin)});App.router.navigate('dashboard')`);
  for(const name of ['dashboard','reservaciones','historial','usuarios','operaciones','daily','configuracion','bitacora']){
   await route(name);await wait("!document.body.innerText.includes('Cargando catálogos')");await capture(name+'-'+width);
   if(name==='dashboard'){
    assert.equal(await e("getComputedStyle(document.querySelector('.nav-link.is-active')).backgroundColor"),'rgb(1, 22, 137)');
    win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('DOM.enable');await win.webContents.debugger.sendCommand('CSS.enable');
    const dom=await win.webContents.debugger.sendCommand('DOM.getDocument');const button=await win.webContents.debugger.sendCommand('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'.dashboard-actions .btn-primary'});
    await win.webContents.debugger.sendCommand('CSS.forcePseudoState',{nodeId:button.nodeId,forcedPseudoClasses:['focus-visible']});
    assert.equal(await e("getComputedStyle(document.querySelector('.dashboard-actions .btn-primary')).outlineColor"),'rgb(1, 22, 137)');
    await win.webContents.debugger.sendCommand('CSS.forcePseudoState',{nodeId:button.nodeId,forcedPseudoClasses:['hover']});await new Promise(r=>setTimeout(r,220));
    assert.equal(await e("getComputedStyle(document.querySelector('.dashboard-actions .btn-primary')).backgroundColor"),'rgb(0, 107, 100)');
    await win.webContents.debugger.sendCommand('CSS.forcePseudoState',{nodeId:button.nodeId,forcedPseudoClasses:[]});win.webContents.debugger.detach();checks.push('Hover y foco emulados '+width);
    await e("document.getElementById('sidebar-toggle').click()");await capture('dashboard-menu-alterno-'+width);await e("document.getElementById('sidebar-toggle').click()");
   }
   if(name==='reservaciones'){
    await e("document.querySelector('[data-reservacion-action=view]').click()");await wait("document.getElementById('reservaciones-dialog')");await capture('reservacion-detalle-'+width);await close('reservaciones-close');
    await e("document.getElementById('reservaciones-nueva').click()");await wait("document.getElementById('reservaciones-dialog')");await capture('reservacion-nueva-'+width);await close('reservaciones-close');
    await e("document.querySelector('[data-reservacion-action=cancel]').click()");await wait("document.getElementById('reservaciones-cancel-dialog')");await capture('reservacion-cancelacion-'+width);await close('reservaciones-cancel-close');
    await e("document.getElementById('reservaciones-pagination-next').click()");await wait("document.getElementById('reservaciones-pagination-summary').innerText.includes('26')");checks.push('Paginacion real de frontend '+width);
    await e("document.getElementById('reservaciones-codigo').value='SYN-B05-101';document.getElementById('reservaciones-filtros').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}))");await wait("document.getElementById('reservaciones-pagination-summary').innerText.includes('1 de 1')");checks.push('Filtro codigo '+width);
   }
   if(name==='historial'){await e("document.querySelector('[data-historial-action=view]').click()");await wait("document.getElementById('historial-dialog')");await capture('historial-detalle-'+width);await close('historial-close');}
   if(name==='usuarios'){await e("document.getElementById('usuarios-nuevo').click()");await wait("document.getElementById('usuarios-dialog')");await e("document.getElementById('usuario-rol').value='20';document.getElementById('usuario-rol').dispatchEvent(new Event('change'))");await capture('usuario-consulta-'+width);await close('usuarios-close');}
   if(name==='operaciones'){
    await e("document.getElementById('operaciones-new').click()");await wait("document.getElementById('operacion-dialog')");await capture('operacion-nueva-'+width);await close('operacion-close');
    await e("document.querySelector('[data-manage-transportes]').click()");await wait("document.querySelector('[data-edit-transporte]') && !document.getElementById('transporte-new').disabled");await capture('transportes-'+width);
    await e("document.querySelector('[data-edit-transporte]').click()");await wait("document.getElementById('transporte-form')");await capture('transporte-editar-'+width);await route('operaciones');
   }
   if(name==='configuracion'){await e("document.querySelector('[data-catalog-tab=vehiculos]').click()");await wait("document.body.innerText.includes('SYN-001')");await e("document.getElementById('catalogos-new').click()");await wait("document.getElementById('catalogo-form')");await capture('vehiculo-nuevo-'+width);await close('catalogo-close');}
  }
  checks.push('Nueve pantallas y dialogos '+width+'x'+height);
 }
 for(const u of [all,selected]){
  user=u;await e(`App.auth.establecerSesion('token-sintetico',${JSON.stringify(u)});App.router.navigate('dashboard')`);await wait("document.querySelector('.dashboard-metric-card')");
  const menu=await e("[...document.querySelectorAll('.nav-link')].map(x=>x.dataset.routeId)");
  assert.deepEqual(menu,u.alcance_plataformas==='selected'?['dashboard','reservaciones']:['dashboard','reservaciones','operaciones','daily','historial','configuracion']);
  if(u.alcance_plataformas==='selected'){await route('historial');assert.equal(await e("document.body.innerText.includes('Acceso no autorizado')"),true);}
  checks.push('Menu y acceso '+u.alcance_plataformas);
 }
 assert.equal(errors.length,0,'Errores renderer/red: '+errors.join(';'));
 fs.writeFileSync(path.join(output,'validacion.json'),JSON.stringify({measurements,checks,errors,requests},null,2));
 console.log('BRANDING_SCREENS_OK '+JSON.stringify({captures:measurements.length,checks:checks.length}));win.destroy();server.close();app.exit(0);
}
run().catch(error=>{fs.writeFileSync(path.join(output,'fallo.json'),JSON.stringify({measurements,checks,errors,message:error.message},null,2));console.error(error);server.close();app.exit(1)});
