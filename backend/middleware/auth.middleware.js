const jwt = require('jsonwebtoken');
const authService = require('../services/auth.service');

const MENSAJE_NO_AUTORIZADO = 'No autorizado';
const MENSAJE_ERROR_AUTENTICACION = 'Error de autenticación';

const responderNoAutorizado = (res) => res.status(401).json({
    mensaje: MENSAJE_NO_AUTORIZADO
});

const obtenerTokenBearer = (authorization) => {
    if (!authorization || typeof authorization !== 'string') {
        return null;
    }

    const partes = authorization.trim().split(/\s+/);

    if (partes.length !== 2 || partes[0] !== 'Bearer' || !partes[1]) {
        return null;
    }

    return partes[1];
};

const construirUsuarioRequest = (usuario) => ({
    id_usuario: usuario.id_usuario,
    nombre: usuario.nombre,
    correo: usuario.correo,
    id_rol: usuario.id_rol,
    rol: usuario.rol
});

const autenticarUsuario = async (req, res, next) => {
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
        return res.status(500).json({
            mensaje: MENSAJE_ERROR_AUTENTICACION
        });
    }

    const token = obtenerTokenBearer(req.headers.authorization);

    if (!token) {
        return responderNoAutorizado(res);
    }

    try {
        const payload = jwt.verify(token, jwtSecret);

        if (!payload.id_usuario) {
            return responderNoAutorizado(res);
        }

        const usuario = await authService.obtenerUsuarioAutenticadoPorId(payload.id_usuario);

        if (!usuario) {
            return responderNoAutorizado(res);
        }

        if (!usuario.estado) {
            return res.status(403).json({
                mensaje: 'Usuario inactivo'
            });
        }

        req.usuario = construirUsuarioRequest(usuario);

        return next();
    } catch (error) {
        if (
            error instanceof jwt.TokenExpiredError ||
            error instanceof jwt.JsonWebTokenError
        ) {
            return responderNoAutorizado(res);
        }

        console.error('Error de autenticación:', error.message);

        return res.status(500).json({
            mensaje: MENSAJE_ERROR_AUTENTICACION
        });
    }
};

const autorizarRoles = (...rolesPermitidos) => (req, res, next) => {
    if (!req.usuario) {
        return responderNoAutorizado(res);
    }

    if (!rolesPermitidos.includes(req.usuario.rol)) {
        return res.status(403).json({
            mensaje: 'No tiene permisos para realizar esta acción'
        });
    }

    return next();
};

module.exports = {
    autenticarUsuario,
    autorizarRoles
};
