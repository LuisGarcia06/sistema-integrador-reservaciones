const reservacionesService = require('../services/reservaciones.service');
const {
    validarIdReservacion,
    validarDatosReservacion,
    validarDatosActualizacionReservacion,
    validarFiltrosReservaciones,
    validarAsignacionTransporteReservacion
} = require('../validators/reservaciones.validator');
const { obtenerRespuestaErrorPostgres } = require('../utils/dbErrors');

const listarReservaciones = async (req, res) => {
    const { errores, filtros } = validarFiltrosReservaciones(req.query || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Filtros inválidos',
            errores
        });
    }

    try {
        const reservaciones = await reservacionesService.obtenerReservaciones(filtros);

        return res.status(200).json({
            mensaje: 'Reservaciones consultadas correctamente',
            total: reservaciones.length,
            datos: reservaciones
        });
    } catch (error) {
        console.error('Error al consultar reservaciones:', error);

        res.status(500).json({
            mensaje: 'Error al consultar reservaciones'
        });
    }
};

const crearReservacion = async (req, res) => {
    const { errores, reservacion } = validarDatosReservacion(req.body || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Datos inválidos',
            errores
        });
    }

    try {
        const idUsuario = req.usuario.id_usuario;
        const reservacionCreada = await reservacionesService.crearReservacion(reservacion, idUsuario);

        return res.status(201).json({
            mensaje: 'Reservación creada correctamente',
            datos: reservacionCreada
        });
    } catch (error) {
        const respuestaErrorPostgres = obtenerRespuestaErrorPostgres(error);

        if (respuestaErrorPostgres) {
            return res.status(respuestaErrorPostgres.status).json(respuestaErrorPostgres.body);
        }

        console.error('Error al crear la reservación:', error);

        return res.status(500).json({
            mensaje: 'Error al crear la reservación'
        });
    }
};

const actualizarReservacionParcial = async (req, res) => {
    const idReservacion = validarIdReservacion(req.params.id);

    if (idReservacion === null) {
        return res.status(400).json({
            mensaje: 'El id de la reservación debe ser un entero válido'
        });
    }

    const { errores, camposActualizacion } = validarDatosActualizacionReservacion(req.body || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Datos inválidos',
            errores
        });
    }

    try {
        const idUsuario = req.usuario.id_usuario;
        const reservacionActualizada = await reservacionesService.actualizarReservacionParcial(
            idReservacion,
            camposActualizacion,
            idUsuario
        );

        if (!reservacionActualizada) {
            return res.status(404).json({
                mensaje: 'Reservación no encontrada'
            });
        }

        return res.status(200).json({
            mensaje: 'Reservación actualizada correctamente',
            datos: reservacionActualizada
        });
    } catch (error) {
        const respuestaErrorPostgres = obtenerRespuestaErrorPostgres(error);

        if (respuestaErrorPostgres) {
            return res.status(respuestaErrorPostgres.status).json(respuestaErrorPostgres.body);
        }

        if (error.statusCode) {
            return res.status(error.statusCode).json({
                mensaje: error.message
            });
        }

        console.error('Error al actualizar la reservación:', error);

        return res.status(500).json({
            mensaje: 'Error al actualizar la reservación'
        });
    }
};

const cancelarReservacion = async (req, res) => {
    const idReservacion = validarIdReservacion(req.params.id);

    if (idReservacion === null) {
        return res.status(400).json({
            mensaje: 'El id de la reservación debe ser un entero válido'
        });
    }

    try {
        const idUsuario = req.usuario.id_usuario;
        const resultadoCancelacion = await reservacionesService.cancelarReservacion(idReservacion, idUsuario);

        if (!resultadoCancelacion) {
            return res.status(404).json({
                mensaje: 'Reservación no encontrada'
            });
        }

        if (resultadoCancelacion.yaEstabaCancelada) {
            return res.status(200).json({
                mensaje: 'La reservación ya estaba cancelada',
                datos: resultadoCancelacion.reservacion
            });
        }

        return res.status(200).json({
            mensaje: 'Reservación cancelada correctamente',
            datos: resultadoCancelacion.reservacion
        });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({
                mensaje: error.message
            });
        }

        console.error('Error al cancelar la reservación:', error);

        return res.status(500).json({
            mensaje: 'Error al cancelar la reservación'
        });
    }
};

const asignarTransporteReservacion = async (req, res) => {
    const idReservacion = validarIdReservacion(req.params.id);

    if (idReservacion === null) {
        return res.status(400).json({
            mensaje: 'El id de la reservación debe ser un entero válido'
        });
    }

    const { errores, asignacion } = validarAsignacionTransporteReservacion(req.body || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Datos inválidos',
            errores
        });
    }

    try {
        const idUsuario = req.usuario.id_usuario;
        const resultado = await reservacionesService.asignarTransporteReservacion(
            idReservacion,
            asignacion.id_transporte_operacion,
            idUsuario
        );

        if (resultado.tipo === 'no_encontrada') {
            return res.status(404).json({
                mensaje: 'Reservación no encontrada'
            });
        }

        if (resultado.tipo === 'transporte_no_encontrado') {
            return res.status(400).json({
                mensaje: 'Transporte de operación no encontrado'
            });
        }

        if (resultado.tipo === 'incompatible') {
            return res.status(400).json({
                mensaje: resultado.mensaje
            });
        }

        if (resultado.tipo === 'capacidad_invalida') {
            return res.status(400).json({
                mensaje: resultado.mensaje
            });
        }

        return res.status(200).json({
            mensaje: resultado.tipo === 'sin_cambios'
                ? 'La reservación ya tenía asignado ese transporte'
                : 'Transporte de reservación actualizado correctamente',
            datos: resultado.reservacion
        });
    } catch (error) {
        const respuestaErrorPostgres = obtenerRespuestaErrorPostgres(error);

        if (respuestaErrorPostgres) {
            return res.status(respuestaErrorPostgres.status).json(respuestaErrorPostgres.body);
        }

        console.error('Error al asignar transporte a la reservación:', error);

        return res.status(500).json({
            mensaje: 'Error al asignar transporte a la reservación'
        });
    }
};

const obtenerReservacionPorId = async (req, res) => {
    const idReservacion = validarIdReservacion(req.params.id);

    if (idReservacion === null) {
        return res.status(400).json({
            mensaje: 'El id de la reservación debe ser un entero válido'
        });
    }

    try {
        const reservacion = await reservacionesService.obtenerReservacionPorId(idReservacion);

        if (!reservacion) {
            return res.status(404).json({
                mensaje: 'Reservación no encontrada'
            });
        }

        return res.status(200).json({
            mensaje: 'Reservación consultada correctamente',
            datos: reservacion
        });
    } catch (error) {
        console.error('Error al consultar la reservación:', error);

        return res.status(500).json({
            mensaje: 'Error al consultar la reservación'
        });
    }
};

module.exports = {
    listarReservaciones,
    crearReservacion,
    actualizarReservacionParcial,
    cancelarReservacion,
    asignarTransporteReservacion,
    obtenerReservacionPorId
};
