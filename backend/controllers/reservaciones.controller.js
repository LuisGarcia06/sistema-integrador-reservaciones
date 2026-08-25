const reservacionesService = require('../services/reservaciones.service');
const {
    validarIdReservacion,
    validarDatosReservacion,
    validarDatosActualizacionReservacion
} = require('../validators/reservaciones.validator');
const { obtenerRespuestaErrorPostgres } = require('../utils/dbErrors');

const listarReservaciones = async (req, res) => {
    try {
        const reservaciones = await reservacionesService.obtenerReservaciones();

        res.status(200).json({
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
        const reservacionCreada = await reservacionesService.crearReservacion(reservacion);

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
        const reservacionActual = await reservacionesService.obtenerReservacionPorId(idReservacion);

        if (!reservacionActual) {
            return res.status(404).json({
                mensaje: 'Reservación no encontrada'
            });
        }

        const reservacionActualizada = await reservacionesService.actualizarReservacionParcial(
            idReservacion,
            camposActualizacion
        );

        return res.status(200).json({
            mensaje: 'Reservación actualizada correctamente',
            datos: reservacionActualizada
        });
    } catch (error) {
        const respuestaErrorPostgres = obtenerRespuestaErrorPostgres(error);

        if (respuestaErrorPostgres) {
            return res.status(respuestaErrorPostgres.status).json(respuestaErrorPostgres.body);
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
        const reservacionActual = await reservacionesService.obtenerReservacionPorId(idReservacion);

        if (!reservacionActual) {
            return res.status(404).json({
                mensaje: 'Reservación no encontrada'
            });
        }

        if (reservacionActual.estado === 'Cancelada') {
            return res.status(200).json({
                mensaje: 'La reservación ya estaba cancelada',
                datos: reservacionActual
            });
        }

        const reservacionCancelada = await reservacionesService.cancelarReservacion(idReservacion);

        return res.status(200).json({
            mensaje: 'Reservación cancelada correctamente',
            datos: reservacionCancelada
        });
    } catch (error) {
        console.error('Error al cancelar la reservación:', error);

        return res.status(500).json({
            mensaje: 'Error al cancelar la reservación'
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
    obtenerReservacionPorId
};
