const express = require('express');
const reservacionesController = require('../controllers/reservaciones.controller');

const router = express.Router();

router.get('/', reservacionesController.listarReservaciones);

module.exports = router;
