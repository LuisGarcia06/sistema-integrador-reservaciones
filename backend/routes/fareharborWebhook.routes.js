const express = require('express');
const fareharborWebhookController = require('../controllers/fareharborWebhook.controller');

const router = express.Router();

router.post('/', fareharborWebhookController.recibirWebhook);

module.exports = router;
