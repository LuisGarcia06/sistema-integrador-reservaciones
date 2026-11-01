// Electron real, exclusivamente contra API ficticia en loopback. No importa pg/backend/config/.env.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const output = process.env.PRE_RELEASE_04_OUTPUT ? path.resolve(process.env.PRE_RELEASE_04_OUTPUT) : fs.mkdtempSync(path.join(os.tmpdir(), 'pr04-evidence-'));
if (process.env.PRE_RELEASE_04_OUTPUT && output !== path.join(root, 'docs/pre-release-04')) throw Error('Destino de evidencia no autorizado');
fs.mkdirSync(output, { recursive: true });
app.disableHardwareAcceleration(); app.commandLine.appendSwitch('in-process-gpu'); app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'pr04-profile-')));
const admin = { id_usuario: 7101, nombre: 'Administrador sintético', rol: 'Administrador', alcance_plataformas: 'all', platform_ids: [] };
const all = { ...admin, id_usuario: 7102, nombre: 'Consulta sintética', rol: 'Consulta' };
const users = new Map([[admin.id_usuario, admin], [all.id_usuario, all]]);
const environment = '4'.repeat(24), calls = [], checks = [], captures = [], errors = [];
let inFlight = 0, maxInFlight = 0, delay = 20, offline = false;
const event = (id, provider = 'getyourguide', overrides = {}) => ({ id_evento_integracion: id, provider, external_booking_id: 'SYN-' + id, event_type: 'new_booking', review_status: 'pending_review', application_status: 'not_applied', archived_at: null, created_at: '2026-10-17T10:00:00Z', normalized_data: { customer_name: 'Visitante sintético', date: '2099-01-05', pax: 2, pickup_place: 'Punto de encuentro sintético', tour_language: 'Español', turno: 'Mañana' },
    fareharbor_summary: { booking: { display_id: '#SYN-' + id }, availability: { start_at: '2099-01-05T06:00:00-0500', item: { name: 'Recorrido sintético' } }, customers: { total: 2 }, money: {} }, ...overrides });
const rows = Array.from({ length: 64 }, (_, i) => event(11001 + i, i % 2 ? 'fareharbor' : 'getyourguide'));
rows[1].fareharbor_summary.availability.start_at = '2020-01-05T06:00:00-0500';
rows[2].event_type = rows[3].event_type = 'modification'; rows[4].event_type = rows[5].event_type = 'cancellation';
rows.push(event(12001, 'getyourguide', { application_status: 'applied' }), event(12002, 'fareharbor', { archived_at: '2026-10-16' }), event(12003, 'getyourguide', { review_status: 'dismissed' }));
const eligible = () => rows.filter(r => !r.archived_at && r.application_status !== 'applied' && ['approved', 'pending_review'].includes(r.review_status));
function summary() {
    const events = eligible().sort((a, b) => b.id_evento_integracion - a.id_evento_integracion).map(r => ({ id_evento_integracion: r.id_evento_integracion, provider: r.provider, event_type: r.event_type, review_status: r.review_status,
        attention: r.provider === 'fareharbor' && r.event_type === 'new_booking' && r.fareharbor_summary.availability.start_at.startsWith('2020') ? 'requires_archive' : 'actionable' }));
    return { environment_id: environment, generated_at: new Date().toISOString(), counts: { pending: events.length, actionable: events.filter(e => e.attention === 'actionable').length, requires_archive: events.filter(e => e.attention === 'requires_archive').length, requires_schedule_review: 0 }, events };
}
const server = http.createServer(async (req, res) => {
    try {
        const u = new URL(req.url, 'http://localhost'); res.setHeader('Cache-Control', 'no-store');
        if (!u.pathname.startsWith('/api/')) {
            const file = path.resolve(root, 'frontend', '.' + u.pathname);
            if (!file.startsWith(path.join(root, 'frontend') + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
            res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : /\.jpe?g$/.test(file) ? 'image/jpeg' : 'text/html'); return res.end(fs.readFileSync(file));
        }
        assert.equal(req.method, 'GET', 'Las notificaciones solo consultan');
        const id = Number((req.headers.authorization || '').replace('Bearer fixture-user-', ''));
        const user = users.get(id); assert.ok(user, 'Sesión sintética identificada');
        calls.push({ path: u.pathname, query: u.search, method: req.method, actor: id }); res.setHeader('Content-Type', 'application/json');
        if (user.alcance_plataformas === 'selected' && u.pathname.startsWith('/api/eventos-integracion')) { res.writeHead(403); return res.end('{"mensaje":"Acceso no autorizado"}'); }
        let data;
        if (u.pathname === '/api/auth/sesion') data = { usuario: user };
        else if (u.pathname === '/api/eventos-integracion/resumen') {
            inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise(r => setTimeout(r, delay)); inFlight -= 1;
            if (offline) { res.writeHead(500); return res.end('{"mensaje":"Fallo sintético de conexión"}'); }
            data = { datos: summary() };
        } else if (u.pathname === '/api/eventos-integracion/centro' || /^\/api\/eventos-integracion\/centro\/\d+\/historial$/.test(u.pathname)) {
            data = require('./notificacionesCentroFixture.cjs').respond(rows, u);
        } else if (u.pathname === '/api/eventos-integracion') {
            const selected = rows.filter(r => Boolean(r.archived_at) === (u.searchParams.get('archived') === 'true') && (!u.searchParams.has('review_status') || r.review_status === u.searchParams.get('review_status')));
            const limit = Number(u.searchParams.get('limit') || 25); data = { data: selected.slice(0, limit), pagination: { total: selected.length, page: 1, limit, totalPages: Math.ceil(selected.length / limit) } };
        } else if (/^\/api\/eventos-integracion\/\d+$/.test(u.pathname)) data = { datos: rows.find(r => r.id_evento_integracion === Number(u.pathname.split('/').pop())) };
        else if (/^\/api\/eventos-integracion\/\d+\/diff$/.test(u.pathname)) data = { datos: { aplicable: false, changes: [] } };
        else if (u.pathname === '/api/dashboard/resumen') data = { fecha: '2026-10-17', alcance_parcial: user.alcance_plataformas === 'selected', metricas: {}, alertas: {}, reservaciones_recientes: [], salidas_hoy: [] };
        else if (u.pathname === '/api/reservaciones') data = { data: [], pagination: { total: 0, totalPages: 0, page: 1, limit: 25 }, resumen_tours: [] };
        else if (['/api/tours', '/api/paises', '/api/plataformas'].includes(u.pathname)) data = { datos: [] };
        else throw Error('Solicitud inesperada: ' + u.pathname);
        res.end(JSON.stringify(data));
    } catch (e) { errors.push(e.message); res.statusCode = 500; res.end(JSON.stringify({ mensaje: e.message })); }
});
const windows = [];
async function run() {
    await app.whenReady(); await new Promise(r => server.listen(0, '127.0.0.1', r));
    const origin = 'http://127.0.0.1:' + server.address().port;
    async function create() {
        const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } }); windows.push(win); win.setContentSize(1366, 900);
        win.webContents.on('console-message', event => { if (String(event.message).includes('Uncaught')) errors.push(event.message); });
        win.webContents.session.webRequest.onBeforeRequest((details, cb) => { const u = new URL(details.url), ok = u.origin === origin || u.protocol === 'data:'; if (!ok) errors.push('Red externa bloqueada'); cb({ cancel: !ok }); });
        await win.loadURL(origin + '/index.html');
        const e = js => win.webContents.executeJavaScript(js);
        await e("window.__fixtureHidden=false;Object.defineProperty(document,'hidden',{get:()=>window.__fixtureHidden,configurable:true});void 0");
        return { win, e, click: selector => e('document.querySelector(' + JSON.stringify(selector) + ').click()'),
            async wait(condition) { for (let i = 0; i < 240; i++) { if (await e('Boolean(' + condition + ')')) return; await new Promise(r => setTimeout(r, 25)); } throw Error(condition + '\n' + await e('document.body.innerText')); },
            async session(actor, route = 'reservaciones') { users.set(actor.id_usuario, actor); await e(`App.auth.establecerSesion('fixture-user-${actor.id_usuario}',${JSON.stringify(actor)});App.router.navigate(${JSON.stringify(route)})`); },
            async hidden(value) { await e(`window.__fixtureHidden=${value};document.dispatchEvent(new Event('visibilitychange'))`); } };
    }
    async function capture(c, name) {
        await c.e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'); await new Promise(r => setTimeout(r, 100));
        const m = await c.e("({width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,panel:(()=>{const p=document.getElementById('notification-panel');if(!p)return null;const r=p.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}})()})");
        assert.ok(m.documentWidth <= m.width, 'Sin desborde global'); if (m.panel) assert.ok(m.panel.left >= 0 && m.panel.right <= m.width && m.panel.top >= 0 && m.panel.bottom <= m.height);
        captures.push({ name, ...m }); fs.writeFileSync(path.join(output, name + '.png'), (await c.win.webContents.capturePage()).toPNG());
    }
    const c = await create();
    await c.session(admin); await c.wait("App.notificaciones.obtenerResumen()?.counts.pending===64 && document.getElementById('notification-toggle')");
    assert.equal(await c.e("document.getElementById('notification-live').textContent"), ''); checks.push('Primer acceso: 64 históricos sin ráfaga; aplicado/archivado/descartado excluidos');
    await c.click('#notification-toggle'); await c.wait("document.getElementById('notification-panel')");
    await capture(c, 'multiples-pendientes-1366');
    assert.ok((await c.e("document.getElementById('notification-panel').innerText")).includes('64 pendientes · 64 sin ver')); checks.push('Conteo completo >50 y categorías accionables/archivo separadas');
    await c.e("for(let i=0;i<6;i++)document.getElementById('notification-next').click();document.getElementById('notification-panel').scrollTop=0;void 0");
    await c.wait("document.getElementById('notification-panel').innerText.includes('Actividad iniciada · Requiere archivo')");
    assert.ok((await c.e("document.getElementById('notification-event-11004').innerText")).includes('Modificación'));
    await c.click('#notification-prev');
    assert.ok((await c.e("document.getElementById('notification-event-11006').innerText")).includes('Cancelación'));
    await c.click('#notification-next');
    checks.push('FareHarbor: etiquetas Modificación y Cancelación visibles en Avisos, con estado pendiente');
    await capture(c, 'actividad-iniciada-y-conciliacion-1366'); checks.push('Paginación hasta históricos: alta vencida distinta de modificaciones y cancelaciones accionables');
    await c.e("for(let i=0;i<6;i++)document.getElementById('notification-prev').click();document.getElementById('notification-panel').scrollTop=0;void 0");
    rows.push(event(13001)); await c.e('App.notificaciones.refresh()'); await c.wait("document.getElementById('notification-live').textContent.includes('GetYourGuide')");
    await capture(c, 'nueva-getyourguide-1366'); checks.push('Nueva GYG visible desde Reservaciones');
    rows.push(event(13002, 'fareharbor')); await c.e('App.notificaciones.refresh()'); await c.wait("document.getElementById('notification-live').textContent.includes('FareHarbor')");
    c.win.setContentSize(1024, 768); await capture(c, 'nueva-fareharbor-1024'); checks.push('Nueva FareHarbor y ajuste 1024x768');
    await c.click('#notification-event-13001'); await c.wait("document.querySelector('.dashboard-integration-dialog') && document.body.innerText.includes('GYG-SYN')===false && document.querySelector('[data-dialog-action=\"archive\"]')");
    await c.wait("localStorage.getItem('ctsk.notifications.v1.'+'4'.repeat(24)+'.7101')?.includes('13001')");
    const stored = JSON.parse(await c.e("localStorage.getItem('ctsk.notifications.v1.'+'4'.repeat(24)+'.7101')")); assert.ok(stored.seen.some(p => p[0] === 13001));
    assert.equal(await c.e('App.notificaciones.obtenerResumen().counts.pending'), 66);
    await capture(c, 'detalle-desde-aviso-1024'); checks.push('Navegación a Dashboard, GET fresco y visto sin cambiar pendiente/revisión/aplicación');
    await c.click('[data-dialog-action="close"]');
    await c.e("App.router.navigate('reservaciones')"); await c.wait("document.getElementById('notification-toggle') && location.hash==='#/reservaciones'");
    await c.click('#notification-toggle'); await c.wait("document.getElementById('notification-event-13002')");
    await c.wait("document.querySelector('#notification-event-13001 .notification-read')?.textContent==='Visto'");
    assert.ok((await c.e("document.getElementById('notification-panel').innerText")).includes('66 pendientes · 65 sin ver'));
    assert.equal(rows.find(r => r.id_evento_integracion === 13001).review_status, 'pending_review');
    assert.equal(rows.find(r => r.id_evento_integracion === 13001).application_status, 'not_applied');
    await capture(c, 'notificacion-vista-1024'); checks.push('Notificación vista: permanece pendiente; contador sin ver disminuye sin aprobar ni aplicar');
    rows.find(r => r.id_evento_integracion === 13002).archived_at = '2026-10-17T18:00:00Z';
    await c.click('#notification-event-13002'); await c.wait("document.body.innerText.includes('Este evento ya no está pendiente')");
    assert.equal(await c.e("Boolean(document.querySelector('[data-dialog-action=\"archive\"]'))"), false); checks.push('Evento archivado entre aviso y clic: detalle anterior no mostrado');
    await c.click('[data-dialog-action="close"]');
    await c.click('#notification-toggle'); await c.wait("document.getElementById('notification-event-11064')");
    rows.find(r => r.id_evento_integracion === 11064).application_status = 'applied';
    await c.click('#notification-event-11064'); await c.wait("document.body.innerText.includes('Este evento ya no está pendiente')");
    assert.equal(await c.e("Boolean(document.querySelector('[data-dialog-action=\"archive\"]'))"), false);
    const afterConflicts = JSON.parse(await c.e("localStorage.getItem('ctsk.notifications.v1.'+'4'.repeat(24)+'.7101')"));
    assert.ok(!afterConflicts.seen.some(p => [11064, 13002].includes(p[0]))); checks.push('Aplicado entre aviso y clic: sin detalle antiguo ni marcado visto; archivos tampoco se marcan');
    await c.click('[data-dialog-action="close"]');
    const b = await create(); await b.session(admin); await b.wait("App.notificaciones.obtenerResumen()?.counts.pending===64");
    const before = calls.filter(r => r.path.endsWith('/resumen') && r.path.includes('eventos-integracion')).length;
    delay = 250; await Promise.all([c.e('App.notificaciones.refresh();App.notificaciones.refresh()'), b.e('App.notificaciones.refresh();App.notificaciones.refresh()')]);
    await new Promise(r => setTimeout(r, 400)); assert.equal(maxInFlight, 1);
    assert.ok(calls.filter(r => r.path === '/api/eventos-integracion/resumen').length <= before + 2); checks.push('Dos ventanas mismo perfil: líder compartido, resumen difundido y máximo un request simultáneo');
    await c.hidden(true); await b.wait("App.notificaciones.obtenerResumen()?.counts.pending===64");
    await new Promise(r => setTimeout(r, 400)); offline = true;
    await b.e('App.notificaciones.refresh()'); await b.click('#notification-toggle'); await b.wait("document.body.innerText.includes('No se pudo actualizar')");
    assert.equal(await b.e('App.notificaciones.obtenerResumen().counts.pending'), 64); checks.push('Falla conserva conteos y comunica estado');
    offline = false; await b.e('App.notificaciones.refresh()'); await b.wait("!document.body.innerText.includes('No se pudo actualizar')"); checks.push('Recuperación de conexión');
    await b.e('App.auth.cerrarSesion()'); await b.wait("document.getElementById('login-form')"); assert.equal(await b.e("Boolean(document.getElementById('notification-toggle'))"), false);
    await c.hidden(false); await c.session(all); await c.wait("App.notificaciones.obtenerResumen()?.counts.pending===64 && document.getElementById('notification-toggle')");
    c.win.setContentSize(1366, 900); await c.click('#notification-toggle'); await capture(c, 'consulta-all-1366');
    await c.click('#notification-event-13001'); await c.wait("document.querySelector('.dashboard-integration-readonly')");
    assert.equal(await c.e("Boolean(document.querySelector('[data-dialog-action=\"archive\"],[data-dialog-action=\"approve\"],[data-dialog-action=\"apply-new-booking\"]'))"), false); checks.push('Consulta all: notificaciones y detalle en lectura');
    await c.click('[data-dialog-action="close"]');
    // Acabar consultas all ya solicitadas antes de medir la revocación a selected.
    await c.e('Promise.all([App.notificaciones.refresh(), App.auth.refrescarSesion()])');
    const firstSelected = calls.length;
    users.set(all.id_usuario, { ...all, alcance_plataformas: 'selected', platform_ids: [17] });
    await c.e('App.auth.refrescarSesion()'); await c.wait("document.body.innerText.includes('Información limitada')");
    assert.equal(await c.e("Boolean(document.getElementById('notification-toggle'))"), false);
    assert.equal(calls.slice(firstSelected).some(r => r.path.startsWith('/api/eventos-integracion')), false); c.win.setContentSize(1024, 768); await capture(c, 'consulta-selected-sin-avisos-1024'); checks.push('Revocación a selected: sin indicador, datos previos ni consultas de eventos');
    await c.session({ ...admin, id_usuario: 7103, nombre: 'Otra sesión sintética' }); await c.wait("App.notificaciones.obtenerResumen()?.counts.pending===64");
    await c.click('#notification-toggle'); await c.wait("document.getElementById('notification-panel').innerText.includes('64 sin ver')"); checks.push('Cambio de usuario: vistos separados');
    rows.forEach(r => { r.application_status = 'applied'; }); await c.e('App.notificaciones.refresh()'); await c.wait("App.notificaciones.obtenerResumen()?.counts.pending===0");
    assert.equal(await c.e("document.querySelector('.notification-badge').textContent"), '0');
    c.win.setContentSize(1366, 900); await capture(c, 'sin-novedades-1366'); checks.push('Estado sin novedades y exclusión de aplicados');
    assert.ok(calls.every(r => r.method === 'GET')); assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'validacion.json'), JSON.stringify({ checks, captures, calls, errors, maxSummaryRequestsInFlight: maxInFlight, onlySyntheticReadRequests: true }, null, 2));
    console.log('NOTIFICACIONES_UI_OK'); windows.forEach(w => w.destroy()); server.close(); app.exit(0);
}
run().catch(e => { fs.writeFileSync(path.join(output, 'fallo.json'), JSON.stringify({ error: e.message, checks, calls, captures, errors }, null, 2)); console.error(e); windows.forEach(w => w.destroy()); server.close(); app.exit(1); });
