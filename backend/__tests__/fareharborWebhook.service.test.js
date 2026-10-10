const {
    crearResumenWebhookFareHarborSanitizado,
    extraerBookingUuid,
    obtenerBookingActualizado,
    procesarPayloadWebhookFareHarbor,
    registrarWebhookRecibido,
    validarWebhookKey
} = require('../integrations/fareharbor/fareharborWebhook.service');
const {
    crearPayloadWebhookFareHarborSanitizado
} = require('./fixtures/fareharbor.booking.fixture');

const crearPayloadFareHarborConPii = () => ({
    type: 'booking.updated',
    webhook_secret_echo: 'super_secret_test_value',
    booking: {
        pk: 10001,
        uuid: '11111111-2222-4333-8444-555555555555',
        display_id: 'FH-TEST-001',
        status: 'cancelled',
        cancellation: {
            reason: 'Cliente compartio datos privados'
        },
        availability: {
            start_at: '2026-10-10T08:00:00-05:00',
            end_at: '2026-10-10T12:00:00-05:00',
            item: {
                pk: 77,
                name: 'Tour Sian Kaan',
                location: {
                    address: 'Muelle Confidencial 123'
                }
            }
        },
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
                phone: '+529984445566',
                note: 'Alergia privada',
                custom_field_values: [
                    {
                        name: 'Hotel',
                        value: 'Hotel Confidencial'
                    }
                ]
            }
        ],
        payments: [
            {
                pk: 9001,
                amount: '150.00',
                card_last_four: '4242',
                token: 'tok_secreto_pago'
            }
        ],
        refunds: [
            {
                pk: 8001,
                amount: '50.00',
                reason: 'Cancelacion parcial'
            }
        ],
        pickup: {
            address: 'Hotel Confidencial',
            time: '08:00'
        },
        meeting: {
            location: {
                name: 'Punto Privado',
                address: 'Entrada Reservada'
            }
        },
        note: 'Nota privada del cliente',
        custom_field_values: [
            {
                name: 'Habitacion',
                value: '301 privada'
            }
        ],
        internal_secret: 'super_secret_test_value'
    }
});

describe('fareharborWebhook.service', () => {
    test('validarWebhookKey rechaza si el secreto no esta configurado', () => {
        expect(validarWebhookKey(undefined, {})).toEqual({
            valid: false,
            status: 500,
            message: 'Webhook FareHarbor no configurado'
        });
    });

    test('validarWebhookKey rechaza key faltante cuando el secreto esta configurado', () => {
        expect(validarWebhookKey(undefined, {
            FAREHARBOR_WEBHOOK_SECRET: 'KEY_CORRECTA'
        })).toEqual({
            valid: false,
            status: 401,
            message: 'Webhook FareHarbor no autorizado'
        });
    });

    test('validarWebhookKey rechaza key incorrecta cuando FAREHARBOR_WEBHOOK_SECRET esta configurado', () => {
        expect(validarWebhookKey('KEY_INCORRECTA', {
            FAREHARBOR_WEBHOOK_SECRET: 'KEY_CORRECTA'
        })).toEqual({
            valid: false,
            status: 403,
            message: 'Webhook FareHarbor no autorizado'
        });
    });

    test('validarWebhookKey acepta key correcta', () => {
        expect(validarWebhookKey('KEY_CORRECTA', {
            FAREHARBOR_WEBHOOK_SECRET: 'KEY_CORRECTA'
        })).toEqual({
            valid: true,
            status: 200,
            message: 'Webhook FareHarbor autorizado'
        });
    });

    test('crearResumenWebhookFareHarborSanitizado conserva estructura e identificadores tecnicos sin PII', () => {
        const payload = crearPayloadFareHarborConPii();
        const resumen = crearResumenWebhookFareHarborSanitizado(payload);
        const resumenTexto = JSON.stringify(resumen);

        expect(resumen.top_level_keys).toEqual(['booking', 'type', 'webhook_secret_echo']);
        expect(resumen.booking.uuid).toBe(payload.booking.uuid);
        expect(resumen.booking.pk).toBe(payload.booking.pk);
        expect(resumen.booking.display_id).toBe(payload.booking.display_id);
        expect(resumen.booking.status).toBe('cancelled');
        expect(resumen.booking.availability.keys).toEqual(['end_at', 'item', 'start_at']);
        expect(resumen.booking.availability.start_at).toBe(payload.booking.availability.start_at);
        expect(resumen.booking.availability.end_at).toBe(payload.booking.availability.end_at);
        expect(resumen.booking.contact.keys).toEqual(['address', 'email', 'name', 'phone']);
        expect(resumen.booking.customers.count).toBe(1);
        expect(resumen.booking.customers.item_keys).toEqual([
            'custom_field_values',
            'email',
            'name',
            'note',
            'phone'
        ]);
        expect(resumen.booking.payments.item_keys).toEqual(['amount', 'card_last_four', 'pk', 'token']);
        expect(resumen.booking.payments.redacted_item_value_keys).toEqual(['card_last_four', 'token']);
        expect(resumen.booking.pickup_arrival_meeting_location_keys.map((entry) => entry.path)).toEqual([
            'availability.item.location',
            'meeting',
            'meeting.location',
            'pickup'
        ]);
        expect(resumen.booking.note_custom_field_keys.map((entry) => entry.path)).toEqual([
            'custom_field_values',
            'customers.[0].custom_field_values',
            'customers.[0].note',
            'note'
        ]);

        expect(resumenTexto).toContain(payload.booking.uuid);
        expect(resumenTexto).not.toContain('Maria Privada');
        expect(resumenTexto).not.toContain('maria.privada@example.test');
        expect(resumenTexto).not.toContain('+529981112233');
        expect(resumenTexto).not.toContain('Calle Secreta 45');
        expect(resumenTexto).not.toContain('Hotel Confidencial');
        expect(resumenTexto).not.toContain('Nota privada del cliente');
        expect(resumenTexto).not.toContain('tok_secreto_pago');
        expect(resumenTexto).not.toContain('super_secret_test_value');
    });

    test('registrarWebhookRecibido en debug imprime resumen sanitizado', () => {
        const payload = crearPayloadFareHarborConPii();
        const logger = {
            log: jest.fn()
        };

        registrarWebhookRecibido(payload, {
            env: { FAREHARBOR_WEBHOOK_DEBUG: 'true' },
            logger
        });

        const logText = JSON.stringify(logger.log.mock.calls);

        expect(logger.log).toHaveBeenCalledTimes(1);
        expect(logger.log.mock.calls[0][0]).toBe('Webhook FareHarbor recibido (debug sanitizado):');
        expect(logText).toContain(payload.booking.uuid);
        expect(logText).not.toContain('Maria Privada');
        expect(logText).not.toContain('maria.privada@example.test');
        expect(logText).not.toContain('+529981112233');
        expect(logText).not.toContain('Hotel Confidencial');
        expect(logText).not.toContain('super_secret_test_value');
    });

    test('registrarWebhookRecibido sin debug no imprime payload', () => {
        const logger = {
            log: jest.fn()
        };

        registrarWebhookRecibido(crearPayloadFareHarborConPii(), {
            env: { FAREHARBOR_WEBHOOK_DEBUG: 'false' },
            logger
        });

        expect(logger.log).toHaveBeenCalledWith('Webhook FareHarbor recibido');
        expect(JSON.stringify(logger.log.mock.calls)).not.toContain('11111111-2222-4333-8444-555555555555');
    });

    test('procesarPayloadWebhookFareHarbor normaliza sin persistir en PostgreSQL', () => {
        const payload = crearPayloadWebhookFareHarborSanitizado();
        const evento = procesarPayloadWebhookFareHarbor(payload);

        expect(evento.provider).toBe('fareharbor');
        expect(evento.external_booking_id).toBe(payload.booking.uuid);
        expect(evento.booking_key).toBe(payload.booking.uuid);
    });

    test('procesarPayloadWebhookFareHarbor no ignora cambios legitimos con el mismo UUID', () => {
        const uuid = '22222222-3333-4444-8555-666666666666';
        const creado = procesarPayloadWebhookFareHarbor(
            crearPayloadWebhookFareHarborSanitizado({ uuid, status: 'booked' })
        );
        const cancelado = procesarPayloadWebhookFareHarbor(
            crearPayloadWebhookFareHarborSanitizado({ uuid, status: 'cancelled' })
        );

        expect(creado.booking_key).toBe(cancelado.booking_key);
        expect(creado.status).toBe('booked');
        expect(cancelado.status).toBe('cancelled');
        expect(creado.payload_fingerprint).not.toBe(cancelado.payload_fingerprint);
    });

    test('extraerBookingUuid obtiene el UUID del booking recibido', () => {
        const payload = crearPayloadWebhookFareHarborSanitizado();

        expect(extraerBookingUuid(payload)).toBe(payload.booking.uuid);
    });

    test('obtenerBookingActualizado prepara la reconsulta por UUID sin ejecutarla en pruebas de webhook', async () => {
        const client = {
            obtenerReserva: jest.fn().mockResolvedValue({
                booking: {
                    uuid: '11111111-2222-4333-8444-555555555555'
                }
            })
        };

        const resultado = await obtenerBookingActualizado({
            bookingUuid: '11111111-2222-4333-8444-555555555555',
            shortname: 'company_test',
            client
        });

        expect(client.obtenerReserva).toHaveBeenCalledWith(
            'company_test',
            '11111111-2222-4333-8444-555555555555'
        );
        expect(resultado.booking.uuid).toBe('11111111-2222-4333-8444-555555555555');
    });
});
