const whatsappWebhookService = require('../services/whatsappWebhook.service');

const verificarWebhook = (req, res) => {
    const mode = req.query['hub.mode'];
    const verifyToken = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && verifyToken === process.env.WHATSAPP_VERIFY_TOKEN) {
        return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
};

const recibirWebhook = (req, res) => {
    res.sendStatus(200);

    setImmediate(() => {
        try {
            whatsappWebhookService.procesarPayloadWebhookWhatsapp(req.body || {});
        } catch (error) {
            console.error('Error al procesar webhook de WhatsApp:', error);
        }
    });
};

module.exports = {
    verificarWebhook,
    recibirWebhook
};
