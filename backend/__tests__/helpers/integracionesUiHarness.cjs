// Electron real con API ficticia local. Sin PG, Gmail, ngrok ni configuración privada.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..'), output = path.join(root, 'docs/integraciones-controles');
fs.mkdirSync(output, { recursive: true });
app.disableHardwareAcceleration(); app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'ctsk-controls-ui-')));
const actors = [null, { id_usuario: 1, nombre: 'Reservas de prueba', rol: 'Administrador', alcance_plataformas: 'all', platform_ids: [] },
    { id_usuario: 2, nombre: 'Visualización de prueba', rol: 'Consulta', alcance_plataformas: 'all', platform_ids: [] },
    { id_usuario: 3, nombre: 'Consulta limitada', rol: 'Consulta', alcance_plataformas: 'selected', platform_ids: [17] }];
const state = { fareharbor: true, getyourguide: true }, backlog = { fareharbor: 0, getyourguide: 0 }, writes = [];
const errors = [], checks = []; let win;
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) {
        const file = path.resolve(root, 'frontend', '.' + url.pathname);
        if (!file.startsWith(path.join(root, 'frontend') + path.sep) || !fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
        res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.jpg') ? 'image/jpeg' : 'text/html');
        return res.end(fs.readFileSync(file));
    }
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
    const actor = actors[Number((req.headers.authorization || '').replace('Bearer user-', ''))];
    if (!actor) { res.statusCode = 401; return res.end('{}'); }
    let result;
    if (url.pathname === '/api/auth/sesion') result = { usuario: actor };
    else if (url.pathname === '/api/integraciones') result = { datos: Object.keys(state).map(provider => ({
        provider, activado: state[provider], acumulados: actor.alcance_plataformas === 'all' ? backlog[provider] : null,
        conexion: provider === 'fareharbor' ? 'receptor_local_disponible' : 'sincronizando',
        ultima_recepcion: '2026-10-21T14:00:00Z', ultima_sincronizacion: '2026-10-21T14:01:00Z' })) };
    else if (req.method === 'PATCH' && /^\/api\/integraciones\/(fareharbor|getyourguide)$/.test(url.pathname)) {
        if (actor.rol !== 'Administrador') { res.statusCode = 403; return res.end('{}'); }
        let body = ''; for await (const chunk of req) body += chunk;
        const provider = url.pathname.split('/').pop(), activado = JSON.parse(body).activado;
        state[provider] = activado; const liberados = activado ? backlog[provider] : 0;
        if (activado) backlog[provider] = 0;
        writes.push({ provider, activado }); result = { datos: { provider, activado, liberados } };
    } else if (url.pathname === '/api/eventos-integracion/resumen') result = { datos: { environment_id: '5'.repeat(24),
        generated_at: new Date().toISOString(), counts: { pending: 0, actionable: 0, requires_archive: 0, requires_schedule_review: 0 }, events: [] } };
    else if (url.pathname === '/api/dashboard/resumen') result = { metricas: {}, alertas: {}, salidas_hoy: [], reservaciones_recientes: [] };
    else if (url.pathname === '/api/eventos-integracion' || url.pathname === '/api/reservaciones') result = { data: [], pagination: { total: 0, page: 1, limit: 25, totalPages: 0 }, resumen_tours: [] };
    else result = { datos: [] };
    res.end(JSON.stringify(result));
});
async function main() {
    await app.whenReady(); await new Promise(r => server.listen(0, '127.0.0.1', r));
    const origin = 'http://127.0.0.1:' + server.address().port;
    win = new BrowserWindow({ show: false, width: 1366, height: 900, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    win.webContents.on('console-message', event => { if (String(event.message).includes('Uncaught')) errors.push(event.message); });
    win.webContents.session.webRequest.onBeforeRequest((details, cb) => cb({ cancel: !(details.url.startsWith(origin + '/') || details.url.startsWith('data:')) }));
    await win.loadURL(origin + '/index.html');
    const js = code => win.webContents.executeJavaScript(code);
    async function wait(expression) { for (let i = 0; i < 160; i++) { if (await js('Boolean(' + expression + ')')) return; await new Promise(r => setTimeout(r, 25)); } throw Error(expression); }
    async function session(id) {
        await js(`App.auth.establecerSesion('user-${id}',${JSON.stringify(actors[id])});App.router.navigate('integraciones')`);
        await wait("document.querySelectorAll('.integracion-card').length===2");
    }
    await session(1);
    assert.equal(await js("document.querySelectorAll('[data-provider]').length"), 2); checks.push('Reservas tiene dos controles independientes');
    await js("document.querySelector('[data-provider=fareharbor]').click()");
    await wait("document.querySelector('[data-provider=fareharbor]')?.textContent==='Activar FareHarbor'");
    assert.equal(state.getyourguide, true); backlog.fareharbor = 73;
    await js("App.router.renderRoute()"); await wait("document.getElementById('integraciones-lista')?.textContent.includes('Acumulados: 73')");
    await js("document.querySelector('[data-provider=fareharbor]').click()");
    await wait("document.getElementById('integraciones-mensaje')?.textContent.includes('Liberados: 73')");
    await wait("document.querySelector('[data-provider=fareharbor]')?.textContent==='Pausar FareHarbor'");
    checks.push('Pausar/Activar FareHarbor muestra acumulados y liberación; GetYourGuide independiente');
    await js("document.querySelector('[data-provider=getyourguide]').click()");
    await wait("document.querySelector('[data-provider=getyourguide]')?.textContent==='Activar GetYourGuide'");
    await js("document.querySelector('[data-provider=getyourguide]').click()");
    await wait("document.querySelector('[data-provider=getyourguide]')?.textContent==='Pausar GetYourGuide'");
    checks.push('Control GetYourGuide funcional y separado de su estado técnico');
    for (const width of [1366, 1024]) {
        win.setContentSize(width, 768); await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
        assert.equal(await js('document.documentElement.scrollWidth<=innerWidth'), true);
        fs.writeFileSync(path.join(output, 'integraciones-reservas-' + width + '.png'), (await win.webContents.capturePage()).toPNG());
    }
    await session(2); assert.equal(await js("document.querySelectorAll('[data-provider]').length"), 0);
    assert.equal(await js("document.querySelectorAll('.integracion-card').length"), 2);
    fs.writeFileSync(path.join(output, 'integraciones-visualizacion-1024.png'), (await win.webContents.capturePage()).toPNG());
    checks.push('Visualización ve estados sin botones de escritura');
    await session(3); assert.equal(await js("document.getElementById('integraciones-lista').textContent.includes('No disponible para este alcance')"), true);
    await js("App.auth.limpiarSesion();App.router.navigate('login')"); await wait("!document.getElementById('integraciones-lista')");
    checks.push('Consulta restringida sin cantidades; logout limpia la vista');
    assert.deepEqual(writes.map(w => w.provider), ['fareharbor', 'fareharbor', 'getyourguide', 'getyourguide']);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'electron-ui-result.json'), JSON.stringify({ status: 'PASSED', checks, mockApi: true, realPostgres: false }, null, 2));
    console.log(JSON.stringify({ status: 'PASSED', checks }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => { win?.destroy(); server.close(); app.quit(); });
