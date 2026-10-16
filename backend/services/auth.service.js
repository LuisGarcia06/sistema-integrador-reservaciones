const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const alcanceService = require('./alcanceReservaciones.service');

const MENSAJE_CREDENCIALES_INVALIDAS = 'Correo o contraseña incorrectos';

const obtenerUsuarioPorCorreo = async (correo) => {
    const query = `
        SELECT
            u.id_usuario,
            u.nombre,
            u.correo,
            u.password,
            u.estado,
            u.id_rol,
            r.nombre AS rol
        FROM usuarios u
        INNER JOIN roles r
            ON r.id_rol = u.id_rol
        WHERE LOWER(u.correo) = LOWER($1)
        LIMIT 1
    `;

    const result = await pool.query(query, [correo]);

    return result.rows[0];
};

const obtenerUsuarioAutenticadoPorId = async (idUsuario) => {
    const query = `
        SELECT
            u.id_usuario,
            u.nombre,
            u.correo,
            u.estado,
            u.id_rol,
            r.nombre AS rol
        FROM usuarios u
        INNER JOIN roles r
            ON r.id_rol = u.id_rol
        WHERE u.id_usuario = $1
        LIMIT 1
    `;

    const result = await pool.query(query, [idUsuario]);

    return result.rows[0];
};

const obtenerUsuarioSeguro = (usuario) => ({
    id_usuario: usuario.id_usuario,
    nombre: usuario.nombre,
    correo: usuario.correo,
    id_rol: usuario.id_rol,
    rol: usuario.rol
});

const obtenerSesionUsuario = async (usuario) => {
    const alcance = await alcanceService.obtenerAlcanceReservacionesUsuario(usuario.id_usuario);
    return {
        ...obtenerUsuarioSeguro(usuario),
        alcance_plataformas: alcance.all ? 'all' : 'selected',
        platform_ids: alcance.all ? [] : alcance.platform_ids
    };
};

const generarToken = (usuario) => {
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
        throw new Error('JWT_SECRET no configurado');
    }

    return jwt.sign(
        {
            id_usuario: usuario.id_usuario,
            id_rol: usuario.id_rol,
            rol: usuario.rol
        },
        jwtSecret,
        {
            expiresIn: process.env.JWT_EXPIRES_IN || '8h'
        }
    );
};

const iniciarSesion = async ({ correo, password }) => {
    const usuario = await obtenerUsuarioPorCorreo(correo);

    if (!usuario) {
        return {
            autenticado: false,
            status: 401,
            mensaje: MENSAJE_CREDENCIALES_INVALIDAS
        };
    }

    const passwordValido = await bcrypt.compare(password, usuario.password);

    if (!passwordValido) {
        return {
            autenticado: false,
            status: 401,
            mensaje: MENSAJE_CREDENCIALES_INVALIDAS
        };
    }

    if (!usuario.estado) {
        return {
            autenticado: false,
            status: 403,
            mensaje: 'Usuario inactivo'
        };
    }

    const usuarioSesion = await obtenerSesionUsuario(usuario);

    return {
        autenticado: true,
        token: generarToken(usuario),
        usuario: usuarioSesion
    };
};

module.exports = {
    iniciarSesion,
    obtenerUsuarioAutenticadoPorId,
    obtenerSesionUsuario
};
