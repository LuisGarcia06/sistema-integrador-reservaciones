const express = require('express');
const usuariosController = require('../controllers/usuarios.controller');
const { autenticarUsuario, autorizarRoles } = require('../middleware/auth.middleware');
const { ROLES } = require('../constants/roles');

const router = express.Router();

router.use(autenticarUsuario, autorizarRoles(ROLES.ADMINISTRADOR));

router.get('/roles', usuariosController.listarRoles);
router.get('/', usuariosController.listarUsuarios);
router.post('/', usuariosController.crearUsuario);
router.patch('/:id/password', usuariosController.actualizarPasswordUsuario);
router.patch('/:id', usuariosController.actualizarUsuarioParcial);
router.get('/:id', usuariosController.obtenerUsuarioPorId);

module.exports = router;
