const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
jest.mock('../config/database', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('bcryptjs', () => ({ hash: jest.fn(async () => 'hash-sintetico'), compare: jest.fn(async () => true) }));
const pool = require('../config/database');
const usuariosService = require('../services/usuarios.service');
const { validarDatosUsuario, validarDatosActualizacionUsuario } = require('../validators/usuarios.validator');
const SECRET = 'scope-03b-sintetico';
let state, client, queries, falloAsignaciones, app;
const payload = (mode, ids = []) => ({ nombre: 'Consulta sintetico', correo: 'nuevo@example.test', password: 'PasswordSintetico!', id_rol: 20, alcance_plataformas: mode, platform_ids: ids });
const token = (id = 5) => jwt.sign({ id_usuario: id, rol: 'Administrador' }, SECRET);
const enrich = (user, db) => user && ({ ...user, rol: user.id_rol === 10 ? 'Administrador' : 'Consulta', platform_ids: db.asignaciones[user.id_usuario] || [] });

beforeEach(() => {
    jest.clearAllMocks(); process.env.JWT_SECRET = SECRET;
    falloAsignaciones = false; queries = [];
    state = { usuarios: [
        { id_usuario: 5, id_rol: 10, nombre: 'Admin A', correo: 'a@example.test', estado: true, alcance_plataformas: 'all', password: 'hash-sintetico' },
        { id_usuario: 6, id_rol: 10, nombre: 'Admin B', correo: 'b@example.test', estado: true, alcance_plataformas: 'all', password: 'hash-sintetico' },
        { id_usuario: 7, id_rol: 20, nombre: 'Consulta all', correo: 'c@example.test', estado: true, alcance_plataformas: 'all', password: 'hash-sintetico' },
        { id_usuario: 8, id_rol: 20, nombre: 'Consulta selected', correo: 'd@example.test', estado: true, alcance_plataformas: 'selected', password: 'hash-sintetico' }
    ], asignaciones: { 8: [17] } };
    let work = null;
    const query = async (sql, values = []) => {
        queries.push([sql, values]);
        if (sql === 'BEGIN') { work = structuredClone(state); return { rows: [] }; }
        if (sql === 'COMMIT') { state = work; work = null; return { rows: [] }; }
        if (sql === 'ROLLBACK') { work = null; return { rows: [] }; }
        const db = work || state;
        if (/FROM roles/.test(sql)) return { rows: [{ id_rol: values[0], nombre: values[0] === 10 ? 'Administrador' : 'Consulta' }] };
        if (/FROM plataformas/.test(sql)) return { rows: values[0].filter((id) => [17,83].includes(id)).map((id_plataforma) => ({ id_plataforma })) };
        if (/FROM usuarios u/.test(sql)) {
            let rows = db.usuarios;
            if (/u.id_usuario = \$1/.test(sql)) rows = rows.filter((u) => u.id_usuario === values[0]);
            if (/LOWER\(u.correo\)/.test(sql)) rows = rows.filter((u) => u.correo === values[0]);
            if (/r.nombre = \$1/.test(sql)) rows = rows.filter((u) => u.id_rol === 10 && u.estado);
            return { rows: rows.map((u) => { const row = enrich(u, db); if (!/u.password/.test(sql)) delete row.password; return row; }) };
        }
        if (/INSERT INTO usuarios/.test(sql)) {
            const user = { id_usuario: 9, id_rol: values[0], nombre: values[1], correo: values[2], password: values[3], estado: values[4], alcance_plataformas: values[5] };
            db.usuarios.push(user); return { rows: [{ id_usuario: 9 }] };
        }
        if (/UPDATE usuarios/.test(sql)) {
            const id = values[values.length - 1]; const user = db.usuarios.find((u) => u.id_usuario === id);
            for (const [,field,index] of sql.matchAll(/(\w+) = \$(\d+)/g)) user[field] = values[Number(index)-1];
            return { rows: [{ id_usuario: id }] };
        }
        if (/DELETE FROM usuario_plataformas_visibles/.test(sql)) { db.asignaciones[values[0]] = []; return { rows: [] }; }
        if (/INSERT INTO usuario_plataformas_visibles/.test(sql)) {
            if (falloAsignaciones) throw new Error('Fallo simulado de asignaciones');
            db.asignaciones[values[0]] = [...values[1]]; return { rows: [] };
        }
        throw new Error('SQL no soportado por DB fake: ' + sql);
    };
    client = { query: jest.fn(query), release: jest.fn() };
    pool.connect.mockResolvedValue(client); pool.query.mockImplementation(query);
    app = express(); app.use(express.json());
    app.use('/api/usuarios', require('../routes/usuarios.routes'));
    app.use('/api/auth', require('../routes/auth.routes'));
});

const create = (body, id = 5) => request(app).post('/api/usuarios').set('Authorization', 'Bearer ' + token(id)).send(body);
const patch = (id, body, actor = 5) => request(app).patch('/api/usuarios/' + id).set('Authorization', 'Bearer ' + token(actor)).send(body);

describe('Usuarios: alcance transaccional', () => {
    test.each([['all', []], ['selected', [83,17]], ['selected', []]])('crear Consulta %s con %j', async (mode, ids) => {
        const response = await create(payload(mode, ids));
        expect(response.status).toBe(201);
        expect(response.body.datos).toMatchObject({ alcance_plataformas: mode, platform_ids: [...ids].sort((a,b) => a-b) });
        expect(response.body.datos).not.toHaveProperty('password');
        expect(queries.map(([sql]) => sql)).toContain('COMMIT'); expect(client.release).toHaveBeenCalledTimes(1);
    });
    test.each([['all', []], ['selected', [83]], ['selected', []]])('editar Consulta a %s con %j', async (mode, ids) => {
        const response = await patch(8, { alcance_plataformas: mode, platform_ids: ids });
        expect(response.status).toBe(200); expect(response.body.datos).toMatchObject({ alcance_plataformas: mode, platform_ids: ids });
    });
    test('Consulta existente all conserva modo al editar solo nombre', async () => {
        const response = await patch(7, { nombre: 'Nuevo nombre' });
        expect(response.status).toBe(200); expect(response.body.datos.alcance_plataformas).toBe('all');
    });
    test('nuevo Consulta requiere eleccion explicita', async () => {
        const body = payload('selected'); delete body.alcance_plataformas;
        expect((await create(body)).status).toBe(400); expect(state.usuarios).toHaveLength(4);
        expect(queries.map(([sql]) => sql)).toContain('ROLLBACK');
    });
    test('Administrador a Consulta exige alcance final', async () => {
        expect((await patch(6, { id_rol: 20 })).status).toBe(400);
        expect(state.usuarios.find((u) => u.id_usuario === 6).id_rol).toBe(10);
        expect((await patch(6, { id_rol: 20, alcance_plataformas: 'selected', platform_ids: [83] })).status).toBe(200);
        expect(state.usuarios.find((u) => u.id_usuario === 6)).toMatchObject({ id_rol: 20, alcance_plataformas: 'selected' });
    });
    test('Consulta a Administrador obtiene acceso completo sin configuracion visual', async () => {
        expect((await patch(8, { id_rol: 10 })).status).toBe(200);
        const sesion = await request(app).get('/api/auth/sesion').set('Authorization', 'Bearer ' + token(8));
        expect(sesion.status).toBe(200); expect(sesion.body.usuario.alcance_plataformas).toBe('all');
    });
    test('plataformas inexistentes se rechazan antes de modificar usuario', async () => {
        const previous = structuredClone(state);
        expect((await patch(7, { alcance_plataformas: 'selected', platform_ids: [999] })).status).toBe(400);
        expect(state).toEqual(previous); expect(queries.map(([sql]) => sql)).toContain('ROLLBACK');
    });
    test('error al insertar asignaciones revierte modo, datos y borrado anterior', async () => {
        const previous = structuredClone(state); falloAsignaciones = true;
        await expect(usuariosService.actualizarUsuarioParcial(7, { nombre: 'No conservar', alcance_plataformas: 'selected', platform_ids: [17] }, { id_usuario: 5 })).rejects.toThrow('Fallo simulado');
        expect(state).toEqual(previous); expect(queries.map(([sql]) => sql)).toContain('ROLLBACK');
        expect(queries.map(([sql]) => sql)).not.toContain('COMMIT'); expect(client.release).toHaveBeenCalled();
    });
    test.each([7,8])('Consulta %s no puede configurar sus permisos ni otro usuario', async (actor) => {
        expect((await patch(actor, { alcance_plataformas: 'all' }, actor)).status).toBe(403);
        expect((await create(payload('all'), actor)).status).toBe(403);
        expect(pool.connect).not.toHaveBeenCalled();
    });
    test('se conserva proteccion propia del Administrador', async () => {
        expect((await patch(5, { estado: false })).status).toBe(409);
        expect((await patch(5, { id_rol: 20, alcance_plataformas: 'selected' })).status).toBe(409);
    });
    test('se conserva proteccion del ultimo Administrador y bloqueos SQL', async () => {
        state.usuarios.find((u) => u.id_usuario === 5).estado = false;
        await expect(usuariosService.actualizarUsuarioParcial(6, { estado: false }, { id_usuario: 999 })).rejects.toMatchObject({ statusCode: 409 });
        expect(queries.some(([sql]) => sql.includes('FOR UPDATE OF u'))).toBe(true);
        expect(state.usuarios.find((u) => u.id_usuario === 6).estado).toBe(true);
    });
    test.each([[17,17], [0], ['17'], null].map((ids) => [ids]))('validador rechaza IDs invalidos %j', (ids) => {
        expect(validarDatosActualizacionUsuario({ platform_ids: ids }).errores.length).toBeGreaterThan(0);
    });
    test('all con asignaciones y alcance en Administrador se rechazan', async () => {
        expect((await patch(7, { alcance_plataformas: 'all', platform_ids: [17] })).status).toBe(400);
        expect((await patch(6, { alcance_plataformas: 'selected', platform_ids: [17] })).status).toBe(400);
    });
});

describe('Sesion verificada del backend', () => {
    test('login entrega alcance y plataformas obtenidos de DB', async () => {
        const response = await request(app).post('/api/auth/login').send({ correo: 'd@example.test', password: 'PasswordSintetico!' });
        expect(response.status).toBe(200); expect(response.body.usuario).toMatchObject({ alcance_plataformas: 'selected', platform_ids: [17] });
    });
    test('sesion solo permite consultar al usuario autenticado y reconoce cambios', async () => {
        expect((await request(app).get('/api/auth/sesion')).status).toBe(401);
        const first = await request(app).get('/api/auth/sesion?id_usuario=5').set('Authorization', 'Bearer ' + token(8));
        expect(first.body.usuario.id_usuario).toBe(8);
        state.asignaciones[8] = [];
        const second = await request(app).get('/api/auth/sesion').set('Authorization', 'Bearer ' + token(8));
        expect(second.body.usuario.platform_ids).toEqual([]); expect(second.headers['cache-control']).toBe('no-store');
    });
    test('fallo de resolucion no entrega usuario ni alcance por defecto', async () => {
        pool.query.mockImplementationOnce(async () => ({ rows: [enrich(state.usuarios[3], state)] })).mockRejectedValueOnce(new Error('Esquema pendiente'));
        const response = await request(app).get('/api/auth/sesion').set('Authorization', 'Bearer ' + token(8));
        expect(response.status).toBe(500); expect(response.body).not.toHaveProperty('usuario');
    });
});
