// API sintética en memoria: no importa el backend, pg, .env ni proveedores.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const admin = { id_usuario: 5, nombre: 'Administrador sintético', rol: 'Administrador', alcance_plataformas: 'all', platform_ids: [] };
const fecha = '2027-05-20';
function crearApi() {
  const vehiculos = [
    { id_vehiculo: 6202, identificador: 'Unidad 2', capacidad: 12, estado: true, placas: 'SYN-002', color: 'Blanco' },
    { id_vehiculo: 6203, identificador: 'Unidad 3', capacidad: 8, estado: true, placas: 'SYN-003', color: 'Azul' }
  ];
  const op = (id, grupo, date = fecha) => ({ id_operacion_tour: id, id_tour: 501, tour: 'Recorrido sintético de laguna', fecha: date, turno: 'Mañana', numero_grupo: grupo, hora_inicio: '07:15:00', id_guia: null, estado: 'Activa' });
  const state = {
    user: admin, missingPax: false, delay: 0,
    operaciones: [op(8101, 1), op(8100, 1, '2020-01-05')],
    transportes: [{ id_transporte_operacion: 9401, id_operacion_tour: 8101, id_vehiculo: 6202, id_operador: null, estado: 'Listo', observaciones_operador: null }],
    reservas: [
      { id_reservacion: 7101, codigo: 'SYN-7101', nombre_cliente: 'Cliente sintético Norte', pax: 2, estado: 'Pendiente', id_transporte_operacion: 9401 },
      { id_reservacion: 7102, codigo: 'SYN-7102', nombre_cliente: 'Cliente sintético Sur', pax: 2, estado: 'Pendiente', id_transporte_operacion: null },
      { id_reservacion: 7103, codigo: 'SYN-7103', nombre_cliente: 'Cliente sintético cancelado', pax: 5, estado: 'Cancelada', id_transporte_operacion: 9401 },
      { id_reservacion: 7104, codigo: 'SYN-7104', nombre_cliente: 'Cliente sintético Grupo 2', pax: 2, estado: 'Pendiente', id_transporte_operacion: null }
    ].map(r => ({ ...r, fecha, id_tour: 501, turno: 'Mañana', ninos: 0, pickup_place: 'Lobby sintético', pickup_time: '07:15:00' }))
  };
  const calls = [], errors = [];
  const enriquecer = tr => {
    const v = vehiculos.find(v => v.id_vehiculo === tr.id_vehiculo);
    const reservas = state.reservas.filter(r => r.id_transporte_operacion === tr.id_transporte_operacion);
    return { ...tr, vehiculo: v?.identificador || null, capacidad: v?.capacidad ?? null, placas: v?.placas || null, color: v?.color || null,
      operador: null, reservaciones: reservas, total_reservaciones: reservas.length,
      total_pax_activos: state.missingPax ? null : reservas.filter(r => r.estado !== 'Cancelada').reduce((n, r) => n + r.pax, 0) };
  };
  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://localhost');
      res.setHeader('Cache-Control', 'no-store');
      if (!u.pathname.startsWith('/api/') && u.pathname !== '/__synthetic/control') {
        const file = path.resolve(root, 'frontend', '.' + u.pathname);
        if (!file.startsWith(path.join(root, 'frontend') + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
        res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : /\.jpe?g$/.test(file) ? 'image/jpeg' : 'text/html');
        return res.end(fs.readFileSync(file));
      }
      let raw = ''; for await (const chunk of req) raw += chunk;
      const body = raw ? JSON.parse(raw) : {};
      res.setHeader('Content-Type', 'application/json');
      const p = u.pathname;
      if (p === '/__synthetic/control') {
        assert.equal(req.method, 'POST');
        if (body.vehicle !== undefined) state.transportes[0].id_vehiculo = body.vehicle;
        if (body.pax !== undefined) state.reservas[0].pax = body.pax;
        if (body.cancel) state.reservas.find(r => r.id_reservacion === body.cancel).estado = 'Cancelada';
        if (body.missingPax !== undefined) state.missingPax = body.missingPax;
        if (body.delay !== undefined) state.delay = body.delay;
        if (body.user) state.user = body.user;
        return res.end('{}');
      }
      calls.push({ path: p, method: req.method, body });
      let data;
      const id = Number(p.split('/').pop());
      if (req.method !== 'GET') {
        if (p === '/api/operaciones') {
          assert.equal(req.method, 'POST');
          const created = { ...op(8102, body.numero_grupo), ...body };
          state.operaciones.push(created); data = { datos: created };
        } else if (p === '/api/transportes') {
          assert.equal(req.method, 'POST'); assert.equal(body.id_vehiculo, undefined);
          const created = { ...body, id_transporte_operacion: 9402, id_vehiculo: null };
          state.transportes.push(created); data = { datos: created };
        } else if (p.startsWith('/api/transportes/')) {
          assert.equal(req.method, 'PATCH');
          assert.ok(body.id_vehiculo === null || vehiculos.some(v => v.id_vehiculo === body.id_vehiculo));
          Object.assign(state.transportes.find(t => t.id_transporte_operacion === id), body); data = {};
        } else if (/^\/api\/reservaciones\/\d+\/transporte$/.test(p)) {
          assert.equal(req.method, 'PATCH');
          const rid = Number(p.split('/')[3]);
          assert.ok(body.id_transporte_operacion === null || state.transportes.some(t => t.id_transporte_operacion === body.id_transporte_operacion));
          state.reservas.find(r => r.id_reservacion === rid).id_transporte_operacion = body.id_transporte_operacion;
          data = { mensaje: 'Asignación sintética actualizada.' };
        } else throw Error('Escritura inesperada: ' + p);
      } else if (p === '/api/auth/sesion') data = { usuario: state.user };
      else if (p === '/api/eventos-integracion/resumen') data = require('./resumenNotificacionesSintetico.cjs').resumenNotificacionesSintetico([evento]);
      else if (p === '/api/tours') data = { datos: [{ id_tour: 501, nombre: 'Recorrido sintético de laguna', activo: true }] };
      else if (p === '/api/guias' || p === '/api/operadores') data = { datos: [] };
      else if (p === '/api/vehiculos') data = { datos: vehiculos };
      else if (p === '/api/operaciones/sugeridas') data = { datos: [], reservaciones_sin_turno: 0 };
      else if (p === '/api/operaciones') data = { datos: state.operaciones.filter(o => o.fecha === u.searchParams.get('fecha')) };
      else if (p === '/api/transportes') data = { datos: state.transportes.filter(t => t.id_operacion_tour === Number(u.searchParams.get('id_operacion_tour'))).map(enriquecer) };
      else if (p === '/api/daily/operativo') data = { fecha: u.searchParams.get('fecha'), operaciones: state.operaciones.filter(o => o.fecha === u.searchParams.get('fecha')).map(o => {
        const trs = state.transportes.filter(t => t.id_operacion_tour === o.id_operacion_tour).map(enriquecer);
        return { ...o, total_pax_activos: state.missingPax ? null : trs.reduce((n, t) => n + t.total_pax_activos, 0), transportes: trs };
      }), reservaciones_sin_asignar: state.reservas.filter(r => r.id_transporte_operacion === null) };
      else if (p === '/api/dashboard/resumen') data = { fecha, metricas: {}, alertas: {}, reservaciones_recientes: [], salidas_hoy: [] };
      else if (p === '/api/eventos-integracion') data = { data: u.searchParams.get('review_status') === 'approved' ? [{ ...evento, fareharbor_summary: { booking: { display_id: '#SYN-9001' }, availability: { start_at: '2020-01-05T06:00:00-0500', item: { name: 'Actividad sintética' } }, customers: { total: 2 } } }] : [] };
      else if (p === '/api/eventos-integracion/9001') data = { datos: evento };
      else throw Error('Ruta inesperada: ' + p);
      const snapshot = JSON.stringify(data);
      if (p === '/api/daily/operativo' && state.delay) setTimeout(() => res.end(snapshot), state.delay);
      else res.end(snapshot);
    } catch (error) { errors.push(error.message); res.statusCode = 500; res.end(JSON.stringify({ mensaje: error.message })); }
  });
  const evento = { id_evento_integracion: 9001, provider: 'fareharbor', external_booking_id: 'synthetic-9001', event_type: 'new_booking', review_status: 'approved', application_status: 'not_applied', created_at: '2026-10-17T15:00:00Z', fareharbor_application_preview: {
    tipo: 'preview', activity_timing: { has_started: true }, money_ready: true,
    missing_fields: ['pickup_place'], issues: ['La actividad ya inició y no puede registrarse como una reservación operativa.'],
    external: { activity_title: 'Actividad sintética', start_at: '2020-01-05T06:00:00-0500', categories: [] },
    reservation_candidate: { nombre_cliente: 'Cliente sintético', pax: 2, fecha: '2020-01-05', tour: 'Actividad sintética', turno: 'Mañana', pickup_time: '06:00' }, sources: { tour: { source: 'equivalence' }, pickup: { pickup_place: 'manual' } }
  } };
  return { server, state, calls, errors, admin, fecha, vehiculos, enriquecer };
}
module.exports = { crearApi };
