const express = require('express');
const vehiculosController = require('../controllers/vehiculos.controller');
const { autenticarUsuario, autorizarRoles } = require('../middleware/auth.middleware');
const { ROLES } = require('../constants/roles');

const router = express.Router();

router.get(
    '/',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR, ROLES.CONSULTA),
    vehiculosController.listarVehiculos
);

router.post(
    '/',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR),
    vehiculosController.crearVehiculo
);

router.patch(
    '/:id',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR),
    vehiculosController.actualizarVehiculoParcial
);

router.get(
    '/:id',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR, ROLES.CONSULTA),
    vehiculosController.obtenerVehiculoPorId
);

module.exports = router;
