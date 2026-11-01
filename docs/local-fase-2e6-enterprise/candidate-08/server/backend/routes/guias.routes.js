const express = require('express');
const guiasController = require('../controllers/guias.controller');
const { autenticarUsuario, autorizarRoles } = require('../middleware/auth.middleware');
const { ROLES } = require('../constants/roles');

const router = express.Router();

router.get(
    '/',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR, ROLES.CONSULTA),
    guiasController.listarGuias
);

router.post(
    '/',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR),
    guiasController.crearGuia
);

router.patch(
    '/:id',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR),
    guiasController.actualizarGuiaParcial
);

router.get(
    '/:id',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR, ROLES.CONSULTA),
    guiasController.obtenerGuiaPorId
);

module.exports = router;
