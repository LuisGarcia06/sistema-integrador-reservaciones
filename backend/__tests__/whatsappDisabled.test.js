const express = require('express');
const request = require('supertest');

jest.mock('../config/database', () => ({ query: jest.fn(), connect: jest.fn() }));

const config = require('../config/whatsapp');
const controller = require('../controllers/whatsapp.controller');
const webhook = require('../services/whatsappWebhook.service');
const { enviarMensajeTextoWhatsapp } = require('../services/whatsappMessage.service');
const pool = require('../config/database');

describe('GITHUB-02: WhatsApp deshabilitado', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = {
            ...originalEnv,
            WHATSAPP_ENABLED: 'true',
            WHATSAPP_VERIFY_TOKEN: 'github02-synthetic-token',
            WHATSAPP_ACCESS_TOKEN: 'github02-synthetic-access',
            WHATSAPP_PHONE_NUMBER_ID: 'github02-synthetic-phone',
            WHATSAPP_GRAPH_API_VERSION: 'v99.0'
        };
    });

    afterEach(() => {
        process.env = originalEnv;
        jest.restoreAllMocks();
    });

    test('las variables heredadas no pueden habilitar la integracion', () => {
        expect(config.habilitado).toBe(false);
        expect(Object.isFrozen(config)).toBe(true);
    });

    test('el controlador rechaza incluso un token igual al configurado', () => {
        const procesar = jest.spyOn(webhook, 'procesarPayloadWebhookWhatsapp');
        const res = { sendStatus: jest.fn(), status: jest.fn(), send: jest.fn() };
        controller.verificarWebhook({ query: {
            'hub.mode': 'subscribe',
            'hub.verify_token': process.env.WHATSAPP_VERIFY_TOKEN,
            'hub.challenge': 'no-devolver-este-challenge'
        } }, res);
        controller.recibirWebhook({ body: { entry: [] } }, res);
        expect(res.sendStatus.mock.calls).toEqual([[404], [404]]);
        expect(res.send).not.toHaveBeenCalled();
        expect(procesar).not.toHaveBeenCalled();
    });

    test('un montaje directo de las rutas tampoco admite GET ni POST', async () => {
        const app = express();
        app.use(express.json());
        app.use('/api/webhooks/whatsapp', require('../routes/whatsapp.routes'));
        await request(app).get('/api/webhooks/whatsapp').query({
            'hub.mode': 'subscribe',
            'hub.verify_token': process.env.WHATSAPP_VERIFY_TOKEN,
            'hub.challenge': 'synthetic-challenge'
        }).expect(404);
        await request(app).post('/api/webhooks/whatsapp').send({ entry: [] }).expect(404);
    });

    test('el servidor real no expone las rutas WhatsApp', async () => {
        const app = require('../server');
        await request(app).get('/api/webhooks/whatsapp').expect(404);
        await request(app).post('/api/webhooks/whatsapp').send({ entry: [] }).expect(404);
        expect(pool.query).not.toHaveBeenCalled();
        expect(pool.connect).not.toHaveBeenCalled();
    });

    test('el envio directo o desde el script falla antes de cualquier llamada a Meta', async () => {
        const fetch = jest.spyOn(global, 'fetch').mockImplementation(() => {
            throw new Error('La prueba no permite llamadas HTTP');
        });
        await expect(enviarMensajeTextoWhatsapp('synthetic-recipient', 'synthetic-text'))
            .rejects.toMatchObject({ code: 'WHATSAPP_DISABLED', statusCode: 503 });
        expect(fetch).not.toHaveBeenCalled();
    });

    test('el procesamiento directo no registra datos de mensajes', () => {
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        const payload = { entry: [{ id: 'synthetic-waba', changes: [{ field: 'messages',
            value: { messages: [{ id: 'synthetic-message', type: 'text', text: { body: 'private' } }] }
        }] }] };
        expect(webhook.procesarPayloadWebhookWhatsapp(payload)).toEqual([]);
        expect(log).not.toHaveBeenCalled();
    });
});
