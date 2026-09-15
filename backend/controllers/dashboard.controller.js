const dashboardService = require('../services/dashboard.service');
const { validarConsultaDaily } = require('../validators/daily.validator');

const consultarResumen = async (req, res) => {
    const { errores, filtros } = validarConsultaDaily(req.query || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Consulta Dashboard inválida',
            errores
        });
    }

    try {
        const resumen = await dashboardService.obtenerResumenDashboard(filtros.fecha);

        return res.status(200).json({
            mensaje: 'Dashboard consultado correctamente',
            ...resumen
        });
    } catch (error) {
        console.error('Error al consultar Dashboard:', error);

        return res.status(500).json({
            mensaje: 'Error al consultar Dashboard'
        });
    }
};

module.exports = {
    consultarResumen
};
