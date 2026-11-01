const service = require('../services/centroAvisos.service');
const { ROLES } = require('../constants/roles');

function ejecutar(history) {
    return async (req, res) => {
        try {
            const filters = service.validarConsulta(req.query);
            if (history && (!/^[1-9]\d*$/.test(req.params.id) || !Number.isSafeInteger(Number(req.params.id)) || Number(req.params.id)>2147483647)) return res.status(400).json({ mensaje: 'Evento inválido' });
            const resultado = history
                ? await service.historialGrupo(Number(req.params.id), filters)
                : await service.listarCentro(filters, { includeFareHarborName: req.usuario.rol === ROLES.ADMINISTRADOR });
            return res.json(resultado);
        } catch (error) {
            return res.status(error.statusCode || 500).json({ mensaje: error.statusCode === 400 ? error.message : 'No fue posible consultar el Centro de Avisos' });
        }
    };
}
module.exports = { listar: ejecutar(false), historial: ejecutar(true) };
