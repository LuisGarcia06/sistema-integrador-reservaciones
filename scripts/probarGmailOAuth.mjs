import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  createGmailClient,
  obtenerClienteGmailAutorizado,
  toSafeGmailError,
} = require('../backend/integrations/getyourguide/getyourguideGmail.service.js');

async function probarGmail() {
  const auth = await obtenerClienteGmailAutorizado();
  const gmail = createGmailClient(auth);

  const result = await gmail.users.labels.list({
    userId: 'me',
  });

  console.log('Conexion con Gmail correcta');

  for (const label of result.data.labels ?? []) {
    console.log('-', label.name);
  }
}

try {
  await probarGmail();
} catch (error) {
  const safeError = toSafeGmailError(error);
  console.error('Error al conectar con Gmail:');
  console.error(safeError.message);
}