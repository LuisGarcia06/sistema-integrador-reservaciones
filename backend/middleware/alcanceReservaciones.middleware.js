const alcanceService = require('../services/alcanceReservaciones.service');
const { validarAlcanceReservaciones } = require('../utils/alcanceReservaciones');

// Solo endpoints necesarios para las dos pantallas autorizadas. Se comparan
// rutas registradas de Express, nunca headers, query ni rutas del frontend.
const LECTURAS_CONSULTA_SELECTED = new Set([
    '/api/dashboard/resumen',
    '/api/reservaciones',
    '/api/reservaciones/:id',
    '/api/tours',
    '/api/paises',
    '/api/plataformas'
]);

const autorizarLecturaPorAlcance = async (req, res, next) => {
    if (!req.usuario) {
        return res.status(401).json({ mensaje: 'No autorizado' });
    }

    try {
        if (!Object.prototype.hasOwnProperty.call(req, 'alcanceReservaciones')) {
            req.alcanceReservaciones = await alcanceService.obtenerAlcanceReservacionesUsuario(req.usuario.id_usuario);
        }

        validarAlcanceReservaciones(req.alcanceReservaciones);
        const rutaRegistrada = `${req.baseUrl}${req.route?.path || ''}`.replace(/\/+$/, '');

        if (!req.alcanceReservaciones.all && !LECTURAS_CONSULTA_SELECTED.has(rutaRegistrada)) {
            return res.status(403).json({ mensaje: 'No tiene permisos para realizar esta acción' });
        }

        // Evitar reutilizar respuestas de otra sesion o de permisos anteriores.
        res.setHeader('Cache-Control', 'no-store');
        return next();
    } catch (error) {
        if (error.statusCode === 403) {
            return res.status(403).json({ mensaje: 'No tiene permisos para realizar esta acción' });
        }

        return res.status(500).json({ mensaje: 'Error al resolver permisos' });
    }
};

module.exports = {
    autorizarLecturaPorAlcance
};
