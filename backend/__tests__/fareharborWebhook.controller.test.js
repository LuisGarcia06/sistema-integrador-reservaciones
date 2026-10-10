jest.mock('../integrations/fareharbor/fareharborWebhook.service', () => {
    class MockFareHarborPayloadInvalidoError extends Error {}

    return {
        FareHarborPayloadInvalidoError: MockFareHarborPayloadInvalidoError,
        esPayloadObjeto: jest.fn(() => true),
        persistirWebhookFareHarbor: jest.fn().mockResolvedValue({ duplicate: false }),
        registrarWebhookRecibido: jest.fn(),
        validarWebhookKey: jest.fn(() => ({ valid: true, status: 200, message: 'ok' }))
    };
});

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

    test('recibirWebhook responde 200 y persiste el evento FareHarbor', async () => {
        const payload = { booking: { uuid: '11111111-2222-4333-8444-555555555555' } };
        const req = { body: payload, query: { key: 'KEY_CORRECTA' } };
        const res = crearRes();

        await fareharborWebhookController.recibirWebhook(req, res);

        expect(fareharborWebhookService.validarWebhookKey).toHaveBeenCalledWith('KEY_CORRECTA');
        expect(fareharborWebhookService.esPayloadObjeto).toHaveBeenCalledWith(payload);
        expect(fareharborWebhookService.registrarWebhookRecibido).toHaveBeenCalledWith(payload);
        expect(fareharborWebhookService.persistirWebhookFareHarbor).toHaveBeenCalledWith(payload);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ mensaje: 'Webhook FareHarbor recibido' });
    });

    test('webhook sin key valida como rechazo controlado', async () => {
        fareharborWebhookService.validarWebhookKey.mockReturnValueOnce({
            valid: false,
            status: 401,
            message: 'Webhook FareHarbor no autorizado'
        });
        const req = { body: {}, query: {} };
        const res = crearRes();

        await fareharborWebhookController.recibirWebhook(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ mensaje: 'Webhook FareHarbor no autorizado' });
        expect(fareharborWebhookService.registrarWebhookRecibido).not.toHaveBeenCalled();
        expect(fareharborWebhookService.persistirWebhookFareHarbor).not.toHaveBeenCalled();
    });

    test('body no objeto responde 400 sin persistir', async () => {
        fareharborWebhookService.esPayloadObjeto.mockReturnValueOnce(false);
        const req = { body: [], query: { key: 'KEY_CORRECTA' } };
        const res = crearRes();

        await fareharborWebhookController.recibirWebhook(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(fareharborWebhookService.registrarWebhookRecibido).not.toHaveBeenCalled();
        expect(fareharborWebhookService.persistirWebhookFareHarbor).not.toHaveBeenCalled();
    });

    test('payload invalido responde 400 controlado', async () => {
        fareharborWebhookService.persistirWebhookFareHarbor.mockRejectedValueOnce(
            new fareharborWebhookService.FareHarborPayloadInvalidoError('booking.uuid es requerido')
        );
        const req = { body: { booking: {} }, query: { key: 'KEY_CORRECTA' } };
        const res = crearRes();

        await fareharborWebhookController.recibirWebhook(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            mensaje: 'El webhook FareHarbor no contiene una reserva valida'
        });
    });

    test('error inesperado responde 500 sin exponer stack', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        fareharborWebhookService.persistirWebhookFareHarbor.mockRejectedValueOnce(
            new Error('fallo postgres con detalle privado')
        );
        const req = { body: { booking: { uuid: '11111111-2222-4333-8444-555555555555' } }, query: { key: 'KEY_CORRECTA' } };
        const res = crearRes();

        await fareharborWebhookController.recibirWebhook(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            mensaje: 'No fue posible procesar el webhook FareHarbor'
        });
        expect(JSON.stringify(res.json.mock.calls)).not.toContain('fallo postgres');

        consoleSpy.mockRestore();
    });
});
