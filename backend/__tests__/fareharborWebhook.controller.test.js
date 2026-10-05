jest.mock('../integrations/fareharbor/fareharborWebhook.service', () => ({
    procesarPayloadWebhookFareHarbor: jest.fn(),
    validarWebhookKey: jest.fn(() => true)
}));

const fareharborWebhookService = require('../integrations/fareharbor/fareharborWebhook.service');
const fareharborWebhookController = require('../controllers/fareharborWebhook.controller');
const {
    crearPayloadWebhookFareHarborSanitizado
} = require('./fixtures/fareharbor.booking.fixture');

describe('fareharborWebhook.controller', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('recibirWebhook responde 200 y delega el procesamiento del payload', async () => {
        const payload = crearPayloadWebhookFareHarborSanitizado();
        const req = { body: payload, query: {} };
        const res = {
            sendStatus: jest.fn()
        };

        fareharborWebhookController.recibirWebhook(req, res);

        expect(res.sendStatus).toHaveBeenCalledWith(200);

        await new Promise((resolve) => setImmediate(resolve));

        expect(fareharborWebhookService.procesarPayloadWebhookFareHarbor).toHaveBeenCalledWith(payload);
    });

    test('webhook con key incorrecta es rechazado si la validacion esta habilitada', async () => {
        fareharborWebhookService.validarWebhookKey.mockReturnValueOnce(false);

        const req = {
            body: crearPayloadWebhookFareHarborSanitizado(),
            query: { key: 'KEY_INCORRECTA' }
        };
        const res = {
            sendStatus: jest.fn()
        };

        fareharborWebhookController.recibirWebhook(req, res);

        expect(res.sendStatus).toHaveBeenCalledWith(403);

        await new Promise((resolve) => setImmediate(resolve));

        expect(fareharborWebhookService.procesarPayloadWebhookFareHarbor).not.toHaveBeenCalled();
    });
});
