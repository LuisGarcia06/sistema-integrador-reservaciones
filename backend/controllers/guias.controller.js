const guiasService = require('../services/guias.service');
const {
    validarIdGuiaCatalogo,
    validarDatosGuia,
    validarDatosActualizacionGuia,
    validarFiltrosGuias
} = require('../validators/guias.validator');

const listarGuias = async (req, res) => {
    const { errores, filtros } = validarFiltrosGuias(req.query || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Filtros inválidos',
            errores
        });
    }

    try {
        const guias = await guiasService.obtenerGuias(filtros);

        return res.status(200).json({
            mensaje: 'Guías consultadas correctamente',
            total: guias.length,
            datos: guias
        });
    } catch (error) {
        console.error('Error al consultar guías:', error);

        return res.status(500).json({
            mensaje: 'Error al consultar guías'
        });
    }
};

const obtenerGuiaPorId = async (req, res) => {
    const idGuia = validarIdGuiaCatalogo(req.params.id);

    if (idGuia === null) {
        return res.status(400).json({
            mensaje: 'El id de la guía debe ser un entero válido'
        });
    }

    try {
        const guia = await guiasService.obtenerGuiaPorId(idGuia);

        if (!guia) {
            return res.status(404).json({
                mensaje: 'Guía no encontrada'
            });
        }

        return res.status(200).json({
            mensaje: 'Guía consultada correctamente',
            datos: guia
        });
    } catch (error) {
        console.error('Error al consultar la guía:', error);

        return res.status(500).json({
            mensaje: 'Error al consultar la guía'
        });
    }
};

const crearGuia = async (req, res) => {
    const { errores, guia } = validarDatosGuia(req.body || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Datos inválidos',
            errores
        });
    }

    try {
        const guiaCreada = await guiasService.crearGuia(guia);

        return res.status(201).json({
            mensaje: 'Guía creada correctamente',
            datos: guiaCreada
        });
    } catch (error) {
        console.error('Error al crear la guía:', error);

        return res.status(500).json({
            mensaje: 'Error al crear la guía'
        });
    }
};

const actualizarGuiaParcial = async (req, res) => {
    const idGuia = validarIdGuiaCatalogo(req.params.id);

    if (idGuia === null) {
        return res.status(400).json({
            mensaje: 'El id de la guía debe ser un entero válido'
        });
    }

    const { errores, camposActualizacion } = validarDatosActualizacionGuia(req.body || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Datos inválidos',
            errores
        });
    }

    try {
        const guiaActualizada = await guiasService.actualizarGuiaParcial(
            idGuia,
            camposActualizacion
        );

        if (!guiaActualizada) {
            return res.status(404).json({
                mensaje: 'Guía no encontrada'
            });
        }

        return res.status(200).json({
            mensaje: 'Guía actualizada correctamente',
            datos: guiaActualizada
        });
    } catch (error) {
        console.error('Error al actualizar la guía:', error);

        return res.status(500).json({
            mensaje: 'Error al actualizar la guía'
        });
    }
};

module.exports = {
    listarGuias,
    obtenerGuiaPorId,
    crearGuia,
    actualizarGuiaParcial
};
