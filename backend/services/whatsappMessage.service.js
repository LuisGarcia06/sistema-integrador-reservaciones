const META_MESSAGES_ENDPOINT = 'https://graph.facebook.com';

const crearErrorServicio = (message, statusCode, code, details = null) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;

    if (details) {
        error.details = details;
    }

    return error;
};

const obtenerVariableEntorno = (name) => {
    const value = process.env[name];

    if (typeof value !== 'string' || value.trim() === '') {
        return null;
    }

    return value.trim();
};

const obtenerConfiguracionWhatsapp = () => {
    const accessToken = obtenerVariableEntorno('WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = obtenerVariableEntorno('WHATSAPP_PHONE_NUMBER_ID');
    const graphApiVersion = obtenerVariableEntorno('WHATSAPP_GRAPH_API_VERSION');
    const faltantes = [];

    if (!accessToken) faltantes.push('WHATSAPP_ACCESS_TOKEN');
    if (!phoneNumberId) faltantes.push('WHATSAPP_PHONE_NUMBER_ID');
    if (!graphApiVersion) faltantes.push('WHATSAPP_GRAPH_API_VERSION');

    if (faltantes.length > 0) {
        throw crearErrorServicio(
            'Configuración de WhatsApp incompleta',
            500,
            'WHATSAPP_CONFIG_MISSING',
            { variables: faltantes }
        );
    }

    return {
        accessToken,
        phoneNumberId,
        graphApiVersion
    };
};

const validarTextoRequerido = (value, fieldName) => {
    if (typeof value !== 'string' || value.trim() === '') {
        throw crearErrorServicio(
            `El campo ${fieldName} es obligatorio`,
            400,
            'WHATSAPP_VALIDATION_ERROR',
            { field: fieldName }
        );
    }

    return value.trim();
};

const leerRespuestaJson = async (response) => {
    try {
        return await response.json();
    } catch (_error) {
        return null;
    }
};

const crearErrorMeta = (response, responseBody) => {
    const metaError = responseBody?.error || {};
    const metaErrorSanitizado = {};

    if (metaError.message) {
        metaErrorSanitizado.message = metaError.message;
    }

    if (metaError.type) {
        metaErrorSanitizado.type = metaError.type;
    }

    if (metaError.code) {
        metaErrorSanitizado.code = metaError.code;
    }

    if (metaError.error_subcode) {
        metaErrorSanitizado.error_subcode = metaError.error_subcode;
    }

    if (metaError.error_data?.details) {
        metaErrorSanitizado.error_data_details = metaError.error_data.details;
    }

    return crearErrorServicio(
        metaError.message || 'Meta rechazó el envío del mensaje de WhatsApp',
        response.status,
        'WHATSAPP_META_ERROR',
        {
            meta_error: metaErrorSanitizado
        }
    );
};

const enviarMensajeTextoWhatsapp = async (destinatario, texto) => {
    const to = validarTextoRequerido(destinatario, 'destinatario');
    const body = validarTextoRequerido(texto, 'texto');
    const {
        accessToken,
        phoneNumberId,
        graphApiVersion
    } = obtenerConfiguracionWhatsapp();

    if (typeof fetch !== 'function') {
        throw crearErrorServicio(
            'Cliente HTTP no disponible para enviar mensajes de WhatsApp',
            500,
            'WHATSAPP_HTTP_CLIENT_UNAVAILABLE'
        );
    }

    const url = `${META_MESSAGES_ENDPOINT}/${graphApiVersion}/${phoneNumberId}/messages`;
    const payload = {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: {
            body
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    const responseBody = await leerRespuestaJson(response);

    if (!response.ok) {
        throw crearErrorMeta(response, responseBody);
    }

    const messageId = responseBody?.messages?.[0]?.id;

    if (!messageId) {
        throw crearErrorServicio(
            'Meta confirmó la solicitud, pero no devolvió message ID',
            502,
            'WHATSAPP_MESSAGE_ID_MISSING'
        );
    }

    return {
        provider: 'whatsapp',
        message_id: messageId
    };
};

module.exports = {
    enviarMensajeTextoWhatsapp
};

