jest.mock('../integrations/fareharbor/fareharborWebhook.service', () => ({
    esPayloadObjeto: jest.fn(() => true),
    procesarPayloadWebhookFareHarbor: jest.fn(),
    registrarWebhookRecibido: jest.fn(),
    validarWebhookKey: jest.fn(() => ({ valid: true, status: 200, message: 'ok' }))
}));

const fareharborWebhookService = require('../integrations/fareharbor/fareharborWebhook.service');
const fareharborWebhookController = require('../controllers/fareharborWebhook.controller');

describe('fareharborWebhook.controller', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    function crearRes() {
        return {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
    }

    test('recibirWebhook responde 200 y solo registra recepcion inicial', () => {
        const payload = { booking: { uuid: '11111111-2222-4333-8444-555555555555' } };
        const req = { body: payload, query: { key: 'KEY_CORRECTA' } };
        const res = crearRes();

        fareharborWebhookController.recibirWebhook(req, res);

        expect(fareharborWebhookService.validarWebhookKey).toHaveBeenCalledWith('KEY_CORRECTA');
        expect(fareharborWebhookService.esPayloadObjeto).toHaveBeenCalledWith(payload);
        expect(fareharborWebhookService.registrarWebhookRecibido).toHaveBeenCalledWith(payload);
        expect(fareharborWebhookService.procesarPayloadWebhookFareHarbor).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ mensaje: 'Webhook FareHarbor recibido' });
    });

    test('webhook sin key valida como rechazo controlado', () => {
        fareharborWebhookService.validarWebhookKey.mockReturnValueOnce({
            valid: false,
            status: 401,
            message: 'Webhook FareHarbor no autorizado'
        });
        const req = { body: {}, query: {} };
        const res = crearRes();

        fareharborWebhookController.recibirWebhook(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ mensaje: 'Webhook FareHarbor no autorizado' });
        expect(fareharborWebhookService.registrarWebhookRecibido).not.toHaveBeenCalled();
        expect(fareharborWebhookService.procesarPayloadWebhookFareHarbor).not.toHaveBeenCalled();
    });

    test('body no objeto responde 400 sin procesar', () => {
        fareharborWebhookService.esPayloadObjeto.mockReturnValueOnce(false);
        const req = { body: [], query: { key: 'KEY_CORRECTA' } };
        const res = crearRes();

        fareharborWebhookController.recibirWebhook(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(fareharborWebhookService.registrarWebhookRecibido).not.toHaveBeenCalled();
        expect(fareharborWebhookService.procesarPayloadWebhookFareHarbor).not.toHaveBeenCalled();
    });
});
