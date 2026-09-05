const express = require('express');
const operacionesController = require('../controllers/operaciones.controller');
const { autenticarUsuario, autorizarRoles } = require('../middleware/auth.middleware');
const { ROLES } = require('../constants/roles');

const router = express.Router();

router.get(
    '/',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR, ROLES.CONSULTA),
    operacionesController.listarOperaciones
);

router.post(
    '/',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR),
    operacionesController.crearOperacion
);

router.patch(
    '/:id',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR),
    operacionesController.actualizarOperacionParcial
);

router.get(
    '/:id',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR, ROLES.CONSULTA),
    operacionesController.obtenerOperacionPorId
);

module.exports = router;
