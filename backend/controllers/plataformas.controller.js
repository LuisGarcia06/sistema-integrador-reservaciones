const plataformasService = require('../services/plataformas.service');

const listarPlataformas = async (req, res) => {
    try {
        const plataformas = await plataformasService.obtenerPlataformas();

        return res.status(200).json({
            mensaje: 'Plataformas consultadas correctamente',
            total: plataformas.length,
            datos: plataformas
        });
    } catch (error) {
        console.error('Error al consultar plataformas:', error);

        return res.status(500).json({
            mensaje: 'Error al consultar plataformas'
        });
    }
};

module.exports = {
    listarPlataformas
};
