jest.mock('../services/whatsappWebhook.service', () => ({
    procesarPayloadWebhookWhatsapp: jest.fn()
}));

const whatsappWebhookService = require('../services/whatsappWebhook.service');
const whatsappController = require('../controllers/whatsapp.controller');

const crearPayloadSanitizado = () => ({
    object: 'whatsapp_business_account',
    entry: [
        {
            id: 'WABA_TEST_ID',
            changes: [
                {
                    field: 'messages',
                    value: {
                        metadata: {
                            phone_number_id: 'PHONE_NUMBER_TEST_ID'
                        },
                        messages: [
                            {
                                from: 'CONTACT_WA_ID_TEST',
                                id: 'MSG_TEST_001',
                                timestamp: '1700000000',
                                type: 'text',
                                text: {
                                    body: 'Mensaje de prueba'
                                }
                            }
                        ]
                    }
                }
            ]
        }
    ]
});

describe('whatsapp.controller', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('recibirWebhook responde 200 y delega el procesamiento del payload', async () => {
        const payload = crearPayloadSanitizado();
        const req = { body: payload };
        const res = {
            sendStatus: jest.fn()
        };

        whatsappController.recibirWebhook(req, res);

        expect(res.sendStatus).toHaveBeenCalledWith(200);

        await new Promise((resolve) => setImmediate(resolve));

        expect(whatsappWebhookService.procesarPayloadWebhookWhatsapp).toHaveBeenCalledWith(payload);
    });
});
