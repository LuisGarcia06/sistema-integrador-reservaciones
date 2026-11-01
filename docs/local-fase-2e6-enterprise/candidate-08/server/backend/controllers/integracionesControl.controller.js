const service = require('../services/integracionesControl.service');
exports.listar = async (req, res) => {
    try {
        res.json({ datos: await service.listarControles({ includeCounts: req.alcanceReservaciones.all }) });
    } catch { res.status(503).json({ mensaje: 'No fue posible consultar las integraciones.' }); }
};
exports.cambiar = async (req, res) => {
    try {
        res.json({ datos: await service.cambiarControl(req.params.provider, req.body?.activado, req.usuario.id_usuario) });
    } catch (error) {
        res.status(error.statusCode === 400 ? 400 : 503).json({ mensaje: error.statusCode === 400
            ? error.message : 'No se guardó el cambio. Actualiza el estado antes de reintentar.' });
    }
};
