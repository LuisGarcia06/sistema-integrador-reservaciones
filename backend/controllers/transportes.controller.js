const transportesService = require('../services/transportes.service');
const {
    validarIdTransporte,
    validarDatosTransporte,
    validarDatosActualizacionTransporte,
    validarFiltrosTransportes
} = require('../validators/transportes.validator');
const { obtenerRespuestaErrorPostgres } = require('../utils/dbErrors');

const listarTransportes = async (req, res) => {
    const { errores, filtros } = validarFiltrosTransportes(req.query || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Filtros inválidos',
            errores
        });
    }

    try {
        const transportes = await transportesService.obtenerTransportes(filtros);

        return res.status(200).json({
            mensaje: 'Transportes consultados correctamente',
            total: transportes.length,
            datos: transportes
        });
    } catch (error) {
        console.error('Error al consultar transportes:', error);

        return res.status(500).json({
            mensaje: 'Error al consultar transportes'
        });
    }
};

const obtenerTransportePorId = async (req, res) => {
    const idTransporte = validarIdTransporte(req.params.id);

    if (idTransporte === null) {
        return res.status(400).json({
            mensaje: 'El id del transporte debe ser un entero válido'
        });
    }

    try {
        const transporte = await transportesService.obtenerTransportePorId(idTransporte);

        if (!transporte) {
            return res.status(404).json({
                mensaje: 'Transporte no encontrado'
            });
        }

        return res.status(200).json({
            mensaje: 'Transporte consultado correctamente',
            datos: transporte
        });
    } catch (error) {
        console.error('Error al consultar el transporte:', error);

        return res.status(500).json({
            mensaje: 'Error al consultar el transporte'
        });
    }
};

const crearTransporte = async (req, res) => {
    const { errores, transporte } = validarDatosTransporte(req.body || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Datos inválidos',
            errores
        });
    }

    try {
        const transporteCreado = await transportesService.crearTransporte(transporte);

        return res.status(201).json({
            mensaje: 'Transporte creado correctamente',
            datos: transporteCreado
        });
    } catch (error) {
        const respuestaErrorPostgres = obtenerRespuestaErrorPostgres(error);

        if (respuestaErrorPostgres) {
            return res.status(respuestaErrorPostgres.status).json(respuestaErrorPostgres.body);
        }

        console.error('Error al crear el transporte:', error);

        return res.status(500).json({
            mensaje: 'Error al crear el transporte'
        });
    }
};

const actualizarTransporteParcial = async (req, res) => {
    const idTransporte = validarIdTransporte(req.params.id);

    if (idTransporte === null) {
        return res.status(400).json({
            mensaje: 'El id del transporte debe ser un entero válido'
        });
    }

    const { errores, camposActualizacion } = validarDatosActualizacionTransporte(req.body || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Datos inválidos',
            errores
        });
    }

    try {
        const transporteActualizado = await transportesService.actualizarTransporteParcial(
            idTransporte,
            camposActualizacion
        );

        if (!transporteActualizado) {
            return res.status(404).json({
                mensaje: 'Transporte no encontrado'
            });
        }

        return res.status(200).json({
            mensaje: 'Transporte actualizado correctamente',
            datos: transporteActualizado
        });
    } catch (error) {
        const respuestaErrorPostgres = obtenerRespuestaErrorPostgres(error);

        if (respuestaErrorPostgres) {
            return res.status(respuestaErrorPostgres.status).json(respuestaErrorPostgres.body);
        }

        console.error('Error al actualizar el transporte:', error);

        return res.status(500).json({
            mensaje: 'Error al actualizar el transporte'
        });
    }
};

module.exports = {
    listarTransportes,
    obtenerTransportePorId,
    crearTransporte,
    actualizarTransporteParcial
};
