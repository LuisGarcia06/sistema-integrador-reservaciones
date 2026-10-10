const crypto = require('crypto');

const PROVIDER = 'fareharbor';
const SCHEMA_VERSION = 1;
const EXTERNAL_EVENT_ID_PREFIX = 'fh';
const SENSITIVE_STRUCT_KEY_PATTERN = /(email|phone|token|card|note|custom|secret|password|authorization)/i;

class FareHarborPayloadInvalidoError extends Error {
    constructor(message) {
        super(message);
        this.name = 'FareHarborPayloadInvalidoError';
    }
}

const esObjetoPlano = (value) => Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
);

const normalizarTexto = (value) => {
    if (value === undefined || value === null) {
        return null;
    }

    if (typeof value === 'string') {
        return value.trim() || null;
    }

    return value;
};

const normalizarEstructura = (value) => {
    if (value === undefined) {
        return null;
    }

    if (Array.isArray(value)) {
        return value.map(normalizarEstructura);
    }

    if (esObjetoPlano(value)) {
        return Object.keys(value).sort().reduce((acumulado, key) => {
            if (SENSITIVE_STRUCT_KEY_PATTERN.test(key)) {
                return acumulado;
            }

            acumulado[key] = normalizarEstructura(value[key]);
            return acumulado;
        }, {});
    }

    return normalizarTexto(value);
};

const ordenarObjeto = (value) => {
    if (Array.isArray(value)) {
        return value.map(ordenarObjeto);
    }

    if (esObjetoPlano(value)) {
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

const obtenerCustomerTypeRate = (customer = {}) => (
    customer.customer_type_rate?.customer_type
    || customer.customer_type_rate
    || {}
);

const crearClaveCategoria = ({ customer_type_pk, singular, plural }) => (
    [
        customer_type_pk === null ? '' : String(customer_type_pk),
        singular || '',
        plural || ''
    ].join('|')
);

const normalizarCategoriaPasajero = (customer = {}) => {
    const customerType = obtenerCustomerTypeRate(customer);

    return {
        customer_type_pk: normalizarTexto(customerType.pk),
        singular: normalizarTexto(customerType.singular),
        plural: normalizarTexto(customerType.plural)
    };
};

const agruparCustomersPorCategoria = (customers = []) => {
    if (!Array.isArray(customers)) {
        return [];
    }

    const categorias = customers.reduce((acumulado, customer) => {
        const categoria = normalizarCategoriaPasajero(customer);
        const clave = crearClaveCategoria(categoria);

        if (!acumulado.has(clave)) {
            acumulado.set(clave, {
                ...categoria,
                count: 0
            });
        }

        acumulado.get(clave).count += 1;
        return acumulado;
    }, new Map());

    return Array.from(categorias.values()).sort((a, b) => {
        const porPk = String(a.customer_type_pk || '').localeCompare(String(b.customer_type_pk || ''));

        if (porPk !== 0) {
            return porPk;
        }

        const porSingular = String(a.singular || '').localeCompare(String(b.singular || ''));

        if (porSingular !== 0) {
            return porSingular;
        }

        return String(a.plural || '').localeCompare(String(b.plural || ''));
    });
};

const normalizarBooking = (booking = {}) => {
    if (!esObjetoPlano(booking)) {
        throw new FareHarborPayloadInvalidoError('booking debe ser un objeto');
    }

    const uuid = normalizarTexto(booking.uuid);

    if (!uuid) {
        throw new FareHarborPayloadInvalidoError('booking.uuid es requerido');
    }

    const availability = esObjetoPlano(booking.availability) ? booking.availability : {};
    const item = esObjetoPlano(availability.item) ? availability.item : {};
    const company = esObjetoPlano(booking.company) ? booking.company : {};
    const contact = esObjetoPlano(booking.contact) ? booking.contact : {};

    return {
        schema_version: SCHEMA_VERSION,
        external_booking_id: uuid,
        booking: {
            uuid,
            pk: normalizarTexto(booking.pk),
            display_id: normalizarTexto(booking.display_id),
            status: normalizarTexto(booking.status),
            created_at: normalizarTexto(booking.created_at)
        },
        availability: {
            pk: normalizarTexto(availability.pk),
            start_at: normalizarTexto(availability.start_at),
            end_at: normalizarTexto(availability.end_at),
            item: {
                pk: normalizarTexto(item.pk),
                name: normalizarTexto(item.name),
                headline: normalizarTexto(item.headline)
            }
        },
        customers: {
            total: normalizarTexto(booking.customer_count),
            by_category: agruparCustomersPorCategoria(booking.customers)
        },
        contact: {
            name: normalizarTexto(contact.name),
            normalized_phone: normalizarTexto(contact.normalized_phone)
        },
        pickup: {
            pickup: normalizarEstructura(booking.pickup),
            lodging: normalizarEstructura(booking.lodging),
            arrival: normalizarEstructura(booking.arrival)
        },
        money: {
            invoice_price: normalizarTexto(booking.invoice_price),
            receipt_total: normalizarTexto(booking.receipt_total),
            amount_paid: normalizarTexto(booking.amount_paid),
            currency: normalizarTexto(company.currency)
        }
    };
};

const crearNormalizedDataFareHarbor = (booking = {}) => {
    const snapshot = normalizarBooking(booking);
    const fingerprint = crearPayloadFingerprint(snapshot);

    return {
        ...snapshot,
        fingerprint
    };
};

const crearExternalEventIdFareHarbor = (externalBookingId, fingerprint) => (
    `${EXTERNAL_EVENT_ID_PREFIX}:${externalBookingId}:${fingerprint}`
);

const normalizarPayloadWebhookFareHarbor = (payload = {}) => {
    if (!esObjetoPlano(payload) || !esObjetoPlano(payload.booking)) {
        throw new FareHarborPayloadInvalidoError('payload.booking es requerido');
    }

    const normalizedData = crearNormalizedDataFareHarbor(payload.booking);

    return {
        provider: PROVIDER,
        external_booking_id: normalizedData.external_booking_id,
        booking_key: normalizedData.external_booking_id,
        status: normalizedData.booking.status,
        payload_fingerprint: normalizedData.fingerprint,
        external_event_id: crearExternalEventIdFareHarbor(
            normalizedData.external_booking_id,
            normalizedData.fingerprint
        ),
        normalized_data: normalizedData
    };
};

module.exports = {
    EXTERNAL_EVENT_ID_PREFIX,
    FareHarborPayloadInvalidoError,
    PROVIDER,
    SCHEMA_VERSION,
    crearExternalEventIdFareHarbor,
    crearNormalizedDataFareHarbor,
    crearPayloadFingerprint,
    normalizarBooking,
    normalizarPayloadWebhookFareHarbor,
    ordenarObjeto
};
