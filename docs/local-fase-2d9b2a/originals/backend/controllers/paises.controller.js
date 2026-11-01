const paisesService = require('../services/paises.service');
const { validarDatosPais } = require('../validators/paises.validator');
const { obtenerRespuestaErrorPostgres } = require('../utils/dbErrors');

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

const crearPais = async (req, res) => {
    const { errores, pais } = validarDatosPais(req.body || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Datos inválidos',
            errores
        });
    }

    try {
        const paisCreado = await paisesService.crearPais(pais);

        return res.status(201).json({
            mensaje: 'País creado correctamente',
            datos: paisCreado
        });
    } catch (error) {
        const respuestaErrorPostgres = obtenerRespuestaErrorPostgres(error);

        if (respuestaErrorPostgres) {
            return res.status(respuestaErrorPostgres.status).json(respuestaErrorPostgres.body);
        }

        console.error('Error al crear el país:', error);

        return res.status(500).json({
            mensaje: 'Error al crear el país'
        });
    }
};

module.exports = {
    listarPaises,
    crearPais
};
