const request = require('supertest');
const { crearPreviewApi } = require('../../scripts/preview/api.cjs');
describe('PRE-RELEASE-05: API manual exclusivamente sintética', () => {
  let api, origin, tokens;
  const get = (path, role = 'admin') => request(api.server).get(path).set('Authorization', 'Bearer ' + tokens[role]);
  const patch = (path, body, role = 'admin') => request(api.server).patch(path).set('Authorization', 'Bearer ' + tokens[role]).send(body);
  beforeEach(async () => {
    api = crearPreviewApi();
    await new Promise(resolve => api.server.listen(0, '127.0.0.1', resolve));
    origin = 'http://127.0.0.1:' + api.server.address().port;
    tokens = {};
    for (const role of ['admin', 'all', 'selected']) tokens[role] = (await request(api.server).post('/api/auth/login').send({ correo: role + '@demo.invalid', password: 'Solo-Demo-05' })).body.token;
  });
  afterEach(async () => { expect(api.errors).toEqual([]); api.server.closeAllConnections(); await new Promise(resolve => api.server.close(resolve)); });
  test('HTML del producto con barra exclusiva y sin alterar el archivo frontend', async () => {
    const r = await request(api.server).get('/index.html');
    expect(r.status).toBe(200); expect(r.text).toContain('/__preview/controls.js'); expect(r.text).toContain('./pages/operaciones.js');
    expect(r.headers['content-security-policy']).toContain("connect-src 'self'");
  });
  test('rechaza falta de autenticación y origen/cabecera Host ajenos', async () => {
    expect((await request(api.server).get('/api/vehiculos')).status).toBe(401);
    expect((await get('/api/vehiculos').set('Origin', 'http://otro.invalid')).status).toBe(403);
    expect((await get('/api/vehiculos').set('Host', 'otro.invalid')).status).toBe(403);
    expect((await request(api.server).post('/api/auth/login').send({ correo: 'real@invalid', password: 'nada' })).status).toBe(401);
  });
  test('catálogo original, grupos y canceladas sin sumar PAX', async () => {
    expect((await get('/api/vehiculos')).body.datos.map(v => v.id_vehiculo)).toEqual([6202, 6203]);
    const r = (await get('/api/daily/operativo?fecha=' + api.fecha)).body;
    expect(r.operaciones.map(o => o.numero_grupo)).toEqual([1, 2]);
    expect(r.operaciones.map(o => o.total_pax_activos)).toEqual([2, 2]);
  });
  test('reasigna IDs originales y cambio/retirada de unidad reflejados en nuevas lecturas', async () => {
    expect((await patch('/api/reservaciones/7102/transporte', { id_transporte_operacion: 9401 })).status).toBe(200);
    expect((await patch('/api/transportes/9401', { id_vehiculo: 6203 })).status).toBe(200);
    let t = (await get('/api/transportes?id_operacion_tour=8101')).body.datos[0];
    expect([t.id_transporte_operacion, t.id_vehiculo, t.total_pax_activos, t.capacidad]).toEqual([9401, 6203, 4, 8]);
    await patch('/api/transportes/9401', { id_vehiculo: null });
    t = (await get('/api/transportes?id_operacion_tour=8101')).body.datos[0]; expect(t.vehiculo).toBeNull();
  });
  test('no crea vehículos y rechaza capacidad inferior a PAX y asignaciones canceladas', async () => {
    expect((await patch('/api/transportes/9401', { id_vehiculo: 999 })).status).toBe(400);
    api.state.reservas[0].pax = 9;
    expect((await patch('/api/transportes/9401', { id_vehiculo: 6203 })).status).toBe(409);
    expect((await patch('/api/reservaciones/7103/transporte', { id_transporte_operacion: 9402 })).status).toBe(409);
    expect(api.vehiculos).toHaveLength(2);
  });
  test('consulta all no puede escribir y selected filtra plataformas y no ve operaciones/integraciones', async () => {
    expect((await patch('/api/transportes/9401', { id_vehiculo: null }, 'all')).status).toBe(403);
    for (const path of ['/api/operaciones', '/api/eventos-integracion', '/api/eventos-integracion/resumen', '/api/eventos-integracion/9101']) expect((await get(path, 'selected')).status).toBe(403);
    const rs = (await get('/api/reservaciones', 'selected')).body.data;
    expect(rs.every(r => r.id_plataforma === 17)).toBe(true);
    expect((await get('/api/reservaciones/7104', 'selected')).status).toBe(404);
  });
  test('archivo requiere motivo, fecha y responsable; conserva estados originales y excluye resumen', async () => {
    expect((await patch('/api/eventos-integracion/9101/archivo', { motivo: '  ' })).status).toBe(400);
    expect((await patch('/api/eventos-integracion/9101/archivo', { motivo: 'x'.repeat(501) })).status).toBe(400);
    expect((await patch('/api/eventos-integracion/9101/archivo', { motivo: 'Caso ficticio' }, 'all')).status).toBe(403);
    const e = (await patch('/api/eventos-integracion/9101/archivo', { motivo: ' Caso ficticio ' })).body.datos;
    expect(e).toMatchObject({ archived_by: 7001, archive_reason: 'Caso ficticio', review_status: 'approved', application_status: 'not_applied' });
    expect(Date.parse(e.archived_at)).not.toBeNaN();
    expect((await get('/api/eventos-integracion/resumen')).body.datos.counts.pending).toBe(2);
    expect((await get('/api/eventos-integracion?archived=true')).body.data).toHaveLength(2);
    expect((await get('/api/eventos-integracion/9101')).body.datos.fareharbor_application_preview).toBeUndefined();
    expect((await patch('/api/eventos-integracion/9101/archivo', { motivo: 'Otra vez' })).status).toBe(409);
  });
  test('llegada requiere control exclusivo y solo muta memoria, sin almacenar vistos en eventos', async () => {
    const send = (cap, role = 'admin') => request(api.server).post('/__preview/arrival').set('Origin', origin).set('X-Preview-Capability', cap).set('Authorization', 'Bearer ' + tokens[role]).send({ provider: 'getyourguide' });
    expect((await send('no')).status).toBe(403); expect((await send(api.capability, 'selected')).status).toBe(403);
    const result = await send(api.capability); expect(result.body.datos.id_evento_integracion).toBe(9301);
    expect((await get('/api/eventos-integracion/resumen')).body.datos.counts.pending).toBe(4);
    expect(api.events.at(-1)).not.toHaveProperty('seen');
    expect((await request(api.server).post('/__synthetic/control').send({ vehicle: 123 })).status).toBe(404);
  });
  test('instancias independientes reservan puertos diferentes y reinician estado', async () => {
    const other = crearPreviewApi();
    await new Promise(resolve => other.server.listen(0, '127.0.0.1', resolve));
    try { expect(other.server.address().port).not.toBe(api.server.address().port); api.state.transportes[0].id_vehiculo = null; expect(other.state.transportes[0].id_vehiculo).toBe(6202); expect(other.environment).not.toBe(api.environment); }
    finally { await new Promise(resolve => other.server.close(resolve)); }
  });
  test('crea otra operación y transporte en memoria, sin duplicar identidad ni aceptar turno implícito', async () => {
    const post = (url, body) => request(api.server).post(url).set('Authorization', 'Bearer ' + tokens.admin).send(body);
    const body = { fecha: api.fecha, id_tour: 501, turno: 'Tarde', numero_grupo: 1, hora_inicio: '14:00', estado: 'Activa' };
    expect((await post('/api/operaciones', { ...body, turno: null })).status).toBe(400);
    const op = (await post('/api/operaciones', body)).body.datos;
    expect(op.id_operacion_tour).toBe(8103);
    expect((await post('/api/operaciones', body)).status).toBe(409);
    const tr = (await post('/api/transportes', { id_operacion_tour: op.id_operacion_tour, estado: 'Preparado' })).body.datos;
    expect(tr.id_transporte_operacion).toBe(9403); expect(tr.id_vehiculo).toBeNull();
    expect((await patch('/api/transportes/9403', { id_vehiculo: 6202 })).status).toBe(409);
    expect((await post('/api/transportes', { id_operacion_tour: op.id_operacion_tour })).status).toBe(409);
  });
});
