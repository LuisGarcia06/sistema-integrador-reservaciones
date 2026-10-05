const fareharborClient = require('./fareharbor.client');
const {
    normalizarPayloadWebhookFareHarbor
} = require('./fareharbor.mapper');

const validarWebhookKey = (queryKey, env = process.env) => {
    const expectedKey = env.FAREHARBOR_WEBHOOK_KEY;

    if (!expectedKey) {
        return true;
    }

    return queryKey === expectedKey;
};

const extraerBookingUuid = (payload = {}) => payload.booking?.uuid || null;

const obtenerBookingActualizado = async ({
    bookingUuid,
    shortname = process.env.FAREHARBOR_COMPANY_SHORTNAME,
    client = fareharborClient
} = {}) => {
    if (!bookingUuid) {
        return null;
    }

    return client.obtenerReserva(shortname, bookingUuid);
};

const procesarPayloadWebhookFareHarbor = (payload = {}) => {
    const eventoNormalizado = normalizarPayloadWebhookFareHarbor(payload);

    if (eventoNormalizado) {
        console.log('Evento normalizado de FareHarbor:', {
            provider: eventoNormalizado.provider,
            external_booking_id: eventoNormalizado.external_booking_id,
            booking_key: eventoNormalizado.booking_key,
            status: eventoNormalizado.status,
            payload_fingerprint: eventoNormalizado.payload_fingerprint
        });
    }

    return eventoNormalizado;
};

module.exports = {
    extraerBookingUuid,
    obtenerBookingActualizado,
    procesarPayloadWebhookFareHarbor,
    validarWebhookKey
};
