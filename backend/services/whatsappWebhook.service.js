const PROVIDER = 'whatsapp';
const EVENT_TYPES = {
    MESSAGE: 'message',
    STATUS: 'status'
};

const toArray = (value) => (Array.isArray(value) ? value : []);

const obtenerNombreContacto = (value, from) => {
    const contacts = toArray(value.contacts);
    const matchingContact = contacts.find((contact) => contact.wa_id === from) || contacts[0];

    return matchingContact?.profile?.name || null;
};

const normalizarMensaje = ({ entry, value, message }) => {
    const messageType = message.type || null;

    return {
        provider: PROVIDER,
        event_type: EVENT_TYPES.MESSAGE,
        waba_id: entry.id || null,
        phone_number_id: value.metadata?.phone_number_id || null,
        message_id: message.id || null,
        deduplication_key: message.id || null,
        from: message.from || null,
        contact_name: obtenerNombreContacto(value, message.from),
        timestamp: message.timestamp || null,
        message_type: messageType,
        text: messageType === 'text' ? message.text?.body || null : null
    };
};

const normalizarEstado = ({ entry, value, status }) => ({
    provider: PROVIDER,
    event_type: EVENT_TYPES.STATUS,
    waba_id: entry.id || null,
    phone_number_id: value.metadata?.phone_number_id || null,
    message_id: status.id || null,
    deduplication_key: status.id || null,
    recipient_id: status.recipient_id || null,
    timestamp: status.timestamp || null,
    status: status.status || null
});

const normalizarPayloadWebhookWhatsapp = (payload = {}) => {
    const eventos = [];

    toArray(payload.entry).forEach((entry) => {
        toArray(entry.changes).forEach((change) => {
            if (change.field !== 'messages') {
                return;
            }

            const value = change.value || {};

            toArray(value.messages).forEach((message) => {
                eventos.push(normalizarMensaje({ entry, value, message }));
            });

            toArray(value.statuses).forEach((status) => {
                eventos.push(normalizarEstado({ entry, value, status }));
            });
        });
    });

    return eventos;
};

const procesarPayloadWebhookWhatsapp = (payload = {}) => {
    const eventosNormalizados = normalizarPayloadWebhookWhatsapp(payload);

    if (eventosNormalizados.length > 0) {
        console.log('Eventos normalizados de WhatsApp:', eventosNormalizados);
    }

    return eventosNormalizados;
};

module.exports = {
    EVENT_TYPES,
    normalizarPayloadWebhookWhatsapp,
    procesarPayloadWebhookWhatsapp
};
