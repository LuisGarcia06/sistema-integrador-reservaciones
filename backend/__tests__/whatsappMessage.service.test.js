const { enviarMensajeTextoWhatsapp } = require('../services/whatsappMessage.service');

const ENV_ORIGINAL = process.env;

const configurarEntornoWhatsapp = () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'TEST_ACCESS_TOKEN';
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'PHONE_NUMBER_TEST_ID';
    process.env.WHATSAPP_GRAPH_API_VERSION = 'v99.0';
};

describe('enviarMensajeTextoWhatsapp', () => {
    beforeEach(() => {
        jest.resetModules();
        process.env = { ...ENV_ORIGINAL };
        configurarEntornoWhatsapp();
        global.fetch = jest.fn();
    });

    afterEach(() => {
        process.env = ENV_ORIGINAL;
        delete global.fetch;
    });

    test('envía mensaje de texto y devuelve el message ID de Meta', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({
                messages: [
                    {
                        id: 'wamid.TEST_MESSAGE_ID'
                    }
                ]
            })
        });

        const resultado = await enviarMensajeTextoWhatsapp(
            'DESTINATARIO_TEST_ID',
            'Mensaje de prueba'
        );

        expect(global.fetch).toHaveBeenCalledWith(
            'https://graph.facebook.com/v99.0/PHONE_NUMBER_TEST_ID/messages',
            {
                method: 'POST',
                headers: {
                    Authorization: 'Bearer TEST_ACCESS_TOKEN',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    to: 'DESTINATARIO_TEST_ID',
                    type: 'text',
                    text: {
                        body: 'Mensaje de prueba'
                    }
                })
            }
        );
        expect(resultado).toEqual({
            provider: 'whatsapp',
            message_id: 'wamid.TEST_MESSAGE_ID'
        });
    });

    test.each([
        ['destinatario faltante', '', 'Mensaje de prueba', 'destinatario'],
        ['texto faltante', 'DESTINATARIO_TEST_ID', '   ', 'texto']
    ])('rechaza %s', async (_caso, destinatario, texto, field) => {
        await expect(enviarMensajeTextoWhatsapp(destinatario, texto)).rejects.toMatchObject({
            statusCode: 400,
            code: 'WHATSAPP_VALIDATION_ERROR',
            details: { field }
        });
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('rechaza configuración incompleta sin llamar a Meta', async () => {
        delete process.env.WHATSAPP_ACCESS_TOKEN;

        await expect(
            enviarMensajeTextoWhatsapp('DESTINATARIO_TEST_ID', 'Mensaje de prueba')
        ).rejects.toMatchObject({
            statusCode: 500,
            code: 'WHATSAPP_CONFIG_MISSING',
            details: {
                variables: ['WHATSAPP_ACCESS_TOKEN']
            }
        });
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('convierte errores de Meta en errores controlados sin exponer token', async () => {
        global.fetch.mockResolvedValue({
            ok: false,
            status: 400,
            json: jest.fn().mockResolvedValue({
                error: {
                    message: 'Invalid recipient',
                    type: 'OAuthException',
                    code: 100,
                    error_subcode: 2018001,
                    error_data: {
                        details: 'Recipient phone number not in allowed list'
                    },
                    fbtrace_id: 'TRACE_TEST_ID'
                }
            })
        });

        const errorCapturado = await enviarMensajeTextoWhatsapp(
            'DESTINATARIO_TEST_ID',
            'Mensaje de prueba'
        ).catch((error) => error);

        expect(errorCapturado).toBeInstanceOf(Error);
        expect(errorCapturado.message).toBe('Invalid recipient');
        expect(errorCapturado.statusCode).toBe(400);
        expect(errorCapturado.code).toBe('WHATSAPP_META_ERROR');
        expect(errorCapturado.details).toEqual({
            meta_error: {
                message: 'Invalid recipient',
                type: 'OAuthException',
                code: 100,
                error_subcode: 2018001,
                error_data_details: 'Recipient phone number not in allowed list'
            }
        });
        expect(JSON.stringify(errorCapturado)).not.toContain('TEST_ACCESS_TOKEN');
        expect(JSON.stringify(errorCapturado)).not.toContain('PHONE_NUMBER_TEST_ID');
        expect(JSON.stringify(errorCapturado)).not.toContain('TRACE_TEST_ID');
    });
});



