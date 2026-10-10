const request = require('supertest');
const app = require('../server');
const pool = require('../config/database');
const fareharborWebhookService = require('../integrations/fareharbor/fareharborWebhook.service');

const WEBHOOK_PATH = '/api/integraciones/fareharbor/webhook';
const WEBHOOK_ALIAS_PATH = '/api/webhooks/fareharbor';

function crearPayload() {
    return {
        type: 'booking.created',
        booking: {
            uuid: '11111111-2222-4333-8444-555555555555'
        }
    };
}

function crearPayloadSinteticoGrande(tamanoRellenoBytes) {
    return {
        type: 'booking.created',
        booking: {
            uuid: '11111111-2222-4333-8444-555555555555',
            metadata: {
                synthetic_padding: 'x'.repeat(tamanoRellenoBytes)
            }
        }
    };
}

function crearPayloadConPii() {
    return {
        type: 'booking.created',
        booking: {
            uuid: '11111111-2222-4333-8444-555555555555',
            pk: 10001,
            display_id: 'FH-TEST-001',
            status: 'booked',
            contact: {
                name: 'Maria Privada',
                email: 'maria.privada@example.test',
                phone: '+529981112233',
                address: 'Calle Secreta 45'
            },
            customers: [
                {
                    name: 'Cliente Sensible',
                    email: 'cliente.sensible@example.test',
                    phone: '+529984445566'
                }
            ],
            availability: {
                start_at: '2026-10-10T08:00:00-05:00',
                end_at: '2026-10-10T12:00:00-05:00',
                item: {
                    pk: 77,
                    name: 'Tour Sian Kaan'
                }
            },
            payments: [
                {
                    amount: '150.00',
                    token: 'tok_secreto_pago'
                }
            ],
            pickup: {
                address: 'Hotel Confidencial'
            },
            note: 'Nota privada del cliente',
            internal_secret: 'super_secret_test_value'
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

    test('POST con payload sintetico de 130 a 140kb responde 200', async () => {
        const response = await request(app)
            .post(WEBHOOK_PATH + '?key=super_secret_test_value')
            .send(crearPayloadSinteticoGrande(135 * 1024));

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ mensaje: 'Webhook FareHarbor recibido' });
        expect(dbSpy).not.toHaveBeenCalled();
        expect(procesarSpy).not.toHaveBeenCalled();
    });

    test('alias POST /api/webhooks/fareharbor conserva el limite especifico de 256kb', async () => {
        const response = await request(app)
            .post(WEBHOOK_ALIAS_PATH + '?key=super_secret_test_value')
            .send(crearPayloadSinteticoGrande(135 * 1024));

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ mensaje: 'Webhook FareHarbor recibido' });
        expect(dbSpy).not.toHaveBeenCalled();
        expect(procesarSpy).not.toHaveBeenCalled();
    });

    test('POST con payload superior a 256kb responde 413 antes del controlador', async () => {
        const response = await request(app)
            .post(WEBHOOK_PATH + '?key=super_secret_test_value')
            .send(crearPayloadSinteticoGrande(270 * 1024));

        expect(response.status).toBe(413);
        expect(dbSpy).not.toHaveBeenCalled();
        expect(procesarSpy).not.toHaveBeenCalled();
    });

    test('una ruta normal conserva el limite global de 100kb', async () => {
        const response = await request(app)
            .post('/api/auth/login')
            .send({
                correo: 'usuario@example.test',
                password: 'x'.repeat(135 * 1024)
            });

        expect(response.status).toBe(413);
        expect(dbSpy).not.toHaveBeenCalled();
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

    test('debug responde 200 con resumen sanitizado sin PII ni escritura DB', async () => {
        process.env.FAREHARBOR_WEBHOOK_DEBUG = 'true';

        const response = await request(app)
            .post(WEBHOOK_PATH + '?key=super_secret_test_value')
            .send(crearPayloadConPii());
        const logText = JSON.stringify(consoleSpy.mock.calls);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ mensaje: 'Webhook FareHarbor recibido' });
        expect(logText).toContain('Webhook FareHarbor recibido (debug sanitizado):');
        expect(logText).toContain('11111111-2222-4333-8444-555555555555');
        expect(logText).not.toContain('super_secret_test_value');
        expect(logText).not.toContain('Maria Privada');
        expect(logText).not.toContain('maria.privada@example.test');
        expect(logText).not.toContain('+529981112233');
        expect(logText).not.toContain('Hotel Confidencial');
        expect(logText).not.toContain('tok_secreto_pago');
        expect(dbSpy).not.toHaveBeenCalled();
        expect(procesarSpy).not.toHaveBeenCalled();
    });
});
