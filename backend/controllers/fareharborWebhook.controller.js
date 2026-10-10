const fareharborWebhookService = require('../integrations/fareharbor/fareharborWebhook.service');

const recibirWebhook = async (req, res) => {
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

    try {
        await fareharborWebhookService.persistirWebhookFareHarbor(req.body);

        return res.status(200).json({
            mensaje: 'Webhook FareHarbor recibido'
        });
    } catch (error) {
        if (error instanceof fareharborWebhookService.FareHarborPayloadInvalidoError) {
            return res.status(400).json({
                mensaje: 'El webhook FareHarbor no contiene una reserva valida'
            });
        }

        console.error('Error al persistir webhook FareHarbor');

        return res.status(500).json({
            mensaje: 'No fue posible procesar el webhook FareHarbor'
        });
    }
};

module.exports = {
    recibirWebhook
};
