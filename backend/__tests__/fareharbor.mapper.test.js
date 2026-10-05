const {
    crearPayloadFingerprint,
    normalizarBooking,
    normalizarPayloadWebhookFareHarbor
} = require('../integrations/fareharbor/fareharbor.mapper');
const {
    crearBookingFareHarborSanitizado,
    crearPayloadWebhookFareHarborSanitizado
} = require('./fixtures/fareharbor.booking.fixture');

describe('fareharbor.mapper', () => {
    test('normaliza un booking de FareHarbor sin asumir columnas internas', () => {
        const booking = crearBookingFareHarborSanitizado();
        const normalizado = normalizarBooking(booking);

        expect(normalizado).toEqual({
            provider: 'fareharbor',
            external_booking_id: booking.uuid,
            booking_key: booking.uuid,
            status: 'booked',
            contact: booking.contact,
            booking: {
                uuid: booking.uuid,
                display_id: 'FH-TEST-001',
                pk: 10001
            },
            payload_fingerprint: expect.any(String),
            raw: booking
        });
    });

    test('dos webhooks con el mismo UUID pertenecen a la misma reserva', () => {
        const uuid = '22222222-3333-4444-8555-666666666666';
        const creado = normalizarPayloadWebhookFareHarbor(
            crearPayloadWebhookFareHarborSanitizado({ uuid, status: 'booked' })
        );
        const actualizado = normalizarPayloadWebhookFareHarbor(
            crearPayloadWebhookFareHarborSanitizado({ uuid, status: 'cancelled' })
        );

        expect(creado.external_booking_id).toBe(uuid);
        expect(actualizado.external_booking_id).toBe(uuid);
        expect(creado.booking_key).toBe(uuid);
        expect(actualizado.booking_key).toBe(uuid);
    });

    test('un segundo webhook con el mismo UUID pero diferente estado no se identifica como payload repetido', () => {
        const uuid = '33333333-4444-4555-8666-777777777777';
        const creado = normalizarPayloadWebhookFareHarbor(
            crearPayloadWebhookFareHarborSanitizado({ uuid, status: 'booked' })
        );
        const cancelado = normalizarPayloadWebhookFareHarbor(
            crearPayloadWebhookFareHarborSanitizado({ uuid, status: 'cancelled' })
        );

        expect(creado.booking_key).toBe(cancelado.booking_key);
        expect(creado.status).not.toBe(cancelado.status);
        expect(creado.payload_fingerprint).not.toBe(cancelado.payload_fingerprint);
    });

    test('dos payloads exactamente iguales pueden identificarse como repeticion futura', () => {
        const payload = crearPayloadWebhookFareHarborSanitizado();
        const primerWebhook = normalizarPayloadWebhookFareHarbor(payload);
        const segundoWebhook = normalizarPayloadWebhookFareHarbor({
            booking: {
                contact: payload.booking.contact,
                display_id: payload.booking.display_id,
                pk: payload.booking.pk,
                status: payload.booking.status,
                uuid: payload.booking.uuid
            }
        });

        expect(primerWebhook.booking_key).toBe(segundoWebhook.booking_key);
        expect(primerWebhook.payload_fingerprint).toBe(segundoWebhook.payload_fingerprint);
        expect(crearPayloadFingerprint(payload.booking)).toBe(primerWebhook.payload_fingerprint);
    });
});
