const express = require('express');
const authController = require('../controllers/auth.controller');
const { autenticarUsuario } = require('../middleware/auth.middleware');

const router = express.Router();

router.post('/login', authController.login);
router.get('/sesion', autenticarUsuario, authController.consultarSesion);

module.exports = router;
