const express = require('express');
const transportesController = require('../controllers/transportes.controller');
const { autenticarUsuario, autorizarRoles } = require('../middleware/auth.middleware');
const { ROLES } = require('../constants/roles');

const router = express.Router();

router.get(
    '/',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR, ROLES.CONSULTA),
    transportesController.listarTransportes
);

router.post(
    '/',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR),
    transportesController.crearTransporte
);

router.patch(
    '/:id',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR),
    transportesController.actualizarTransporteParcial
);

router.get(
    '/:id',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR, ROLES.CONSULTA),
    transportesController.obtenerTransportePorId
);

module.exports = router;
