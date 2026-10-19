const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
jest.mock('../config/database', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../services/auth.service', () => ({ obtenerUsuarioAutenticadoPorId: jest.fn() }));
jest.mock('../services/alcanceReservaciones.service', () => ({ obtenerAlcanceReservacionesUsuario: jest.fn() }));
const db = require('../config/database');
const auth = require('../services/auth.service');
const scope = require('../services/alcanceReservaciones.service');
const { crearEvento, crearPool } = require('./helpers/archivoEventosFake.cjs');
const secret = 'pre-release-03-sintetico';
let app, pool;
const token = id => jwt.sign({ id_usuario: id }, secret);
const api = (method, url, id = 1) => request(app)[method](url).set('Authorization', 'Bearer ' + token(id));
beforeEach(() => {
    jest.clearAllMocks(); process.env.JWT_SECRET = secret;
    pool = crearPool(); db.connect.mockImplementation(() => pool.connect());
    db.query.mockImplementation(async sql => ({ rows: /COUNT\(/.test(sql) ? [{ total: 1 }] : /UPDATE/.test(sql) ? [] : [crearEvento({ archived_at: '2026-10-17', archived_by: 9, archive_reason: 'Original' })] }));
    auth.obtenerUsuarioAutenticadoPorId.mockImplementation(async id => ({ id_usuario: id, nombre: 'Persona sintética', rol: id === 1 ? 'Administrador' : 'Consulta', estado: id !== 4 }));
    scope.obtenerAlcanceReservacionesUsuario.mockImplementation(async id => ({ all: id !== 3, platformIds: id === 3 ? [17] : [] }));
    app = express(); app.use(express.json()); app.use('/api/eventos-integracion', require('../routes/eventosIntegracion.routes'));
});
test('PATCH administrativo con sesión válida usa usuario del servidor y conserva el evento', async () => {
    const r = await api('patch', '/api/eventos-integracion/801/archivo').send({ motivo: 'Fecha transcurrida' });
    expect(r.status).toBe(200); expect(r.body.datos.archived_by).toBe(1);
    expect(r.body.datos.review_status).toBe('approved'); expect(r.body.datos.application_status).toBe('not_applied');
    expect(pool.state.writes.every(sql => /UPDATE eventos_integracion/.test(sql))).toBe(true);
});
test.each([2, 3, 4])('Consulta all/selected o usuario inactivo no archiva (%s)', async id => {
    expect((await api('patch', '/api/eventos-integracion/801/archivo', id).send({ motivo: 'X' })).status).toBe(403);
    expect(db.connect).not.toHaveBeenCalled();
});
test('Sin token devuelve 401', async () => {
    expect((await request(app).patch('/api/eventos-integracion/801/archivo').send({ motivo: 'X' })).status).toBe(401);
});
test.each([{}, { motivo: '' }, { motivo: false }, { motivo: 'a'.repeat(501) }, { motivo: 'X', idUsuario: 99 }, []])('Cuerpo estricto devuelve 400: %p', async body => {
    expect((await api('patch', '/api/eventos-integracion/801/archivo').send(body)).status).toBe(400);
    expect(db.connect).not.toHaveBeenCalled();
});
test.each(['0', '-1', 'incorrecto'])('ID inválido: %s', async id => {
    expect((await api('patch', '/api/eventos-integracion/' + id + '/archivo').send({ motivo: 'X' })).status).toBe(400);
});
test.each([[null, 404], [crearEvento({ archived_at: '2026-10-17' }), 409], [crearEvento({ application_status: 'applied' }), 409]])('Estado de conflicto/no encontrado (%s)', async (evento, status) => {
    pool = crearPool(evento);
    expect((await api('patch', '/api/eventos-integracion/801/archivo').send({ motivo: 'X' })).status).toBe(status);
    expect(pool.state.writes).toEqual([]);
});
test.each(['get', 'head'])('Consulta selected no recibe historial, contadores ni detalle (%s)', async method => {
    for (const path of ['/api/eventos-integracion?archived=true', '/api/eventos-integracion/801']) {
        expect((await api(method, path, 3)).status).toBe(403);
    }
    expect(db.query).not.toHaveBeenCalled();
});
test.each([1, 2])('Administrador y Consulta all consultan historial y detalle con responsable (%s)', async id => {
    const r = await api('get', '/api/eventos-integracion?archived=true', id);
    expect(r.status).toBe(200); expect(r.body.pagination.total).toBe(1);
    expect(db.query.mock.calls.every(([sql]) => /archived_at IS NOT NULL/.test(sql))).toBe(true);
    const detail = await api('get', '/api/eventos-integracion/801', id);
    expect(detail.status).toBe(200); expect(detail.body.datos.archive_reason).toBe('Original');
});
test('Revisar/rechazar un archivo devuelve conflicto y no sobrescribe revisión', async () => {
    expect((await api('patch', '/api/eventos-integracion/801/revision').send({ accion: 'dismiss' })).status).toBe(409);
    expect(db.query.mock.calls.find(([sql]) => /UPDATE/.test(sql))[0]).toContain('archived_at IS NULL');
});
test.each([
    ['getyourguide', 'new_booking', {}], ['getyourguide', 'modification', {}], ['getyourguide', 'cancellation', {}],
    ['fareharbor', 'new_booking', {}], ['fareharbor', 'modification', { diff_fingerprint: 'a'.repeat(64), decisions: {} }],
    ['fareharbor', 'cancellation', { cancellation_fingerprint: 'a'.repeat(64) }]
])('Carrera posterior a lectura HTTP: aplicación %s/%s devuelve 409', async (provider, event_type, body) => {
    db.query.mockResolvedValue({ rows: [crearEvento({ provider, event_type })] });
    pool = crearPool(crearEvento({ provider, event_type, archived_at: '2026-10-17' }));
    const response = await api('post', '/api/eventos-integracion/801/aplicar').send(body);
    expect(response.status).toBe(409); expect(response.body.mensaje).toContain('archivado'); expect(pool.state.writes).toEqual([]);
});
