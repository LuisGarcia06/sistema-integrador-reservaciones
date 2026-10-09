const request = require('supertest');
const app = require('../server');
const pool = require('../config/database');
const fareharborWebhookService = require('../integrations/fareharbor/fareharborWebhook.service');

const WEBHOOK_PATH = '/api/integraciones/fareharbor/webhook';

function crearPayload() {
    return {
        type: 'booking.created',
        booking: {
            uuid: '11111111-2222-4333-8444-555555555555'
        }
    };
}

describe('POST /api/integraciones/fareharbor/webhook', () => {
    const originalSecret = process.env.FAREHARBOR_WEBHOOK_SECRET;
    const originalDebug = process.env.FAREHARBOR_WEBHOOK_DEBUG;
    let consoleSpy;
    let dbSpy;
    let procesarSpy;

    beforeEach(() => {
        process.env.FAREHARBOR_WEBHOOK_SECRET = 'super_secret_test_value';
        process.env.FAREHARBOR_WEBHOOK_DEBUG = 'false';
        consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        dbSpy = jest.spyOn(pool, 'query').mockImplementation(() => {
            throw new Error('El webhook inicial de FareHarbor no debe consultar PostgreSQL');
        });
        procesarSpy = jest.spyOn(fareharborWebhookService, 'procesarPayloadWebhookFareHarbor');
    });

    afterEach(() => {
        process.env.FAREHARBOR_WEBHOOK_SECRET = originalSecret;
        process.env.FAREHARBOR_WEBHOOK_DEBUG = originalDebug;
        jest.restoreAllMocks();
    });

    test('POST sin key es rechazado y no toca PostgreSQL', async () => {
        const response = await request(app)
            .post(WEBHOOK_PATH)
            .send(crearPayload());

        expect(response.status).toBe(401);
        expect(dbSpy).not.toHaveBeenCalled();
        expect(procesarSpy).not.toHaveBeenCalled();
    });

    test('POST con key incorrecta es rechazado y no toca PostgreSQL', async () => {
        const response = await request(app)
            .post(WEBHOOK_PATH + '?key=wrong_key')
            .send(crearPayload());

        expect(response.status).toBe(403);
        expect(dbSpy).not.toHaveBeenCalled();
        expect(procesarSpy).not.toHaveBeenCalled();
    });

    test('POST con key correcta y JSON objeto responde 200 sin crear reservas ni eventos', async () => {
        const response = await request(app)
            .post(WEBHOOK_PATH + '?key=super_secret_test_value')
            .send(crearPayload());

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ mensaje: 'Webhook FareHarbor recibido' });
        expect(dbSpy).not.toHaveBeenCalled();
        expect(procesarSpy).not.toHaveBeenCalled();
    });

    test('POST con key correcta pero body no objeto responde 400', async () => {
        const response = await request(app)
            .post(WEBHOOK_PATH + '?key=super_secret_test_value')
            .send(['payload-no-objeto']);

        expect(response.status).toBe(400);
        expect(dbSpy).not.toHaveBeenCalled();
        expect(procesarSpy).not.toHaveBeenCalled();
    });

    test('el secreto no aparece en respuesta ni logs', async () => {
        const response = await request(app)
            .post(WEBHOOK_PATH + '?key=super_secret_test_value')
            .send(crearPayload());
        const logText = consoleSpy.mock.calls.map((call) => call.join(' ')).join(' ');

        expect(response.status).toBe(200);
        expect(JSON.stringify(response.body)).not.toContain('super_secret_test_value');
        expect(logText).not.toContain('super_secret_test_value');
    });
});
