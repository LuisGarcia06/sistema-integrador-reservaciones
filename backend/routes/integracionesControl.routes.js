const router = require('express').Router();
const controller = require('../controllers/integracionesControl.controller');
const { autenticarUsuario, autorizarRoles } = require('../middleware/auth.middleware');
const { ROLES } = require('../constants/roles');
router.use(autenticarUsuario);
router.get('/', autorizarRoles(ROLES.ADMINISTRADOR, ROLES.CONSULTA), controller.listar);
router.patch('/:provider', autorizarRoles(ROLES.ADMINISTRADOR), controller.cambiar);
module.exports = router;
