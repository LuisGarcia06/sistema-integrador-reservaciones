const fs = require('node:fs/promises');
const path = require('node:path');
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');
const { parseGetYourGuideEmail } = require('./getyourguideEmailParser');

const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const GETYOURGUIDE_FROM_QUERY = 'from:do-not-reply@notification.getyourguide.com';
const DEFAULT_CREDENTIALS_PATH = path.join(process.cwd(), 'secrets', 'credentials.json');
const DEFAULT_GMAIL_TOKEN_PATH = path.join(process.cwd(), 'secrets', 'gmail-token.json');
const OAUTH_TOKEN_FIELDS = [
  'access_token',
  'refresh_token',
  'scope',
  'token_type',
  'expiry_date',
];

function createSafeError(message, cause) {
  const error = new Error(message);
  error.cause = cause;
  error.isSafeForLogs = true;
  return error;
}

function sanitizeDiagnosticText(value) {
  if (value === undefined || value === null || value === '') {
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

function safeDiagnosticValue(value) {
  if (value === undefined || value === null || value === '') {
    return 'no_disponible';
  }

  return String(value).replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 80);
}

function getSafeHttpStatus(error) {
  return error?.response?.status ?? (typeof error?.code === 'number' ? error.code : undefined);
}

function normalizeGoogleErrorValue(value) {
  if (value && typeof value === 'object') {
    return value.status ?? value.code ?? value.reason ?? value.message ?? 'objeto_error';
  }

  return value;
}

function getSafeErrorCode(error) {
  return normalizeGoogleErrorValue(
    error?.response?.data?.error
      ?? error?.response?.data?.error_description
      ?? error?.errors?.[0]?.reason
      ?? error?.code,
  );
}

function getSafeOAuthErrorName(error) {
  return normalizeGoogleErrorValue(error?.response?.data?.error ?? error?.error);
}

function getSafeErrorName(error) {
  return error?.name ?? error?.constructor?.name;
}

function getSafeErrorMessage(error) {
  return error?.message;
}

function formatStageDiagnosticLines(stage, error) {
  const lines = [
    `Etapa: ${stage}`,
    `HTTP status: ${safeDiagnosticValue(getSafeHttpStatus(error))}`,
    `Error code: ${safeDiagnosticValue(getSafeErrorCode(error))}`,
    `Error name: ${safeDiagnosticValue(getSafeErrorName(error))}`,
    `Error message: ${sanitizeDiagnosticText(getSafeErrorMessage(error))}`,
  ];

  if (stage === 'oauth_refresh') {
    lines.push(`OAuth error: ${safeDiagnosticValue(getSafeOAuthErrorName(error))}`);
  }

  if (stage === 'gmail_api') {
    lines.push(`Mensaje sanitizado: ${sanitizeErrorMessage(error)}`);
  }

  return lines;
}

function logSafeStageDiagnostics(stage, error, logger = console) {
  for (const line of formatStageDiagnosticLines(stage, error)) {
    logSafeDiagnostic(line, logger);
  }
}

function formatStageErrorMessage(stage, error) {
  return [
    'Error al consultar Gmail. Revisa la configuracion local sin imprimir credenciales.',
    ...formatStageDiagnosticLines(stage, error),
  ].join('\n');
}

function createSafeStageError(stage, error) {
  return createSafeError(formatStageErrorMessage(stage, error), error);
}

function logSafeDiagnostic(message, logger = console) {
  logger.log(message);
}

function logGmailClientShape(gmail, logger = console) {
  logSafeDiagnostic(`Gmail users disponible: ${Boolean(gmail?.users)}`, logger);
  logSafeDiagnostic(`Gmail messages disponible: ${Boolean(gmail?.users?.messages)}`, logger);
  logSafeDiagnostic(`Gmail messages.list disponible: ${typeof gmail?.users?.messages?.list === 'function'}`, logger);
  logSafeDiagnostic(`Gmail messages.get disponible: ${typeof gmail?.users?.messages?.get === 'function'}`, logger);
}

function sanitizeErrorMessage(error) {
  const status = error?.code || error?.response?.status;

  if (status === 401) {
    return 'Gmail API rechazo la autenticacion (401). Revisa OAuth sin exponer tokens. Si el token fue revocado, vuelve a autorizar de forma controlada.';
  }

  if (status === 403) {
    return 'Gmail API rechazo permisos (403). Verifica que solo se use gmail.readonly y que la cuenta tenga acceso.';
  }

  if (status === 429) {
    return 'Gmail API limito la solicitud (429). Intenta de nuevo mas tarde.';
  }

  if (typeof status === 'number' && status >= 500) {
    return `Gmail API respondio con error ${status}. Intenta de nuevo mas tarde.`;
  }

  if (error?.code === 'ENOENT') {
    return 'No se encontraron las credenciales OAuth locales. Configura el archivo local de OAuth.';
  }

  return 'Error al consultar Gmail. Revisa la configuracion local sin imprimir credenciales.';
}

function toSafeGmailError(error) {
  if (error?.isSafeForLogs) {
    return error;
  }

  return createSafeError(sanitizeErrorMessage(error), error);
}

function defaultOAuth2ClientFactory(clientId, clientSecret, redirectUri) {
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function sanitizeOAuthCredentials(credentials = {}) {
  return OAUTH_TOKEN_FIELDS.reduce((safeCredentials, field) => {
    if (credentials[field] !== undefined && credentials[field] !== null) {
      safeCredentials[field] = credentials[field];
    }

    return safeCredentials;
  }, {});
}

function mergeOAuthCredentials(existingCredentials = {}, newCredentials = {}) {
  return {
    ...sanitizeOAuthCredentials(existingCredentials),
    ...sanitizeOAuthCredentials(newCredentials),
  };
}

async function readJsonFile(filePath, fsClient = fs) {
  const content = await fsClient.readFile(filePath, 'utf8');
  return JSON.parse(content);
}

async function readSavedOAuthCredentials(tokenPath, fsClient = fs) {
  try {
    return await readJsonFile(tokenPath, fsClient);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }

    throw createSafeError('No se pudo leer el token OAuth local guardado. Revisa el archivo local sin imprimir su contenido.', error);
  }
}

async function saveOAuthCredentials(tokenPath, credentials, {
  fsClient = fs,
  existingCredentials = {},
} = {}) {
  const mergedCredentials = mergeOAuthCredentials(existingCredentials, credentials);

  await fsClient.mkdir(path.dirname(tokenPath), { recursive: true });
  await fsClient.writeFile(
    tokenPath,
    `${JSON.stringify(mergedCredentials, null, 2)}\n`,
    'utf8',
  );

  return mergedCredentials;
}

async function saveMergedOAuthCredentials(tokenPath, credentials, {
  fsClient = fs,
} = {}) {
  const existingCredentials = await readSavedOAuthCredentials(tokenPath, fsClient) ?? {};
  return saveOAuthCredentials(tokenPath, credentials, {
    fsClient,
    existingCredentials,
  });
}

function getInstalledOAuthClientConfig(credentialsFile) {
  const installed = credentialsFile.installed;
  const redirectUri = installed?.redirect_uris?.[0];

  if (!installed?.client_id || !installed?.client_secret || !redirectUri) {
    throw createSafeError('El archivo OAuth local no contiene una configuracion installed valida.');
  }

  return {
    clientId: installed.client_id,
    clientSecret: installed.client_secret,
    redirectUri,
  };
}

async function createOAuth2ClientFromCredentialsFile({
  credentialsPath,
  fsClient = fs,
  oauth2ClientFactory = defaultOAuth2ClientFactory,
}) {
  const credentialsFile = await readJsonFile(credentialsPath, fsClient);
  const { clientId, clientSecret, redirectUri } = getInstalledOAuthClientConfig(credentialsFile);

  return oauth2ClientFactory(clientId, clientSecret, redirectUri);
}

function registerTokenPersistence(auth, tokenPath, {
  fsClient = fs,
} = {}) {
  if (typeof auth?.on !== 'function') {
    return;
  }

  auth.on('tokens', async (tokens) => {
    try {
      await saveMergedOAuthCredentials(tokenPath, tokens, { fsClient });
    } catch {
      // No imprimir tokens ni rutas sensibles desde el listener de renovacion.
    }
  });
}

async function obtenerClienteGmailAutorizado({
  credentialsPath = DEFAULT_CREDENTIALS_PATH,
  tokenPath = DEFAULT_GMAIL_TOKEN_PATH,
  scopes = [GMAIL_READONLY_SCOPE],
  authenticateFn = authenticate,
  fsClient = fs,
  oauth2ClientFactory = defaultOAuth2ClientFactory,
  diagnosticLogger = console,
} = {}) {
  try {
    const savedCredentials = await readSavedOAuthCredentials(tokenPath, fsClient);

    if (savedCredentials) {
      if (!savedCredentials.refresh_token) {
        throw createSafeError('El token OAuth local guardado no contiene refresh_token. Rehaz la autorizacion de forma controlada sin imprimir ni editar tokens manualmente.');
      }

      const credentialsFile = await readJsonFile(credentialsPath, fsClient);
      logSafeDiagnostic('Credenciales cargadas: true', diagnosticLogger);
      logSafeDiagnostic('Token local cargado: true', diagnosticLogger);
      logSafeDiagnostic(`Refresh token presente: ${Boolean(savedCredentials.refresh_token)}`, diagnosticLogger);

      const { clientId, clientSecret, redirectUri } = getInstalledOAuthClientConfig(credentialsFile);
      const auth = oauth2ClientFactory(clientId, clientSecret, redirectUri);
      logSafeDiagnostic('OAuth2Client creado: true', diagnosticLogger);

      auth.setCredentials(savedCredentials);
      logSafeDiagnostic('setCredentials ejecutado: true', diagnosticLogger);
      registerTokenPersistence(auth, tokenPath, { fsClient });

      try {
        await auth.getAccessToken();
        logSafeDiagnostic('Access token disponible/refrescado: true', diagnosticLogger);
      } catch (error) {
        logSafeDiagnostic('Access token disponible/refrescado: false', diagnosticLogger);
        logSafeDiagnostic('Llamada Gmail iniciada: false', diagnosticLogger);
        logSafeStageDiagnostics('oauth_refresh', error, diagnosticLogger);
        throw createSafeStageError('oauth_refresh', error);
      }

      return auth;
    }

    await fsClient.access(credentialsPath);

    const auth = await authenticateFn({
      scopes,
      keyfilePath: credentialsPath,
    });

    if (!auth?.credentials?.refresh_token) {
      throw createSafeError('Google no devolvio refresh_token. Repite la autorizacion de forma controlada sin cambiar scopes.');
    }

    const safeCredentials = await saveOAuthCredentials(tokenPath, auth.credentials, { fsClient });
    auth.setCredentials?.(safeCredentials);
    registerTokenPersistence(auth, tokenPath, { fsClient });

    return auth;
  } catch (error) {
    throw toSafeGmailError(error);
  }
}

const authenticateGmail = obtenerClienteGmailAutorizado;

function createGmailClient(auth) {
  return google.gmail({
    version: 'v1',
    auth,
  });
}

async function searchGetYourGuideMessages(gmail, {
  query = GETYOURGUIDE_FROM_QUERY,
  maxResults = 10,
  diagnosticLogger = console,
} = {}) {
  try {
    logGmailClientShape(gmail, diagnosticLogger);
    logSafeDiagnostic('Llamada Gmail iniciada: true', diagnosticLogger);
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults,
    });

    return response.data.messages ?? [];
  } catch (error) {
    logSafeStageDiagnostics('gmail_api', error, diagnosticLogger);
    throw createSafeStageError('gmail_api', error);
  }
}

async function getGmailMessage(gmail, messageId, {
  diagnosticLogger = console,
} = {}) {
  if (!messageId) {
    throw createSafeError('Se requiere Gmail message ID para obtener el mensaje.');
  }

  try {
    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    return response.data;
  } catch (error) {
    logSafeStageDiagnostics('gmail_api', error, diagnosticLogger);
    throw createSafeStageError('gmail_api', error);
  }
}

function getHeader(headers = [], name) {
  return headers.find(
    (header) => header.name?.toLowerCase() === name.toLowerCase(),
  )?.value ?? '';
}

function decodeBase64Url(data) {
  if (!data) {
    return '';
  }

  const normalized = String(data)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padding = normalized.length % 4 === 0
    ? ''
    : '='.repeat(4 - (normalized.length % 4));

  return Buffer.from(normalized + padding, 'base64').toString('utf8');
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:td|th)>\s*<(?:td|th)\b[^>]*>/gi, '\n')
    .replace(/<\/(?:p|div|tr|li|dt|dd|h[1-6])>/gi, '\n')
    .replace(/<(?:tr|li|dt|dd)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function collectTextParts(part, textParts = { plain: [], html: [] }) {
  if (!part) {
    return textParts;
  }

  const mimeType = String(part.mimeType || '').toLowerCase();
  const decodedBody = decodeBase64Url(part.body?.data);

  if (decodedBody && mimeType === 'text/plain') {
    textParts.plain.push(decodedBody);
  }

  if (decodedBody && mimeType === 'text/html') {
    textParts.html.push(decodedBody);
  }

  for (const childPart of part.parts ?? []) {
    collectTextParts(childPart, textParts);
  }

  return textParts;
}

function extractTextBody(payload) {
  if (!payload) {
    throw createSafeError('El mensaje de Gmail no contiene payload.');
  }

  const textParts = collectTextParts(payload);

  if (textParts.plain.length > 0) {
    return textParts.plain.join('\n').trim();
  }

  if (textParts.html.length > 0) {
    return htmlToText(textParts.html.join('\n')).trim();
  }

  throw createSafeError('El mensaje de Gmail no contiene cuerpo text/plain ni text/html interpretable.');
}

function extractEmailFromGmailMessage(message) {
  if (!message?.payload) {
    throw createSafeError('El mensaje de Gmail no contiene payload.');
  }

  const headers = message.payload.headers ?? [];
  const subject = getHeader(headers, 'Subject');
  const from = getHeader(headers, 'From');
  const text = extractTextBody(message.payload);
  const textParts = collectTextParts(message.payload);
  const html = textParts.html.join('\n').trim();

  return {
    email_message_id: message.id,
    email_thread_id: message.threadId,
    from,
    subject,
    text,
    html: html || undefined,
  };
}

function parseGetYourGuideGmailMessage(message) {
  const email = extractEmailFromGmailMessage(message);
  return parseGetYourGuideEmail(email);
}

async function getLatestGetYourGuideEmailEvent(gmail) {
  const messages = await searchGetYourGuideMessages(gmail, {
    maxResults: 1,
  });

  if (messages.length === 0) {
    throw createSafeError('No se encontraron correos de GetYourGuide.');
  }

  const message = await getGmailMessage(gmail, messages[0].id);
  return parseGetYourGuideGmailMessage(message);
}

module.exports = {
  DEFAULT_CREDENTIALS_PATH,
  DEFAULT_GMAIL_TOKEN_PATH,
  GETYOURGUIDE_FROM_QUERY,
  GMAIL_READONLY_SCOPE,
  authenticateGmail,
  collectTextParts,
  createGmailClient,
  createOAuth2ClientFromCredentialsFile,
  createSafeStageError,
  decodeBase64Url,
  extractEmailFromGmailMessage,
  extractTextBody,
  getHeader,
  getInstalledOAuthClientConfig,
  getLatestGetYourGuideEmailEvent,
  getSafeErrorCode,
  getSafeErrorMessage,
  getSafeErrorName,
  getSafeHttpStatus,
  getSafeOAuthErrorName,
  formatStageDiagnosticLines,
  htmlToText,
  mergeOAuthCredentials,
  obtenerClienteGmailAutorizado,
  parseGetYourGuideGmailMessage,
  readSavedOAuthCredentials,
  sanitizeDiagnosticText,
  sanitizeErrorMessage,
  sanitizeOAuthCredentials,
  formatStageErrorMessage,
  saveMergedOAuthCredentials,
  saveOAuthCredentials,
  searchGetYourGuideMessages,
  toSafeGmailError,
};