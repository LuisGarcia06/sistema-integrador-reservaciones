const express = require('express');
const reservacionesController = require('../controllers/reservaciones.controller');

const router = express.Router();

router.get('/', reservacionesController.listarReservaciones);
router.post('/', reservacionesController.crearReservacion);
router.get('/:id', reservacionesController.obtenerReservacionPorId);

module.exports = router;
