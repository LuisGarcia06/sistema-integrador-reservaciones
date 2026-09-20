const plataformasService = require('../services/plataformas.service');
const { validarDatosPlataforma } = require('../validators/plataformas.validator');
const { obtenerRespuestaErrorPostgres } = require('../utils/dbErrors');

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

const crearPlataforma = async (req, res) => {
    const { errores, plataforma } = validarDatosPlataforma(req.body || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Datos inválidos',
            errores
        });
    }

    try {
        const plataformaCreada = await plataformasService.crearPlataforma(plataforma);

        return res.status(201).json({
            mensaje: 'Plataforma creada correctamente',
            datos: plataformaCreada
        });
    } catch (error) {
        const respuestaErrorPostgres = obtenerRespuestaErrorPostgres(error);

        if (respuestaErrorPostgres) {
            return res.status(respuestaErrorPostgres.status).json(respuestaErrorPostgres.body);
        }

        console.error('Error al crear la plataforma:', error);

        return res.status(500).json({
            mensaje: 'Error al crear la plataforma'
        });
    }
};

module.exports = {
    listarPlataformas,
    crearPlataforma
};
