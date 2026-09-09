const toursService = require('../services/tours.service');
const { validarIdCatalogo } = require('../validators/catalogosOperativos.validator');

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
    const idTour = validarIdCatalogo(req.params.id);

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

module.exports = {
    listarTours,
    obtenerTourPorId
};
