const express = require('express');
const toursController = require('../controllers/tours.controller');
const { autenticarUsuario, autorizarRoles } = require('../middleware/auth.middleware');
const { ROLES } = require('../constants/roles');

const router = express.Router();

router.get(
    '/',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR, ROLES.CONSULTA),
    toursController.listarTours
);

router.post(
    '/',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR),
    toursController.crearTour
);

router.patch(
    '/:id',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR),
    toursController.actualizarTourParcial
);

router.get(
    '/:id',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR, ROLES.CONSULTA),
    toursController.obtenerTourPorId
);

module.exports = router;
