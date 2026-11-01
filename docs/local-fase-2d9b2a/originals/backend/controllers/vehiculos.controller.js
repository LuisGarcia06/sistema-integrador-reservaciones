const vehiculosService = require('../services/vehiculos.service');
const {
    validarIdVehiculo,
    validarDatosVehiculo,
    validarDatosActualizacionVehiculo,
    validarFiltrosVehiculos
} = require('../validators/vehiculos.validator');
const { obtenerRespuestaErrorPostgres } = require('../utils/dbErrors');

const listarVehiculos = async (req, res) => {
    const { errores, filtros } = validarFiltrosVehiculos(req.query || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Filtros inválidos',
            errores
        });
    }

    try {
        const vehiculos = await vehiculosService.obtenerVehiculos(filtros);

        return res.status(200).json({
            mensaje: 'Vehículos consultados correctamente',
            total: vehiculos.length,
            datos: vehiculos
        });
    } catch (error) {
        console.error('Error al consultar vehículos:', error);

        return res.status(500).json({
            mensaje: 'Error al consultar vehículos'
        });
    }
};

const obtenerVehiculoPorId = async (req, res) => {
    const idVehiculo = validarIdVehiculo(req.params.id);

    if (idVehiculo === null) {
        return res.status(400).json({
            mensaje: 'El id del vehículo debe ser un entero válido'
        });
    }

    try {
        const vehiculo = await vehiculosService.obtenerVehiculoPorId(idVehiculo);

        if (!vehiculo) {
            return res.status(404).json({
                mensaje: 'Vehículo no encontrado'
            });
        }

        return res.status(200).json({
            mensaje: 'Vehículo consultado correctamente',
            datos: vehiculo
        });
    } catch (error) {
        console.error('Error al consultar el vehículo:', error);

        return res.status(500).json({
            mensaje: 'Error al consultar el vehículo'
        });
    }
};

const crearVehiculo = async (req, res) => {
    const { errores, vehiculo } = validarDatosVehiculo(req.body || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Datos inválidos',
            errores
        });
    }

    try {
        const vehiculoCreado = await vehiculosService.crearVehiculo(vehiculo);

        return res.status(201).json({
            mensaje: 'Vehículo creado correctamente',
            datos: vehiculoCreado
        });
    } catch (error) {
        const respuestaErrorPostgres = obtenerRespuestaErrorPostgres(error);

        if (respuestaErrorPostgres) {
            return res.status(respuestaErrorPostgres.status).json(respuestaErrorPostgres.body);
        }

        console.error('Error al crear el vehículo:', error);

        return res.status(500).json({
            mensaje: 'Error al crear el vehículo'
        });
    }
};

const actualizarVehiculoParcial = async (req, res) => {
    const idVehiculo = validarIdVehiculo(req.params.id);

    if (idVehiculo === null) {
        return res.status(400).json({
            mensaje: 'El id del vehículo debe ser un entero válido'
        });
    }

    const { errores, camposActualizacion } = validarDatosActualizacionVehiculo(req.body || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Datos inválidos',
            errores
        });
    }

    try {
        const vehiculoActualizado = await vehiculosService.actualizarVehiculoParcial(
            idVehiculo,
            camposActualizacion
        );

        if (!vehiculoActualizado) {
            return res.status(404).json({
                mensaje: 'Vehículo no encontrado'
            });
        }

        return res.status(200).json({
            mensaje: 'Vehículo actualizado correctamente',
            datos: vehiculoActualizado
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

        console.error('Error al actualizar el vehículo:', error);

        return res.status(500).json({
            mensaje: 'Error al actualizar el vehículo'
        });
    }
};

module.exports = {
    listarVehiculos,
    obtenerVehiculoPorId,
    crearVehiculo,
    actualizarVehiculoParcial
};
