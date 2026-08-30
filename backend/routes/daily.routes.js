const express = require('express');
const dailyController = require('../controllers/daily.controller');
const { autenticarUsuario, autorizarRoles } = require('../middleware/auth.middleware');
const { ROLES } = require('../constants/roles');

const router = express.Router();

router.get(
    '/observaciones',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR, ROLES.CONSULTA),
    dailyController.consultarObservaciones
);

router.put(
    '/observaciones',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR),
    dailyController.guardarObservaciones
);

router.get(
    '/',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR, ROLES.CONSULTA),
    dailyController.consultarDaily
);

module.exports = router;
