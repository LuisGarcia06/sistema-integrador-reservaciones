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

module.exports = {
    listarReservaciones
};
