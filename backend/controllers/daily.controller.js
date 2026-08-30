const dailyService = require('../services/daily.service');
const {
    validarConsultaDaily,
    validarBodyObservacionesDaily
} = require('../validators/daily.validator');

const consultarDaily = async (req, res) => {
    const { errores, filtros } = validarConsultaDaily(req.query || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Consulta Daily inválida',
            errores
        });
    }

    try {
        const daily = await dailyService.consultarDailyPorFecha(filtros.fecha);

        return res.status(200).json({
            mensaje: 'Daily consultado correctamente',
            fecha: filtros.fecha,
            observaciones: daily.observaciones,
            total: daily.datos.length,
            datos: daily.datos
        });
    } catch (error) {
        console.error('Error al consultar Daily:', error);

        return res.status(500).json({
            mensaje: 'Error al consultar Daily'
        });
    }
};

const consultarObservaciones = async (req, res) => {
    const { errores, filtros } = validarConsultaDaily(req.query || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Consulta de observaciones inválida',
            errores
        });
    }

    try {
        const observaciones = await dailyService.obtenerObservacionesPorFecha(filtros.fecha);

        return res.status(200).json({
            mensaje: 'Observaciones consultadas correctamente',
            fecha: filtros.fecha,
            observaciones
        });
    } catch (error) {
        console.error('Error al consultar observaciones Daily:', error);

        return res.status(500).json({
            mensaje: 'Error al consultar observaciones'
        });
    }
};

const guardarObservaciones = async (req, res) => {
    const validacionQuery = validarConsultaDaily(req.query || {});
    const validacionBody = validarBodyObservacionesDaily(req.body || {});
    const errores = [
        ...validacionQuery.errores,
        ...validacionBody.errores
    ];

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Datos de observaciones inválidos',
            errores
        });
    }

    try {
        const observacion = await dailyService.guardarObservacionesPorFecha(
            validacionQuery.filtros.fecha,
            validacionBody.datos.observaciones
        );

        return res.status(200).json({
            mensaje: 'Observaciones guardadas correctamente',
            fecha: validacionQuery.filtros.fecha,
            observaciones: observacion.observaciones
        });
    } catch (error) {
        console.error('Error al guardar observaciones Daily:', error);

        return res.status(500).json({
            mensaje: 'Error al guardar observaciones'
        });
    }
};

module.exports = {
    consultarDaily,
    consultarObservaciones,
    guardarObservaciones
};
