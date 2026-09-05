const express = require('express');
const reservacionesController = require('../controllers/reservaciones.controller');
const { autenticarUsuario, autorizarRoles } = require('../middleware/auth.middleware');
const { ROLES } = require('../constants/roles');

const router = express.Router();

router.get(
    '/',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR, ROLES.CONSULTA),
    reservacionesController.listarReservaciones
);

router.post(
    '/',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR),
    reservacionesController.crearReservacion
);

router.patch(
    '/:id/cancelar',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR),
    reservacionesController.cancelarReservacion
);

router.patch(
    '/:id/transporte',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR),
    reservacionesController.asignarTransporteReservacion
);

router.patch(
    '/:id',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR),
    reservacionesController.actualizarReservacionParcial
);

router.get(
    '/:id',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR, ROLES.CONSULTA),
    reservacionesController.obtenerReservacionPorId
);

module.exports = router;
