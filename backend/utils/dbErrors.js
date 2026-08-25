const obtenerRespuestaErrorPostgres = (error) => {
    if (error.code === '23503') {
        return {
            status: 400,
            body: {
                mensaje: 'Datos relacionados inválidos'
            }
        };
    }

    if (error.code === '23505') {
        return {
            status: 409,
            body: {
                mensaje: 'El código de reservación ya existe'
            }
        };
    }

    if (error.code && error.code.startsWith('22')) {
        return {
            status: 400,
            body: {
                mensaje: 'Datos inválidos'
            }
        };
    }

    return null;
};

module.exports = {
    obtenerRespuestaErrorPostgres
};
