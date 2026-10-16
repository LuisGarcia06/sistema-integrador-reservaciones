const { app, BrowserWindow } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('in-process-gpu');
app.commandLine.appendSwitch('no-sandbox');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'access-scope-03b-')));
const root = path.resolve(__dirname, '../../..');
let current = { id_usuario: 3, nombre: 'Consulta externa', rol: 'Consulta', alcance_plataformas: 'selected', platform_ids: [17] };
let failSession = false;
let detailError = 0;
const calls = [];
const checks = [];
const platforms = [{ id_plataforma: 17, nombre: 'Canal A' }, { id_plataforma: 83, nombre: 'Canal B' }];
const users = [
 { id_usuario: 6, nombre: 'Otro Admin', correo: 'otro@example.test', id_rol: 10, rol: 'Administrador', estado: true, alcance_plataformas: 'all', platform_ids: [] },
 { id_usuario: 5, nombre: 'Admin', correo: 'admin@example.test', id_rol: 10, rol: 'Administrador', estado: true, alcance_plataformas: 'all', platform_ids: [] },
 { id_usuario: 7, nombre: 'Consulta', correo: 'consulta@example.test', id_rol: 20, rol: 'Consulta', estado: true, alcance_plataformas: 'selected', platform_ids: [83] }
];
const rows = [{ id_reservacion: 1, codigo: 'VISIBLE-1', nombre_cliente: 'Cliente autorizado', fecha: '2020-01-05', id_plataforma: 17, plataforma: 'Canal A', id_tour: 501, tour: 'Tour general', estado: 'Pendiente', pax: 2, precio_total: 100, pickup_place: 'Hotel', pickup_time: '08:00', turno: 'Mañana' }];
const privateRow = { ...rows[0], id_reservacion: 99, id_plataforma: 83, nombre_cliente: 'SECRETO ANTERIOR', codigo: 'OCULTA' };
const server = http.createServer(async (req, res) => {
 const url = new URL(req.url, 'http://localhost');
 if (!url.pathname.startsWith('/api/')) {
  const file = path.resolve(root, 'frontend', '.' + url.pathname);
  if (!file.startsWith(path.join(root, 'frontend') + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); res.end(fs.readFileSync(file)); return;
 }
 let raw = ''; for await (const chunk of req) raw += chunk;
 const body = raw ? JSON.parse(raw) : null;
 calls.push({ path: url.pathname, method: req.method, body });
 res.setHeader('Content-Type', 'application/json');
 const restricted = current.rol === 'Consulta' && current.alcance_plataformas === 'selected';
 const visible = restricted ? rows.filter((row) => current.platform_ids.includes(row.id_plataforma)) : [...rows, privateRow];
 let data;
 switch (url.pathname) {
  case '/api/auth/login': data = { token: 'token-sintetico', usuario: current }; break;
  case '/api/auth/sesion': if (failSession) { res.writeHead(500); data = { mensaje: 'Fallo simulado' }; } else data = { usuario: current }; break;
  case '/api/dashboard/resumen': data = { fecha: '2027-01-15', alcance_parcial: restricted, metricas: { reservaciones_vigentes: visible.length, pax_vigentes: visible.length * 2, grupos_preparados: 2, grupos_pendientes: 1 }, alertas: {}, reservaciones_recientes: visible, salidas_hoy: [] }; break;
  case '/api/plataformas': data = { datos: restricted ? platforms.filter((pl) => current.platform_ids.includes(pl.id_plataforma)) : platforms }; break;
  case '/api/tours': data = { datos: [{ id_tour: 501, nombre: 'Tour general', activo: true }] }; break;
  case '/api/paises': data = { datos: [{ id_pais: 8, nombre: 'País' }] }; break;
  case '/api/eventos-integracion': data = { data: [], pagination: { total: 0 } }; break;
  case '/api/usuarios/roles': data = { datos: [{ id_rol: 10, nombre: 'Administrador' }, { id_rol: 20, nombre: 'Consulta' }] }; break;
  case '/api/usuarios': data = req.method === 'GET' ? { datos: users } : { datos: { ...body, id_usuario: 9 } }; break;
  case '/api/reservaciones': data = { data: visible, pagination: { page: 1, limit: 25, total: visible.length, totalPages: visible.length ? 1 : 0 } }; break;
  default:
   if (url.pathname.startsWith('/api/usuarios/')) data = { datos: body };
   else if (url.pathname.startsWith('/api/reservaciones/')) {
    const row = visible.find((row) => row.id_reservacion === Number(url.pathname.split('/').pop()));
    if (detailError) { res.writeHead(detailError); data = { mensaje: detailError === 404 ? 'Reservación no encontrada' : 'Acceso no autorizado' }; } else if (!row) { res.writeHead(404); data = { mensaje: 'Reservación no encontrada' }; } else data = { datos: row };
   } else { res.writeHead(403); data = { mensaje: 'Acceso no autorizado' }; }
 }
 const snapshot = JSON.stringify(data);
 if (url.searchParams.has('delay')) setTimeout(() => res.end(snapshot), 120);
 else res.end(snapshot);
});

async function run() {
 await app.whenReady();
 await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
 const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
 const evaluate = async (source) => { try { return await win.webContents.executeJavaScript(source); } catch (error) { throw new Error(source + ': ' + error.message); } };
 const wait = async (condition) => {
  for (let i = 0; i < 100; i++) { if (await evaluate(condition)) return; await new Promise((r) => setTimeout(r, 30)); }
  throw Error('No se cumplio condicion DOM: ' + condition + '\n' + await evaluate('document.body.innerText'));
 };
 const check = async (label, fn) => { await fn(); checks.push(label); };
 const change = async (user, route = 'dashboard') => {
  current = user;
  await evaluate(`App.auth.establecerSesion('token-sintetico', ${JSON.stringify(user)}); App.router.navigate(${JSON.stringify(route)});`);
 };
 await win.loadURL('http://127.0.0.1:' + server.address().port + '/index.html');
 await evaluate("App.auth.iniciarSesion('consulta@example.test','PasswordSintetico!').then(() => App.router.navigate('dashboard'))");
 await wait("document.body.innerText.includes('Información limitada')");
 await check('Menu reducido, Dashboard parcial y ausencia de consultas de integracion', async () => {
  assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.nav-link')).map(el => el.dataset.routeId)"), ['dashboard','reservaciones']);
  assert.equal(await evaluate("document.body.innerText.includes('Grupos preparados')"), false);
  assert.equal(calls.some((call) => call.path === '/api/eventos-integracion'), false);
 });
 await check('Navegacion directa a Historial bloqueada', async () => {
  await evaluate("App.router.navigate('historial')"); await wait("document.body.innerText.includes('Acceso no autorizado')");
 });
 await check('Reservaciones y catalogo de plataformas restringido', async () => {
  await evaluate("App.router.navigate('reservaciones')"); await wait("document.body.innerText.includes('VISIBLE-1')");
  assert.equal(await evaluate("document.body.innerText.includes('SECRETO ANTERIOR')"), false);
  assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('#reservaciones-plataforma option')).filter(el => el.value).map(el => el.value)"), ['17']);
  assert.equal(await evaluate("document.body.innerText.includes('Nueva reservación')"), false);
 });
 await check('Detalle autorizado y manejo visual de 403 y 404', async () => {
  await evaluate("document.querySelector('[data-reservacion-action=\"view\"]').click();");
  await wait("Boolean(document.getElementById('reservaciones-dialog-host').innerHTML)");
  await evaluate("document.getElementById('reservaciones-dialog-host').innerHTML='';");
  for (const status of [403,404]) {
   detailError=status;
   await evaluate("document.querySelector('[data-reservacion-action=\"view\"]').click();");
   await wait("document.getElementById('reservaciones-message').classList.contains('is-error')");
   assert.equal(await evaluate("document.getElementById('reservaciones-dialog-host').innerHTML"),'');
  }
  detailError=0;
 });
 await check('Selected vacio presenta un estado vacio', async () => {
  current = { ...current, platform_ids: [] };
  await evaluate('App.auth.refrescarSesion()');
  await wait("document.body.innerText.includes('No hay reservaciones') || document.body.innerText.includes('No se encontraron reservaciones')");
 });
 const admin = { id_usuario: 5, nombre: 'Admin', rol: 'Administrador', alcance_plataformas: 'all', platform_ids: [] };
 await change(admin, 'usuarios'); await wait("document.getElementById('usuarios-nuevo') && document.body.innerText.includes('Admin')");
 await check('Formulario Consulta exige alcance y usa IDs del catalogo', async () => {
  await evaluate("document.getElementById('usuarios-nuevo').click(); const rol = document.getElementById('usuario-rol'); rol.value='20'; rol.dispatchEvent(new Event('change'));");
  assert.equal(await evaluate("document.getElementById('usuarios-alcance').hidden"), false);
  assert.equal(await evaluate("document.getElementById('usuario-alcance').value"), '');
  await evaluate("document.getElementById('usuario-nombre').value='Nuevo'; document.getElementById('usuario-correo').value='nuevo@example.test'; document.getElementById('usuario-password').value='PasswordSintetico!'; document.getElementById('usuarios-form').dispatchEvent(new Event('submit', {bubbles:true,cancelable:true}));");
  await wait("document.body.innerText.includes('Selecciona el alcance')");
  await evaluate("const modo=document.getElementById('usuario-alcance'); modo.value='selected'; modo.dispatchEvent(new Event('change')); document.querySelector('[data-plataforma-id=\"83\"]').checked=true; document.getElementById('usuarios-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));");
  await wait("!document.getElementById('usuarios-form') && document.body.innerText.includes('Usuario guardado correctamente')");
  const saved = calls.findLast((call) => call.path === '/api/usuarios' && call.method === 'POST');
  assert.equal(saved.body.alcance_plataformas,'selected'); assert.deepEqual(saved.body.platform_ids,[83]);
 });
 await check('Editar Consulta selected a all', async () => {
  await evaluate("document.querySelector('[data-usuarios-action=\"edit\"][data-id=\"7\"]').click(); document.getElementById('usuario-alcance').value='all'; document.getElementById('usuarios-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));");
  await wait("!document.getElementById('usuarios-form') && document.body.innerText.includes('Usuario guardado correctamente')");
  assert.equal(calls.findLast((call) => call.method === 'PATCH').body.alcance_plataformas,'all');
 });
 await check('Cambio visual Administrador a Consulta requiere alcance y permite selected vacio', async () => {
  await evaluate("document.querySelector('[data-usuarios-action=\"edit\"][data-id=\"6\"]').click(); const otroRol=document.getElementById('usuario-rol'); otroRol.value='20'; otroRol.dispatchEvent(new Event('change')); ");
  assert.equal(await evaluate("document.getElementById('usuario-alcance').value"),'');
  await evaluate("document.getElementById('usuario-alcance').value='selected'; document.getElementById('usuarios-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));");
  await wait("!document.getElementById('usuarios-form') && document.body.innerText.includes('Usuario guardado correctamente')");
  const saved=calls.findLast((call)=>call.method==='PATCH');
  assert.equal(saved.body.alcance_plataformas,'selected'); assert.deepEqual(saved.body.platform_ids,[]);
 });
 await change({ id_usuario: 7, nombre: 'Consulta all', rol: 'Consulta', alcance_plataformas: 'all', platform_ids: [] });
 await wait("document.body.innerText.includes('Grupos preparados')");
 await check('Consulta all conserva menu y Dashboard operativo', async () => {
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.nav-link')).some(el => el.dataset.routeId === 'historial')"),true);
  assert.equal(await evaluate("document.body.innerText.includes('Pendientes de integración')"),true);
 });
 await check('Renovacion retira vistas y datos al perder permisos', async () => {
  current = { ...current, alcance_plataformas: 'selected', platform_ids: [17] };
  await evaluate('App.auth.refrescarSesion()'); await wait("document.body.innerText.includes('Información limitada')");
  assert.equal(await evaluate("document.body.innerText.includes('SECRETO ANTERIOR')"),false);
 });
 await change(admin, 'reservaciones'); await wait("document.body.innerText.includes('SECRETO ANTERIOR')");
 await check('Respuesta asincrona de sesion anterior se descarta y logout limpia impresion', async () => {
  await evaluate("window.lateData=null; window.lateError=null; App.api.apiFetch('/api/reservaciones?delay=1').then(data=>window.lateData=data).catch(error=>window.lateError=error.isStaleSession); true;");
  await new Promise((resolve) => setTimeout(resolve, 30));
  await evaluate("document.getElementById('reservacion-print-root').innerHTML='SECRETO IMPRESION'; App.auth.cerrarSesion();");
  await wait('window.lateError === true');
  assert.equal(await evaluate('window.lateData'),null);
  assert.equal(await evaluate("document.body.innerText.includes('SECRETO')"),false);
 });
 await change(admin);
 await wait("document.body.innerText.includes('Grupos preparados')");
 await check('Fallo de verificacion de sesion limpia datos y no concede acceso', async () => {
  failSession = true; await evaluate('App.auth.refrescarSesion().catch(() => {})');
  await wait("location.hash === '#/login'");
  assert.equal(await evaluate('App.auth.estaAutenticado()'),false);
  assert.equal(await evaluate("document.body.innerText.includes('SECRETO')"),false);
 });
 console.log('FRONTEND_SCOPE_OK ' + JSON.stringify(checks));
 win.destroy(); server.close(); app.exit(0);
}
run().catch((error) => { console.error(error); server.close(); app.exit(1); });
