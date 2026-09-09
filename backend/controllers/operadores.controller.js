const operadoresService = require('../services/operadores.service');
const {
    validarIdOperador,
    validarDatosOperador,
    validarDatosActualizacionOperador,
    validarFiltrosOperadores
} = require('../validators/operadores.validator');

const listarOperadores = async (req, res) => {
    const { errores, filtros } = validarFiltrosOperadores(req.query || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Filtros inválidos',
            errores
        });
    }

    try {
        const operadores = await operadoresService.obtenerOperadores(filtros);

        return res.status(200).json({
            mensaje: 'Operadores consultados correctamente',
            total: operadores.length,
            datos: operadores
        });
    } catch (error) {
        console.error('Error al consultar operadores:', error);

        return res.status(500).json({
            mensaje: 'Error al consultar operadores'
        });
    }
};

const obtenerOperadorPorId = async (req, res) => {
    const idOperador = validarIdOperador(req.params.id);

    if (idOperador === null) {
        return res.status(400).json({
            mensaje: 'El id del operador debe ser un entero válido'
        });
    }

    try {
        const operador = await operadoresService.obtenerOperadorPorId(idOperador);

        if (!operador) {
            return res.status(404).json({
                mensaje: 'Operador no encontrado'
            });
        }

        return res.status(200).json({
            mensaje: 'Operador consultado correctamente',
            datos: operador
        });
    } catch (error) {
        console.error('Error al consultar el operador:', error);

        return res.status(500).json({
            mensaje: 'Error al consultar el operador'
        });
    }
};

const crearOperador = async (req, res) => {
    const { errores, operador } = validarDatosOperador(req.body || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Datos inválidos',
            errores
        });
    }

    try {
        const operadorCreado = await operadoresService.crearOperador(operador);

        return res.status(201).json({
            mensaje: 'Operador creado correctamente',
            datos: operadorCreado
        });
    } catch (error) {
        console.error('Error al crear el operador:', error);

        return res.status(500).json({
            mensaje: 'Error al crear el operador'
        });
    }
};

const actualizarOperadorParcial = async (req, res) => {
    const idOperador = validarIdOperador(req.params.id);

    if (idOperador === null) {
        return res.status(400).json({
            mensaje: 'El id del operador debe ser un entero válido'
        });
    }

    const { errores, camposActualizacion } = validarDatosActualizacionOperador(req.body || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Datos inválidos',
            errores
        });
    }

    try {
        const operadorActualizado = await operadoresService.actualizarOperadorParcial(
            idOperador,
            camposActualizacion
        );

        if (!operadorActualizado) {
            return res.status(404).json({
                mensaje: 'Operador no encontrado'
            });
        }

        return res.status(200).json({
            mensaje: 'Operador actualizado correctamente',
            datos: operadorActualizado
        });
    } catch (error) {
        console.error('Error al actualizar el operador:', error);

        return res.status(500).json({
            mensaje: 'Error al actualizar el operador'
        });
    }
};

module.exports = {
    listarOperadores,
    obtenerOperadorPorId,
    crearOperador,
    actualizarOperadorParcial
};
