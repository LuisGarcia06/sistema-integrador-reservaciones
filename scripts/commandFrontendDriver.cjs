const {app,BrowserWindow,session:electronSession}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
if(!process.send)throw Error('COMMAND_UI_REQUIRES_HARNESS');
app.disableHardwareAcceleration();app.commandLine.appendSwitch('in-process-gpu');
let input;const windows=[],checks=[],incoming=new Map(),uiActions=new Set();
process.on('message',msg=>{if(msg.type==='input'){input=msg;run().catch(fail);}else if(msg.type==='harness-error')fail(Error(msg.message));else{incoming.get(msg.type)?.(msg);incoming.delete(msg.type);}});
const ipc=(type,message)=>new Promise(resolve=>{incoming.set(type,resolve);if(message)process.send(message);});
const e=(win,source)=>win.webContents.executeJavaScript(source,true);
async function wait(win,expression){for(let i=0;i<850;i++){if(await e(win,'Boolean('+expression+')'))return;await new Promise(r=>setTimeout(r,20));}throw Error('COMMAND_UI_WAIT '+expression+' '+await e(win,"document.getElementById('lab-status').textContent"));}
function pass(text){checks.push(text);process.send({type:'progress',check:text});console.log('COMMAND_UI_OK '+text);}
async function makeWindow(correo){
  const ses=electronSession.fromPartition('command-ui-'+windows.length);ses.setPermissionRequestHandler((_w,_p,callback)=>callback(false));
  ses.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith(input.origin+'/')}));
  const win=new BrowserWindow({show:false,width:1366,height:950,webPreferences:{session:ses,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});windows.push(win);
  win.webContents.setBackgroundThrottling(false);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());
  const preferences=win.webContents.getLastWebPreferences();assert(preferences.sandbox&&preferences.contextIsolation&&preferences.webSecurity&&!preferences.nodeIntegration);
  await win.loadURL(input.origin+'/');
  await e(win,"window.confirmations=[];window.acceptConfirmation=true;window.confirm=text=>{confirmations.push(text);return acceptConfirmation;};window.writesIssued=0;window.nativeFetch=window.fetch;window.fetch=(url,options)=>{if(new Headers(options?.headers).has('Idempotency-Key'))writesIssued++;return nativeFetch(url,options);};window.addEventListener('error',event=>window.rendererFailure=event.message)");
  await e(win,`document.getElementById('correo').value=${JSON.stringify(correo)};document.getElementById('password').value=${JSON.stringify(input.credentials.password)};document.getElementById('lab-login').requestSubmit()`);
  await wait(win,'App.auth.estaAutenticado()');return win;
}
async function open(win,key,target){
  await e(win,`App.revisionEditor.openAction(${JSON.stringify(key)},${JSON.stringify(String(target))})`);
  await wait(win,"document.getElementById('protected-form') && App.revisionEditor.getSession()?.state==='ready'");uiActions.add(key);
}
async function field(win,name,value){await e(win,`document.querySelector('[data-field="${name}"]').value=${JSON.stringify(String(value))}`);}
async function save(win,state='confirmed'){
  await e(win,"document.getElementById('protected-form').requestSubmit()");
  await wait(win,`App.revisionEditor.getSession()?.state===${JSON.stringify(state)} && ${state==='ready'?'!':' '}document.getElementById('save').disabled`);
  if(state!=='ready')await wait(win,"document.getElementById('command-state')");
}
async function recover(win,state='confirmed'){
  await e(win,"document.querySelector('[data-command-action=recover]').click()");
  await wait(win,`!App.revisionEditor.getSession()?.recovering && App.revisionEditor.getSession()?.state===${JSON.stringify(state)} && !document.querySelector('[data-command-action=recover]').disabled`);
}
const key=win=>e(win,'App.revisionEditor.getSession().command.key');
const counts=async(win,id)=>ipc('counts',{type:'counts',id,key:await key(win)});
async function mutate(win,url,body){return e(win,`(async()=>{const s=await new App.commandLab.CommandSession('PATCH',${JSON.stringify(url)}).open();s.setProposal(${JSON.stringify(body)});try{await s.submit(()=>window.confirm('Confirmar cambio sintético de otro administrador'));return s.receipt.comando.estado;}catch(x){return x.status;}})()`);}
async function wireReplay(win,different=false){return e(win,`(async()=>{const c=App.revisionEditor.getSession().command;const r=await nativeFetch(c.url,{method:c.method,headers:{...c.headers,'Content-Type':'application/json',Authorization:'Bearer '+App.auth.obtenerToken()},body:${different?"JSON.stringify({...c.body,habitacion:'Intención diferente'})":'c.bodyJson'}});return {status:r.status,body:await r.json(),replayed:r.headers.get('Idempotency-Replayed')};})()`);}
async function screenshot(win,name){await e(win,"(document.querySelector('#conflict h2') || document.querySelector('#command-result h2') || document.querySelector('#editor h2')).scrollIntoView();true");await e(win,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');fs.writeFileSync(path.join(input.output,name+'.png'),(await win.webContents.capturePage()).toPNG());}
async function run(){
  await app.whenReady();const f=input.fixtures,a=await makeWindow(input.credentials.correo),b=await makeWindow('segundo@standalone.example.test'),id=f.records[0].reservaciones;
  await open(a,'reservacion',id);await field(a,'habitacion','Guardado con comando');
  const originalEtag=await e(a,'App.revisionEditor.getSession().original.etag');await save(a);
  assert.equal(await e(a,'Object.isFrozen(App.revisionEditor.getSession().command.body)'),true);
  assert.equal(await e(a,'App.revisionEditor.getSession().original.etag'),originalEtag);assert.equal(await e(a,'writesIssued'),1);
  await screenshot(a,'comando-confirmado');
  const duplicate=await wireReplay(a);assert.equal(duplicate.status,200);assert.equal(duplicate.replayed,'true');
  let proof=await counts(a,id);assert.equal(proof.audit,1);assert.equal(proof.commands,1);assert.equal(proof.upstreamWrites,2);assert.equal(proof.bodyHashes.length,1);
  pass('Guardar conserva sobre inmutable y recibo; dos HTTP con la misma clave producen una modificación y una bitácora');

  await open(a,'reservacion',f.reservations[1]);await field(a,'habitacion','Reenvío del transporte');await ipc('armed',{type:'arm',mode:'duplicate'});await save(a);
  assert.equal(await e(a,'App.revisionEditor.getSession().replayed'),true);proof=await counts(a,f.reservations[1]);assert.equal(proof.commands,1);assert.equal(proof.audit,1);assert.equal(proof.upstreamWrites,2);assert.equal(proof.replayed,1);assert.equal(proof.bodyHashes.length,1);
  assert.equal(await e(a,'writesIssued'),2);
  pass('Transporte HTTP keep-alive repite la petición original: un fetch de aplicación, dos envíos y un efecto confirmado');

  await open(a,'reservacion',f.reservations[6]);await field(a,'habitacion','Respuesta perdida después de COMMIT');const lostOriginal=await e(a,'App.revisionEditor.getSession().original.etag');
  await ipc('armed',{type:'arm',mode:'truncate'});await save(a,'uncertain');const lostKey=await key(a);
  assert.equal(await e(a,"document.querySelector('[data-field=habitacion]').value"),'Respuesta perdida después de COMMIT');proof=await counts(a,f.reservations[6]);assert.equal(proof.commands,1);assert.equal(proof.audit,1);assert.equal(proof.upstreamWrites,1);
  await screenshot(a,'respuesta-incierta');
  await ipc('recovery-error-ready',{type:'recovery-error'});await recover(a,'uncertain');assert.equal(await key(a),lostKey);
  await recover(a);assert.equal(await key(a),lostKey);assert.equal(await e(a,'App.revisionEditor.getSession().original.etag'),lostOriginal);
  assert.match(await e(a,"document.getElementById('command-state').textContent"),/recuperado/);
  await e(a,"document.querySelector('[data-command-action=current]').click()");await wait(a,"document.getElementById('current-command-data').textContent.includes('Respuesta perdida después de COMMIT')");
  proof=await counts(a,f.reservations[6]);assert.equal(proof.upstreamWrites,1);assert.equal(proof.audit,1);
  await screenshot(a,'recibo-recuperado');
  pass('Respuesta real truncada después de COMMIT mantiene formulario/sobre; error de recuperación no escribe; GET recupera y consulta estado actual por separado');
  await ipc('restarted',{type:'restart'});await recover(a);assert.equal(await key(a),lostKey);proof=await counts(a,f.reservations[6]);assert.equal(proof.audit,1);assert.equal(proof.commands,1);assert.equal(proof.upstreamWrites,1);
  pass('Reinicio del backend normal conserva generación y recibo; la ventana activa recupera el mismo comando sin guardar');

  await open(a,'reservacion',f.reservations[2]);await field(a,'habitacion','Intención original de clave');await ipc('armed',{type:'arm',mode:'key-conflict'});await save(a,'keyConflict');
  const reusedKey=await key(a);assert.equal(await e(a,'App.revisionEditor.getSession().error.kind'),'key-reuse');assert.equal(await e(a,"document.querySelector('#conflict table')"),null);
  assert.equal(await e(a,"App.revisionEditor.getSession().prepare('review').then(()=>false,x=>x.kind)"),'blocked');
  await recover(a);assert.equal(await key(a),reusedKey);proof=await counts(a,f.reservations[2]);assert.equal(proof.commands,1);assert.equal(proof.audit,1);assert.equal(proof.bodyHashes.length,2);
  pass('Misma clave con intención diferente muestra error propio, bloquea edición nueva y permite reconocer el comando original');

  await open(a,'reservacion',id);await open(b,'reservacion',id);await field(a,'habitacion','Administrador A actual');await field(b,'habitacion','B conserva <script>');await save(a);await save(b,'conflict');
  const staleKey=await key(b),staleTag=await e(b,'App.revisionEditor.getSession().original.etag');
  assert.equal(await e(b,'App.revisionEditor.getSession().error.status'),412);assert.equal(await e(b,'App.revisionEditor.getSession().receipt.comando.estado'),'rechazado');
  assert.equal(await e(b,"document.querySelector('[data-field=habitacion]').value"),'B conserva <script>');assert.equal(await e(b,"document.querySelectorAll('#conflict th').length"),5);assert.equal(await e(b,"document.querySelector('#conflict script')"),null);
  assert.match(await e(b,"document.getElementById('conflict').textContent"),/Administrador A actual/);await screenshot(b,'conflicto-412');
  await recover(b,'conflict');assert.equal(await key(b),staleKey);
  await e(b,"document.querySelector('[data-decision=review]').click()");await wait(b,"App.revisionEditor.getSession().state==='ready' && !document.querySelector('#conflict table')");
  assert.equal(await e(b,'App.revisionEditor.getSession().command'),null);assert.notEqual(await e(b,'App.revisionEditor.getSession().original.etag'),staleTag);
  await e(b,'window.acceptConfirmation=false');await save(b,'ready');assert.equal(await e(b,'App.revisionEditor.getSession().command'),null);
  await e(b,'window.acceptConfirmation=true');await save(b);assert.notEqual(await key(b),staleKey);
  pass('412 durable compara original/propuesta/actual sin reemplazar entradas; revisión explícita y nueva confirmación producen otra clave y precondiciones nuevas');

  await open(b,'reservacion',id);await field(b,'observaciones','B conserva contexto');assert.equal(await mutate(a,'/api/vehiculos/'+f.vehicles[0],{color:'Contexto modificado'}),'confirmado');await save(b,'conflict');
  assert.equal(await e(b,'App.revisionEditor.getSession().error.kind'),'context');assert.match(await e(b,"document.getElementById('conflict').textContent"),/dependencias/);await screenshot(b,'conflicto-409');
  await e(b,"window.acceptConfirmation=false;document.querySelector('[data-decision=current]').click()");await wait(b,"!document.querySelector('[data-decision=current]').disabled");assert.equal(await e(b,"document.querySelector('[data-field=observaciones]').value"),'B conserva contexto');
  await e(b,"window.acceptConfirmation=true;document.querySelector('[data-decision=current]').click()");await wait(b,"App.revisionEditor.getSession().state==='ready'");assert.equal(await e(b,'App.revisionEditor.getSession().command'),null);
  pass('409 de contexto conserva propuesta y advierte dependencias; utilizar información actual exige confirmar descarte');

  await open(b,'reservacion',id);await field(b,'pax','0');await save(b,'rejected');const rejectedKey=await key(b);await recover(b,'rejected');assert.equal(await key(b),rejectedKey);assert.equal(await e(b,"document.querySelector('[data-field=pax]').value"),'0');
  assert.match(await e(b,"document.getElementById('command-state').textContent"),/Rechazado durable/);
  pass('Rechazo durable de negocio se recupera sin escritura y conserva el formulario para revisión');

  const unknown=await makeWindow(input.credentials.correo);await open(unknown,'reservacion',f.reservations[3]);await field(unknown,'habitacion','Sin evidencia concluyente');await ipc('armed',{type:'arm',mode:'before-write'});await save(unknown,'uncertain');const unknownKey=await key(unknown);
  await recover(unknown,'uncertain');assert.equal(await key(unknown),unknownKey);assert.equal(await e(unknown,'App.revisionEditor.getSession().recoveryError.kind'),'unknown');
  assert.equal(await e(unknown,"App.revisionEditor.getSession().submit(()=>true).then(()=>false,x=>x.kind)"),'blocked');
  await e(unknown,`App.revisionEditor.openAction('operacion','${f.records[0].operaciones_tour}')`);assert.equal(await key(unknown),unknownKey);
  proof=await counts(unknown,f.reservations[3]);assert.equal(proof.commands,0);assert.equal(proof.audit,0);assert.equal(proof.upstreamWrites,0);assert.equal(await e(unknown,'writesIssued'),1);await screenshot(unknown,'resultado-desconocido');
  pass('404/desconocido no prueba rollback: conserva comando, bloquea nueva intención y no envía otro guardado');

  const locked=await makeWindow(input.credentials.correo);await open(locked,'reservacion',f.reservations[7]);await field(locked,'habitacion','Bloqueo original');await ipc('locked',{type:'lock'});
  try{await save(locked,'uncertain');assert.equal(await e(locked,'App.revisionEditor.getSession().error.kind'),'lock');await recover(locked,'uncertain');assert.equal(await e(locked,"document.querySelector('#conflict table')"),null);}finally{await ipc('unlocked',{type:'unlock'});}
  proof=await counts(locked,f.reservations[7]);assert.equal(proof.commands,0);assert.equal(proof.audit,0);assert.equal(proof.upstreamWrites,1);
  pass('Conflicto real por candado se distingue del contexto: incertidumbre sin rechazo durable ni reenvío');

  for(const [action,target,name,value]of [['cancelar',f.reservations[0],'motivo_cancelacion','Cancelación UI con comando'],['asignar',f.reservations[1],'id_transporte_operacion',f.records[0].transportes_operacion],['operacion',f.records[0].operaciones_tour,'hora_inicio','09:00'],['transporte',f.records[0].transportes_operacion,'observaciones_operador','Transporte UI con comando'],['daily','2098-02-04','observaciones','Daily UI con comando']]){
    await open(a,action,target);await field(a,name,value);await save(a);const repeated=await wireReplay(a);assert.equal(repeated.status,200);assert.equal(repeated.replayed,'true');
  }
  pass('Cancelación, asignación, operaciones, transportes y Daily guardan desde formularios reales y reconocen la misma clave');
  for(const [action,target,name,value]of [['vehiculo',f.vehicles[0],'color','Verde UI'],['guia',input.extraIds.guia,'nombre','Guía UI comandos'],['operador',input.extraIds.operador,'nombre','Operador UI comandos'],['tour',f.tour,'descripcion','Tour UI comandos'],['usuario',input.extraIds.usuario,'nombre','Segundo UI comandos']]){await open(a,action,target);await field(a,name,value);await save(a);}
  await e(b,'App.auth.refrescarSesion()');
  pass('Cinco formularios administrativos usan el contrato; altas y password permanecen bloqueados');

  await open(a,'aplicar',f.events.getyourguide);await field(a,'motivo_cancelacion','GYG UI sintético');await save(a);assert.equal((await wireReplay(a)).replayed,'true');proof=await counts(a,f.reservations[4]);assert.equal(proof.audit,1);assert.equal(proof.commands,1);
  await open(a,'revision',f.events.fareharbor);await field(a,'accion','approve');await save(a);
  await open(a,'aplicar',f.events.fareharbor);await field(a,'motivo_cancelacion','FH UI sintético');await ipc('armed',{type:'arm',mode:'duplicate'});await save(a);proof=await counts(a,f.reservations[5]);assert.equal(proof.audit,1);assert.equal(proof.commands,1);assert.equal(proof.upstreamWrites,2);
  await open(a,'archivo',f.events.archive);await field(a,'motivo','Archivo UI sintético');await save(a);
  pass('GYG/FH exclusivamente sintéticos: aprobación, cancelación y archivo con una sola aplicación de cada decisión');

  const consulta=await makeWindow('consulta@standalone.example.test');await e(consulta,`App.revisionEditor.openAction('reservacion','${id}')`);assert.equal(await e(consulta,"document.getElementById('protected-form')"),null);assert.equal(await e(consulta,'writesIssued'),0);
  assert.equal(await e(consulta,`App.api.apiFetch('/api/reservaciones/${f.reservations[8]}').then(()=>200,x=>x.status)`),404);
  const denied=await e(consulta,`nativeFetch('/api/reservaciones/${id}',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+App.auth.obtenerToken()},body:'{"habitacion":"Prohibido"}'}).then(r=>r.status)`);assert.equal(denied,403);
  pass('Consulta no abre edición ni genera comandos; backend rechaza escrituras y conserva alcance por plataforma');

  await open(b,'reservacion',f.records[1].reservaciones);await field(b,'habitacion','Permisos durante operación');await ipc('armed',{type:'arm',mode:'hold'});const held=ipc('held');await e(b,"document.getElementById('protected-form').requestSubmit()");const heldMessage=await held;
  assert.equal(await mutate(a,'/api/usuarios/'+input.extraIds.usuario,{id_rol:input.extraIds.consultaRole,alcance_plataformas:'selected',platform_ids:[f.platform]}),'confirmado');
  await e(b,'App.auth.refrescarSesion()');await wait(b,'!App.revisionEditor.getSession()');await ipc('released',{type:'release'});
  assert.equal(await e(b,"document.getElementById('command-result').textContent"),'');assert.equal(await e(b,"document.getElementById('editor').textContent"),'');
  const historical=await e(b,`nativeFetch('/api/comandos/${heldMessage.key}',{headers:{Authorization:'Bearer '+App.auth.obtenerToken(),'X-CTSK-Protocol':'ctsk-command-api-v1','X-CTSK-Data-Generation':${JSON.stringify(input.generation)}}}).then(r=>r.status)`);assert.equal(historical,403);
  pass('Permisos cambiados mientras llega la respuesta destruyen edición/recibo anterior; recuperación histórica se deniega');

  assert.equal(uiActions.size,14);assert.equal(await e(a,"App.api.apiFetch('/api/reservaciones',{method:'POST',body:{}}).then(()=>false,x=>x.kind)"),'blocked');
  assert.equal(await e(a,"nativeFetch('/frontend/index.html').then(r=>r.status)"),404);assert.equal(await e(a,"nativeFetch('/api/integraciones/fareharbor',{method:'PATCH'}).then(r=>r.status)"),405);
  for(const win of windows)assert.equal(await e(win,'window.rendererFailure || null'),null);
  pass('14 formularios ejercitados; lista cerrada excluye 11 escritores, pantallas originales e integraciones; Electron conserva sandbox y aislamiento');
  fs.writeFileSync(path.join(input.output,'command-frontend-ui-checks.json'),JSON.stringify({checks,uiActions:[...uiActions],screenshots:['comando-confirmado.png','respuesta-incierta.png','recibo-recuperado.png','conflicto-412.png','conflicto-409.png','resultado-desconocido.png']},null,2));
  process.send({type:'checks',checks});windows.forEach(w=>w.destroy());app.exit(0);
}
function fail(error){console.error(error.stack);windows.forEach(w=>{if(!w.isDestroyed())w.destroy();});app.exit(1);}
process.send({type:'ready'});
