const usuariosService = require('../services/usuarios.service');
const {
    validarIdUsuario,
    validarDatosUsuario,
    validarDatosActualizacionUsuario,
    validarDatosPasswordUsuario
} = require('../validators/usuarios.validator');
const { obtenerRespuestaErrorPostgres } = require('../utils/dbErrors');

const responderErrorServicio = (res, error, contexto, mensajeDefault) => {
    const respuestaErrorPostgres = obtenerRespuestaErrorPostgres(error);

    if (respuestaErrorPostgres) {
        return res.status(respuestaErrorPostgres.status).json(respuestaErrorPostgres.body);
    }

    if (error.statusCode) {
        return res.status(error.statusCode).json({
            mensaje: error.message
        });
    }

    console.error(contexto, error);

    return res.status(500).json({
        mensaje: mensajeDefault
    });
};

const listarUsuarios = async (req, res) => {
    try {
        const usuarios = await usuariosService.obtenerUsuarios();

        return res.status(200).json({
            mensaje: 'Usuarios consultados correctamente',
            total: usuarios.length,
            datos: usuarios
        });
    } catch (error) {
        return responderErrorServicio(
            res,
            error,
            'Error al consultar usuarios:',
            'Error al consultar usuarios'
        );
    }
};

const listarRoles = async (req, res) => {
    try {
        const roles = await usuariosService.obtenerRoles();

        return res.status(200).json({
            mensaje: 'Roles consultados correctamente',
            total: roles.length,
            datos: roles
        });
    } catch (error) {
        return responderErrorServicio(
            res,
            error,
            'Error al consultar roles:',
            'Error al consultar roles'
        );
    }
};

const obtenerUsuarioPorId = async (req, res) => {
    const idUsuario = validarIdUsuario(req.params.id);

    if (idUsuario === null) {
        return res.status(400).json({
            mensaje: 'El id del usuario debe ser un entero válido'
        });
    }

    try {
        const usuario = await usuariosService.obtenerUsuarioPorId(idUsuario);

        if (!usuario) {
            return res.status(404).json({
                mensaje: 'Usuario no encontrado'
            });
        }

        return res.status(200).json({
            mensaje: 'Usuario consultado correctamente',
            datos: usuario
        });
    } catch (error) {
        return responderErrorServicio(
            res,
            error,
            'Error al consultar el usuario:',
            'Error al consultar el usuario'
        );
    }
};

const crearUsuario = async (req, res) => {
    const { errores, usuario } = validarDatosUsuario(req.body || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Datos inválidos',
            errores
        });
    }

    try {
        const usuarioCreado = await usuariosService.crearUsuario(usuario);

        return res.status(201).json({
            mensaje: 'Usuario creado correctamente',
            datos: usuarioCreado
        });
    } catch (error) {
        return responderErrorServicio(
            res,
            error,
            'Error al crear el usuario:',
            'Error al crear el usuario'
        );
    }
};

const actualizarUsuarioParcial = async (req, res) => {
    const idUsuario = validarIdUsuario(req.params.id);

    if (idUsuario === null) {
        return res.status(400).json({
            mensaje: 'El id del usuario debe ser un entero válido'
        });
    }

    const { errores, camposActualizacion } = validarDatosActualizacionUsuario(req.body || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Datos inválidos',
            errores
        });
    }

    try {
        const usuarioActualizado = await usuariosService.actualizarUsuarioParcial(
            idUsuario,
            camposActualizacion,
            req.usuario
        );

        if (!usuarioActualizado) {
            return res.status(404).json({
                mensaje: 'Usuario no encontrado'
            });
        }

        return res.status(200).json({
            mensaje: 'Usuario actualizado correctamente',
            datos: usuarioActualizado
        });
    } catch (error) {
        return responderErrorServicio(
            res,
            error,
            'Error al actualizar el usuario:',
            'Error al actualizar el usuario'
        );
    }
};

const actualizarPasswordUsuario = async (req, res) => {
    const idUsuario = validarIdUsuario(req.params.id);

    if (idUsuario === null) {
        return res.status(400).json({
            mensaje: 'El id del usuario debe ser un entero válido'
        });
    }

    const { errores, password } = validarDatosPasswordUsuario(req.body || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Datos inválidos',
            errores
        });
    }

    try {
        const usuarioActualizado = await usuariosService.actualizarPasswordUsuario(idUsuario, password);

        if (!usuarioActualizado) {
            return res.status(404).json({
                mensaje: 'Usuario no encontrado'
            });
        }

        return res.status(200).json({
            mensaje: 'Contraseña actualizada correctamente',
            datos: usuarioActualizado
        });
    } catch (error) {
        return responderErrorServicio(
            res,
            error,
            'Error al actualizar la contraseña del usuario:',
            'Error al actualizar la contraseña del usuario'
        );
    }
};

module.exports = {
    listarUsuarios,
    listarRoles,
    obtenerUsuarioPorId,
    crearUsuario,
    actualizarUsuarioParcial,
    actualizarPasswordUsuario
};
