import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

const pool = require('../backend/config/database.js');
const { classifyGetYourGuideEmailSubject } = require('../backend/integrations/getyourguide/getyourguideEmailClassifier.js');
const {
  getCustomerNameDiagnostics,
} = require('../backend/integrations/getyourguide/getyourguideEmailParser.js');
const {
  obtenerClienteGmailAutorizado,
  createGmailClient,
  extractTextBody,
  extractEmailFromGmailMessage,
  getHeader,
  parseGetYourGuideGmailMessage,
  searchGetYourGuideMessages,
} = require('../backend/integrations/getyourguide/getyourguideGmail.service.js');
const {
  construirValoresInsertEventoIntegracion,
  normalizarEventoIntegracion,
  registrarEventoIntegracion,
} = require('../backend/services/eventosIntegracion.service.js');
const {
  getGmailMessageSourceReceivedAt,
  getSourceReceivedAtDiagnostics,
  toGetYourGuideIntegrationEvent,
} = require('../backend/integrations/getyourguide/getyourguide.mapper.js');

function sanitizeDiagnosticMessage(value) {
  if (!value) {
    return 'no_disponible';
  }

  return String(value)
    .replace(/access_token[=:][^\s&]+/gi, 'access_token=[redactado]')
    .replace(/refresh_token[=:][^\s&]+/gi, 'refresh_token=[redactado]')
    .replace(/client_secret[=:][^\s&]+/gi, 'client_secret=[redactado]')
    .replace(/authorization[=:]\s*bearer\s+[^\s]+/gi, 'authorization=bearer_[redactado]')
    .replace(/ya29\.[a-zA-Z0-9._-]+/g, 'ya29.[redactado]')
    .slice(0, 240);
}

function toDiagnosticValue(value) {
  if (value === undefined || value === null || value === '') {
    return 'no_disponible';
  }

  return String(value).replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 80);
}

function diagnosticarErrorSeguro(error) {
  return {
    status: toDiagnosticValue(error?.response?.status),
    code: toDiagnosticValue(error?.code),
    apiStatus: toDiagnosticValue(error?.response?.data?.error?.status),
    reason: toDiagnosticValue(error?.errors?.[0]?.reason),
    messageSanitizado: sanitizeDiagnosticMessage(error?.message),
  };
}

function imprimirErrorSeguro(error) {
  const diagnostico = diagnosticarErrorSeguro(error);

  console.log(`status: ${diagnostico.status}`);
  console.log(`code: ${diagnostico.code}`);
  console.log(`apiStatus: ${diagnostico.apiStatus}`);
  console.log(`reason: ${diagnostico.reason}`);
  console.log(`messageSanitizado: ${diagnostico.messageSanitizado}`);
}

async function ejecutarPasoDiagnostico(etiqueta, accion) {
  try {
    const resultado = await accion();
    console.log(`${etiqueta}: OK`);
    return { ok: true, resultado };
  } catch (error) {
    console.log(`${etiqueta}: ERROR`);
    imprimirErrorSeguro(error);
    return { ok: false };
  }
}

function reportarPasoError(etiqueta, message) {
  console.log(`${etiqueta}: ERROR`);
  imprimirErrorSeguro(new Error(message));
}


function construirEventoPersistible(gmailMessage, event) {
  const headers = gmailMessage?.payload?.headers ?? [];

  return toGetYourGuideIntegrationEvent(event, {
    source_subject: getHeader(headers, 'Subject'),
    source_received_at: getGmailMessageSourceReceivedAt(gmailMessage),
  });
}

function obtenerClavesSeguras(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }

  return Object.keys(value).sort();
}

function imprimirResumenClaves(etiqueta, value) {
  const claves = obtenerClavesSeguras(value);

  console.log(`${etiqueta} cantidad: ${claves.length}`);
  console.log(`${etiqueta} claves: ${claves.length > 0 ? claves.join(', ') : '(ninguna)'}`);
}

function obtenerJsonbNormalizadoDesdeParametros(eventoNormalizado) {
  const values = construirValoresInsertEventoIntegracion(eventoNormalizado);
  return JSON.parse(values[7]);
}

async function obtenerMensajePorId(gmail, messageId) {
  return gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });
}

async function existeEventoIntegracion(db, messageId) {
  const result = await db.query(
    `
      SELECT 1
      FROM eventos_integracion
      WHERE provider = $1
        AND external_event_id = $2
      LIMIT 1
    `,
    ['getyourguide', messageId],
  );

  return result.rows.length > 0;
}

async function buscarNuevoGetYourGuideNewBooking({
  gmail,
  db,
  maxCandidates = 50,
  buscarMensajes = searchGetYourGuideMessages,
  obtenerMensaje = obtenerMensajePorId,
  existeEvento = existeEventoIntegracion,
  parseMessage = parseGetYourGuideGmailMessage,
  extraerEmail = extractEmailFromGmailMessage,
  clasificarSubject = classifyGetYourGuideEmailSubject,
} = {}) {
  const messages = await buscarMensajes(gmail, {
    maxResults: maxCandidates,
    diagnosticLogger: { log() {} },
  });
  const candidatos = messages.slice(0, maxCandidates).filter((message) => message?.id);

  for (const message of candidatos) {
    const response = await obtenerMensaje(gmail, message.id);
    const gmailMessage = response?.data ?? response;
    const email = extraerEmail(gmailMessage);
    const classification = clasificarSubject(email.subject);

    if (classification.event_type !== 'new_booking') {
      continue;
    }

    const yaExiste = await existeEvento(db, gmailMessage.id);

    if (yaExiste) {
      continue;
    }

    const parsed = parseMessage(gmailMessage);

    return {
      found: true,
      gmailMessageId: gmailMessage.id,
      eventType: parsed.event_type,
      urgent: Boolean(parsed.urgent),
      parsedDataKeys: obtenerClavesSeguras(parsed.data),
    };
  }

  return {
    found: false,
  };
}

async function ejecutarBusquedaNuevoGetYourGuide({ db = pool } = {}) {
  const auth = await obtenerClienteGmailAutorizado({ diagnosticLogger: { log() {} } });
  const gmail = createGmailClient(auth);
  const resultado = await buscarNuevoGetYourGuideNewBooking({ gmail, db });

  console.log(`Nuevo correo disponible: ${resultado.found}`);

  if (!resultado.found) {
    return;
  }

  console.log(`Gmail message ID: ${resultado.gmailMessageId}`);
  console.log(`Event type: ${resultado.eventType}`);
  console.log(`Urgent: ${resultado.urgent}`);
  console.log(`parsed.data cantidad: ${resultado.parsedDataKeys.length}`);
  console.log(`parsed.data claves: ${resultado.parsedDataKeys.length > 0 ? resultado.parsedDataKeys.join(', ') : '(ninguna)'}`);
}

async function diagnosticarNormalizacionGetYourGuide(messageId) {
  if (!messageId) {
    console.log('[1] Gmail message ID recibido: ERROR');
    console.log('Uso: node scripts/probarPersistenciaGetYourGuide.mjs diagnostico <gmail_message_id>');
    process.exitCode = 1;
    return;
  }

  console.log('[1] Gmail message ID recibido: OK');
  console.log('Modo diagnóstico read-only: true');

  const paso2 = await ejecutarPasoDiagnostico('[2] Cliente Gmail autorizado', async () => {
    const auth = await obtenerClienteGmailAutorizado();
    return createGmailClient(auth);
  });

  if (!paso2.ok) {
    return;
  }

  const gmail = paso2.resultado;
  const paso3 = await ejecutarPasoDiagnostico('[3] messages.get por ID', () => obtenerMensajePorId(gmail, messageId));

  if (!paso3.ok) {
    return;
  }

  const gmailMessage = paso3.resultado?.data;

  if (!gmailMessage?.payload) {
    reportarPasoError('[4] payload disponible', 'Gmail message no contiene payload');
    return;
  }

  let extractedText;

  try {
    extractedText = extractTextBody(gmailMessage.payload);
  } catch (error) {
    console.log('[5] extracción MIME: ERROR');
    imprimirErrorSeguro(error);
    return;
  }

  const email = extractEmailFromGmailMessage(gmailMessage);
  const classification = classifyGetYourGuideEmailSubject(email.subject);
  const customerNameDiagnostics = getCustomerNameDiagnostics(email);
  const parsed = parseGetYourGuideGmailMessage(gmailMessage);
  const despuesMapper = toGetYourGuideIntegrationEvent(parsed, {
    source_subject: getHeader(gmailMessage.payload.headers ?? [], 'Subject'),
    source_received_at: getGmailMessageSourceReceivedAt(gmailMessage),
  });
  const eventoPersistible = construirEventoPersistible(gmailMessage, parsed);
  const eventoNormalizado = normalizarEventoIntegracion(eventoPersistible);
  const jsonbParametroSql = obtenerJsonbNormalizadoDesdeParametros(eventoNormalizado);

  console.log(`Longitud del texto extraído: ${extractedText.length}`);
  console.log(`Tipo de evento clasificado: ${classification.event_type ?? ''}`);
  console.log(`etiqueta de cliente detectada: ${customerNameDiagnostics.customerLabelDetected}`);
  console.log(`valor candidato encontrado: ${customerNameDiagnostics.customerValueCandidateFound}`);
  console.log(`customer_name presente: ${customerNameDiagnostics.customerNamePresent}`);
  console.log(`claves finales de parsed.data: ${customerNameDiagnostics.parsedDataKeys.length > 0 ? customerNameDiagnostics.parsedDataKeys.join(', ') : '(ninguna)'}`);
  imprimirResumenClaves('parsed.data', parsed.data);
  imprimirResumenClaves('después de getyourguide.mapper.js', despuesMapper.normalized_data);
  imprimirResumenClaves('evento.normalized_data', eventoPersistible.normalized_data);
  imprimirResumenClaves('después de sanitizar', eventoNormalizado.normalized_data);
  imprimirResumenClaves('parámetro SQL JSONB', jsonbParametroSql);
}

async function probarPersistenciaGetYourGuide() {
  const args = process.argv.slice(2);
  const modoBuscarNuevo = args[0] === 'buscar-nuevo';
  const modoDiagnostico = ['diagnostico', 'diagnóstico', '--diagnostico', '--diagnóstico'].includes(args[0]);
  const messageId = modoDiagnostico ? args[1] : args[0];

  if (modoBuscarNuevo) {
    await ejecutarBusquedaNuevoGetYourGuide();
    return;
  }

  if (modoDiagnostico) {
    await diagnosticarNormalizacionGetYourGuide(messageId);
    return;
  }

  if (!messageId) {
    console.log('[1] Gmail message ID recibido: ERROR');
    console.log('Uso: node scripts/probarPersistenciaGetYourGuide.mjs <gmail_message_id>');
    console.log('Diagnóstico read-only: node scripts/probarPersistenciaGetYourGuide.mjs diagnostico <gmail_message_id>');
    console.log('Buscar nuevo read-only: node scripts/probarPersistenciaGetYourGuide.mjs buscar-nuevo');
    process.exitCode = 1;
    return;
  }

  console.log('[1] Gmail message ID recibido: OK');

  const paso2 = await ejecutarPasoDiagnostico('[2] Cliente Gmail autorizado', async () => {
    const auth = await obtenerClienteGmailAutorizado();
    return createGmailClient(auth);
  });

  if (!paso2.ok) {
    return;
  }

  const gmail = paso2.resultado;
  const paso3 = await ejecutarPasoDiagnostico('[3] messages.get por ID', () => obtenerMensajePorId(gmail, messageId));

  if (!paso3.ok) {
    return;
  }

  const gmailMessage = paso3.resultado?.data;

  if (!gmailMessage?.payload) {
    reportarPasoError('[4] payload disponible', 'Gmail message no contiene payload');
    return;
  }

  console.log('[4] payload disponible: OK');

  let extractedText;

  try {
    extractedText = extractTextBody(gmailMessage.payload);
    console.log('[5] extracción MIME: OK');
  } catch (error) {
    console.log('[5] extracción MIME: ERROR');
    imprimirErrorSeguro(error);
    return;
  }

  if (typeof extractedText !== 'string' || extractedText.length === 0) {
    reportarPasoError('[6] texto utilizable', 'Texto extraido vacio o no utilizable');
    return;
  }

  console.log('[6] texto utilizable: OK');
  console.log(`Longitud: ${extractedText.length}`);

  let event;

  try {
    const email = extractEmailFromGmailMessage(gmailMessage);
    const classification = classifyGetYourGuideEmailSubject(email.subject);

    console.log('[7] classifier: OK');
    console.log(`Event type: ${classification.event_type ?? ''}`);
  } catch (error) {
    console.log('[7] classifier: ERROR');
    imprimirErrorSeguro(error);
    return;
  }

  try {
    event = parseGetYourGuideGmailMessage(gmailMessage);

    console.log('[8] parser: OK');
    console.log(`Provider: ${event.provider ?? ''}`);
    console.log(`External booking ID presente: ${Boolean(event.external_booking_id)}`);
  } catch (error) {
    console.log('[8] parser: ERROR');
    imprimirErrorSeguro(error);
    return;
  }

  let eventoPersistible;

  try {
    const diagnosticoFecha = getSourceReceivedAtDiagnostics(gmailMessage);
    console.log(`existe internalDate: ${diagnosticoFecha.internalDateExists}`);
    console.log(`internalDate parseable: ${diagnosticoFecha.internalDateParseable}`);
    console.log(`existe Date header: ${diagnosticoFecha.dateHeaderExists}`);
    console.log(`Date header parseable: ${diagnosticoFecha.dateHeaderParseable}`);
    console.log(`source_received_at válido: ${diagnosticoFecha.sourceReceivedAtValid}`);

    eventoPersistible = construirEventoPersistible(gmailMessage, event);
    console.log('[9] evento normalizado construido: OK');
  } catch (error) {
    console.log('[9] evento normalizado construido: ERROR');
    imprimirErrorSeguro(error);
    return;
  }

  const paso10 = await ejecutarPasoDiagnostico('[10] PostgreSQL conexión', () => pool.query('SELECT 1'));

  if (!paso10.ok) {
    return;
  }

  const paso11 = await ejecutarPasoDiagnostico('[11] persistencia', () => registrarEventoIntegracion(eventoPersistible));

  if (!paso11.ok) {
    return;
  }

  console.log(`Duplicado: ${Boolean(paso11.resultado?.duplicate)}`);
  console.log(`Review status: ${paso11.resultado?.event?.review_status ?? ''}`);
}

const ejecutadoDirectamente = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (ejecutadoDirectamente) {
  try {
    await probarPersistenciaGetYourGuide();
  } catch (error) {
    console.log('Error no clasificado en prueba de persistencia: ERROR');
    imprimirErrorSeguro(error);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

export {
  buscarNuevoGetYourGuideNewBooking,
  existeEventoIntegracion,
  ejecutarBusquedaNuevoGetYourGuide,
};
