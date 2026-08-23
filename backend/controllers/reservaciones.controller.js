const reservacionesService = require('../services/reservaciones.service');

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

const obtenerReservacionPorId = async (req, res) => {
    const idReservacion = Number(req.params.id);

    if (!Number.isInteger(idReservacion) || idReservacion <= 0) {
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
    obtenerReservacionPorId
};
