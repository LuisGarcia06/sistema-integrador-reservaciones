const fareharborWebhookService = require('../integrations/fareharbor/fareharborWebhook.service');

const recibirWebhook = (req, res) => {
    const validacion = fareharborWebhookService.validarWebhookKey(req.query.key);

    if (!validacion.valid) {
        return res.status(validacion.status).json({
            mensaje: validacion.message
        });
    }

    if (!fareharborWebhookService.esPayloadObjeto(req.body)) {
        return res.status(400).json({
            mensaje: 'El webhook FareHarbor debe enviar un objeto JSON'
        });
    }

    fareharborWebhookService.registrarWebhookRecibido(req.body);

    return res.status(200).json({
        mensaje: 'Webhook FareHarbor recibido'
    });
};

module.exports = {
    recibirWebhook
};
