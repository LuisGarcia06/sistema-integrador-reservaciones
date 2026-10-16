import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  GETYOURGUIDE_FROM_QUERY,
  createGmailClient,
  getHeader,
  obtenerClienteGmailAutorizado,
  toSafeGmailError,
} = require('../backend/integrations/getyourguide/getyourguideGmail.service.js');

async function probarGetYourGuide() {
  const auth = await obtenerClienteGmailAutorizado();
  const gmail = createGmailClient(auth);

  const response = await gmail.users.messages.list({
    userId: 'me',
    q: GETYOURGUIDE_FROM_QUERY,
    maxResults: 10,
  });

  const messages = response.data.messages ?? [];

  console.log(`Correos de GetYourGuide encontrados: ${messages.length}`);

  for (const message of messages) {
    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: message.id,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'Date'],
    });

    const headers = detail.data.payload?.headers ?? [];

    console.log('-----------------------------');
    console.log('Message ID:', message.id);
    console.log('Thread ID:', message.threadId);
    console.log('From:', getHeader(headers, 'From'));
    console.log('Subject:', getHeader(headers, 'Subject'));
    console.log('Date:', getHeader(headers, 'Date'));
  }
}

try {
  await probarGetYourGuide();
} catch (error) {
  const safeError = toSafeGmailError(error);
  console.error('Error al consultar GetYourGuide:');
  console.error(safeError.message);
}