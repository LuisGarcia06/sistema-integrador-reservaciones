const request = require('supertest');
const app = require('../server');
const {
    crearPayloadWebhookFareHarborSanitizado
} = require('./fixtures/fareharbor.booking.fixture');

describe('POST /api/webhooks/fareharbor', () => {
    const originalWebhookKey = process.env.FAREHARBOR_WEBHOOK_KEY;

    afterEach(() => {
        process.env.FAREHARBOR_WEBHOOK_KEY = originalWebhookKey;
    });

    test('webhook valido responde 200', async () => {
        delete process.env.FAREHARBOR_WEBHOOK_KEY;

        const response = await request(app)
            .post('/api/webhooks/fareharbor')
            .send(crearPayloadWebhookFareHarborSanitizado());

        expect(response.status).toBe(200);
    });

    test('webhook con key incorrecta responde 403 si la validacion esta habilitada', async () => {
        process.env.FAREHARBOR_WEBHOOK_KEY = 'KEY_CORRECTA_TEST';

        const response = await request(app)
            .post('/api/webhooks/fareharbor?key=KEY_INCORRECTA')
            .send(crearPayloadWebhookFareHarborSanitizado());

        expect(response.status).toBe(403);
    });
});
