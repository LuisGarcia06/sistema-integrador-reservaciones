// Electron es únicamente el corredor de pruebas; no agrega una modalidad al producto.
const { app, BrowserWindow, session: electronSession } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
if (!process.send) throw Error('FRONTEND_DRIVER_REQUIRES_HARNESS');
app.disableHardwareAcceleration(); app.commandLine.appendSwitch('in-process-gpu');
let input; const windows = [], checks = [], runtimeErrors = [];
const incoming = new Map();
process.on('message', msg => { if (msg.type === 'input') { input = msg; run().catch(fail); } else { incoming.get(msg.type)?.(msg); incoming.delete(msg.type); } });
const ipc = (type, message) => new Promise(resolve => { incoming.set(type, resolve); process.send(message); });
const e = (win, source) => win.webContents.executeJavaScript(source, true);
async function wait(win, expression) {
  for (let i = 0; i < 700; i++) { if (await e(win, 'Boolean(' + expression + ')')) return; await new Promise(r => setTimeout(r, 20)); }
  throw Error('UI_WAIT ' + expression + ' ' + await e(win, "document.getElementById('lab-status').textContent"));
}
function pass(text) { checks.push(text); console.log('FRONTEND_OK ' + text); }
async function open(win, key, target) { await e(win, `App.revisionEditor.openAction(${JSON.stringify(key)},${JSON.stringify(String(target))})`); await wait(win, "document.getElementById('protected-form')"); }
async function field(win, name, value) { await e(win, `document.querySelector('[data-field="${name}"]').value=${JSON.stringify(String(value))}`); }
async function save(win, state = 'saved') {
  await e(win, "document.getElementById('protected-form').requestSubmit()");
  await wait(win, state === 'saved' ? "!App.revisionEditor.getSession() && document.getElementById('lab-status').textContent.includes('COMMIT')" : `App.revisionEditor.getSession()?.state===${JSON.stringify(state)} && !document.getElementById('save').disabled`);
}
async function mutate(win, method, url, body) {
  return e(win, `(async()=>{const s=await new App.revisionLab.EditSession(${JSON.stringify(method)},${JSON.stringify(url)}).open();s.setProposal(${JSON.stringify(body)});try{await s.submit(()=>window.confirm('Confirmar ensayo sintético'));return {status:200,state:s.state};}catch(x){return {status:x.status,kind:x.kind,state:s.state,proposal:s.proposal};}})()`);
}
async function raw(win, method, url, body, headers = {}) {
  return e(win, `(async()=>{const r=await fetch(${JSON.stringify(url)},{method:${JSON.stringify(method)},headers:{'Content-Type':'application/json','Authorization':'Bearer '+App.auth.obtenerToken(),...${JSON.stringify(headers)}},body:${JSON.stringify(JSON.stringify(body))}});return {status:r.status,body:await r.json()};})()`);
}
async function snapshot(win, name) {
  await e(win, "(document.querySelector('#conflict h2') || document.querySelector('#editor h2'))?.scrollIntoView();true");
  await e(win, 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
  fs.writeFileSync(path.join(input.output, name + '.png'), (await win.webContents.capturePage()).toPNG());
}
async function makeWindow(correo) {
  const ses = electronSession.fromPartition('revision-frontend-' + windows.length);
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith(input.origin + '/') }));
  const win = new BrowserWindow({ show: false, width: 1366, height: 950, webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } }); windows.push(win);
  win.webContents.setBackgroundThrottling(false);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('console-message', (_event, details) => { if (details.level === 'error' && !/Failed to load resource/.test(details.message)) runtimeErrors.push(details.message); });
  const prefs = win.webContents.getLastWebPreferences(); assert(prefs.sandbox && prefs.contextIsolation && prefs.webSecurity && !prefs.nodeIntegration);
  await win.loadURL(input.origin + '/');
  await e(win, "window.confirmations=[];window.acceptConfirmation=true;window.confirm=(text)=>{confirmations.push(text);return acceptConfirmation;};window.addEventListener('error',x=>{window.rendererFailure=x.message;})");
  // Los diálogos se responden solo en el corredor y se verifica cada decisión.
  await e(win, `document.getElementById('correo').value=${JSON.stringify(correo)};document.getElementById('password').value=${JSON.stringify(input.credentials.password)};document.getElementById('lab-login').requestSubmit()`);
  await wait(win, 'App.auth.estaAutenticado()'); return win;
}
async function run() {
  await app.whenReady();
  const f = input.fixtures, a = await makeWindow(input.credentials.correo), b = await makeWindow('segundo@standalone.example.test');
  const id = f.records[0].reservaciones, url = '/api/reservaciones/' + id;
  await open(a, 'reservacion', id); await open(b, 'reservacion', id);
  await field(a, 'habitacion', 'Administrador A'); await field(b, 'habitacion', 'Intención B <script>');
  const originalTag = await e(b, 'App.revisionEditor.getSession().original.etag');
  await save(a); await save(b, 'conflict');
  assert.equal(await e(b, "document.querySelector('[data-field=habitacion]').value"), 'Intención B <script>');
  assert.equal(await e(b, 'App.revisionEditor.getSession().error.status'), 412);
  assert.equal(await e(b, 'App.revisionEditor.getSession().original.etag'), originalTag);
  assert.equal(await e(b, "document.querySelectorAll('#conflict th').length"), 5);
  assert.match(await e(b, "document.getElementById('conflict').textContent"), /Administrador A/);
  assert.match(await e(b, "document.getElementById('conflict').textContent"), /Intención B <script>/);
  assert.equal(await e(b, "document.querySelector('#conflict script')"), null);
  await snapshot(b, 'conflicto-412'); pass('Dos administradores reales: 412, formulario intacto, original/propuesta/actual y escape de texto');
  await e(b, "document.querySelector('[data-decision=review]').click()"); await wait(b, "App.revisionEditor.getSession().state==='ready' && !document.querySelector('#conflict table')");
  assert.notEqual(await e(b, 'App.revisionEditor.getSession().original.etag'), originalTag);
  assert.equal(await e(b, "document.querySelector('[data-field=habitacion]').value"), 'Intención B <script>');
  await e(b, 'window.acceptConfirmation=false'); await save(b, 'ready');
  assert.equal((await e(a, `App.api.apiFetch('${url}')`)).datos.habitacion, 'Administrador A');
  await e(b, 'window.acceptConfirmation=true'); await save(b);
  pass('Decisión explícita obtiene precondiciones nuevas; rechazar confirmación no escribe y confirmar guarda');

  await open(b, 'reservacion', id); await field(b, 'observaciones', 'B conserva contexto');
  assert.equal((await mutate(a, 'PATCH', '/api/vehiculos/' + f.vehicles[0], { color: 'Contexto nuevo' })).status, 200);
  await save(b, 'conflict'); assert.equal(await e(b, 'App.revisionEditor.getSession().error.status'), 409);
  assert.match(await e(b, "document.getElementById('conflict').textContent"), /dependencias/);
  await snapshot(b, 'conflicto-409');
  await e(b, "window.acceptConfirmation=false;document.querySelector('[data-decision=current]').click()");
  await wait(b, "!document.querySelector('[data-decision=current]').disabled");
  assert.equal(await e(b, "document.querySelector('[data-field=observaciones]').value"), 'B conserva contexto');
  await e(b, "window.acceptConfirmation=true;document.querySelector('[data-decision=current]').click()");
  await wait(b, "App.revisionEditor.getSession().state==='ready'"); assert.deepEqual(await e(b, 'App.revisionEditor.getSession().proposal'), {});
  pass('409 por dependencia; información actual se usa solo después de confirmar el descarte');

  for (const [key, target, name, value] of [['operacion', f.records[0].operaciones_tour, 'hora_inicio', '09:00'], ['transporte', f.records[0].transportes_operacion, 'observaciones_operador', 'Transporte B'], ['daily', '2098-02-03', 'observaciones', 'Daily B']]) {
    await open(a, key, target); await open(b, key, target); await field(a, name, 'hora_inicio' === name ? '08:00' : 'Versión A'); await field(b, name, value);
    await save(a); await save(b, 'conflict'); assert.equal(await e(b, `document.querySelector('[data-field=${name}]').value`), value);
    assert([409, 412].includes(await e(b, 'App.revisionEditor.getSession().error.status')));
  }
  pass('Formularios reales de operaciones, transportes y Daily conservan sus entradas ante conflictos');

  for (const [key, target, name, value] of [['cancelar', f.reservations[0], 'motivo_cancelacion', 'Cancelación escrita'], ['asignar', f.reservations[1], 'id_transporte_operacion', f.records[0].transportes_operacion]]) {
    await open(b, key, target); await field(b, name, value);
    assert.equal((await mutate(a, 'PATCH', '/api/vehiculos/' + f.vehicles[0], { color: 'Cambio para ' + key })).status, 200);
    await save(b, 'conflict'); assert.equal(await e(b, 'App.revisionEditor.getSession().error.status'), 409);
    assert.equal(await e(b, `document.querySelector('[data-field=${name}]').value`), String(value));
  }
  pass('Cancelación y cambio de transporte obsoletos: 409 sin perder la intención');
  await open(b, 'cancelar', f.reservations[2]); await field(b, 'motivo_cancelacion', 'Cancelación vigente sintética'); await save(b);
  assert.equal((await e(a, `App.api.apiFetch('/api/reservaciones/${f.reservations[2]}')`)).datos.estado, 'Cancelada');
  await open(b, 'asignar', f.reservations[3]); await field(b, 'id_transporte_operacion', f.records[0].transportes_operacion); await save(b);
  assert.equal((await e(a, `App.api.apiFetch('/api/reservaciones/${f.reservations[3]}')`)).datos.id_transporte_operacion, f.records[0].transportes_operacion);
  pass('Cancelación y asignación vigentes guardan desde sus formularios con confirmación');

  await open(b, 'aplicar', f.events.getyourguide); await field(b, 'motivo_cancelacion', 'Cancelación GYG sintética');
  assert.equal((await mutate(a, 'PATCH', '/api/reservaciones/' + f.reservations[4], { habitacion: 'Cambio previo GYG' })).status, 200);
  await save(b, 'conflict'); assert.equal(await e(b, 'App.revisionEditor.getSession().error.status'), 409);
  await e(b, "document.querySelector('[data-decision=review]').click()"); await wait(b, "App.revisionEditor.getSession().state==='ready' && !document.querySelector('#conflict table')"); await save(b);
  assert.equal((await e(a, `App.api.apiFetch('/api/reservaciones/${f.reservations[4]}')`)).datos.estado, 'Cancelada');
  await open(b, 'revision', f.events.fareharbor); await field(b, 'accion', 'approve');
  await open(a, 'revision', f.events.fareharbor); await field(a, 'accion', 'approve'); await save(a); await save(b, 'conflict');
  assert.equal(await e(b, 'App.revisionEditor.getSession().error.status'), 412);
  await open(b, 'aplicar', f.events.fareharbor); await field(b, 'motivo_cancelacion', 'Cancelación FH sintética');
  assert.equal((await mutate(a, 'PATCH', '/api/reservaciones/' + f.reservations[5], { habitacion: 'Cambio previo FH' })).status, 200);
  await save(b, 'conflict');
  await e(b, "document.querySelector('[data-decision=review]').click()"); await wait(b, "App.revisionEditor.getSession().state==='ready' && !document.querySelector('#conflict table')"); await save(b);
  await open(a, 'archivo', f.events.archive); await field(a, 'motivo', 'Archivo de prueba sintética'); await save(a);
  pass('Eventos GYG/FareHarbor sintéticos: aprobación obsoleta 412, aplicación 409, huella renovada y aplicación manual confirmada');

  for (const [key, target, name, value] of [['vehiculo', f.vehicles[0], 'color', 'Verde sintético'], ['guia', input.extraIds.guia, 'nombre', 'Guía UI'], ['operador', input.extraIds.operador, 'nombre', 'Operador UI'], ['tour', f.tour, 'descripcion', 'Tour UI'], ['usuario', input.extraIds.usuario, 'nombre', 'Segundo UI']]) {
    await open(a, key, target); await field(a, name, value); await save(a);
  }
  pass('Cinco formularios administrativos guardan por el contrato protegido');
  await e(b, 'App.auth.refrescarSesion()');

  for (const [mode, expected] of [['missing', 428], ['malformed', 400]]) {
    await open(a, 'reservacion', id); await field(a, 'habitacion', 'Contrato inválido ' + mode);
    await e(a, `window.savedFetch=window.fetch;window.fetch=(url,options)=>{if(url===${JSON.stringify(url)}&&options.method==='PATCH'){window.fetch=savedFetch;${mode === 'missing' ? "options.headers.delete('If-Match')" : "options.headers.set('If-Match','bad-etag')"};}return savedFetch(url,options);};true`);
    await save(a, 'blocked'); assert.equal(await e(a, 'App.revisionEditor.getSession().error.status'), expected);
    const proposal = await e(a, 'App.revisionEditor.getSession().proposal'); assert.equal(proposal.habitacion, 'Contrato inválido ' + mode);
    const retry = await e(a, 'App.revisionEditor.getSession().submit(()=>true).then(()=>false,x=>x.kind)'); assert.equal(retry, 'blocked');
  }
  pass('428 sin If-Match y 400 ETag incorrecto contra HTTP real: bloqueo y cero reenvíos');

  const noopBefore = await e(a, `App.api.apiFetch('${url}')`), countBefore = await ipc('counts', { type: 'counts', id });
  assert.equal((await mutate(a, 'PATCH', url, { habitacion: noopBefore.datos.habitacion })).status, 200);
  assert.equal((await e(a, `App.api.apiFetch('${url}')`)).revision, noopBefore.revision);
  const noopAfter = await ipc('counts', { type: 'counts', id }); assert.equal(noopAfter.audit, countBefore.audit);
  const failed = await mutate(a, 'PATCH', url, { habitacion: 'SYN-FAIL-AUDIT' }); assert.equal(failed.status, 500); assert.equal(failed.state, 'uncertain');
  assert.equal((await e(a, `App.api.apiFetch('${url}')`)).datos.habitacion, noopBefore.datos.habitacion);
  const rollbackCounts = await ipc('counts', { type: 'counts', id }); assert.equal(rollbackCounts.audit, countBefore.audit);
  pass('No-op mantiene revisión y bitácora; fallo sintético de auditoría revierte datos y se trata como incierto');

  const lostId = f.reservations[6]; await open(a, 'reservacion', lostId); await field(a, 'habitacion', 'COMMIT sin respuesta');
  const lostBefore = await ipc('counts', { type: 'counts', id: lostId }); await ipc('dropped-armed', { type: 'drop' });
  await save(a, 'uncertain');
  assert.equal(await e(a, "document.querySelector('[data-field=habitacion]').value"), 'COMMIT sin respuesta');
  const lostAfter = await ipc('counts', { type: 'counts', id: lostId }); assert.equal(lostAfter.writes, lostBefore.writes + 1); assert.equal(lostAfter.audit, lostBefore.audit + 1);
  assert.equal((await e(b, `App.api.apiFetch('/api/reservaciones/${lostId}')`)).datos.habitacion, 'COMMIT sin respuesta');
  const blocked = await e(a, 'App.revisionEditor.getSession().submit(()=>true).then(()=>false,x=>x.kind)'); assert.equal(blocked, 'blocked');
  const afterBlocked = await ipc('counts', { type: 'counts', id: lostId }); assert.equal(afterBlocked.writes, lostAfter.writes);
  await snapshot(a, 'respuesta-incierta'); pass('Respuesta perdida después de COMMIT: formulario vivo, GET reconcilia, una escritura y una entrada de bitácora');

  await open(a, 'reservacion', f.records[1].reservaciones); assert.equal(await e(a, 'App.revisionEditor.getSession().original.revision'), '9007199254740993');
  await snapshot(a, 'formulario-bigint'); pass('Revisión BIGINT mayor que 2^53 permanece como cadena exacta en el frontend');

  const blockedLegacy = await e(a, "App.api.apiFetch('/api/integraciones/fareharbor',{method:'PATCH',body:{activado:true}}).then(()=>false,x=>x.kind)"); assert.equal(blockedLegacy, 'blocked');
  assert.equal(await e(a, "(()=>{try{new App.revisionLab.EditSession('POST','/api/reservaciones');return false;}catch(x){return x.kind;}})()"), 'blocked');
  pass('Sin fallback: altas, password y controles de integraciones permanecen bloqueados en el perfil nuevo');

  const consulta = await makeWindow('consulta@standalone.example.test');
  assert.equal((await raw(consulta, 'PATCH', url, { habitacion: 'Prohibido' })).status, 403);
  await e(consulta, `App.revisionEditor.openAction('reservacion','${id}')`); assert.equal(await e(consulta, "document.getElementById('protected-form')"), null);
  assert.equal((await e(consulta, `App.api.apiFetch('/api/reservaciones/${f.reservations[8]}').then(()=>200,x=>x.status)`)), 404);
  pass('Consulta: backend rechaza escritura y precondiciones; alcance selected oculta otra plataforma');

  await open(b, 'reservacion', id); await field(b, 'habitacion', 'B pierde permisos');
  const oldToken = await e(b, 'App.auth.obtenerToken()');
  assert.equal((await mutate(a, 'PATCH', '/api/usuarios/' + input.extraIds.usuario, { id_rol: input.extraIds.consultaRole, alcance_plataformas: 'selected', platform_ids: [f.platform] })).status, 200);
  await e(b, "document.getElementById('protected-form').requestSubmit()");
  await wait(b, '!App.revisionEditor.getSession()');
  const denied = await e(b, `(async()=>{const r=await fetch('${url}',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+${JSON.stringify(oldToken)}},body:'{"habitacion":"No autorizado"}'});return r.status;})()`); assert.equal(denied, 403);
  assert.equal(await e(b, "document.getElementById('conflict').textContent"), '');
  pass('Cambio de permisos durante edición invalida su sesión de edición y no muestra lecturas actuales sin autorización');

  for (const win of windows) assert.equal(await e(win, 'window.rendererFailure || null'), null);
  assert.deepEqual(runtimeErrors, []);
  pass('Tres contextos Electron aislados: sandbox, contextIsolation, webSecurity y sin errores de renderer');
  fs.writeFileSync(path.join(input.output, 'frontend-ui-checks.json'), JSON.stringify({ checks, runtimeErrors, screenshots: ['conflicto-412.png', 'conflicto-409.png', 'respuesta-incierta.png', 'formulario-bigint.png'] }, null, 2));
  process.send({ type: 'checks', checks }); windows.forEach(w => w.destroy()); app.exit(0);
}
function fail(error) { console.error(error.stack); windows.forEach(w => { if (!w.isDestroyed()) w.destroy(); }); app.exit(1); }
process.send({ type: 'ready' });
