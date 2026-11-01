const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
function client(lab = true) {
  let version = 1;
  const auth = { obtenerVersionSesion: () => version, estaAutenticado: () => true, refrescarSesion: async () => {}, obtenerToken: () => 'synthetic', registrarSolicitud: () => () => {}, limpiarSesion: jest.fn(), establecerMensajeSesion: jest.fn() };
  const window = { App: { auth }, location: { hash: '#/login' }, dispatchEvent: jest.fn() };
  const fetch = jest.fn(), context = vm.createContext({ window, fetch, Headers, AbortController, Event, URL });
  for (const file of ['api.js', ...(lab ? ['revisionLab.js'] : [])]) vm.runInContext(fs.readFileSync(path.join(__dirname, '../../frontend/js', file), 'utf8'), context);
  const response = (status, body) => ({ status, ok: status < 300, headers: new Headers({ 'content-type': 'application/json' }), json: async () => body });
  const photo = { datos: { datos: { habitacion: 'Original', pax: 2 } }, revision: '9007199254740993', etag: '"synthetic-tag"', contexto: '"synthetic-context"', metodo: 'PATCH', ruta: '/api/reservaciones/1' };
  return { api: window.App.api, lab: window.App.revisionLab, fetch, window, photo, response, revoke: () => version++ };
}
test('apiFetch previo conserva respuesta y no añade precondiciones', async () => {
  const c = client(false); c.fetch.mockResolvedValue(c.response(201, { datos: { id: 1 } }));
  expect(await c.api.apiFetch('/api/reservaciones', { method: 'POST', body: { nombre: 'S' } })).toEqual({ datos: { id: 1 } });
  expect(c.fetch.mock.calls[0][1].headers.has('If-Match')).toBe(false);
});
test.each([[412, 'PRECONDICION_OBSOLETA', 'record'], [409, 'CONTEXTO_OPERATIVO_CAMBIO', 'context'], [409, undefined, 'business'], [428, 'PRECONDICION_REQUERIDA', 'required'], [400, 'PRECONDICION_INVALIDA', 'protocol'], [400, 'CLIENTE_INCOMPATIBLE', 'protocol'], [400, undefined, 'business'], [401, undefined, 'authentication'], [403, undefined, 'permission']])('clasifica HTTP %s %s sin repetir', async (status, codigo, kind) => {
  const c = client(); c.fetch.mockResolvedValue(c.response(status, { codigo, mensaje: 'Sintético' }));
  await expect(c.api.apiFetch('/api/reservaciones/1')).rejects.toMatchObject({ status, kind }); expect(c.fetch).toHaveBeenCalledTimes(1);
});
test.each([412, 409])('conserva original y propuesta ante %s, lee actual y exige decidir y confirmar', async status => {
  const c = client(); c.fetch.mockResolvedValueOnce(c.response(200, c.photo));
  const s = await new c.lab.EditSession('PATCH', c.photo.ruta).open(); s.setProposal({ habitacion: 'Mi intención' });
  c.fetch.mockResolvedValueOnce(c.response(status, { codigo: status === 412 ? 'PRECONDICION_OBSOLETA' : 'CONTEXTO_OPERATIVO_CAMBIO' })).mockResolvedValueOnce(c.response(200, { ...c.photo, etag: '"current"' }));
  await expect(s.submit(() => true)).rejects.toMatchObject({ status });
  expect(s.original.etag).toBe(c.photo.etag); expect(s.original.revision).toBe('9007199254740993'); expect(Object.isFrozen(s.original)).toBe(true);
  expect(s.proposal.habitacion).toBe('Mi intención'); expect(s.current.etag).toBe('"current"');
  await expect(s.submit(() => true)).rejects.toMatchObject({ kind: 'blocked' });
  c.fetch.mockResolvedValueOnce(c.response(200, { ...c.photo, etag: '"fresh"' })); await s.prepare('review');
  expect(c.fetch).toHaveBeenCalledTimes(4); expect(s.original.etag).toBe('"fresh"');
  expect(await s.submit(() => false)).toBe(false); expect(c.fetch).toHaveBeenCalledTimes(4);
  c.fetch.mockResolvedValueOnce(c.response(200, { confirmado: true })); await s.submit(() => true);
  const sent = c.fetch.mock.calls[4][1]; expect(sent.headers.get('If-Match')).toBe('"fresh"'); expect(sent.headers.get('If-Operational-Match')).toBe(c.photo.contexto); expect(sent.headers.get('X-CTSK-Protocol')).toBe(c.lab.PROTOCOL);
});
test('pérdida de respuesta no reenvía ni presupone rollback', async () => {
  const c = client(); c.fetch.mockResolvedValueOnce(c.response(200, c.photo)); const s = await new c.lab.EditSession('PATCH', c.photo.ruta).open(); s.setProposal({ pax: 3 });
  c.fetch.mockRejectedValueOnce(Error('Lost response')); await expect(s.submit(() => true)).rejects.toMatchObject({ isNetworkError: true });
  expect(s.state).toBe('uncertain'); expect(s.proposal).toEqual({ pax: 3 }); await expect(s.submit(() => true)).rejects.toMatchObject({ kind: 'blocked' }); expect(c.fetch).toHaveBeenCalledTimes(2);
});
test('foto rechazada no obtiene representación actual sin autorización', async () => {
  const c = client(); c.fetch.mockResolvedValueOnce(c.response(200, c.photo)); const s = await new c.lab.EditSession('PATCH', c.photo.ruta).open();
  c.fetch.mockResolvedValueOnce(c.response(412, {})).mockResolvedValueOnce(c.response(403, {})); await expect(s.submit(() => true)).rejects.toMatchObject({ status: 412 }); expect(s.current).toBeNull(); expect(s.readError.status).toBe(403);
});
test('cambio de sesión no reutiliza precondiciones', async () => {
  const c = client(); c.fetch.mockResolvedValueOnce(c.response(200, c.photo)); const s = await new c.lab.EditSession('PATCH', c.photo.ruta).open(); c.revoke(); await expect(s.submit(() => true)).rejects.toMatchObject({ kind: 'blocked' }); expect(c.fetch).toHaveBeenCalledTimes(1);
});
test('perfil falla cerrado para consumidores heredados y altas/password pendientes', async () => {
  const c = client(); await expect(c.api.apiFetch('/api/reservaciones/1', { method: 'PATCH', body: {} })).rejects.toMatchObject({ kind: 'blocked' });
  expect(() => new c.lab.EditSession('POST', '/api/reservaciones')).toThrow(); expect(() => new c.lab.EditSession('PATCH', '/api/usuarios/1/password')).toThrow(); expect(c.fetch).not.toHaveBeenCalled();
});
test('matriz del frontend contrasta exactamente las 25 rutas del contrato', () => {
  const c = client(), C = require('../security/revisionApiContract'); let supported = 0;
  for (const r of C.routes) { const url = r.mount + (r.path === '/' ? '' : r.path.replace(':id', '1')) + (r.resource === 'daily' ? '?fecha=2098-02-03' : '');
    const enabled = c.lab.supported(r.method, url); expect(Boolean(enabled)).toBe(r.path !== '/' && r.path !== '/:id/password'); if (enabled) supported++;
  }
  expect(C.routes).toHaveLength(25); expect(supported).toBe(14);
});
