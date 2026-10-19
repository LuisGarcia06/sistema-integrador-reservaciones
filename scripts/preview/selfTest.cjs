// Solo se ejecuta con --preview-self-test. El lanzador manual NO usa esta opción.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
async function probar({ win, api, origin, profile, blocked, isolation }) {
  const output = path.resolve(__dirname, '../../docs/pre-release-05');
  fs.mkdirSync(output, { recursive: true });
  const checks = [], captures = [];
  const e = code => win.webContents.executeJavaScript(code);
  const wait = async condition => {
    for (let i = 0; i < 320; i++) {
      if (await e('Boolean(' + condition + ')')) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw Error('No se cumplió: ' + condition + '\n' + await e('document.body.innerText'));
  };
  const click = selector => e('document.querySelector(' + JSON.stringify(selector) + ').click()');
  const value = (id, val) => e('document.getElementById(' + JSON.stringify(id) + ').value=' + JSON.stringify(String(val)));
  const login = async key => {
    await value('preview-profile', key); await click('#preview-login');
    await wait('App.auth.obtenerUsuario()?.id_usuario===' + api.perfiles[key].id_usuario + ' && !document.getElementById("preview-login").disabled');
    await wait("document.getElementById('notification-toggle') || document.body.innerText.includes('Información limitada')");
    if (key !== 'selected') await wait('App.notificaciones.obtenerResumen()');
  };
  const capture = async name => {
    await e('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.ok(await e('document.documentElement.scrollWidth<=innerWidth'), 'Desborde ' + name);
    const bannerBottom = await e('document.getElementById("preview-lab").getBoundingClientRect().bottom');
    const headerTop = await e('document.getElementById("app-header").getBoundingClientRect().top');
    assert.ok(await e("[...document.querySelectorAll('[role=dialog][class*=backdrop]')].every(x=>x.getBoundingClientRect().top>=document.getElementById('preview-lab').getBoundingClientRect().bottom-1)"), 'Barra cubre diálogo: ' + name);
    // El encabezado es parte del documento y puede estar desplazado al revisar un detalle.
    captures.push({ name, bannerBottom, headerTop });
    fs.writeFileSync(path.join(output, name + '.png'), (await win.webContents.capturePage()).toPNG());
  };
  try {
    // Window visible para que visibilitychange y avisos sigan el ciclo normal del producto.
    win.show(); win.setContentSize(1366, 900);
    await wait("document.getElementById('login-form') && document.getElementById('preview-login')");
    await login('admin');
    await wait("document.querySelector('[data-integration-id=\"9101\"]')");
    assert.equal((await e('App.notificaciones.obtenerResumen()')).counts.pending, 3);
    await capture('administrador-inicio');
    await click('#preview-operations');
    await wait("document.getElementById('operaciones-content')?.getAttribute('aria-busy')==='false'");
    await wait("document.getElementById('operaciones-content').innerText.includes('Grupo 1 · Unidad 2 · 2/12 PAX')");
    assert.ok(await e("document.getElementById('operaciones-content').innerText.includes('Grupo 2 · Vehículo pendiente · 2/12 PAX')"));
    await click('[data-manage-transportes="8101"]');
    await wait("document.getElementById('transportes-identidad')?.innerText.includes('Unidad 2')");
    await click('#reservaciones-organizar');
    await wait("document.getElementById('reservas-asignar-7102')");
    await value('reservas-asignar-7102', 9401); await click('[data-assign-reserva="7102"]');
    await wait("document.getElementById('transportes-identidad')?.innerText.includes('4/12 PAX')");
    assert.equal(api.state.reservas.find(r => r.id_reservacion === 7102).id_transporte_operacion, 9401);
    await click('[data-edit-transporte]'); await wait("document.getElementById('transporte-vehiculo')");
    assert.deepEqual(await e("[...document.getElementById('transporte-vehiculo').options].map(x=>x.value)"), ['', '6202', '6203']);
    await value('transporte-vehiculo', 6203);
    await e("document.getElementById('transporte-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
    await wait("!document.getElementById('transporte-form') && document.getElementById('transportes-identidad')?.innerText.includes('Unidad 3 · 4/8 PAX')");
    await capture('operaciones-cambio-vehiculo');
    checks.push('Operaciones reales: ambos grupos, catálogo, asignación con ID original, cancelada excluida, cambio de unidad y capacidad 8.');
    await click('[data-edit-transporte]'); await wait("document.getElementById('transporte-vehiculo')");
    await value('transporte-vehiculo', '');
    await e("document.getElementById('transporte-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
    await wait("!document.getElementById('transporte-form') && document.getElementById('transportes-identidad')?.innerText.includes('Vehículo pendiente · 4/12 PAX')");
    await click('[data-edit-transporte]'); await wait("document.getElementById('transporte-vehiculo')");
    await value('transporte-vehiculo', 6203);
    await e("document.getElementById('transporte-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
    await wait("!document.getElementById('transporte-form') && document.getElementById('transportes-identidad')?.innerText.includes('Unidad 3 · 4/8 PAX')");
    await click('#transportes-close');
    await click('[data-manage-transportes="8102"]'); await wait("document.getElementById('transportes-identidad')?.innerText.includes('Grupo 2 · Vehículo pendiente · 2/12 PAX')");
    win.setContentSize(1024, 768); await capture('grupo-2-pendiente-1024'); win.setContentSize(1366, 900);
    await click('#transportes-close');
    await click('#operaciones-new'); await wait("document.getElementById('operacion-form')");
    await value('operacion-tour', 501); await value('operacion-turno', 'Tarde'); await value('operacion-grupo', 1); await value('operacion-hora', '14:00');
    await e("document.getElementById('operacion-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
    await wait("document.querySelector('[data-manage-transportes=\"8103\"]')"); await click('[data-manage-transportes="8103"]');
    await wait("document.getElementById('transporte-new') && !document.getElementById('transporte-new').disabled"); await click('#transporte-new');
    await wait("document.getElementById('transporte-form')"); await value('transporte-estado', 'Preparado');
    await e("document.getElementById('transporte-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
    await wait("!document.getElementById('transporte-form') && document.getElementById('transportes-identidad')?.innerText.includes('Vehículo pendiente · 0/12 PAX')");
    assert.equal(api.state.transportes.find(t => t.id_transporte_operacion === 9403).id_operacion_tour, 8103);
    await capture('operacion-nueva-turno-tarde'); await click('#transportes-close');
    checks.push('Retirada y nueva selección de vehículo; grupo 2 pendiente a 1024px; nueva operación Tarde con transporte nuevo e identificadores propios.');
    // El mismo coordinador debe recibir el evento mientras Operaciones sigue abierto.
    await click('#preview-gyg');
    await wait("document.getElementById('preview-message').innerText.includes('#9301') && !document.getElementById('preview-login').disabled");
    await wait("document.getElementById('notification-live').innerText.includes('evento nuevo')");
    assert.equal((await e('App.notificaciones.obtenerResumen()')).counts.pending, 4);
    await click('#notification-toggle'); await wait("document.getElementById('notification-event-9301')");
    await capture('aviso-nueva-reservacion');
    await click('#notification-event-9301');
    await wait("document.querySelector('.dashboard-integration-dialog') && document.body.innerText.includes('DEMO-getyourguide-9301')");
    await wait("!document.getElementById('notification-event-9301')?.innerText.includes('Sin ver')");
    const pendingAfterSeen = (await e('App.notificaciones.obtenerResumen()')).counts.pending;
    assert.equal(pendingAfterSeen, 4);
    const seenStorage = await e("Object.entries(localStorage).filter(([k])=>k.startsWith('ctsk.notifications.v1.'))");
    assert.ok(JSON.stringify(seenStorage).includes('9301'));
    await click('[data-dialog-action="close"]');
    // Reabrir el mismo frontend desde su API conserva cambios/vistos del perfil temporal.
    await win.loadURL(origin + '/index.html'); await wait("document.getElementById('preview-login')"); await login('admin');
    await wait('App.notificaciones.obtenerResumen()?.counts.pending===4');
    assert.ok(!(await e("document.getElementById('notification-live').innerText")));
    await click('#preview-operations');
    await wait("document.getElementById('operaciones-content')?.innerText.includes('Unidad 3 · 4/8 PAX')");
    checks.push('Aviso en otro módulo, detalle real, visto local sin resolver, recarga del frontend conserva estado API y vistos sin repetir aviso.');
    await e("App.router.navigate('dashboard')"); await wait("document.querySelector('[data-integration-id=\"9101\"]')");
    await click('[data-integration-id="9101"]'); await wait("document.querySelector('[data-dialog-action=\"archive\"]')");
    assert.ok((await e('document.body.innerText')).includes('La aprobación no significa'));
    assert.equal(await e("document.querySelector('[data-dialog-action=\"apply-fareharbor\"]').disabled"), true);
    await click('[data-dialog-action="archive"]'); await wait("document.getElementById('integration-archive-reason')");
    assert.equal(await e("document.querySelector('[data-dialog-action=\"confirm-archive\"]').disabled"), true);
    await value('integration-archive-reason', 'Actividad transcurrida. Archivo de demostración.');
    await e("document.getElementById('integration-archive-reason').dispatchEvent(new Event('input'))");
    await capture('archivo-motivo-obligatorio');
    await click('[data-dialog-action="confirm-archive"]');
    await wait("!document.querySelector('.dashboard-integration-dialog') && App.notificaciones.obtenerResumen()?.counts.pending===3");
    await value('dashboard-integration-filter', 'archived');
    await e("document.getElementById('dashboard-integration-filter').dispatchEvent(new Event('change'))");
    await wait("document.querySelector('[data-integration-id=\"9101\"]')"); await click('[data-integration-id="9101"]');
    await wait("document.body.innerText.includes('Actividad transcurrida. Archivo de demostración.')");
    assert.equal(api.events[0].review_status, 'approved'); assert.equal(api.events[0].application_status, 'not_applied');
    await capture('historial-archivado');
    checks.push('Archivo sintético con motivo/fecha/responsable: sale del resumen, historial original, revisión y aplicación conservadas.');
    await login('all');
    await wait("document.querySelector('[data-integration-id=\"9102\"]')"); await click('[data-integration-id="9102"]');
    await wait("document.querySelector('.dashboard-integration-readonly')");
    assert.equal(await e("Boolean(document.querySelector('[data-dialog-action=\"archive\"]'))"), false);
    await click('[data-dialog-action="close"]'); await click('#preview-fh');
    await wait("document.getElementById('preview-message').innerText.includes('#9302')");
    await wait('App.notificaciones.obtenerResumen()?.counts.pending===4');
    checks.push('Consulta all: lectura sin archivo; control de laboratorio separado puede simular una llegada FareHarbor.');
    const before = api.calls.length;
    await login('selected');
    await new Promise(resolve => setTimeout(resolve, 1200));
    assert.equal(await e("Boolean(document.getElementById('notification-toggle'))"), false);
    assert.equal(api.calls.slice(before).some(c => c.actor === api.perfiles.selected.id_usuario && c.path.startsWith('/api/eventos-integracion')), false);
    assert.equal(await e("document.getElementById('preview-gyg').disabled"), true);
    await capture('consulta-selected');
    const selectedIntegrationRequestsBeforeProbe = api.calls.slice(before).filter(c => c.actor === api.perfiles.selected.id_usuario && c.path.startsWith('/api/eventos-integracion')).length;
    const denied = await e("fetch('/api/eventos-integracion/resumen',{headers:{Authorization:'Bearer '+App.auth.obtenerToken()}}).then(r=>r.status)");
    assert.equal(denied, 403);
    checks.push('Consulta selected: sin campana, sin solicitudes de integraciones, controles de llegada deshabilitados y API rechaza acceso forzado.');
    const blockedBefore = blocked.length;
    assert.equal(await e("fetch('http://127.0.0.1:1/no-autorizado').then(()=>false,()=>true)"), true);
    // Otra API efímera ficticia actúa como testigo: webRequest debe bloquear antes del socket.
    let trapHits = 0;
    const trap = require('node:http').createServer((_req, res) => { trapHits++; res.end('No debe recibirse'); });
    await new Promise(resolve => trap.listen(0, '127.0.0.1', resolve));
    try { await assert.rejects(win.webContents.session.fetch('http://127.0.0.1:' + trap.address().port + '/prohibido')); }
    finally { trap.closeAllConnections(); await new Promise(resolve => trap.close(resolve)); }
    assert.equal(trapHits, 0); assert.ok(blocked.length > blockedBefore);
    assert.throws(() => require('node:net').connect(5432, '127.0.0.1'), /no permite conexiones/);
    assert.throws(() => require('pg'), /Módulo bloqueado/);
    assert.throws(() => require('../../backend/config/database'), /Backend real bloqueado/);
    assert.equal(api.errors.length, 0);
    checks.push('Conexión Node a 5432 rechazada antes del socket, pg/backend real bloqueados, CSP y webRequest bloquean otro origen; servidor ficticio testigo recibe cero solicitudes.');
    fs.writeFileSync(path.join(output, 'validacion-electron.json'), JSON.stringify({ checks, captures, profileTemporary: path.basename(profile).startsWith('ctsk-preview-05-'), port: api.server.address().port, calls: api.calls, apiErrors: api.errors, selectedIntegrationRequestsBeforeProbe, forcedSelectedRequestStatus: denied, trapHits, nodeBlocks: isolation.blocked.length, chromiumBlockedAdditional: blocked.length - blockedBefore, databasesLoaded: Object.keys(require.cache).some(k => /node_modules[\\/]pg[\\/]|backend[\\/]config[\\/]database/.test(k)) }, null, 2));
  } catch (error) {
    fs.writeFileSync(path.join(output, 'fallo-electron.json'), JSON.stringify({ message: error.message, calls: api.calls, errors: api.errors }, null, 2));
    throw error;
  }
}
module.exports = { probar };
