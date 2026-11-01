// Electron real: se opera la tabla y el formulario de pages/reservaciones.js.
const {app,BrowserWindow,session:electronSession}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
if(!process.send)throw Error('RESERVATION_UI_REQUIRES_HARNESS');
app.disableHardwareAcceleration();app.commandLine.appendSwitch('in-process-gpu');
let input;const windows=[],checks=[],incoming=new Map();
process.on('message',msg=>{if(msg.type==='input'){input=msg;run().catch(fail);}else if(msg.type==='harness-error')fail(Error(msg.message));else{incoming.get(msg.type)?.(msg);incoming.delete(msg.type);}});
const ipc=(type,message)=>new Promise(resolve=>{incoming.set(type,resolve);if(message)process.send(message);});
const e=(win,source)=>win.webContents.executeJavaScript(source,true);
const model='App.reservationCommands.getSession()';
async function wait(win,expression){for(let i=0;i<850;i++){if(await e(win,'Boolean('+expression+')'))return;await new Promise(r=>setTimeout(r,20));}throw Error('RESERVATION_UI_WAIT '+expression+' '+await e(win,"document.getElementById('reservaciones-message')?.textContent+' '+document.getElementById('reservaciones-form-message')?.textContent+' '+document.getElementById('login-message')?.textContent"));}
function pass(text){checks.push(text);process.send({type:'progress',check:text});console.log('RESERVATION_UI_OK '+text);}
async function makeWindow(correo){
  const ses=electronSession.fromPartition('reservation-ui-'+windows.length);ses.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
  ses.webRequest.onBeforeRequest((details,cb)=>cb({cancel:!details.url.startsWith(input.origin+'/')}));
  const win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{session:ses,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});windows.push(win);
  win.webContents.setBackgroundThrottling(false);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',ev=>ev.preventDefault());
  const preferences=win.webContents.getLastWebPreferences();assert(preferences.sandbox&&preferences.contextIsolation&&preferences.webSecurity&&!preferences.nodeIntegration);
  await win.loadURL(input.origin+'/');
  await e(win,"window.confirmations=[];window.acceptConfirmation=true;window.confirm=text=>{confirmations.push(text);return acceptConfirmation;};window.writesIssued=0;window.photos=0;window.nativeFetch=fetch;window.fetch=(url,options)=>{if(new Headers(options?.headers).has('Idempotency-Key'))writesIssued++;if(url==='/api/precondiciones')photos++;return nativeFetch(url,options);};window.addEventListener('error',ev=>window.rendererFailure=ev.message)");
  await e(win,`document.getElementById('login-correo').value=${JSON.stringify(correo)};document.getElementById('login-password').value=${JSON.stringify(input.credentials.password)};document.getElementById('login-form').requestSubmit()`);
  await wait(win,"App.auth.estaAutenticado() && document.getElementById('reservaciones-codigo') && !document.getElementById('reservaciones-codigo').disabled");return win;
}
async function open(win,id,action='edit'){
  if(await e(win,"Boolean(document.getElementById('reservaciones-close'))")){
    await e(win,"document.getElementById('reservaciones-close').click()");await wait(win,"!document.getElementById('reservaciones-dialog')");
  }
  const code=await e(win,`App.api.apiFetch('/api/reservaciones/${id}').then(r=>r.datos.codigo)`);
  await e(win,`document.getElementById('reservaciones-codigo').value=${JSON.stringify(code)};document.getElementById('reservaciones-filtros').requestSubmit()`);
  const selector=`[data-reservacion-action="${action}"][data-id="${id}"]`;
  await wait(win,`document.querySelector(${JSON.stringify(selector)}) && !document.getElementById('reservaciones-codigo').disabled`);
  await e(win,`document.querySelector(${JSON.stringify(selector)}).click()`);
  await wait(win,"document.getElementById('reservaciones-form')"+(action==='edit'?` && ${model}?.state==='ready'`:''));
}
const field=(win,id,value)=>e(win,`document.getElementById(${JSON.stringify('reserva-'+id)}).value=${JSON.stringify(String(value))}`);
const values=win=>e(win,"Object.fromEntries([...document.querySelectorAll('#reservaciones-form [id^=reserva-]')].map(c=>[c.id,c.value]))");
async function save(win,state='confirmed'){
  await e(win,"document.getElementById('reservaciones-form').requestSubmit()");
  await wait(win,`${model}?.state===${JSON.stringify(state)} && !document.getElementById('reservaciones-close').disabled`+(state==='ready'?'':" && document.getElementById('command-state')"));
}
// En incertidumbre Cerrar permanece bloqueado; esperar el panel y recuperación habilitada.
async function uncertainSave(win){await e(win,"document.getElementById('reservaciones-form').requestSubmit()");await wait(win,`${model}?.state==='uncertain' && document.querySelector('[data-command-action=recover]') && !document.querySelector('[data-command-action=recover]').disabled`);}
async function recover(win,state='confirmed'){
  await e(win,"document.querySelector('[data-command-action=recover]').click()");
  await wait(win,`${model}?.state===${JSON.stringify(state)} && !document.querySelector('[data-command-action=recover]').disabled`);
}
const key=win=>e(win,model+'.command.key');
const counts=async(win,id)=>ipc('counts',{type:'counts',id,key:await key(win)});
async function screenshot(win,name){await e(win,"(document.querySelector('#conflict-title') || document.querySelector('#command-state') || document.querySelector('#reservaciones-dialog-title')).scrollIntoView();true");await e(win,'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))');fs.writeFileSync(path.join(input.output,name+'.png'),(await win.webContents.capturePage()).toPNG());}
async function run(){
  await app.whenReady();const f=input.fixtures,a=await makeWindow(input.credentials.correo),b=await makeWindow('segundo@standalone.example.test'),id=f.records[0].reservaciones;
  await open(a,id);
  const fields=['codigo','fecha','turno','tour','pais','plataforma','nombre','telefono','habitacion','idioma','notificado','pax','ninos','pickup-place','pickup-time','metodo-pago','vendedor','precio-total','deposito','saldo','tipo-cambio','observaciones'];
  assert.equal(await e(a,`JSON.stringify(${JSON.stringify(fields)}.filter(id=>!document.getElementById('reserva-'+id)))`),'[]');
  assert.equal(await e(a,"document.getElementById('reserva-codigo').disabled"),true);
  assert.equal(await e(a,"document.getElementById('reserva-nombre').maxLength"),120);
  assert.equal(await e(a,"document.getElementById('reserva-pax').min"),'1');
  assert.equal(await e(a,"document.getElementById('reserva-precio-total').step"),'0.01');
  assert.deepEqual(await e(a,"[...document.getElementById('reserva-turno').options].map(o=>o.value).filter(Boolean)"),['Mañana','Tarde']);
  for(const select of ['tour','pais','plataforma'])assert.notEqual(await e(a,`document.getElementById('reserva-${select}').value`),'');
  assert.equal(await e(a,"document.getElementById('reservaciones-dialog-title').textContent"),'Editar reservación');
  const original=await e(a,model+'.original'),noWrites=await e(a,'writesIssued');
  await e(a,"document.getElementById('reservaciones-form').requestSubmit()");await wait(a,"document.getElementById('reservaciones-form-message').textContent.includes('No hay cambios')");assert.equal(await e(a,'writesIssued'),noWrites);
  const valid=await values(a);
  for(const [name,value,warning]of [['nombre','','nombre'],['pax','0','PAX'],['ninos','99','Niños'],['pickup-place','','pickup'],['pickup-time','','hora'],['tour','','tour'],['pais','','país'],['plataforma','','plataforma'],['idioma','x'.repeat(51),'Idioma']]){
    await field(a,name,value);await e(a,"document.getElementById('reservaciones-form').requestSubmit()");
    assert.ok((await e(a,"document.getElementById('reservaciones-form-message').textContent")).toLowerCase().includes(warning.toLowerCase()));
    assert.equal(await e(a,'writesIssued'),noWrites);await field(a,name,valid['reserva-'+name]);
  }
  assert.equal(await e(a,'confirmations.length'),0);
  pass('Modal original: 22 campos, catálogos, turnos, límites, importes, nueve validaciones y guardado sin cambios conservados');
  const changed={telefono:'9980000000',habitacion:'Habitación original protegida',idioma:'Español sintético',notificado:'false',ninos:'1','pickup-time':'07:15','metodo-pago':'Efectivo',vendedor:'Vendedor sintético','precio-total':'1234.56',deposito:'100',saldo:'1134.56','tipo-cambio':'18.5',observaciones:'Campos originales <script> sin ejecución'};
  for(const [name,value]of Object.entries(changed))await field(a,name,value);
  await e(a,'window.acceptConfirmation=false');await save(a,'ready');assert.equal(await e(a,model+'.command'),null);assert.equal(await e(a,'writesIssued'),0);
  await e(a,'window.acceptConfirmation=true');await save(a);
  assert.equal(await e(a,`Object.isFrozen(${model}.command.body)`),true);assert.deepEqual(await e(a,model+'.original'),original);
  const current=await e(a,`App.api.apiFetch('/api/reservaciones/${id}').then(r=>r.datos)`);
  assert.equal(current.habitacion,changed.habitacion);assert.equal(current.notificado,false);assert.equal(Number(current.precio_total),1234.56);
  const photo=await e(a,`App.api.apiFetch('/api/precondiciones',{method:'POST',headers:{'X-CTSK-Protocol':'ctsk-command-api-v1'},body:{metodo:'PATCH',ruta:'/api/reservaciones/${id}',datos:{}}})`);
  assert.equal(BigInt(photo.revision),BigInt(original.revision)+1n);
  assert.equal(await e(a,"document.getElementById('reserva-codigo').disabled"),true);assert.equal(await e(a,"document.getElementById('reservaciones-submit').disabled"),true);
  let proof=await counts(a,id);assert.equal(proof.commands,1);assert.equal(proof.audit,1);assert.equal(proof.upstreamWrites,1);
  await screenshot(a,'modal-original-confirmado');
  pass('Confirmación cancelable sin UUID; guardado tipado único, revisión BIGINT incrementada, recibo en modal y sobre inmutable');

  await open(a,id);await open(b,id);await field(a,'habitacion','Administrador A');await field(a,'vendedor','Venta actual autorizada');await field(b,'habitacion','Propuesta B <script>');await field(b,'observaciones','Mi observación retenida');
  const draft=await values(b),stale=await e(b,model+'.original'),conflictPhotos=await e(b,'photos');await save(a);await save(b,'conflict');
  assert.equal(await e(b,'photos'),conflictPhotos);
  assert.equal(await e(b,model+'.error.status'),412);assert.deepEqual(await values(b),draft);assert.deepEqual(await e(b,model+'.original'),stale);
  assert.equal(await e(b,"document.querySelectorAll('#reservation-conflict-panel th').length"),5);assert.equal(await e(b,"document.querySelector('#reservation-conflict-panel script')"),null);
  assert.match(await e(b,"document.getElementById('reservation-conflict-panel').textContent"),/Administrador A/);await screenshot(b,'modal-original-conflicto-412');
  const staleKey=await key(b),photos=await e(b,'photos');await e(b,"window.acceptConfirmation=false;document.querySelector('[data-decision=review]').click()");await wait(b,"!document.querySelector('[data-decision=review]').disabled");assert.equal(await e(b,'photos'),photos);assert.equal(await key(b),staleKey);assert.deepEqual(await values(b),draft);
  await e(b,"window.acceptConfirmation=true;document.querySelector('[data-decision=review]').click()");await wait(b,model+"?.state==='ready' && !document.getElementById('reservaciones-submit').disabled");
  assert.equal(await e(b,"document.getElementById('reserva-habitacion').value"),'Propuesta B <script>');assert.equal(await e(b,"document.getElementById('reserva-vendedor').value"),'Venta actual autorizada');assert.equal(await e(b,model+'.command'),null);
  await save(b);assert.notEqual(await key(b),staleKey);
  pass('Dos administradores: 412 conserva todos los valores y compara tres versiones; renovar exige confirmación y solo entonces otra foto/clave');

  await open(b,id);await field(b,'observaciones','Contexto propuesto B');const contextDraft=await values(b);
  await ipc('fixture-changed',{type:'fixture-change',url:'/api/vehiculos/'+f.vehicles[0],body:{color:'Contexto sintético cambiado'}});await save(b,'conflict');
  assert.equal(await e(b,model+'.error.kind'),'context');assert.deepEqual(await values(b),contextDraft);assert.match(await e(b,"document.getElementById('reservation-conflict-panel').textContent"),/dependencias/);await screenshot(b,'modal-original-conflicto-409');
  await e(b,"window.acceptConfirmation=false;document.querySelector('[data-decision=current]').click()");await wait(b,"!document.querySelector('[data-decision=current]').disabled");assert.deepEqual(await values(b),contextDraft);
  await e(b,"window.acceptConfirmation=true;document.querySelector('[data-decision=current]').click()");await wait(b,model+"?.state==='ready' && !document.getElementById('reservaciones-submit').disabled");assert.notEqual(await e(b,"document.getElementById('reserva-observaciones').value"),'Contexto propuesto B');
  pass('409 de contexto conserva el formulario; usar datos actuales requiere confirmar el descarte y no guarda');

  await open(a,f.reservations[6]);await field(a,'habitacion','COMMIT con respuesta truncada');const lostDraft=await values(a),lostOriginal=await e(a,model+'.original');
  await ipc('armed',{type:'arm',mode:'truncate'});await uncertainSave(a);const lostKey=await key(a);assert.deepEqual(await values(a),lostDraft);assert.equal(await e(a,"document.getElementById('reservaciones-submit').disabled"),true);
  proof=await counts(a,f.reservations[6]);assert.equal(proof.audit,1);assert.equal(proof.commands,1);await screenshot(a,'modal-original-incierto');
  await ipc('recovery-error-ready',{type:'recovery-error'});await recover(a,'uncertain');assert.equal(await key(a),lostKey);
  await recover(a);assert.equal(await key(a),lostKey);assert.deepEqual(await e(a,model+'.original'),lostOriginal);assert.deepEqual(await values(a),lostDraft);
  await e(a,"document.querySelector('[data-command-action=current]').click()");await wait(a,"document.getElementById('current-command-data').textContent.includes('COMMIT con respuesta truncada')");assert.deepEqual(await values(a),lostDraft);
  proof=await counts(a,f.reservations[6]);assert.equal(proof.upstreamWrites,1);assert.equal(proof.audit,1);assert.equal(proof.commands,1);await screenshot(a,'modal-original-recuperado');
  await ipc('restarted',{type:'restart'});await recover(a);assert.equal(await key(a),lostKey);
  pass('Respuesta perdida después de COMMIT: formulario y comando retenidos; GET recupera un comando/bitácora incluso tras reiniciar backend; recibo no sustituye foto');

  const unknown=await makeWindow(input.credentials.correo);await open(unknown,f.reservations[3]);await field(unknown,'habitacion','Desconocido no concluyente');await ipc('armed',{type:'arm',mode:'before-write'});await uncertainSave(unknown);const unknownKey=await key(unknown),unknownDraft=await values(unknown);
  await recover(unknown,'uncertain');assert.equal(await e(unknown,model+'.recoveryError.kind'),'unknown');
  await e(unknown,"document.getElementById('reservaciones-form').requestSubmit();document.getElementById('reservaciones-close').dispatchEvent(new Event('click'));location.hash='#/operaciones'");await wait(unknown,"location.hash==='#/reservaciones'");
  assert.equal(await key(unknown),unknownKey);assert.deepEqual(await values(unknown),unknownDraft);assert.equal(await e(unknown,'writesIssued'),1);
  proof=await counts(unknown,f.reservations[3]);assert.equal(proof.commands,0);assert.equal(proof.audit,0);assert.equal(proof.upstreamWrites,0);await screenshot(unknown,'modal-original-desconocido');
  pass('Desconocido sigue no concluyente: no reenvía, no cambia clave, no permite cerrar/sustituir modal ni navegar fuera de alcance');

  const consulta=await makeWindow('consulta@standalone.example.test');
  assert.equal(await e(consulta,"document.querySelector('[data-reservacion-action=edit], [data-reservacion-action=cancel], #reservaciones-nueva')"),null);
  assert.equal(await e(consulta,`App.api.apiFetch('/api/reservaciones/${f.reservations[8]}').then(()=>200,x=>x.status)`),404);
  assert.equal(await e(consulta,`App.api.apiFetch('/api/reservaciones?limit=100').then(r=>JSON.stringify(r).includes('SYN-API-8'))`),false);
  await open(consulta,id,'view');assert.equal(await e(consulta,"document.getElementById('reservaciones-submit')"),null);assert.equal(await e(consulta,model),null);
  const denied=await e(consulta,`nativeFetch('/api/reservaciones/${id}',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+App.auth.obtenerToken(),'X-CTSK-Protocol':'ctsk-command-api-v1','X-CTSK-Data-Generation':${JSON.stringify(input.generation)},'Idempotency-Key':crypto.randomUUID(),'If-Match':${JSON.stringify(photo.etag)},'If-Operational-Match':${JSON.stringify(photo.contexto)}},body:'{}'}).then(r=>r.status)`);assert.equal(denied,403);assert.equal(await e(consulta,'writesIssued'),0);
  pass('Consulta restringido: detalle original de lectura, sin edición ni alta; lista y GET ocultan otra plataforma y backend deniega PATCH');

  await open(b,f.records[1].reservaciones);await field(b,'habitacion','Permisos cambiados durante respuesta');await ipc('armed',{type:'arm',mode:'hold'});const held=ipc('held');await e(b,"document.getElementById('reservaciones-form').requestSubmit()");const heldMessage=await held;
  await ipc('fixture-changed',{type:'fixture-change',url:'/api/usuarios/'+input.extraIds.usuario,body:{id_rol:input.extraIds.consultaRole,alcance_plataformas:'selected',platform_ids:[f.platform]}});
  await e(b,'App.auth.refrescarSesion()');await wait(b,`!${model} && !document.getElementById('reservaciones-form')`);await ipc('released',{type:'release'});
  assert.equal(await e(b,"document.getElementById('command-receipt')"),null);assert.equal(await e(b,"document.querySelector('[data-reservacion-action=edit]')"),null);
  assert.equal(await e(b,`nativeFetch('/api/comandos/${heldMessage.key}',{headers:{Authorization:'Bearer '+App.auth.obtenerToken(),'X-CTSK-Protocol':'ctsk-command-api-v1','X-CTSK-Data-Generation':${JSON.stringify(input.generation)}}}).then(r=>r.status)`),403);
  pass('Cambio de permisos mientras llega respuesta: invalida formulario/sobre/recibo; no resucita datos y recuperación histórica resulta denegada');

  for(const [method,url]of [['POST','/api/reservaciones'],['PATCH',`/api/reservaciones/${id}/cancelar`],['PATCH',`/api/reservaciones/${id}/transporte`],['PATCH','/api/usuarios/1'],['PUT','/api/daily/observaciones?fecha=2098-01-01']])assert.equal(await e(a,`nativeFetch(${JSON.stringify(url)},{method:${JSON.stringify(method)}}).then(r=>r.status)`),405);
  for(const asset of ['index.html','pages/operaciones.js','js/notificaciones.js','lab/command.html'])assert.equal(await e(a,`nativeFetch('/frontend/${asset}').then(r=>r.status)`),404);
  assert.equal(await e(a,"document.querySelector('[data-reservacion-action=cancel]')?.disabled"),true);
  assert.equal(await e(a,"document.getElementById('reservaciones-nueva').disabled"),true);
  assert.equal(await e(a,"App.api.apiFetch('/api/reservaciones/1',{method:'PATCH',body:{}}).then(()=>false,x=>x.kind)"),'blocked');
  assert.equal(await e(a,"nativeFetch('/api/reservaciones/1',{method:'PATCH',body:'{}'}).then(r=>r.status)"),428);
  for(const win of windows)assert.equal(await e(win,'window.rendererFailure || null'),null);
  pass('Lista cerrada: solo edición protegida, sin escritores heredados, otras pantallas, impresión ni integraciones; Electron mantiene aislamiento');
  fs.writeFileSync(path.join(input.output,'reservation-frontend-ui-checks.json'),JSON.stringify({checks,fields,screenshots:['modal-original-confirmado.png','modal-original-conflicto-412.png','modal-original-conflicto-409.png','modal-original-incierto.png','modal-original-recuperado.png','modal-original-desconocido.png']},null,2));
  process.send({type:'checks',checks});windows.forEach(w=>w.destroy());app.exit(0);
}
function fail(error){console.error(error.stack);windows.forEach(w=>{if(!w.isDestroyed())w.destroy();});app.exit(1);}
process.send({type:'ready'});
