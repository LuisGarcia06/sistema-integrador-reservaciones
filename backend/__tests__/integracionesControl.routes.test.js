const express = require('express'), request = require('supertest'), jwt = require('jsonwebtoken');
jest.mock('../config/database', () => ({ query: jest.fn() }));
jest.mock('../services/auth.service', () => ({ obtenerUsuarioAutenticadoPorId: jest.fn() }));
jest.mock('../services/alcanceReservaciones.service', () => ({ obtenerAlcanceReservacionesUsuario: jest.fn() }));
jest.mock('../services/integracionesControl.service', () => ({ listarControles: jest.fn(), cambiarControl: jest.fn() }));
const auth = require('../services/auth.service'), scope = require('../services/alcanceReservaciones.service');
const control = require('../services/integracionesControl.service');
const secret = 'synthetic-integration-controls-secret';
let app;
beforeEach(() => {
    jest.clearAllMocks(); process.env.JWT_SECRET = secret;
    auth.obtenerUsuarioAutenticadoPorId.mockImplementation(async id => ({ id_usuario: id,
        rol: id === 1 ? 'Administrador' : 'Consulta', estado: id !== 4 }));
    scope.obtenerAlcanceReservacionesUsuario.mockImplementation(async id => ({ all: id !== 3, platform_ids: id === 3 ? [17] : [] }));
    control.listarControles.mockResolvedValue([]); control.cambiarControl.mockResolvedValue({ activado: false });
    app = express(); app.use(express.json()); app.use('/api/integraciones', require('../routes/integracionesControl.routes'));
});
const token = id => 'Bearer ' + jwt.sign({ id_usuario: id }, secret);
test.each([1, 2, 3])('consulta autenticada de estados; cantidades solo alcance all (%s)', async id => {
    const r = await request(app).get('/api/integraciones').set('Authorization', token(id));
    expect(r.status).toBe(200); expect(r.headers['cache-control']).toBe('no-store');
    expect(control.listarControles).toHaveBeenCalledWith({ includeCounts: id !== 3 });
});
test.each([2, 3, 4])('Consulta/inactivo no cambia controles (%s)', async id => {
    expect((await request(app).patch('/api/integraciones/fareharbor').set('Authorization', token(id)).send({ activado: false })).status).toBe(403);
    expect(control.cambiarControl).not.toHaveBeenCalled();
});
test('sin sesión rechaza lectura/escritura', async () => {
    expect((await request(app).get('/api/integraciones')).status).toBe(401);
    expect((await request(app).patch('/api/integraciones/getyourguide').send({ activado: true })).status).toBe(401);
});
test('Reservas usa identidad autenticada para auditoría', async () => {
    expect((await request(app).patch('/api/integraciones/getyourguide').set('Authorization', token(1)).send({ activado: false, id_usuario: 99 })).status).toBe(200);
    expect(control.cambiarControl).toHaveBeenCalledWith('getyourguide', false, 1);
});
test('fallo SQL no se expone ni informa éxito', async () => {
    control.cambiarControl.mockRejectedValue(Error('SQL con dato privado'));
    const r = await request(app).patch('/api/integraciones/fareharbor').set('Authorization', token(1)).send({ activado: true });
    expect(r.status).toBe(503); expect(JSON.stringify(r.body)).not.toContain('privado');
});
