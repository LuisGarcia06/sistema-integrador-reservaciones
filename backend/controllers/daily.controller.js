const dailyService = require('../services/daily.service');
const { validarConsultaDaily } = require('../validators/daily.validator');

const consultarDaily = async (req, res) => {
    const { errores, filtros } = validarConsultaDaily(req.query || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Consulta Daily inválida',
            errores
        });
    }

    try {
        const datos = await dailyService.consultarDailyPorFecha(filtros.fecha);

        return res.status(200).json({
            mensaje: 'Daily consultado correctamente',
            fecha: filtros.fecha,
            total: datos.length,
            datos
        });
    } catch (error) {
        console.error('Error al consultar Daily:', error);

        return res.status(500).json({
            mensaje: 'Error al consultar Daily'
        });
    }
};

module.exports = {
    consultarDaily
};
