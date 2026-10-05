const {
    extraerBookingUuid,
    obtenerBookingActualizado,
    procesarPayloadWebhookFareHarbor,
    validarWebhookKey
} = require('../integrations/fareharbor/fareharborWebhook.service');
const {
    crearPayloadWebhookFareHarborSanitizado
} = require('./fixtures/fareharbor.booking.fixture');

describe('fareharborWebhook.service', () => {
    test('validarWebhookKey permite payloads de prueba si no hay key configurada', () => {
        expect(validarWebhookKey(undefined, {})).toBe(true);
    });

    test('validarWebhookKey rechaza key incorrecta cuando FAREHARBOR_WEBHOOK_KEY esta configurada', () => {
        expect(validarWebhookKey('KEY_INCORRECTA', {
            FAREHARBOR_WEBHOOK_KEY: 'KEY_CORRECTA'
        })).toBe(false);
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
