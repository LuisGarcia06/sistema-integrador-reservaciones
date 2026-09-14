const paisesService = require('../services/paises.service');

const listarPaises = async (req, res) => {
    try {
        const paises = await paisesService.obtenerPaises();

        return res.status(200).json({
            mensaje: 'Países consultados correctamente',
            total: paises.length,
            datos: paises
        });
    } catch (error) {
        console.error('Error al consultar países:', error);

        return res.status(500).json({
            mensaje: 'Error al consultar países'
        });
    }
};

module.exports = {
    listarPaises
};
