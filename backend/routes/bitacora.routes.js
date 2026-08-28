const express = require('express');
const bitacoraController = require('../controllers/bitacora.controller');
const { autenticarUsuario, autorizarRoles } = require('../middleware/auth.middleware');
const { ROLES } = require('../constants/roles');

const router = express.Router();

router.get(
    '/',
    autenticarUsuario,
    autorizarRoles(ROLES.ADMINISTRADOR),
    bitacoraController.consultarBitacora
);

module.exports = router;
