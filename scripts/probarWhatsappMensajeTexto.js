const path = require('path');
const dotenv = require('dotenv');
const { enviarMensajeTextoWhatsapp } = require('../backend/services/whatsappMessage.service');

dotenv.config({
    path: path.join(__dirname, '..', '.env'),
    quiet: true
});

const TEXTO_PRUEBA = 'Prueba de integración Community Tours';
const destinatario = process.argv[2];

const ejecutarPrueba = async () => {
    if (!destinatario || destinatario.trim() === '') {
        console.error('Uso: node scripts/probarWhatsappMensajeTexto.js NUMERO_DESTINATARIO');
        process.exitCode = 1;
        return;
    }

    try {
        const resultado = await enviarMensajeTextoWhatsapp(destinatario, TEXTO_PRUEBA);
        console.log(resultado.message_id);
    } catch (error) {
        console.error('Error al enviar mensaje de WhatsApp de prueba');

        if (error?.code === 'WHATSAPP_META_ERROR') {
            const metaError = error.details?.meta_error || {};

            if (metaError.message) {
                console.error(`error.message=${metaError.message}`);
            }

            if (metaError.type) {
                console.error(`error.type=${metaError.type}`);
            }

            if (metaError.code) {
                console.error(`error.code=${metaError.code}`);
            }

            if (metaError.error_subcode) {
                console.error(`error.error_subcode=${metaError.error_subcode}`);
            }

            if (metaError.error_data_details) {
                console.error(`error.error_data.details=${metaError.error_data_details}`);
            }
        } else if (error?.code) {
            console.error(`codigo=${error.code}`);
        }

        process.exitCode = 1;
    }
};

ejecutarPrueba();

