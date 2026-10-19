// Laboratorio manual: reutiliza los fixtures y lecturas de PRE-RELEASE-02/04.
// Este módulo nunca carga el servidor productivo, .env, pg ni proveedores.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { crearApi } = require('../../backend/__tests__/helpers/transportesUiApi.cjs');
const { resumenNotificacionesSintetico } = require('../../backend/__tests__/helpers/resumenNotificacionesSintetico.cjs');
const root = path.resolve(__dirname, '../..');
const perfiles = Object.freeze({
  admin: { id_usuario: 7001, nombre: 'Administrador ficticio', rol: 'Administrador', alcance_plataformas: 'all', platform_ids: [] },
  all: { id_usuario: 7002, nombre: 'Consulta all ficticio', rol: 'Consulta', alcance_plataformas: 'all', platform_ids: [] },
  selected: { id_usuario: 7003, nombre: 'Consulta selected ficticio', rol: 'Consulta', alcance_plataformas: 'selected', platform_ids: [17] }
});
const fallo = (status, mensaje) => Object.assign(new Error(mensaje), { status });
async function cuerpo(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 16384) throw fallo(413, 'Solicitud demasiado grande.');
  }
  try { return raw ? JSON.parse(raw) : {}; } catch { throw fallo(400, 'JSON inválido.'); }
}
function crearPreviewApi({ cerrar = () => {} } = {}) {
  const base = crearApi();
  const { server, state, vehiculos, enriquecer } = base;
  const original = server.listeners('request')[0];
  server.removeAllListeners('request');
  const capability = crypto.randomBytes(24).toString('hex');
  const environment = crypto.randomBytes(12).toString('hex');
  const sesiones = new Map();
  const calls = [], errors = [];
  const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cancun', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  state.operaciones.filter(o => o.fecha === base.fecha).forEach(o => { o.fecha = fecha; });
  state.reservas.forEach((r, i) => { r.fecha = fecha; r.id_plataforma = i === 3 ? 18 : 17; r.plataforma = i === 3 ? 'FareHarbor ficticio' : 'GetYourGuide ficticio'; });
  state.operaciones.push({ ...state.operaciones[0], id_operacion_tour: 8102, numero_grupo: 2 });
  state.transportes.push({ id_transporte_operacion: 9402, id_operacion_tour: 8102, id_vehiculo: null, id_operador: null, estado: 'Pendiente', observaciones_operador: null });
  state.reservas.find(r => r.id_reservacion === 7104).id_transporte_operacion = 9402;
  let nextOp = 8103, nextTr = 9403, nextEvent = 9300;
  function evento(id, provider, expired = false) {
    const start = expired ? '2020-01-05T06:00:00-05:00' : '2099-05-20T07:15:00-05:00';
    const e = { id_evento_integracion: id, provider, external_booking_id: 'DEMO-' + provider + '-' + id,
      event_type: 'new_booking', review_status: expired ? 'approved' : 'pending_review', application_status: 'not_applied',
      created_at: new Date().toISOString(), archived_at: null,
      normalized_data: { customer_name: 'Visitante ficticio ' + id, date: start.slice(0, 10), pax: 2, pickup_place: 'Lobby ficticio', tour_language: 'Español', turno: 'Mañana' } };
    if (provider === 'fareharbor') {
      e.fareharbor_summary = { booking: { display_id: '#DEMO-' + id, status: 'booked' }, availability: { start_at: start, item: { name: 'Recorrido ficticio de laguna' } }, customers: { total: 2 }, money: {} };
      e.fareharbor_application_preview = { tipo: 'preview', activity_timing: { has_started: expired }, money_ready: true,
        missing_fields: [], issues: expired ? ['La actividad ya inició y no puede registrarse como una reservación operativa.'] : ['Demostración: el registro de reservaciones externas está fuera de este recorrido.'],
        reservation_candidate: { pax: 2, nombre_cliente: 'Visitante ficticio ' + id, fecha: start.slice(0, 10) },
        external: { activity_title: 'Recorrido ficticio de laguna', start_at: start, categories: [] }, sources: {} };
    }
    return e;
  }
  const events = [evento(9101, 'fareharbor', true), evento(9102, 'getyourguide'), evento(9103, 'fareharbor')];
  events.push({ ...evento(9099, 'getyourguide'), archived_at: new Date().toISOString(), archived_by: 7001, archived_by_name: perfiles.admin.nombre, archive_reason: 'Ejemplo ficticio de archivo anterior.' });
  function json(res, data, status = 200) { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(data)); }
  function activo(r) { return r.estado !== 'Cancelada'; }
  function pax(id, reservas = state.reservas) { return reservas.filter(r => r.id_transporte_operacion === id && activo(r)).reduce((n, r) => n + Number(r.pax), 0); }
  function validarCapacidad(reservas = state.reservas, transportes = state.transportes) {
    for (const tr of transportes) {
      const limite = Math.min(12, vehiculos.find(v => v.id_vehiculo === tr.id_vehiculo)?.capacidad ?? 12);
      if (pax(tr.id_transporte_operacion, reservas) > limite) throw fallo(409, 'Se supera la capacidad efectiva del transporte.');
      if (tr.id_vehiculo != null && pax(tr.id_transporte_operacion, reservas) < 2) throw fallo(409, 'El transporte con vehículo debe tener al menos 2 pasajeros activos.');
    }
    // Una operación por grupo, máximo dos grupos y 12 por grupo: conserva el límite 24.
  }
  const lecturasBase = new Set(['/api/tours', '/api/guias', '/api/operadores', '/api/vehiculos', '/api/operaciones', '/api/operaciones/sugeridas', '/api/transportes', '/api/daily/operativo']);
  server.on('request', async (req, res) => {
    try {
      const expectedHost = '127.0.0.1:' + server.address().port;
      const origin = 'http://' + expectedHost;
      if (req.headers.host !== expectedHost || (req.headers.origin && req.headers.origin !== origin)
        || ['cross-site', 'same-site'].includes(req.headers['sec-fetch-site'])) throw fallo(403, 'Origen ajeno a la demostración.');
      const u = new URL(req.url, origin), p = u.pathname, method = req.method;
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'");
      if (p === '/' || p === '/index.html') {
        if (method !== 'GET') throw fallo(405, 'Método no permitido.');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        const html = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
        return res.end(html.replace('</head>', '<meta name="preview-capability" content="' + capability + '"><link rel="stylesheet" href="/__preview/controls.css"><script defer src="/__preview/controls.js"></script></head>'));
      }
      if (p === '/__preview/controls.js' || p === '/__preview/controls.css') {
        if (method !== 'GET') throw fallo(405, 'Método no permitido.');
        res.setHeader('Content-Type', p.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8');
        return res.end(fs.readFileSync(path.join(__dirname, path.basename(p))));
      }
      if (p === '/__synthetic/control') throw fallo(404, 'Control de pruebas no disponible.');
      if (!p.startsWith('/api/') && !p.startsWith('/__preview/')) {
        if (method !== 'GET' || !/^\/(js|css|pages|assets)\/[a-zA-Z0-9_./-]+$/.test(p)) throw fallo(404, 'Recurso no disponible.');
        return original(req, res);
      }
      // No se registran contraseñas, tokens ni cuerpos de autenticación en la evidencia.
      const actor = sesiones.get((req.headers.authorization || '').replace(/^Bearer /, ''));
      calls.push({ method, path: p, actor: actor?.id_usuario ?? null });
      if (p === '/api/auth/login' && method === 'POST') {
        const b = await cuerpo(req), key = String(b.correo || '').replace('@demo.invalid', '');
        if (!perfiles[key] || b.correo !== key + '@demo.invalid' || b.password !== 'Solo-Demo-05') throw fallo(401, 'Usa un perfil ficticio de la barra DEMO.');
        const token = crypto.randomBytes(24).toString('hex'); sesiones.set(token, { ...perfiles[key] });
        return json(res, { token, usuario: perfiles[key] });
      }
      if (p.startsWith('/__preview/')) {
        if (req.headers['x-preview-capability'] !== capability || method !== 'POST') throw fallo(403, 'Control exclusivo del laboratorio.');
        if (p === '/__preview/close') { json(res, { mensaje: 'Cerrando demostración.' }); setImmediate(cerrar); return; }
        if (p === '/__preview/arrival') {
          if (!actor || actor.alcance_plataformas !== 'all') throw fallo(403, 'Perfil sin acceso a integraciones.');
          const b = await cuerpo(req);
          if (!['fareharbor', 'getyourguide'].includes(b.provider)) throw fallo(400, 'Proveedor ficticio inválido.');
          const e = evento(++nextEvent, b.provider); events.push(e);
          return json(res, { datos: { id_evento_integracion: e.id_evento_integracion } });
        }
        throw fallo(404, 'Control de laboratorio inexistente.');
      }
      if (!actor) throw fallo(401, 'Inicia sesión con un perfil ficticio.');
      const selected = actor.alcance_plataformas === 'selected';
      if (selected && !['/api/auth/sesion', '/api/dashboard/resumen', '/api/tours', '/api/paises', '/api/plataformas'].includes(p) && !/^\/api\/reservaciones(?:\/\d+)?$/.test(p)) throw fallo(403, 'Acceso limitado por ACCESS-SCOPE.');
      if (method !== 'GET' && actor.rol !== 'Administrador') throw fallo(403, 'Se requiere Administrador.');
      if (p === '/api/auth/sesion' && method === 'GET') return json(res, { usuario: actor });
      if (p.startsWith('/api/eventos-integracion')) {
        if (p === '/api/eventos-integracion/resumen' && method === 'GET') return json(res, resumenNotificacionesSintetico(events, environment));
        if (p === '/api/eventos-integracion' && method === 'GET') {
          const archived = u.searchParams.get('archived') === 'true';
          const rows = events.filter(e => Boolean(e.archived_at) === archived && (!u.searchParams.has('review_status') || e.review_status === u.searchParams.get('review_status'))).sort((a, b) => b.id_evento_integracion - a.id_evento_integracion);
          const page = Math.max(1, Number(u.searchParams.get('page')) || 1), limit = Math.min(50, Math.max(1, Number(u.searchParams.get('limit')) || 25));
          return json(res, { data: rows.slice((page - 1) * limit, page * limit), pagination: { page, limit, total: rows.length, totalPages: Math.ceil(rows.length / limit) } });
        }
        const match = p.match(/^\/api\/eventos-integracion\/(\d+)(?:\/(archivo|revision|aplicar))?$/);
        if (!match) throw fallo(404, 'Evento ficticio no encontrado.');
        const e = events.find(e => e.id_evento_integracion === Number(match[1]));
        if (!e) throw fallo(404, 'Evento ficticio no encontrado.');
        if (!match[2] && method === 'GET') {
          const { fareharbor_application_preview, ...rest } = e;
          return json(res, { datos: e.archived_at ? rest : e });
        }
        if (e.archived_at || e.application_status === 'applied' || !['approved', 'pending_review'].includes(e.review_status)) throw fallo(409, 'El evento ya no admite esta acción.');
        const b = await cuerpo(req);
        if (match[2] === 'archivo' && method === 'PATCH') {
          if (typeof b.motivo !== 'string' || !b.motivo.trim() || Array.from(b.motivo.trim()).length > 500) throw fallo(400, 'Motivo obligatorio, máximo 500 caracteres.');
          Object.assign(e, { archived_at: new Date().toISOString(), archived_by: actor.id_usuario, archived_by_name: actor.nombre, archive_reason: b.motivo.trim() });
          return json(res, { datos: e, mensaje: 'Evento ficticio archivado.' });
        }
        if (match[2] === 'revision' && method === 'PATCH' && ['approve', 'dismiss'].includes(b.accion)) {
          Object.assign(e, { review_status: b.accion === 'approve' ? 'approved' : 'dismissed', reviewed_by: actor.id_usuario, reviewed_at: new Date().toISOString() });
          return json(res, { datos: e });
        }
        throw fallo(409, 'La aplicación de reservaciones externas no forma parte de esta demostración.');
      }
      const reservasVisibles = () => state.reservas.filter(r => !selected || actor.platform_ids.includes(r.id_plataforma));
      if (p === '/api/dashboard/resumen' && method === 'GET') return json(res, { fecha, alcance_parcial: selected, metricas: {}, alertas: {}, reservaciones_recientes: reservasVisibles(), salidas_hoy: [] });
      if (p === '/api/plataformas' && method === 'GET') return json(res, { datos: [{ id_plataforma: 17, nombre: 'GetYourGuide ficticio' }, ...(!selected ? [{ id_plataforma: 18, nombre: 'FareHarbor ficticio' }] : [])] });
      if (p === '/api/paises' && method === 'GET') return json(res, { datos: [{ id_pais: 1, nombre: 'México ficticio' }] });
      if (p === '/api/reservaciones' && method === 'GET') return json(res, { data: reservasVisibles(), pagination: { page: 1, limit: 25, total: reservasVisibles().length, totalPages: 1 } });
      if (/^\/api\/reservaciones\/\d+$/.test(p) && method === 'GET') {
        const r = reservasVisibles().find(r => r.id_reservacion === Number(p.split('/').pop()));
        if (!r) throw fallo(404, 'Reservación no disponible para este perfil.');
        return json(res, { datos: r });
      }
      if (method === 'GET' && lecturasBase.has(p)) return original(req, res);
      if (method === 'GET' && ['/api/historial', '/api/bitacora', '/api/usuarios'].includes(p)) return json(res, { datos: [], paginacion: { pagina: 1, total: 0, total_paginas: 1 } });
      const b = await cuerpo(req);
      if (p === '/api/operaciones' && method === 'POST') {
        if (![1, 2].includes(b.numero_grupo) || !['Mañana', 'Tarde'].includes(b.turno) || b.id_tour !== 501 || !/^\d{4}-\d{2}-\d{2}$/.test(b.fecha)) throw fallo(400, 'Usa el tour ficticio, fecha, grupo 1/2 y turno explícito.');
        if (state.operaciones.some(o => ['fecha', 'id_tour', 'turno', 'numero_grupo'].every(k => o[k] === b[k]))) throw fallo(409, 'El grupo ya existe para ese tour, fecha y turno.');
        const o = { ...state.operaciones[0], ...b, id_operacion_tour: nextOp++ }; state.operaciones.push(o); return json(res, { datos: o });
      }
      if (p === '/api/transportes' && method === 'POST') {
        if (!state.operaciones.some(o => o.id_operacion_tour === b.id_operacion_tour) || state.transportes.some(t => t.id_operacion_tour === b.id_operacion_tour) || b.id_vehiculo != null) throw fallo(409, 'Cada grupo admite un transporte, inicialmente sin vehículo.');
        const t = { ...b, id_transporte_operacion: nextTr++, id_vehiculo: null }; state.transportes.push(t); return json(res, { datos: enriquecer(t) });
      }
      if (/^\/api\/transportes\/\d+$/.test(p) && method === 'PATCH') {
        const t = state.transportes.find(t => t.id_transporte_operacion === Number(p.split('/').pop()));
        if (!t) throw fallo(404, 'Transporte ficticio no encontrado.');
        if (b.id_operacion_tour !== undefined && b.id_operacion_tour !== t.id_operacion_tour) throw fallo(409, 'La reasignación de grupos no forma parte del recorrido.');
        if (b.id_vehiculo != null && !vehiculos.some(v => v.id_vehiculo === b.id_vehiculo)) throw fallo(400, 'Selecciona un vehículo del catálogo ficticio.');
        if (b.id_vehiculo != null && pax(t.id_transporte_operacion) < 2) throw fallo(409, 'El transporte con vehículo debe tener al menos 2 pasajeros activos.');
        const change = { ...t, ...Object.fromEntries(Object.entries(b).filter(([k]) => ['id_vehiculo', 'id_operador', 'estado', 'observaciones_operador'].includes(k))) };
        validarCapacidad(state.reservas, state.transportes.map(tr => tr === t ? change : tr));
        Object.assign(t, change); return json(res, { datos: enriquecer(t) });
      }
      if (/^\/api\/reservaciones\/\d+\/transporte$/.test(p) && method === 'PATCH') {
        const r = state.reservas.find(r => r.id_reservacion === Number(p.split('/')[3]));
        if (!r || !activo(r)) throw fallo(409, 'Solo se asignan reservaciones ficticias activas.');
        const tr = state.transportes.find(t => t.id_transporte_operacion === b.id_transporte_operacion);
        const op = state.operaciones.find(o => o.id_operacion_tour === tr?.id_operacion_tour);
        if (b.id_transporte_operacion !== null && (!op || !['fecha', 'id_tour', 'turno'].every(k => op[k] === r[k]))) throw fallo(409, 'El grupo debe coincidir con fecha, tour y turno.');
        const change = { ...r, id_transporte_operacion: b.id_transporte_operacion };
        validarCapacidad(state.reservas.map(row => row === r ? change : row));
        Object.assign(r, change); return json(res, { datos: r, mensaje: 'Asignación ficticia actualizada.' });
      }
      throw fallo(409, 'Función fuera del recorrido de esta demostración; no se ha guardado ningún cambio.');
    } catch (error) {
      if (!error.status) errors.push(error.message);
      if (!res.headersSent) json(res, { mensaje: error.status ? error.message : 'Error del simulador.' }, error.status || 500);
      else res.end();
    }
  });
  return { ...base, calls, errors, events, perfiles, fecha, capability, environment };
}
module.exports = { crearPreviewApi, perfiles };
