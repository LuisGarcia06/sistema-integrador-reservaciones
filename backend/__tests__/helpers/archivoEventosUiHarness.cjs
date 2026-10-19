// Frontend real y servidor exclusivamente sintético. Nunca carga .env, pg o backend/server.
const { app, BrowserWindow } = require('electron');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const output = process.env.PRE_RELEASE_03_OUTPUT ? path.resolve(process.env.PRE_RELEASE_03_OUTPUT) : fs.mkdtempSync(path.join(os.tmpdir(), 'pre-release-03-ui-'));
if (process.env.PRE_RELEASE_03_OUTPUT && output !== path.join(root, 'docs/pre-release-03')) throw Error('Destino de evidencia no autorizado');
fs.mkdirSync(output, { recursive: true });
app.disableHardwareAcceleration(); app.commandLine.appendSwitch('in-process-gpu'); app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'pre-release-03-profile-')));
const admin = { id_usuario: 7001, nombre: 'Administrador sintético', rol: 'Administrador', alcance_plataformas: 'all', platform_ids: [] };
let user = admin;
const summary = { booking: { display_id: '#SYN-9101', status: 'booked' }, availability: { start_at: '2020-01-05T06:00:00-0500', item: { name: 'Recorrido sintético' } }, customers: { total: 2 }, money: {} };
const evento = { id_evento_integracion: 9101, provider: 'fareharbor', external_booking_id: 'synthetic-booking-9101', event_type: 'new_booking', review_status: 'approved', application_status: 'not_applied', reviewed_by: 7002, reviewed_at: '2026-10-16T12:00:00Z', created_at: '2026-10-17T15:00:00Z', fareharbor_summary: summary, archived_at: null,
    fareharbor_application_preview: { tipo: 'preview', activity_timing: { has_started: true }, money_ready: true, missing_fields: [], issues: ['La actividad ya inició y no puede registrarse como una reservación operativa.'], reservation_candidate: { pax: 2, nombre_cliente: 'Cliente sintético', fecha: '2020-01-05' }, external: { activity_title: 'Recorrido sintético', start_at: summary.availability.start_at, categories: [] }, sources: {} } };
const gyg = { id_evento_integracion: 9102, provider: 'getyourguide', external_booking_id: 'GYG-SYN-9102', event_type: 'new_booking', review_status: 'pending_review', application_status: 'not_applied', created_at: '2026-10-17T15:01:00Z', normalized_data: {} };
const rows = [evento, gyg, ...Array.from({ length: 26 }, (_, i) => ({ ...gyg, id_evento_integracion: 9200 + i, external_booking_id: 'GYG-HIST-SYN-' + i, archived_at: '2026-10-16T18:00:00Z', archived_by: 7001, archived_by_name: admin.nombre, archive_reason: 'Archivo histórico sintético' }))];
const calls = [], errors = [], captures = [];
const server = http.createServer(async (req, res) => {
    try {
        const u = new URL(req.url, 'http://localhost'); res.setHeader('Cache-Control', 'no-store');
        if (!u.pathname.startsWith('/api/')) {
            const file = path.resolve(root, 'frontend', '.' + u.pathname);
            if (!file.startsWith(path.join(root, 'frontend') + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
            res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : /\.jpe?g$/.test(file) ? 'image/jpeg' : 'text/html'); return res.end(fs.readFileSync(file));
        }
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = raw ? JSON.parse(raw) : null;
        calls.push({ path: u.pathname, query: u.search, method: req.method, body }); res.setHeader('Content-Type', 'application/json');
        const restricted = user.alcance_plataformas === 'selected';
        if (restricted && u.pathname.startsWith('/api/eventos-integracion')) { res.statusCode = 403; return res.end('{"mensaje":"Acceso no autorizado"}'); }
        let data;
        if (u.pathname === '/api/auth/sesion') data = { usuario: user };
        else if (u.pathname === '/api/dashboard/resumen') data = { fecha: '2026-10-17', alcance_parcial: restricted, metricas: {}, alertas: {}, reservaciones_recientes: [], salidas_hoy: [] };
        else if (u.pathname === '/api/eventos-integracion/resumen') data = require('./resumenNotificacionesSintetico.cjs').resumenNotificacionesSintetico(rows);
        else if (u.pathname === '/api/eventos-integracion') {
            const archived = u.searchParams.get('archived') === 'true';
            let selected = rows.filter(r => Boolean(r.archived_at) === archived && (!u.searchParams.has('review_status') || r.review_status === u.searchParams.get('review_status')));
            selected = [...selected].sort((a, b) => (b.id_evento_integracion === 9101 ? 1 : 0) - (a.id_evento_integracion === 9101 ? 1 : 0));
            const page = Number(u.searchParams.get('page') || 1), limit = Number(u.searchParams.get('limit') || 25);
            data = { data: selected.slice((page - 1) * limit, page * limit), pagination: { page, limit, total: selected.length, totalPages: Math.ceil(selected.length / limit) } };
        } else if (u.pathname === '/api/eventos-integracion/9101/archivo') {
            assert.equal(req.method, 'PATCH'); assert.equal(user.rol, 'Administrador');
            assert.ok(body.motivo.trim()); assert.ok(Array.from(body.motivo).length <= 500); assert.equal(evento.archived_at, null);
            Object.assign(evento, { archived_at: '2026-10-17T19:00:00Z', archived_by: user.id_usuario, archived_by_name: user.nombre, archive_reason: body.motivo });
            data = { datos: evento, mensaje: 'Evento archivado correctamente' };
        } else if (/^\/api\/eventos-integracion\/\d+$/.test(u.pathname)) {
            const row = rows.find(r => r.id_evento_integracion === Number(u.pathname.split('/').pop()));
            const { fareharbor_application_preview: preview, ...rest } = row;
            data = { datos: row.archived_at ? rest : row };
        } else if (u.pathname === '/api/tours') data = { datos: [] };
        else throw Error('Solicitud inesperada: ' + req.method + ' ' + u.pathname);
        res.end(JSON.stringify(data));
    } catch (error) { errors.push(error.message); res.statusCode = 500; res.end(JSON.stringify({ mensaje: error.message })); }
});
async function run() {
    await app.whenReady(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    win.setContentSize(1366, 900);
    win.webContents.session.webRequest.onBeforeRequest((details, cb) => { const url = new URL(details.url), allowed = url.origin === origin || url.protocol === 'data:'; if (!allowed) errors.push('Red externa bloqueada'); cb({ cancel: !allowed }); });
    const e = code => win.webContents.executeJavaScript(code);
    const wait = async condition => { for (let i = 0; i < 220; i++) { if (await e('Boolean(' + condition + ')')) return; await new Promise(r => setTimeout(r, 25)); } throw Error(condition + '\n' + await e('document.body.innerText')); };
    const click = selector => e(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const capture = async name => {
        await e("if(!document.querySelector('.dashboard-integration-dialog'))document.getElementById('dashboard-integration-section')?.scrollIntoView({block:'start'})");
        await e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'); await new Promise(r => setTimeout(r, 100));
        const m = await e('({width:innerWidth,documentWidth:document.documentElement.scrollWidth})');
        assert.ok(m.documentWidth <= m.width); captures.push({ name, ...m });
        fs.writeFileSync(path.join(output, name + '.png'), (await win.webContents.capturePage()).toPNG());
    };
    const session = async actor => { user = actor; await e(`App.auth.establecerSesion('sintetico',${JSON.stringify(actor)});App.router.navigate('dashboard')`); await wait("document.getElementById('dashboard-integration-filter') || document.querySelector('.dashboard-metric-card')"); };
    await win.loadURL(origin + '/index.html'); await wait("document.getElementById('login-form')"); await session(admin);
    await wait("document.querySelector('.dashboard-integration-count')?.innerText==='2'");
    await capture('pendientes-activos-1366');
    await click('[data-integration-id="9102"]'); await wait("document.querySelector('[data-dialog-action=\"dismiss\"]')");
    assert.ok(await e("Boolean(document.querySelector('[data-dialog-action=\"archive\"]'))"));
    await click('[data-dialog-action="close"]');
    await click('[data-integration-id="9101"]'); await wait("document.querySelector('[data-dialog-action=\"archive\"]')");
    assert.equal(await e("document.querySelector('[data-dialog-action=\"apply-fareharbor\"]').disabled"), true);
    await click('[data-dialog-action="archive"]');
    await wait("document.getElementById('integration-archive-reason')");
    assert.equal(await e("document.querySelector('[data-dialog-action=\"confirm-archive\"]').disabled"), true);
    await capture('archivo-advertencia-1366');
    await e("document.getElementById('integration-archive-reason').value='  ';document.getElementById('integration-archive-reason').dispatchEvent(new Event('input'))");
    assert.equal(await e("document.querySelector('[data-dialog-action=\"confirm-archive\"]').disabled"), true);
    await e("document.getElementById('integration-archive-reason').value='Actividad transcurrida; sin aplicar. Caso sintético.';document.getElementById('integration-archive-reason').dispatchEvent(new Event('input'))");
    win.setContentSize(1024, 768); await capture('archivo-motivo-1024');
    await click('[data-dialog-action="confirm-archive"]');
    await wait("!document.querySelector('.dashboard-integration-dialog') && document.querySelector('.dashboard-integration-count')?.innerText==='1'");
    assert.equal(evento.review_status, 'approved'); assert.equal(evento.application_status, 'not_applied'); assert.equal(evento.reviewed_by, 7002);
    assert.equal(await e("Boolean(document.querySelector('[data-integration-id=\"9101\"]'))"), false);
    await capture('pendientes-despues-1024');
    await e("document.getElementById('dashboard-integration-filter').value='archived';document.getElementById('dashboard-integration-filter').dispatchEvent(new Event('change'))");
    await wait("document.querySelector('.dashboard-integration-count')?.innerText==='27' && document.getElementById('integration-archive-next')");
    await capture('historial-archivados-1024');
    await click('#integration-archive-next'); await wait("document.body.innerText.includes('Página 2 de 2') && !document.getElementById('integration-archive-prev').disabled");
    await click('#integration-archive-prev'); await wait("document.body.innerText.includes('Página 1 de 2') && !document.getElementById('integration-archive-next').disabled");
    await click('[data-integration-id="9101"]'); await wait("document.body.innerText.includes('Evento archivado')");
    assert.equal(await e("Boolean(document.querySelector('[data-dialog-action=\"archive\"], [data-dialog-action=\"apply-fareharbor\"], [data-dialog-action=\"dismiss\"]'))"), false);
    assert.ok((await e('document.body.innerText')).includes('Actividad transcurrida; sin aplicar. Caso sintético.'));
    assert.ok((await e('document.body.innerText')).includes('Administrador sintético · Usuario #7001'));
    win.setContentSize(1366, 900); await capture('detalle-archivado-1366');
    win.setContentSize(1024, 768); await capture('detalle-archivado-1024');
    await session({ ...admin, rol: 'Consulta' });
    await wait("document.querySelector('[data-integration-id=\"9102\"]')");
    await click('[data-integration-id="9102"]'); await wait("document.querySelector('.dashboard-integration-readonly')");
    assert.equal(await e("Boolean(document.querySelector('[data-dialog-action=\"archive\"]'))"), false);
    const beforeSelected = calls.length;
    await session({ ...admin, rol: 'Consulta', alcance_plataformas: 'selected', platform_ids: [17] });
    await wait("document.body.innerText.includes('Información limitada')");
    assert.equal(await e("Boolean(document.getElementById('dashboard-integration-filter'))"), false);
    assert.equal(calls.slice(beforeSelected).some(c => c.path.startsWith('/api/eventos-integracion')), false);
    assert.equal(calls.filter(c => c.method !== 'GET').length, 1);
    assert.ok(!calls.some(c => /\/aplicar|\/diff/.test(c.path)));
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'validacion.json'), JSON.stringify({ captures, calls, errors, originalReviewPreserved: evento.review_status === 'approved', originalApplicationPreserved: evento.application_status === 'not_applied' }, null, 2));
    console.log('ARCHIVO_EVENTOS_UI_OK'); win.destroy(); server.close(); app.exit(0);
}
run().catch(error => { fs.writeFileSync(path.join(output, 'fallo.json'), JSON.stringify({ error: error.message, calls, errors, captures }, null, 2)); console.error(error); server.close(); app.exit(1); });
