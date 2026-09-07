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

const consultarDailyOperativo = async (req, res) => {
    const { errores, filtros } = validarConsultaDaily(req.query || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Consulta Daily operativo inválida',
            errores
        });
    }

    try {
        const daily = await dailyService.consultarDailyOperativoPorFecha(filtros.fecha);

        return res.status(200).json({
            mensaje: 'Daily operativo consultado correctamente',
            fecha: filtros.fecha,
            total_operaciones: daily.total_operaciones,
            total_transportes: daily.total_transportes,
            total_reservaciones: daily.total_reservaciones,
            total_reservaciones_asignadas: daily.total_reservaciones_asignadas,
            total_reservaciones_sin_asignar: daily.total_reservaciones_sin_asignar,
            total_pax_activos: daily.total_pax_activos,
            operaciones: daily.operaciones,
            reservaciones_sin_asignar: daily.reservaciones_sin_asignar
        });
    } catch (error) {
        console.error('Error al consultar Daily operativo:', error);

        return res.status(500).json({
            mensaje: 'Error al consultar Daily operativo'
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
    consultarDailyOperativo,
    consultarObservaciones,
    guardarObservaciones
};
