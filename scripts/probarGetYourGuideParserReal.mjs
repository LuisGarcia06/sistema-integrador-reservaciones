import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const { classifyGetYourGuideEmailSubject } = require('../backend/integrations/getyourguide/getyourguideEmailClassifier.js');

const GYG_BOOKING_ID_PATTERN = /^GYG[A-Z0-9]+$/;
const NORMAL_SEARCH_LIMIT = 20;
const URGENT_SUBJECT_TEXT = 'Urgente:';

const EVENT_TYPE_CONFIG = {
  normal: {
    label: 'normal',
    subjectQuery: 'Reserva -',
    excludedSubjectQuery: 'Urgente: nueva reserva recibida',
    maxResults: NORMAL_SEARCH_LIMIT,
  },
  modificacion: {
    label: 'modificacion',
    subjectQuery: 'Cambio en los detalles de la reserva',
  },
  cancelacion: {
    label: 'cancelacion',
    subjectQuery: 'Se ha cancelado una reserva',
  },
  urgente: {
    label: 'urgente',
    subjectQuery: 'Urgente: nueva reserva recibida',
  },
};

const {
  GETYOURGUIDE_FROM_QUERY,
  obtenerClienteGmailAutorizado,
  createGmailClient,
  getGmailMessage,
  searchGetYourGuideMessages,
  parseGetYourGuideGmailMessage,
  toSafeGmailError,
  collectTextParts,
  extractEmailFromGmailMessage,
  extractTextBody,
  getHeader,
} = require('../backend/integrations/getyourguide/getyourguideGmail.service.js');

const diagnosticState = {
  gmailCallStarted: false,
  stagePrinted: false,
};

const diagnosticLogger = {
  log(message) {
    if (message === 'Llamada Gmail iniciada: true') {
      diagnosticState.gmailCallStarted = true;
    }

    if (String(message).startsWith('Etapa: ')) {
      diagnosticState.stagePrinted = true;
    }

    console.log(message);
  },
};

function normalizeEventType(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getRequestedEventType(rawValue) {
  const normalizedValue = normalizeEventType(rawValue);
  return EVENT_TYPE_CONFIG[normalizedValue] ?? null;
}

function buildGmailQuery(config) {
  const excludedSubject = config.excludedSubjectQuery
    ? ` -subject:"${config.excludedSubjectQuery}"`
    : '';

  return `${GETYOURGUIDE_FROM_QUERY} subject:"${config.subjectQuery}"${excludedSubject}`;
}
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

function reportarPasoError(etiqueta, error) {
  console.log(`${etiqueta}: ERROR`);
  imprimirErrorSeguro(error);
}

function crearErrorDiagnostico(message) {
  return new Error(message);
}

async function ejecutarDiagnosticoGmail(gmail, config) {
  const paso1 = await ejecutarPasoDiagnostico('[1] getProfile', () => gmail.users.getProfile({
    userId: 'me',
  }));

  if (!paso1.ok) {
    return;
  }

  const paso2 = await ejecutarPasoDiagnostico('[2] messages.list sin query', () => gmail.users.messages.list({
    userId: 'me',
    maxResults: 1,
  }));

  if (!paso2.ok) {
    return;
  }

  const paso3 = await ejecutarPasoDiagnostico('[3] messages.list from', () => gmail.users.messages.list({
    userId: 'me',
    q: GETYOURGUIDE_FROM_QUERY,
    maxResults: 1,
  }));

  if (!paso3.ok) {
    return;
  }

  const paso4 = await ejecutarPasoDiagnostico(`[4] messages.list ${config.label}`, () => gmail.users.messages.list({
    userId: 'me',
    q: buildGmailQuery(config),
    maxResults: 1,
  }));

  if (!paso4.ok) {
    return;
  }

  const messageId = paso4.resultado?.data?.messages?.[0]?.id;

  if (!messageId) {
    reportarPasoError('[5] message ID disponible', crearErrorDiagnostico('messages.list no devolvio message.id'));
    return;
  }

  console.log('[5] message ID disponible: OK');

  const paso6 = await ejecutarPasoDiagnostico('[6] messages.get full', () => gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  }));

  if (!paso6.ok) {
    return;
  }

  const gmailMessage = paso6.resultado?.data;

  if (!gmailMessage?.payload) {
    reportarPasoError('[7] payload disponible', crearErrorDiagnostico('Gmail message no contiene payload'));
    return;
  }

  console.log('[7] payload disponible: OK');

  let extractedText;

  try {
    extractedText = extractTextBody(gmailMessage.payload);
    console.log('[8] extracción MIME: OK');
  } catch (error) {
    reportarPasoError('[8] extracción MIME', error);
    return;
  }

  if (typeof extractedText !== 'string' || extractedText.length === 0) {
    reportarPasoError('[9] texto utilizable', crearErrorDiagnostico('Texto extraido vacio o no utilizable'));
    return;
  }

  console.log('[9] texto utilizable: OK');
  console.log(`Longitud: ${extractedText.length}`);

  let email;
  let classification;

  try {
    email = extractEmailFromGmailMessage(gmailMessage);
    classification = classifyGetYourGuideEmailSubject(email.subject);
    console.log('[10] classifier: OK');
    console.log(`Event type: ${classification.event_type ?? ''}`);
  } catch (error) {
    reportarPasoError('[10] classifier', error);
    return;
  }

  try {
    const event = parseGetYourGuideGmailMessage(gmailMessage);
    console.log('[11] parser: OK');
    console.log(`Provider: ${event.provider ?? ''}`);
    console.log(`Event type: ${event.event_type ?? ''}`);
    console.log(`External booking ID presente: ${Boolean(event.external_booking_id)}`);
    console.log(`Urgent: ${Boolean(event.urgent)}`);
  } catch (error) {
    reportarPasoError('[11] parser', error);
  }
}

function getSafeMessageDiagnostics(gmailMessage) {
  const payload = gmailMessage?.payload ?? {};
  const headers = payload.headers ?? [];
  const textParts = collectTextParts(payload);
  const hasTextPlain = textParts.plain.length > 0;
  const hasTextHtml = textParts.html.length > 0;

  return {
    subject: getHeader(headers, 'Subject'),
    mainMimeType: payload.mimeType ?? '',
    hasTextPlain,
    hasTextHtml,
    usedHtmlFallback: !hasTextPlain && hasTextHtml,
  };
}

function isValidNormalEvent(diagnostics, event) {
  return !diagnostics.subject.includes(URGENT_SUBJECT_TEXT)
    && event.provider === 'getyourguide'
    && event.event_type === 'new_booking'
    && !Boolean(event.urgent)
    && GYG_BOOKING_ID_PATTERN.test(event.external_booking_id ?? '');
}

function shouldAcceptMessage(config, diagnostics, event) {
  if (config.label !== 'normal') {
    return true;
  }

  return isValidNormalEvent(diagnostics, event);
}

async function findRealMessageForEventType(gmail, config) {
  const messages = await searchGetYourGuideMessages(gmail, {
    query: buildGmailQuery(config),
    maxResults: config.maxResults ?? 1,
    diagnosticLogger,
  });

  for (const message of messages) {
    const gmailMessage = await getGmailMessage(gmail, message.id, { diagnosticLogger });
    const diagnostics = getSafeMessageDiagnostics(gmailMessage);
    const event = parseGetYourGuideGmailMessage(gmailMessage);

    if (shouldAcceptMessage(config, diagnostics, event)) {
      return {
        gmailMessage,
        diagnostics,
        event,
      };
    }
  }

  return null;
}

function printUsage() {
  console.error('Uso: node scripts/probarGetYourGuideParserReal.mjs <normal|modificacion|cancelacion|urgente>');
}

async function probarGetYourGuideParserReal() {
  const requestedEventType = getRequestedEventType(process.argv[2]);

  if (!requestedEventType) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const auth = await obtenerClienteGmailAutorizado({ diagnosticLogger });
  const gmail = createGmailClient(auth);

  await ejecutarDiagnosticoGmail(gmail, requestedEventType);
}

try {
  await probarGetYourGuideParserReal();
} catch (error) {
  const safeError = toSafeGmailError(error);


  console.error(safeError.message);
  process.exitCode = 1;
}