const {
    EVENT_TYPES,
    normalizarPayloadWebhookWhatsapp
} = require('../services/whatsappWebhook.service');

const crearPayloadMensajeTexto = () => ({
    object: 'whatsapp_business_account',
    entry: [
        {
            id: 'WABA_TEST_ID',
            changes: [
                {
                    field: 'messages',
                    value: {
                        metadata: {
                            phone_number_id: 'PHONE_NUMBER_TEST_ID'
                        },
                        contacts: [
                            {
                                profile: {
                                    name: 'CONTACT_TEST_NAME'
                                },
                                wa_id: 'CONTACT_WA_ID_TEST'
                            }
                        ],
                        messages: [
                            {
                                from: 'CONTACT_WA_ID_TEST',
                                id: 'MSG_TEST_001',
                                timestamp: '1700000000',
                                text: {
                                    body: 'Mensaje de prueba'
                                },
                                type: 'text'
                            }
                        ]
                    }
                }
            ]
        }
    ]
});

const crearPayloadEstado = () => ({
    object: 'whatsapp_business_account',
    entry: [
        {
            id: 'WABA_TEST_ID',
            changes: [
                {
                    field: 'messages',
                    value: {
                        metadata: {
                            phone_number_id: 'PHONE_NUMBER_TEST_ID'
                        },
                        statuses: [
                            {
                                id: 'MSG_TEST_001',
                                recipient_id: 'CONTACT_WA_ID_TEST',
                                status: 'delivered',
                                timestamp: '1700000100'
                            }
                        ]
                    }
                }
            ]
        }
    ]
});

describe('normalizarPayloadWebhookWhatsapp', () => {
    test('normaliza mensajes entrantes de texto de WhatsApp Cloud API', () => {
        const eventos = normalizarPayloadWebhookWhatsapp(crearPayloadMensajeTexto());

        expect(eventos).toEqual([
            {
                provider: 'whatsapp',
                event_type: EVENT_TYPES.MESSAGE,
                waba_id: 'WABA_TEST_ID',
                phone_number_id: 'PHONE_NUMBER_TEST_ID',
                message_id: 'MSG_TEST_001',
                deduplication_key: 'MSG_TEST_001',
                from: 'CONTACT_WA_ID_TEST',
                contact_name: 'CONTACT_TEST_NAME',
                timestamp: '1700000000',
                message_type: 'text',
                text: 'Mensaje de prueba'
            }
        ]);
    });

    test('distingue actualizaciones de estado mediante value.statuses', () => {
        const eventos = normalizarPayloadWebhookWhatsapp(crearPayloadEstado());

        expect(eventos).toEqual([
            {
                provider: 'whatsapp',
                event_type: EVENT_TYPES.STATUS,
                waba_id: 'WABA_TEST_ID',
                phone_number_id: 'PHONE_NUMBER_TEST_ID',
                message_id: 'MSG_TEST_001',
                deduplication_key: 'MSG_TEST_001',
                recipient_id: 'CONTACT_WA_ID_TEST',
                timestamp: '1700000100',
                status: 'delivered'
            }
        ]);
    });

    test('ignora cambios que no corresponden a field messages', () => {
        const eventos = normalizarPayloadWebhookWhatsapp({
            entry: [
                {
                    id: 'WABA_TEST_ID',
                    changes: [
                        {
                            field: 'account_update',
                            value: {}
                        }
                    ]
                }
            ]
        });

        expect(eventos).toEqual([]);
    });

    test('devuelve lista vacia si el payload no contiene eventos procesables', () => {
        expect(normalizarPayloadWebhookWhatsapp({})).toEqual([]);
    });
});
