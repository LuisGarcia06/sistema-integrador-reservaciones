const express = require('express');
const eventosIntegracionController = require('../controllers/eventosIntegracion.controller');
const { autenticarUsuario, autorizarRoles } = require('../middleware/auth.middleware');
const { ROLES } = require('../constants/roles');

const router = express.Router();

router.get(
    '/',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR, ROLES.CONSULTA),
    eventosIntegracionController.listarEventosIntegracion
);

router.get(
    '/:id/diff',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR, ROLES.CONSULTA),
    eventosIntegracionController.obtenerDiffEventoIntegracion
);
router.get(
    '/:id',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR, ROLES.CONSULTA),
    eventosIntegracionController.obtenerEventoIntegracion
);


router.post(
    '/:id/aplicar',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR),
    eventosIntegracionController.aplicarEventoIntegracion
);
router.patch(
    '/:id/revision',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR),
    eventosIntegracionController.revisarEventoIntegracion
);

module.exports = router;

