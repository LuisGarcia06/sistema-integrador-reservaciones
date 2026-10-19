const express = require('express'), request = require('supertest'), jwt = require('jsonwebtoken');
jest.mock('../config/database', () => ({ query: jest.fn() }));
jest.mock('../services/auth.service', () => ({ obtenerUsuarioAutenticadoPorId: jest.fn() }));
jest.mock('../services/alcanceReservaciones.service', () => ({ obtenerAlcanceReservacionesUsuario: jest.fn() }));
jest.mock('../services/notificacionesIntegracion.service', () => ({ obtenerResumenNotificaciones: jest.fn() }));
const auth = require('../services/auth.service'), scope = require('../services/alcanceReservaciones.service');
const summary = require('../services/notificacionesIntegracion.service');
const secret = 'pre-release-04-synthetic-only'; let app;
beforeEach(() => {
    jest.clearAllMocks(); process.env.JWT_SECRET = secret;
    auth.obtenerUsuarioAutenticadoPorId.mockImplementation(async id => ({ id_usuario: id, rol: id === 1 ? 'Administrador' : 'Consulta', nombre: 'Usuario ficticio', estado: id !== 4 }));
    scope.obtenerAlcanceReservacionesUsuario.mockImplementation(async id => ({ all: id !== 3, platformIds: id === 3 ? [17] : [] }));
    summary.obtenerResumenNotificaciones.mockResolvedValue({ environment_id: 'a'.repeat(24), counts: { pending: 73 }, events: [] });
    app = express(); app.use('/api/eventos-integracion', require('../routes/eventosIntegracion.routes'));
});
const api = (id, method = 'get') => request(app)[method]('/api/eventos-integracion/resumen').set('Authorization', 'Bearer ' + jwt.sign({ id_usuario: id }, secret));
test.each([1, 2])('Administrador/Consulta all usa /resumen estático sin caché (%s)', async id => {
    const r = await api(id); expect(r.status).toBe(200); expect(r.headers['cache-control']).toBe('no-store'); expect(r.body.datos.counts.pending).toBe(73); expect(summary.obtenerResumenNotificaciones).toHaveBeenCalledTimes(1);
});
test.each(['get', 'head'])('Consulta selected no consulta servicio ni recibe cantidades (%s)', async method => {
    expect((await api(3, method)).status).toBe(403); expect(summary.obtenerResumenNotificaciones).not.toHaveBeenCalled();
});
test('sesión ausente/inactiva no consulta', async () => {
    expect((await request(app).get('/api/eventos-integracion/resumen')).status).toBe(401); expect((await api(4)).status).toBe(403); expect(summary.obtenerResumenNotificaciones).not.toHaveBeenCalled();
});
test('revocación se relee en backend', async () => {
    expect((await api(2)).status).toBe(200); scope.obtenerAlcanceReservacionesUsuario.mockResolvedValue({ all: false, platformIds: [17] });
    expect((await api(2)).status).toBe(403); expect(summary.obtenerResumenNotificaciones).toHaveBeenCalledTimes(1);
});
test('fallo devuelve 500 sin cero ni SQL', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    summary.obtenerResumenNotificaciones.mockRejectedValue(Object.assign(Error('SQL privado'), { code: '42703' }));
    const r = await api(1); expect(r.status).toBe(500); expect(r.body.datos).toBeUndefined(); expect(JSON.stringify(r.body)).not.toContain('SQL privado'); log.mockRestore();
});
