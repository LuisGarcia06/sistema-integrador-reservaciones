const fareharborClient = require('./fareharbor.client');
const {
    normalizarPayloadWebhookFareHarbor
} = require('./fareharbor.mapper');

const obtenerWebhookSecret = (env = process.env) => {
    const secret = env.FAREHARBOR_WEBHOOK_SECRET;

    return typeof secret === 'string' ? secret.trim() : '';
};

const validarWebhookKey = (queryKey, env = process.env) => {
    const expectedKey = obtenerWebhookSecret(env);

    if (!expectedKey) {
        return {
            valid: false,
            status: 500,
            message: 'Webhook FareHarbor no configurado'
        };
    }

    if (!queryKey) {
        return {
            valid: false,
            status: 401,
            message: 'Webhook FareHarbor no autorizado'
        };
    }

    if (queryKey !== expectedKey) {
        return {
            valid: false,
            status: 403,
            message: 'Webhook FareHarbor no autorizado'
        };
    }

    return {
        valid: true,
        status: 200,
        message: 'Webhook FareHarbor autorizado'
    };
};

const esPayloadObjeto = (payload) => Boolean(
    payload
    && typeof payload === 'object'
    && !Array.isArray(payload)
);

const registrarWebhookRecibido = (payload, {
    env = process.env,
    logger = console
} = {}) => {
    if (String(env.FAREHARBOR_WEBHOOK_DEBUG || '').toLowerCase() === 'true') {
        logger.log('Webhook FareHarbor recibido:', payload);
        return;
    }

    logger.log('Webhook FareHarbor recibido');
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
    esPayloadObjeto,
    extraerBookingUuid,
    obtenerBookingActualizado,
    procesarPayloadWebhookFareHarbor,
    registrarWebhookRecibido,
    validarWebhookKey
};
