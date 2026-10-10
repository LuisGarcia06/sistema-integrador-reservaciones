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

const SENSITIVE_KEY_PATTERN = /(name|email|phone|address|street|customer|contact|note|custom|secret|token|password|authorization|card)/i;

const obtenerKeys = (value) => (
    value && typeof value === 'object' && !Array.isArray(value)
        ? Object.keys(value).sort()
        : []
);

const obtenerKeysSensibles = (keys = []) => keys.filter((key) => SENSITIVE_KEY_PATTERN.test(key));

const crearResumenEstructura = (value) => {
    if (Array.isArray(value)) {
        const itemKeys = obtenerKeys(value[0]);

        return {
            type: 'array',
            count: value.length,
            item_keys: itemKeys,
            redacted_item_value_keys: obtenerKeysSensibles(itemKeys)
        };
    }

    if (value && typeof value === 'object') {
        const keys = obtenerKeys(value);

        return {
            type: 'object',
            keys,
            redacted_value_keys: obtenerKeysSensibles(keys)
        };
    }

    return {
        type: value === null ? 'null' : typeof value
    };
};

const buscarEstructurasPorKey = (value, pattern, path = []) => {
    if (!value || typeof value !== 'object') {
        return [];
    }

    if (Array.isArray(value)) {
        return value.flatMap((item, index) => buscarEstructurasPorKey(item, pattern, path.concat(`[${index}]`)));
    }

    return Object.keys(value).sort().flatMap((key) => {
        const child = value[key];
        const childPath = path.concat(key);
        const match = pattern.test(key)
            ? [{
                path: childPath.join('.'),
                structure: crearResumenEstructura(child)
            }]
            : [];

        return match.concat(buscarEstructurasPorKey(child, pattern, childPath));
    });
};

const crearResumenWebhookFareHarborSanitizado = (payload = {}) => {
    const booking = payload.booking || {};
    const availability = booking.availability || {};
    const item = booking.item || availability.item || null;
    const product = booking.product || availability.product || null;

    return {
        top_level_keys: obtenerKeys(payload),
        booking: {
            keys: obtenerKeys(booking),
            uuid: booking.uuid || null,
            pk: booking.pk || null,
            display_id: booking.display_id || null,
            status: booking.status || booking.state || null,
            cancellation: crearResumenEstructura(booking.cancellation || booking.cancelled || booking.canceled || null),
            availability: {
                keys: obtenerKeys(availability),
                start_at: booking.start_at || availability.start_at || null,
                end_at: booking.end_at || availability.end_at || null
            },
            item: crearResumenEstructura(item),
            product: crearResumenEstructura(product),
            customers: crearResumenEstructura(booking.customers || booking.customer || []),
            contact: crearResumenEstructura(booking.contact || null),
            customer: crearResumenEstructura(booking.customer || null),
            payments: crearResumenEstructura(booking.payments || []),
            refunds: crearResumenEstructura(booking.refunds || []),
            pickup_arrival_meeting_location_keys: buscarEstructurasPorKey(booking, /(pickup|arrival|meeting|location)/i),
            note_custom_field_keys: buscarEstructurasPorKey(booking, /(note|custom(?!er))/i)
        }
    };
};

const registrarWebhookRecibido = (payload, {
    env = process.env,
    logger = console
} = {}) => {
    if (String(env.FAREHARBOR_WEBHOOK_DEBUG || '').toLowerCase() === 'true') {
        logger.log(
            'Webhook FareHarbor recibido (debug sanitizado):',
            crearResumenWebhookFareHarborSanitizado(payload)
        );
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
    crearResumenWebhookFareHarborSanitizado,
    esPayloadObjeto,
    extraerBookingUuid,
    obtenerBookingActualizado,
    procesarPayloadWebhookFareHarbor,
    registrarWebhookRecibido,
    validarWebhookKey
};
