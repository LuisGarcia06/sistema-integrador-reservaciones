const crypto = require('crypto');

const PROVIDER = 'fareharbor';

const ordenarObjeto = (value) => {
    if (Array.isArray(value)) {
        return value.map(ordenarObjeto);
    }

    if (value && typeof value === 'object') {
        return Object.keys(value).sort().reduce((acumulado, key) => {
            acumulado[key] = ordenarObjeto(value[key]);
            return acumulado;
        }, {});
    }

    return value;
};

const crearPayloadFingerprint = (value = {}) => crypto
    .createHash('sha256')
    .update(JSON.stringify(ordenarObjeto(value)))
    .digest('hex');

const normalizarBooking = (booking = {}) => {
    const uuid = booking.uuid || null;

    return {
        provider: PROVIDER,
        external_booking_id: uuid,
        booking_key: uuid,
        status: booking.status || null,
        contact: booking.contact || null,
        booking: {
            uuid,
            display_id: booking.display_id || null,
            pk: booking.pk || null
        },
        payload_fingerprint: crearPayloadFingerprint(booking),
        raw: booking
    };
};

const normalizarPayloadWebhookFareHarbor = (payload = {}) => {
    if (!payload.booking) {
        return null;
    }

    return normalizarBooking(payload.booking);
};

module.exports = {
    PROVIDER,
    crearPayloadFingerprint,
    normalizarBooking,
    normalizarPayloadWebhookFareHarbor
};
