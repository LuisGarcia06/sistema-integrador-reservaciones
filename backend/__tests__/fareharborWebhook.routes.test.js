const request = require('supertest');
const app = require('../server');
const pool = require('../config/database');

const WEBHOOK_PATH = '/api/integraciones/fareharbor/webhook';
const WEBHOOK_ALIAS_PATH = '/api/webhooks/fareharbor';

function crearPayload(sobrescriturasBooking = {}) {
    return {
        booking: {
            uuid: '11111111-2222-4333-8444-555555555555',
            pk: 10001,
            display_id: 'FH-TEST-001',
            status: 'booked',
            created_at: '2026-10-10T09:00:00-0500',
            customer_count: 2,
            availability: {
                pk: 70001,
                start_at: '2026-10-12T08:00:00-0500',
                end_at: '2026-10-12T12:00:00-0500',
                item: {
                    pk: 77,
                    name: 'Tour Sian Kaan',
                    headline: 'Tour corto'
                }
            },
            contact: {
                name: 'Cliente Demo',
                normalized_phone: '+520000000000',
                email: 'cliente.demo@example.test'
            },
            customers: [
                {
                    customer_type_rate: {
                        customer_type: {
                            pk: 1,
                            singular: 'Adult',
                            plural: 'Adults'
                        }
                    }
                },
                {
                    customer_type_rate: {
                        customer_type: {
                            pk: 1,
                            singular: 'Adult',
                            plural: 'Adults'
                        }
                    }
                }
            ],
            pickup: null,
            lodging: null,
            arrival: null,
            invoice_price: '100.00',
            receipt_total: '100.00',
            amount_paid: '100.00',
            company: {
                currency: 'mxn'
            },
            ...sobrescriturasBooking
        }
    };
}

function crearPayloadSinteticoGrande(tamanoRellenoBytes) {
    return crearPayload({
        metadata: {
            synthetic_padding: 'x'.repeat(tamanoRellenoBytes)
        }
    });
}

function crearPayloadConPii() {
    return crearPayload({
        contact: {
            name: 'Maria Privada',
            email: 'maria.privada@example.test',
            normalized_phone: '+529981112233',
            phone: '+529981112233',
            address: 'Calle Secreta 45'
        },
        customers: [
            {
                name: 'Cliente Sensible',
                email: 'cliente.sensible@example.test',
                phone: '+529984445566',
                customer_type_rate: {
                    customer_type: {
                        pk: 1,
                        singular: 'Adult',
                        plural: 'Adults'
                    }
                }
            }
        ],
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
    });
}

function crearDbWebhookMemoria({ conLink = false } = {}) {
    const state = {
        eventos: [],
        links: conLink
            ? [{
                id_reserva_integracion_link: 1,
                provider: 'fareharbor',
                external_booking_id: '11111111-2222-4333-8444-555555555555',
                id_reservacion: 99
            }]
            : [],
        queries: []
    };

    const client = {
        query: jest.fn(async (query, values = []) => {
            state.queries.push(query);

            if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(query)) {
                return { rows: [] };
            }

            if (/INSERT\s+INTO\s+reservaciones/i.test(query)) {
                throw new Error('FH-1 no debe crear reservaciones');
            }

            if (/INSERT\s+INTO\s+reservas_integracion_link/i.test(query)
                || /UPDATE\s+reservas_integracion_link/i.test(query)
                || /DELETE\s+FROM\s+reservas_integracion_link/i.test(query)) {
                throw new Error('FH-1 no debe modificar reservas_integracion_link');
            }

            if (/FROM\s+reservas_integracion_link/i.test(query)) {
                const [provider, externalBookingId] = values;
                return {
                    rows: state.links.filter((link) => (
                        link.provider === provider
                        && link.external_booking_id === externalBookingId
                    ))
                };
            }

            if (/SELECT[\s\S]+FROM\s+eventos_integracion[\s\S]+WHERE provider = \$1[\s\S]+external_event_id = \$2/i.test(query)) {
                const [provider, externalEventId] = values;
                return {
                    rows: state.eventos.filter((evento) => (
                        evento.provider === provider
                        && evento.external_event_id === externalEventId
                    ))
                };
            }

            if (/INSERT\s+INTO\s+eventos_integracion/i.test(query)) {
                const [
                    provider,
                    externalEventId,
                    externalThreadId,
                    externalBookingId,
                    eventType,
                    urgent,
                    reviewStatus,
                    normalizedData,
                    sourceSubject,
                    sourceReceivedAt
                ] = values;
                const existente = state.eventos.find((evento) => (
                    evento.provider === provider
                    && evento.external_event_id === externalEventId
                ));

                if (existente) {
                    return { rows: [] };
                }

                const evento = {
                    id_evento_integracion: state.eventos.length + 1,
                    provider,
                    external_event_id: externalEventId,
                    external_thread_id: externalThreadId,
                    external_booking_id: externalBookingId,
                    event_type: eventType,
                    urgent,
                    review_status: reviewStatus,
                    application_status: 'not_applied',
                    normalized_data: JSON.parse(normalizedData),
                    source_subject: sourceSubject,
                    source_received_at: sourceReceivedAt,
                    created_at: new Date('2026-10-10T15:00:00.000Z'),
                    updated_at: new Date('2026-10-10T15:00:00.000Z')
                };

                state.eventos.push(evento);

                return { rows: [evento] };
            }

            throw new Error(`Query no soportado en prueba: ${query}`);
        }),
        release: jest.fn()
    };

    return {
        client,
        state
    };
}

describe('POST /api/integraciones/fareharbor/webhook', () => {
    const originalSecret = process.env.FAREHARBOR_WEBHOOK_SECRET;
    const originalDebug = process.env.FAREHARBOR_WEBHOOK_DEBUG;
    let consoleLogSpy;
    let consoleErrorSpy;
    let connectSpy;
    let db;

    beforeEach(() => {
        process.env.FAREHARBOR_WEBHOOK_SECRET = 'super_secret_test_value';
        process.env.FAREHARBOR_WEBHOOK_DEBUG = 'false';
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        db = crearDbWebhookMemoria();
        connectSpy = jest.spyOn(pool, 'connect').mockResolvedValue(db.client);
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
        expect(connectSpy).not.toHaveBeenCalled();
    });

    test('POST con key incorrecta es rechazado y no toca PostgreSQL', async () => {
        const response = await request(app)
            .post(WEBHOOK_PATH + '?key=wrong_key')
            .send(crearPayload());

        expect(response.status).toBe(403);
        expect(connectSpy).not.toHaveBeenCalled();
    });

    test('primer booking nuevo inserta un evento_integracion new_booking', async () => {
        const response = await request(app)
            .post(WEBHOOK_PATH + '?key=super_secret_test_value')
            .send(crearPayload());

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ mensaje: 'Webhook FareHarbor recibido' });
        expect(db.state.eventos).toHaveLength(1);
        expect(db.state.eventos[0]).toMatchObject({
            provider: 'fareharbor',
            external_booking_id: '11111111-2222-4333-8444-555555555555',
            event_type: 'new_booking',
            review_status: 'pending_review',
            application_status: 'not_applied'
        });
        expect(db.state.eventos[0].external_event_id).toMatch(/^fh:11111111-2222-4333-8444-555555555555:[a-f0-9]{64}$/);
        expect(db.state.eventos[0].normalized_data).not.toHaveProperty('raw');
    });

    test('mismo webhook repetido mantiene un solo evento y responde 200', async () => {
        await request(app)
            .post(WEBHOOK_PATH + '?key=super_secret_test_value')
            .send(crearPayload());
        const response = await request(app)
            .post(WEBHOOK_PATH + '?key=super_secret_test_value')
            .send(crearPayload());

        expect(response.status).toBe(200);
        expect(db.state.eventos).toHaveLength(1);
    });

    test('mismo booking.uuid con snapshot diferente crea segundo evento unico', async () => {
        await request(app)
            .post(WEBHOOK_PATH + '?key=super_secret_test_value')
            .send(crearPayload());
        const response = await request(app)
            .post(WEBHOOK_PATH + '?key=super_secret_test_value')
            .send(crearPayload({ customer_count: 3 }));

        expect(response.status).toBe(200);
        expect(db.state.eventos).toHaveLength(2);
        expect(db.state.eventos[0].external_event_id).not.toBe(db.state.eventos[1].external_event_id);
    });

    test('booking con reservas_integracion_link existente clasifica modification', async () => {
        db = crearDbWebhookMemoria({ conLink: true });
        connectSpy.mockResolvedValue(db.client);

        const response = await request(app)
            .post(WEBHOOK_PATH + '?key=super_secret_test_value')
            .send(crearPayload());

        expect(response.status).toBe(200);
        expect(db.state.eventos).toHaveLength(1);
        expect(db.state.eventos[0].event_type).toBe('modification');
    });

    test('payload invalido no inserta evento', async () => {
        const response = await request(app)
            .post(WEBHOOK_PATH + '?key=super_secret_test_value')
            .send({ booking: { display_id: 'SIN-UUID' } });

        expect(response.status).toBe(400);
        expect(db.state.eventos).toHaveLength(0);
    });

    test('FH-1 no crea reservaciones ni modifica reservas_integracion_link', async () => {
        const response = await request(app)
            .post(WEBHOOK_PATH + '?key=super_secret_test_value')
            .send(crearPayload());
        const consultas = db.state.queries.join('\n');

        expect(response.status).toBe(200);
        expect(consultas).not.toMatch(/INSERT\s+INTO\s+reservaciones/i);
        expect(consultas).not.toMatch(/INSERT\s+INTO\s+reservas_integracion_link/i);
        expect(consultas).not.toMatch(/UPDATE\s+reservas_integracion_link/i);
        expect(consultas).not.toMatch(/DELETE\s+FROM\s+reservas_integracion_link/i);
    });

    test('FH-1 no toca eventos GetYourGuide', async () => {
        await request(app)
            .post(WEBHOOK_PATH + '?key=super_secret_test_value')
            .send(crearPayload());

        expect(db.state.eventos.every((evento) => evento.provider === 'fareharbor')).toBe(true);
    });

    test('POST con payload sintetico de 130 a 140kb responde 200', async () => {
        const response = await request(app)
            .post(WEBHOOK_PATH + '?key=super_secret_test_value')
            .send(crearPayloadSinteticoGrande(135 * 1024));

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ mensaje: 'Webhook FareHarbor recibido' });
        expect(db.state.eventos).toHaveLength(1);
    });

    test('alias POST /api/webhooks/fareharbor conserva el limite especifico de 256kb', async () => {
        const response = await request(app)
            .post(WEBHOOK_ALIAS_PATH + '?key=super_secret_test_value')
            .send(crearPayloadSinteticoGrande(135 * 1024));

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ mensaje: 'Webhook FareHarbor recibido' });
        expect(db.state.eventos).toHaveLength(1);
    });

    test('POST con payload superior a 256kb responde 413 antes del controlador', async () => {
        const response = await request(app)
            .post(WEBHOOK_PATH + '?key=super_secret_test_value')
            .send(crearPayloadSinteticoGrande(270 * 1024));

        expect(response.status).toBe(413);
        expect(db.state.eventos).toHaveLength(0);
    });

    test('una ruta normal conserva el limite global de 100kb', async () => {
        const response = await request(app)
            .post('/api/auth/login')
            .send({
                correo: 'usuario@example.test',
                password: 'x'.repeat(135 * 1024)
            });

        expect(response.status).toBe(413);
    });

    test('POST con key correcta pero body no objeto responde 400', async () => {
        const response = await request(app)
            .post(WEBHOOK_PATH + '?key=super_secret_test_value')
            .send(['payload-no-objeto']);

        expect(response.status).toBe(400);
        expect(connectSpy).not.toHaveBeenCalled();
    });

    test('el secreto no aparece en respuesta ni logs', async () => {
        const response = await request(app)
            .post(WEBHOOK_PATH + '?key=super_secret_test_value')
            .send(crearPayload());
        const logText = consoleLogSpy.mock.calls.map((call) => call.join(' ')).join(' ');

        expect(response.status).toBe(200);
        expect(JSON.stringify(response.body)).not.toContain('super_secret_test_value');
        expect(logText).not.toContain('super_secret_test_value');
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test('debug responde 200 con resumen sanitizado sin PII y persiste evento minimo', async () => {
        process.env.FAREHARBOR_WEBHOOK_DEBUG = 'true';

        const response = await request(app)
            .post(WEBHOOK_PATH + '?key=super_secret_test_value')
            .send(crearPayloadConPii());
        const logText = JSON.stringify(consoleLogSpy.mock.calls);
        const persistedText = JSON.stringify(db.state.eventos[0].normalized_data);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ mensaje: 'Webhook FareHarbor recibido' });
        expect(logText).toContain('Webhook FareHarbor recibido (debug sanitizado):');
        expect(logText).toContain('11111111-2222-4333-8444-555555555555');
        expect(logText).not.toContain('super_secret_test_value');
        expect(logText).not.toContain('Maria Privada');
        expect(logText).not.toContain('maria.privada@example.test');
        expect(logText).not.toContain('+529981112233');
        expect(logText).not.toContain('tok_secreto_pago');
        expect(persistedText).toContain('Maria Privada');
        expect(persistedText).not.toContain('maria.privada@example.test');
        expect(persistedText).not.toContain('tok_secreto_pago');
    });
});
