const fareharborWebhookService = require('../integrations/fareharbor/fareharborWebhook.service');

const recibirWebhook = (req, res) => {
    if (!fareharborWebhookService.validarWebhookKey(req.query.key)) {
        return res.sendStatus(403);
    }

    res.sendStatus(200);

    setImmediate(() => {
        try {
            fareharborWebhookService.procesarPayloadWebhookFareHarbor(req.body || {});
        } catch (error) {
            console.error('Error al procesar webhook de FareHarbor:', error);
        }
    });
};

module.exports = {
    recibirWebhook
};
