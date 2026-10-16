const fs = require('node:fs');
const path = require('node:path');

// El pool real no se carga y ninguna prueba se conecta a PostgreSQL.
jest.mock('../config/database', () => ({ query: jest.fn() }));

const pool = require('../config/database');
const { obtenerAlcanceReservacionesUsuario } = require('../services/alcanceReservaciones.service');
const {
    validarDatosUsuario,
    validarDatosActualizacionUsuario
} = require('../validators/usuarios.validator');

const crearUsuario = (campos = {}) => ({
    estado: true,
    rol: 'Consulta',
    alcance_plataformas: 'selected',
    platform_ids: [],
    ...campos
});

describe('alcanceReservaciones.service', () => {
    beforeEach(() => {
        pool.query.mockReset();
    });

    test.each(['all', 'selected'])('Administrador obtiene acceso completo con modo %s', async (modo) => {
        pool.query.mockResolvedValue({ rows: [crearUsuario({
            rol: 'Administrador',
            alcance_plataformas: modo,
            platform_ids: [17]
        })] });

        await expect(obtenerAlcanceReservacionesUsuario(47)).resolves.toEqual({ all: true });
    });

    test('Consulta all conserva acceso completo aunque no tenga asignaciones', async () => {
        pool.query.mockResolvedValue({ rows: [crearUsuario({ alcance_plataformas: 'all' })] });

        await expect(obtenerAlcanceReservacionesUsuario(47)).resolves.toEqual({ all: true });
    });

    test('Consulta selected recibe solamente los IDs obtenidos de PostgreSQL', async () => {
        pool.query.mockResolvedValue({ rows: [crearUsuario({ platform_ids: [17, 83] })] });

        await expect(obtenerAlcanceReservacionesUsuario(47)).resolves.toEqual({
            all: false,
            platform_ids: [17, 83]
        });
        expect(pool.query).toHaveBeenCalledTimes(1);
        expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE u.id_usuario = $1'), [47]);
    });

    test('Consulta selected sin plataformas recibe cero permisos', async () => {
        pool.query.mockResolvedValue({ rows: [crearUsuario()] });

        await expect(obtenerAlcanceReservacionesUsuario(47)).resolves.toEqual({
            all: false,
            platform_ids: []
        });
    });

    test('usuario inexistente no recibe autorizacion', async () => {
        pool.query.mockResolvedValue({ rows: [] });

        await expect(obtenerAlcanceReservacionesUsuario(47)).rejects.toMatchObject({ statusCode: 403 });
    });

    test.each(['Administrador', 'Consulta'])('usuario inactivo de rol %s no recibe autorizacion', async (rol) => {
        pool.query.mockResolvedValue({ rows: [crearUsuario({
            rol,
            estado: false,
            alcance_plataformas: 'all'
        })] });

        await expect(obtenerAlcanceReservacionesUsuario(47)).rejects.toMatchObject({ statusCode: 403 });
    });

    test('un error de PostgreSQL se propaga y no concede acceso completo', async () => {
        const error = new Error('Fallo simulado de PostgreSQL');
        pool.query.mockRejectedValue(error);

        await expect(obtenerAlcanceReservacionesUsuario(47)).rejects.toBe(error);
    });

    test('los cambios de asignaciones se reflejan en la siguiente resolucion, incluida revocacion total', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [crearUsuario({ platform_ids: [17] })] })
            .mockResolvedValueOnce({ rows: [crearUsuario({ platform_ids: [83] })] })
            .mockResolvedValueOnce({ rows: [crearUsuario()] });

        await expect(obtenerAlcanceReservacionesUsuario(47)).resolves.toEqual({ all: false, platform_ids: [17] });
        await expect(obtenerAlcanceReservacionesUsuario(47)).resolves.toEqual({ all: false, platform_ids: [83] });
        await expect(obtenerAlcanceReservacionesUsuario(47)).resolves.toEqual({ all: false, platform_ids: [] });
        expect(pool.query).toHaveBeenCalledTimes(3);
    });

    test('cambios de rol, modo y estado se resuelven nuevamente desde DB', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [crearUsuario({ rol: 'Administrador' })] })
            .mockResolvedValueOnce({ rows: [crearUsuario()] })
            .mockResolvedValueOnce({ rows: [crearUsuario({ alcance_plataformas: 'all' })] })
            .mockResolvedValueOnce({ rows: [crearUsuario({ estado: false })] });

        await expect(obtenerAlcanceReservacionesUsuario(47)).resolves.toEqual({ all: true });
        await expect(obtenerAlcanceReservacionesUsuario(47)).resolves.toEqual({ all: false, platform_ids: [] });
        await expect(obtenerAlcanceReservacionesUsuario(47)).resolves.toEqual({ all: true });
        await expect(obtenerAlcanceReservacionesUsuario(47)).rejects.toMatchObject({ statusCode: 403 });
    });

    test('una consulta fallida despues de all no reutiliza el permiso anterior', async () => {
        const error = new Error('Fallo simulado tras cambiar permisos');
        pool.query
            .mockResolvedValueOnce({ rows: [crearUsuario({ alcance_plataformas: 'all' })] })
            .mockRejectedValueOnce(error);

        await expect(obtenerAlcanceReservacionesUsuario(47)).resolves.toEqual({ all: true });
        await expect(obtenerAlcanceReservacionesUsuario(47)).rejects.toBe(error);
    });

    test.each(['Otro rol', null, undefined])('un rol desconocido %s no obtiene all', async (rol) => {
        pool.query.mockResolvedValue({ rows: [crearUsuario({ rol, alcance_plataformas: 'all' })] });

        await expect(obtenerAlcanceReservacionesUsuario(47)).rejects.toMatchObject({ statusCode: 403 });
    });

    test.each([null, undefined, '', 'selected_platforms'])('un modo invalido %s no obtiene acceso', async (modo) => {
        pool.query.mockResolvedValue({ rows: [crearUsuario({ alcance_plataformas: modo })] });

        await expect(obtenerAlcanceReservacionesUsuario(47)).rejects.toMatchObject({ statusCode: 403 });
    });

    test.each([null, undefined, [0], ['17']].map((ids) => [ids]))('asignaciones invalidas %j no conceden acceso', async (ids) => {
        pool.query.mockResolvedValue({ rows: [crearUsuario({ platform_ids: ids })] });

        await expect(obtenerAlcanceReservacionesUsuario(47)).rejects.toMatchObject({ statusCode: 403 });
    });

    test.each([undefined, null, 0, -1, 1.5, true, [], 2147483648, '47 OR 1=1', { id_usuario: 47, rol: 'Administrador', platform_ids: [17] }].map((id) => [id]))(
        'una identidad invalida %j se rechaza sin consultar DB', async (idUsuario) => {
            await expect(obtenerAlcanceReservacionesUsuario(idUsuario)).rejects.toMatchObject({ statusCode: 403 });
            expect(pool.query).not.toHaveBeenCalled();
        }
    );

    test('un ID entero representado como texto se consulta mediante parametro', async () => {
        pool.query.mockResolvedValue({ rows: [crearUsuario()] });

        await expect(obtenerAlcanceReservacionesUsuario('47')).resolves.toEqual({ all: false, platform_ids: [] });
        expect(pool.query).toHaveBeenCalledWith(expect.any(String), [47]);
    });
});

describe('validacion administrativa de alcance ACCESS-SCOPE-03B', () => {
    test('los campos de alcance son admitidos para validacion administrativa', () => {
        const resultado = validarDatosUsuario({
            nombre: 'Usuario sintetico',
            correo: 'consulta@example.test',
            password: 'PasswordSintetico!',
            id_rol: 2,
            alcance_plataformas: 'all',
            platform_ids: [17, 83]
        });

        expect(resultado.errores).toEqual([]);
        expect(resultado.usuario).toMatchObject({ alcance_plataformas: 'all', platform_ids: [17, 83] });
    });

    test('la validacion admite cambios de modo y asignaciones', () => {
        const resultado = validarDatosActualizacionUsuario({ alcance_plataformas: 'selected', platform_ids: [17] });

        expect(resultado.errores).toEqual([]);
        expect(resultado.camposActualizacion).toEqual({ alcance_plataformas: 'selected', platform_ids: [17] });
    });
});

describe('declaraciones SQL de ACCESS-SCOPE-02 (sin ejecutar migraciones)', () => {
    const migration = fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'migrations', '016_alcance_plataformas_usuarios.sql'), 'utf8');
    const schema = fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'schema.sql'), 'utf8');

    test('migracion transaccional distingue usuarios existentes all de nuevas cuentas selected', () => {
        expect(migration).toMatch(/BEGIN;[\s\S]*ADD COLUMN alcance_plataformas VARCHAR\(20\) NOT NULL DEFAULT 'all'[\s\S]*ALTER COLUMN alcance_plataformas SET DEFAULT 'selected';[\s\S]*COMMIT;/);
    });

    test.each([['migracion', migration], ['esquema', schema]])('%s declara CHECK, PK compuesta y ambas FK', (_nombre, sql) => {
        expect(sql).toMatch(/CHECK \(alcance_plataformas IN \('all', 'selected'\)\)/);
        expect(sql).toMatch(/CREATE TABLE usuario_plataformas_visibles \(\s*id_usuario INTEGER NOT NULL,\s*id_plataforma INTEGER NOT NULL,/);
        expect(sql).toMatch(/PRIMARY KEY \(id_usuario, id_plataforma\)/);
        expect(sql).toMatch(/FOREIGN KEY \(id_usuario\)\s+REFERENCES usuarios\(id_usuario\)/);
        expect(sql).toMatch(/FOREIGN KEY \(id_plataforma\)\s+REFERENCES plataformas\(id_plataforma\)/);
    });

    test('esquema de nuevas instalaciones utiliza default selected', () => {
        expect(schema).toMatch(/alcance_plataformas VARCHAR\(20\) NOT NULL DEFAULT 'selected'/);
    });
});
