const operacionesService = require('../services/operaciones.service');
const {
    validarIdOperacion,
    validarDatosOperacion,
    validarDatosActualizacionOperacion,
    validarFiltrosOperaciones,
    validarFiltrosOperacionesSugeridas
} = require('../validators/operaciones.validator');
const { obtenerRespuestaErrorPostgres } = require('../utils/dbErrors');

const listarOperaciones = async (req, res) => {
    const { errores, filtros } = validarFiltrosOperaciones(req.query || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Filtros inválidos',
            errores
        });
    }

    try {
        const operaciones = await operacionesService.obtenerOperaciones(filtros);

        return res.status(200).json({
            mensaje: 'Operaciones consultadas correctamente',
            total: operaciones.length,
            datos: operaciones
        });
    } catch (error) {
        console.error('Error al consultar operaciones:', error);

        return res.status(500).json({
            mensaje: 'Error al consultar operaciones'
        });
    }
};

const listarOperacionesSugeridas = async (req, res) => {
    const { errores, filtros } = validarFiltrosOperacionesSugeridas(req.query || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Filtros inválidos',
            errores
        });
    }

    try {
        const resultado = await operacionesService.obtenerOperacionesSugeridas(filtros.fecha);

        return res.status(200).json({
            mensaje: 'Salidas detectadas por reservaciones consultadas correctamente',
            fecha: resultado.fecha,
            total_salidas_detectadas: resultado.total_salidas_detectadas,
            reservaciones_sin_turno: resultado.reservaciones_sin_turno,
            datos: resultado.datos
        });
    } catch (error) {
        console.error('Error al consultar operaciones sugeridas:', error);

        return res.status(500).json({
            mensaje: 'Error al consultar operaciones sugeridas'
        });
    }
};

const obtenerOperacionPorId = async (req, res) => {
    const idOperacion = validarIdOperacion(req.params.id);

    if (idOperacion === null) {
        return res.status(400).json({
            mensaje: 'El id de la operación debe ser un entero válido'
        });
    }

    try {
        const operacion = await operacionesService.obtenerOperacionPorId(idOperacion);

        if (!operacion) {
            return res.status(404).json({
                mensaje: 'Operación no encontrada'
            });
        }

        return res.status(200).json({
            mensaje: 'Operación consultada correctamente',
            datos: operacion
        });
    } catch (error) {
        console.error('Error al consultar la operación:', error);

        return res.status(500).json({
            mensaje: 'Error al consultar la operación'
        });
    }
};

const crearOperacion = async (req, res) => {
    const { errores, operacion } = validarDatosOperacion(req.body || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Datos inválidos',
            errores
        });
    }

    try {
        const operacionCreada = await operacionesService.crearOperacion(operacion);

        return res.status(201).json({
            mensaje: 'Operación creada correctamente',
            datos: operacionCreada
        });
    } catch (error) {
        const respuestaErrorPostgres = obtenerRespuestaErrorPostgres(error);

        if (respuestaErrorPostgres) {
            return res.status(respuestaErrorPostgres.status).json(respuestaErrorPostgres.body);
        }

        console.error('Error al crear la operación:', error);

        return res.status(500).json({
            mensaje: 'Error al crear la operación'
        });
    }
};

const actualizarOperacionParcial = async (req, res) => {
    const idOperacion = validarIdOperacion(req.params.id);

    if (idOperacion === null) {
        return res.status(400).json({
            mensaje: 'El id de la operación debe ser un entero válido'
        });
    }

    const { errores, camposActualizacion } = validarDatosActualizacionOperacion(req.body || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Datos inválidos',
            errores
        });
    }

    try {
        const operacionActualizada = await operacionesService.actualizarOperacionParcial(
            idOperacion,
            camposActualizacion
        );

        if (!operacionActualizada) {
            return res.status(404).json({
                mensaje: 'Operación no encontrada'
            });
        }

        return res.status(200).json({
            mensaje: 'Operación actualizada correctamente',
            datos: operacionActualizada
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

        console.error('Error al actualizar la operación:', error);

        return res.status(500).json({
            mensaje: 'Error al actualizar la operación'
        });
    }
};

module.exports = {
    listarOperaciones,
    listarOperacionesSugeridas,
    obtenerOperacionPorId,
    crearOperacion,
    actualizarOperacionParcial
};
