const toursService = require('../services/tours.service');
const {
    validarIdTourCatalogo,
    validarDatosTour,
    validarDatosActualizacionTour
} = require('../validators/tours.validator');

const listarTours = async (req, res) => {
    try {
        const tours = await toursService.obtenerTours();

        return res.status(200).json({
            mensaje: 'Tours consultados correctamente',
            total: tours.length,
            datos: tours
        });
    } catch (error) {
        console.error('Error al consultar tours:', error);

        return res.status(500).json({
            mensaje: 'Error al consultar tours'
        });
    }
};

const obtenerTourPorId = async (req, res) => {
    const idTour = validarIdTourCatalogo(req.params.id);

    if (idTour === null) {
        return res.status(400).json({
            mensaje: 'El id del tour debe ser un entero válido'
        });
    }

    try {
        const tour = await toursService.obtenerTourPorId(idTour);

        if (!tour) {
            return res.status(404).json({
                mensaje: 'Tour no encontrado'
            });
        }

        return res.status(200).json({
            mensaje: 'Tour consultado correctamente',
            datos: tour
        });
    } catch (error) {
        console.error('Error al consultar el tour:', error);

        return res.status(500).json({
            mensaje: 'Error al consultar el tour'
        });
    }
};

const crearTour = async (req, res) => {
    const { errores, tour } = validarDatosTour(req.body || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Datos inválidos',
            errores
        });
    }

    try {
        const tourCreado = await toursService.crearTour(tour);

        return res.status(201).json({
            mensaje: 'Tour creado correctamente',
            datos: tourCreado
        });
    } catch (error) {
        console.error('Error al crear el tour:', error);

        return res.status(500).json({
            mensaje: 'Error al crear el tour'
        });
    }
};

const actualizarTourParcial = async (req, res) => {
    const idTour = validarIdTourCatalogo(req.params.id);

    if (idTour === null) {
        return res.status(400).json({
            mensaje: 'El id del tour debe ser un entero válido'
        });
    }

    const { errores, camposActualizacion } = validarDatosActualizacionTour(req.body || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Datos inválidos',
            errores
        });
    }

    try {
        const tourActualizado = await toursService.actualizarTourParcial(
            idTour,
            camposActualizacion
        );

        if (!tourActualizado) {
            return res.status(404).json({
                mensaje: 'Tour no encontrado'
            });
        }

        return res.status(200).json({
            mensaje: 'Tour actualizado correctamente',
            datos: tourActualizado
        });
    } catch (error) {
        console.error('Error al actualizar el tour:', error);

        return res.status(500).json({
            mensaje: 'Error al actualizar el tour'
        });
    }
};

module.exports = {
    listarTours,
    obtenerTourPorId,
    crearTour,
    actualizarTourParcial
};
