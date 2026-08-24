const express = require('express');
const reservacionesController = require('../controllers/reservaciones.controller');

const router = express.Router();

router.get('/', reservacionesController.listarReservaciones);
router.post('/', reservacionesController.crearReservacion);
router.patch('/:id', reservacionesController.actualizarReservacionParcial);
router.get('/:id', reservacionesController.obtenerReservacionPorId);

module.exports = router;
