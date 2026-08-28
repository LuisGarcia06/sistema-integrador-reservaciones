const bitacoraService = require('../services/bitacora.service');
const { validarFiltrosBitacora } = require('../validators/bitacora.validator');

const consultarBitacora = async (req, res) => {
    const { errores, filtros } = validarFiltrosBitacora(req.query || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Filtros inválidos',
            errores
        });
    }

    try {
        const datos = await bitacoraService.consultarBitacora(filtros);

        return res.status(200).json({
            mensaje: 'Bitácora consultada correctamente',
            total: datos.length,
            datos
        });
    } catch (error) {
        console.error('Error al consultar bitácora:', error);

        return res.status(500).json({
            mensaje: 'Error al consultar bitácora'
        });
    }
};

module.exports = {
    consultarBitacora
};
