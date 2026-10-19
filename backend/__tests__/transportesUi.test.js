const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const { crearApi } = require('./helpers/transportesUiApi.cjs');

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../frontend/js/transportesUi.js'), 'utf8'), context);
const describir = context.window.App.transportesUi.describir;
test.each([
  [{ id_vehiculo: 21, vehiculo: 'Unidad 2', capacidad: 12, total_pax_activos: 2 }, 1, 'Grupo 1 · Unidad 2 · 2/12 PAX'],
  [{ id_vehiculo: null, vehiculo: 'Nombre anterior', total_pax_activos: 2 }, 2, 'Grupo 2 · Vehículo pendiente · 2/12 PAX'],
  [{ id_vehiculo: 22, vehiculo: 'Unidad 3', capacidad: 8, total_pax_activos: 6 }, 2, 'Grupo 2 · Unidad 3 · 6/8 PAX'],
  [{ id_vehiculo: 22, vehiculo: 'Unidad grande', capacidad: 20, total_pax_activos: 12 }, 1, 'Grupo 1 · Unidad grande · 12/12 PAX'],
  [{ id_vehiculo: null }, 1, 'Grupo 1 · Vehículo pendiente · PAX por consultar'],
  [{ id_vehiculo: null, total_pax_activos: null }, 1, 'Grupo 1 · Vehículo pendiente · PAX por consultar'],
  [{ id_vehiculo: null, total_pax_activos: 0 }, 1, 'Grupo 1 · Vehículo pendiente · 0/12 PAX'],
  [{ id_vehiculo: 22, vehiculo: 'Unidad 3', capacidad: null, total_pax_activos: 2 }, 1, 'Grupo 1 · Unidad 3 · 2 PAX · Capacidad por consultar']
])('Descripción derivada sin confundir IDs ni datos desconocidos (%#)', (tr, grupo, esperado) => {
  const data = { ...tr, id_transporte_operacion: 9401 };
  expect(describir(data, { numero_grupo: grupo }).principal).toBe(esperado);
  expect(describir(data).secundaria).toBe('Transporte #9401');
  expect(data).toEqual({ ...tr, id_transporte_operacion: 9401 });
});

test('Electron: operaciones nuevas/existentes, cambios de catálogo/PAX, carga, permisos y reapertura con API sintética', async () => {
  const api = crearApi();
  const output = process.env.PRE_RELEASE_02_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'pre-release-02-'));
  if (process.env.PRE_RELEASE_02_OUTPUT && path.resolve(output) !== path.resolve(__dirname, '../../docs/pre-release-02')) throw Error('Destino de capturas no autorizado');
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => api.server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + api.server.address().port;
  const ejecutar = phase => new Promise((resolve, reject) => {
    const env = { ...process.env, PRE_RELEASE_02_ORIGIN: origin, PRE_RELEASE_02_OUTPUT: output, PRE_RELEASE_02_PHASE: phase };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require('electron'), [path.join(__dirname, 'helpers/transportesUiHarness.cjs'), '--disable-gpu'], { env, windowsHide: true });
    let log = '';
    child.stdout.on('data', c => { log += c; }); child.stderr.on('data', c => { log += c; });
    const timer = setTimeout(() => { child.kill(); reject(Error('Tiempo excedido: ' + log)); }, 65000);
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('exit', code => { clearTimeout(timer); code === 0 && log.includes('PRE_RELEASE_02_OK') ? resolve() : reject(Error(log)); });
  });
  try {
    await ejecutar('cambios');
    // Un proceso Electron completamente nuevo debe consultar el estado actual del simulador.
    api.state.transportes[0].id_vehiculo = 6203;
    api.state.transportes[1].id_vehiculo = 6202;
    api.state.reservas[0].pax = 6;
    await ejecutar('reapertura');
    expect(api.errors).toEqual([]);
    expect(api.calls.some(c => c.path === '/api/vehiculos' && c.method !== 'GET')).toBe(false);
    expect(api.calls.filter(c => c.path.endsWith('/transporte') && c.method === 'PATCH').map(c => c.body.id_transporte_operacion)).toEqual([9401, 9402]);
    expect(api.state.transportes.map(t => t.id_transporte_operacion)).toEqual([9401, 9402]);
    fs.writeFileSync(path.join(output, 'api-sintetica.json'), JSON.stringify({ calls: api.calls, errors: api.errors }, null, 2));
  } finally { await new Promise(resolve => api.server.close(resolve)); }
}, 135000);
