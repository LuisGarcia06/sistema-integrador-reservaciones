const path = require('node:path');
const {
  GMAIL_READONLY_SCOPE,
  authenticateGmail,
  decodeBase64Url,
  extractEmailFromGmailMessage,
  extractTextBody,
  getHeader,
  parseGetYourGuideGmailMessage,
  sanitizeErrorMessage,
  searchGetYourGuideMessages,
} = require('../getyourguideGmail.service');

const CLIENT_SECRET_FILE = JSON.stringify({
  installed: {
    client_id: 'client-id-local',
    client_secret: 'client-secret-local',
    redirect_uris: ['http://localhost/oauth2callback'],
  },
});

function encodeBase64Url(value) {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createMessage({ id = 'gmail-message-001', threadId = 'gmail-thread-001', subject, from, payload }) {
  return {
    id,
    threadId,
    payload: {
      headers: [
        { name: 'Subject', value: subject },
        { name: 'From', value: from },
      ],
      ...payload,
    },
  };
}

function createEnoentError(filePath) {
  const error = new Error(`ENOENT: no such file or directory, open ${filePath}`);
  error.code = 'ENOENT';
  return error;
}

function createMemoryFs(initialFiles = {}) {
  const files = new Map(Object.entries(initialFiles));

  return {
    files,
    access: jest.fn(async (filePath) => {
      if (!files.has(filePath)) {
        throw createEnoentError(filePath);
      }
    }),
    readFile: jest.fn(async (filePath) => {
      if (!files.has(filePath)) {
        throw createEnoentError(filePath);
      }

      return files.get(filePath);
    }),
    mkdir: jest.fn(async () => {}),
    writeFile: jest.fn(async (filePath, content) => {
      files.set(filePath, content);
    }),
  };
}

function createFakeOAuth2Client({ getAccessToken = jest.fn(async () => ({ token: 'test-token' })) } = {}) {
  return {
    credentials: null,
    listeners: {},
    getAccessToken,
    setCredentials: jest.fn(function setCredentials(credentials) {
      this.credentials = credentials;
    }),
    on: jest.fn(function on(event, listener) {
      this.listeners[event] = listener;
    }),
  };
}

function createSilentDiagnosticLogger() {
  return { log: jest.fn() };
}

describe('getyourguideGmail.service', () => {
  test('decodifica contenido base64url', () => {
    const encoded = encodeBase64Url('Reserva - GYGABC123');

    expect(decodeBase64Url(encoded)).toBe('Reserva - GYGABC123');
  });

  test('extrae text/plain', () => {
    const payload = {
      mimeType: 'text/plain',
      body: {
        data: encodeBase64Url('Referencia: GYGABC123'),
      },
    };

    expect(extractTextBody(payload)).toBe('Referencia: GYGABC123');
  });

  test('extrae text/plain desde multipart anidado', () => {
    const payload = {
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'application/pdf',
          body: { data: encodeBase64Url('adjunto ignorado') },
        },
        {
          mimeType: 'multipart/alternative',
          parts: [
            {
              mimeType: 'text/html',
              body: { data: encodeBase64Url('<p>HTML ignorado si hay texto</p>') },
            },
            {
              mimeType: 'text/plain',
              body: { data: encodeBase64Url('Referencia: GYGXYZ789') },
            },
          ],
        },
      ],
    };

    expect(extractTextBody(payload)).toBe('Referencia: GYGXYZ789');
  });

  test('usa HTML como fallback si no existe text/plain', () => {
    const payload = {
      mimeType: 'text/html',
      body: {
        data: encodeBase64Url('<html><body><p>Referencia: GYGHTML123</p><p>Actividad: Tour sanitizado</p></body></html>'),
      },
    };

    expect(extractTextBody(payload)).toBe('Referencia: GYGHTML123\nActividad: Tour sanitizado');
  });

  test('extrae headers Subject y From', () => {
    const headers = [
      { name: 'Subject', value: 'Reserva - STEST001 - GYGABC123' },
      { name: 'From', value: 'GetYourGuide <do-not-reply@notification.getyourguide.com>' },
    ];

    expect(getHeader(headers, 'subject')).toBe('Reserva - STEST001 - GYGABC123');
    expect(getHeader(headers, 'FROM')).toBe('GetYourGuide <do-not-reply@notification.getyourguide.com>');
  });

  test('conserva Gmail message ID y thread ID', () => {
    const message = createMessage({
      id: 'gmail-message-123',
      threadId: 'gmail-thread-456',
      subject: 'Reserva - STEST001 - GYGABC123',
      from: 'GetYourGuide <do-not-reply@notification.getyourguide.com>',
      payload: {
        mimeType: 'text/plain',
        body: { data: encodeBase64Url('Referencia: GYGABC123') },
      },
    });

    const email = extractEmailFromGmailMessage(message);

    expect(email.email_message_id).toBe('gmail-message-123');
    expect(email.email_thread_id).toBe('gmail-thread-456');
  });

  test('correo HTML realista con pares etiqueta valor produce datos operativos', () => {
    const message = createMessage({
      id: 'gmail-message-html-001',
      threadId: 'gmail-thread-html-001',
      subject: 'Reserva - STEST001 - GYGHTML001',
      from: 'GetYourGuide <do-not-reply@notification.getyourguide.com>',
      payload: {
        mimeType: 'text/html',
        body: {
          data: encodeBase64Url(`
            <html><body>
              <table>
                <tr><td>Actividad</td><td>Tour Sian Kaan Sanitizado</td></tr>
                <tr><td>Fecha</td><td>2027-01-15</td></tr>
                <tr><td>Hora de inicio</td><td>08:30</td></tr>
                <tr><td>Participantes</td><td>2 adultos</td></tr>
                <tr><td>Cliente principal</td><td>Cliente Sanitizado</td></tr>
                <tr><td>Lugar de recogida</td><td>Hotel Sanitizado</td></tr>
                <tr><td>Precio</td><td>250.00 USD</td></tr>
              </table>
            </body></html>
          `),
        },
      },
    });

    const text = extractTextBody(message.payload);
    const event = parseGetYourGuideGmailMessage(message);

    expect(text).toContain('Actividad\nTour Sian Kaan Sanitizado');
    expect(event.data).toEqual(expect.objectContaining({
      tour: 'Tour Sian Kaan Sanitizado',
      date: '2027-01-15',
      start_time: '08:30',
      pax: 2,
      customer_name: 'Cliente Sanitizado',
      pickup_place: 'Hotel Sanitizado',
      price: 250,
      currency: 'USD',
    }));
    expect(Object.keys(event.data)).toEqual(expect.arrayContaining([
      'tour',
      'date',
      'start_time',
      'pax',
      'customer_name',
      'pickup_place',
      'price',
      'currency',
    ]));
  });
  test('correo HTML realista de GetYourGuide conserva activity_title y option_title', () => {
    const message = createMessage({
      id: 'gmail-message-html-title-001',
      threadId: 'gmail-thread-html-title-001',
      subject: 'Reserva - STEST001 - GYGHTMLTITLE001',
      from: 'GetYourGuide <do-not-reply@notification.getyourguide.com>',
      payload: {
        mimeType: 'text/html',
        body: {
          data: encodeBase64Url(`
            <html><body>
              <div class="booking-heading">Se ha reservado tu producto</div>
              <div class="activity activity-title">Riviera Maya: tour por los antiguos canales mayas de la reserva de Sian Ka'an</div>
              <div class="activity activity-option-title">Desde Playa del Carmen, Riviera Maya o Tulum: tour al mediodía</div>
              <table>
                <tr><td>Fecha</td><td>7 de febrero de 2027</td></tr>
                <tr><td>Participantes</td><td>2 adultos</td></tr>
                <tr><td>Lugar de recogida</td><td>Hotel Sanitizado</td></tr>
                <tr><td>Precio</td><td>6760 MXN</td></tr>
              </table>
            </body></html>
          `),
        },
      },
    });

    const email = extractEmailFromGmailMessage(message);
    const event = parseGetYourGuideGmailMessage(message);

    expect(email.html).toContain('activity-title');
    expect(event.data).toEqual(expect.objectContaining({
      activity_title: "Riviera Maya: tour por los antiguos canales mayas de la reserva de Sian Ka'an",
      option_title: 'Desde Playa del Carmen, Riviera Maya o Tulum: tour al mediodía',
      date: '7 de febrero de 2027',
      pax: 2,
      pickup_place: 'Hotel Sanitizado',
      price: 6760,
      currency: 'MXN',
    }));
  });
  test('entrega informacion de Gmail al parser existente', () => {
    const message = createMessage({
      id: 'gmail-message-789',
      threadId: 'gmail-thread-789',
      subject: 'Reserva - STEST001 - GYGABC123',
      from: 'GetYourGuide <do-not-reply@notification.getyourguide.com>',
      payload: {
        mimeType: 'text/plain',
        body: {
          data: encodeBase64Url([
            'Referencia: GYGABC123',
            'Referencia interna: STEST001',
            'Actividad: Tour sanitizado',
            'Fecha: 2026-11-12',
            'Hora de inicio: 08:30',
            'Participantes: 2',
          ].join('\n')),
        },
      },
    });

    const event = parseGetYourGuideGmailMessage(message);

    expect(event.provider).toBe('getyourguide');
    expect(event.event_type).toBe('new_booking');
    expect(event.external_booking_id).toBe('GYGABC123');
    expect(event.external_booking_id).not.toBe('STEST001');
    expect(event.email_message_id).toBe('gmail-message-789');
    expect(event.email_thread_id).toBe('gmail-thread-789');
    expect(event.data.tour).toBe('Tour sanitizado');
  });

  test('un correo desconocido no se convierte en reserva valida', () => {
    const message = createMessage({
      subject: 'Boletin GetYourGuide sin formato de reserva',
      from: 'GetYourGuide <do-not-reply@notification.getyourguide.com>',
      payload: {
        mimeType: 'text/plain',
        body: { data: encodeBase64Url('Contenido informativo sin codigo GYG') },
      },
    });

    const event = parseGetYourGuideGmailMessage(message);

    expect(event.provider).toBe('getyourguide');
    expect(event.event_type).toBe('unknown');
    expect(event.external_booking_id).toBeUndefined();
  });

  test('credentials.installed mas token existente crean OAuth2Client sin autorizacion interactiva', async () => {
    const credentialsPath = 'secrets/credentials.json';
    const tokenPath = 'secrets/gmail-token.json';
    const fsClient = createMemoryFs({
      [credentialsPath]: CLIENT_SECRET_FILE,
      [tokenPath]: JSON.stringify({
        access_token: 'saved-access-token',
        refresh_token: 'saved-refresh-token',
        scope: GMAIL_READONLY_SCOPE,
        token_type: 'Bearer',
      }),
    });
    const fakeOAuthClient = createFakeOAuth2Client();
    const authenticateFn = jest.fn();
    const oauth2ClientFactory = jest.fn(() => fakeOAuthClient);

    const auth = await authenticateGmail({
      credentialsPath,
      tokenPath,
      fsClient,
      authenticateFn,
      oauth2ClientFactory,
    });

    expect(auth).toBe(fakeOAuthClient);
    expect(authenticateFn).not.toHaveBeenCalled();
    expect(oauth2ClientFactory).toHaveBeenCalledWith(
      'client-id-local',
      'client-secret-local',
      'http://localhost/oauth2callback',
    );
    expect(fakeOAuthClient.setCredentials).toHaveBeenCalledWith(expect.objectContaining({
      access_token: 'saved-access-token',
      refresh_token: 'saved-refresh-token',
      scope: GMAIL_READONLY_SCOPE,
      token_type: 'Bearer',
    }));
    expect(fakeOAuthClient.credentials.refresh_token).toBe('saved-refresh-token');
  });

  test('ejecuta autorizacion inicial si no existe token guardado', async () => {
    const credentialsPath = 'secrets/credentials.json';
    const tokenPath = 'secrets/gmail-token.json';
    const fsClient = createMemoryFs({
      [credentialsPath]: CLIENT_SECRET_FILE,
    });
    const interactiveAuth = createFakeOAuth2Client();
    interactiveAuth.credentials = {
      access_token: 'interactive-access-token',
      refresh_token: 'interactive-refresh-token',
      scope: GMAIL_READONLY_SCOPE,
      token_type: 'Bearer',
    };
    const authenticateFn = jest.fn(async () => interactiveAuth);

    await authenticateGmail({
      credentialsPath,
      tokenPath,
      fsClient,
      authenticateFn,
    });

    expect(authenticateFn).toHaveBeenCalledWith({
      scopes: [GMAIL_READONLY_SCOPE],
      keyfilePath: credentialsPath,
    });

    const savedCredentials = JSON.parse(fsClient.files.get(tokenPath));
    expect(savedCredentials.refresh_token).toBe('interactive-refresh-token');
    expect(savedCredentials.access_token).toBe('interactive-access-token');
  });

  test('guarda el token dentro de secrets', async () => {
    const credentialsPath = 'secrets/credentials.json';
    const tokenPath = path.join('secrets', 'gmail-token.json');
    const fsClient = createMemoryFs({
      [credentialsPath]: CLIENT_SECRET_FILE,
    });
    const interactiveAuth = createFakeOAuth2Client();
    interactiveAuth.credentials = {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    };

    await authenticateGmail({
      credentialsPath,
      tokenPath,
      fsClient,
      authenticateFn: jest.fn(async () => interactiveAuth),
    });

    const savedPath = fsClient.writeFile.mock.calls[0][0];
    expect(path.basename(savedPath)).toBe('gmail-token.json');
    expect(path.basename(path.dirname(savedPath))).toBe('secrets');
  });

  test('no pierde refresh_token existente cuando Google renueva solo access_token', async () => {
    const credentialsPath = 'secrets/credentials.json';
    const tokenPath = 'secrets/gmail-token.json';
    const fsClient = createMemoryFs({
      [credentialsPath]: CLIENT_SECRET_FILE,
      [tokenPath]: JSON.stringify({
        access_token: 'old-access-token',
        refresh_token: 'old-refresh-token',
        scope: GMAIL_READONLY_SCOPE,
      }),
    });
    const fakeOAuthClient = createFakeOAuth2Client();

    await authenticateGmail({
      credentialsPath,
      tokenPath,
      fsClient,
      authenticateFn: jest.fn(),
      oauth2ClientFactory: jest.fn(() => fakeOAuthClient),
    });

    await fakeOAuthClient.listeners.tokens({
      access_token: 'renewed-access-token',
      expiry_date: 123456,
    });

    const savedCredentials = JSON.parse(fsClient.files.get(tokenPath));
    expect(savedCredentials.access_token).toBe('renewed-access-token');
    expect(savedCredentials.refresh_token).toBe('old-refresh-token');
    expect(savedCredentials.expiry_date).toBe(123456);
  });

  test('clasifica de forma segura errores al refrescar access token', async () => {
    const credentialsPath = 'secrets/credentials.json';
    const tokenPath = 'secrets/gmail-token.json';
    const fsClient = createMemoryFs({
      [credentialsPath]: CLIENT_SECRET_FILE,
      [tokenPath]: JSON.stringify({
        access_token: 'saved-access-token-secret',
        refresh_token: 'saved-refresh-token-secret',
        scope: GMAIL_READONLY_SCOPE,
      }),
    });
    const refreshError = new Error('invalid_grant access_token=saved-access-token-secret refresh_token=saved-refresh-token-secret');
    refreshError.response = {
      status: 400,
      data: { error: 'invalid_grant' },
    };
    const fakeOAuthClient = createFakeOAuth2Client({
      getAccessToken: jest.fn(async () => {
        throw refreshError;
      }),
    });

    await expect(authenticateGmail({
      credentialsPath,
      tokenPath,
      fsClient,
      authenticateFn: jest.fn(),
      oauth2ClientFactory: jest.fn(() => fakeOAuthClient),
      diagnosticLogger: createSilentDiagnosticLogger(),
    })).rejects.toMatchObject({
      message: expect.stringContaining('Etapa: oauth_refresh'),
    });

    await expect(authenticateGmail({
      credentialsPath,
      tokenPath,
      fsClient,
      authenticateFn: jest.fn(),
      oauth2ClientFactory: jest.fn(() => fakeOAuthClient),
      diagnosticLogger: createSilentDiagnosticLogger(),
    })).rejects.toThrow(/OAuth error: invalid_grant/);

    await expect(authenticateGmail({
      credentialsPath,
      tokenPath,
      fsClient,
      authenticateFn: jest.fn(),
      oauth2ClientFactory: jest.fn(() => fakeOAuthClient),
      diagnosticLogger: createSilentDiagnosticLogger(),
    })).rejects.not.toThrow(/saved-access-token-secret|saved-refresh-token-secret/);
  });

  test('clasifica de forma segura errores de Gmail API', async () => {
    const gmail = {
      users: {
        messages: {
          list: jest.fn(async () => {
            const error = new Error('fallo con access_token=secret-token');
            error.response = {
              status: 403,
              data: { error: 'access_denied' },
            };
            throw error;
          }),
        },
      },
    };
    const diagnosticLogger = createSilentDiagnosticLogger();

    await expect(searchGetYourGuideMessages(gmail, { diagnosticLogger })).rejects.toMatchObject({
      message: expect.stringContaining('Etapa: gmail_api'),
    });
    await expect(searchGetYourGuideMessages(gmail, { diagnosticLogger })).rejects.toThrow(/HTTP status: 403/);
    await expect(searchGetYourGuideMessages(gmail, { diagnosticLogger })).rejects.toThrow(/Error code: access_denied/);
    await expect(searchGetYourGuideMessages(gmail, { diagnosticLogger })).rejects.not.toThrow(/secret-token/);
    expect(diagnosticLogger.log).toHaveBeenCalledWith('Llamada Gmail iniciada: true');
  });
  test('no imprime tokens ni secretos durante autenticacion persistente', async () => {
    const credentialsPath = 'secrets/credentials.json';
    const tokenPath = 'secrets/gmail-token.json';
    const fsClient = createMemoryFs({
      [credentialsPath]: CLIENT_SECRET_FILE,
    });
    const interactiveAuth = createFakeOAuth2Client();
    interactiveAuth.credentials = {
      access_token: 'access-token-no-log',
      refresh_token: 'refresh-token-no-log',
    };
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await authenticateGmail({
        credentialsPath,
        tokenPath,
        fsClient,
        authenticateFn: jest.fn(async () => interactiveAuth),
      });
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    }

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test('sanitiza errores sin exponer credenciales ni tokens', () => {
    const rawError = new Error('client_secret=abc access_token=def refresh_token=ghi credentials.json');
    rawError.code = 401;

    const safeMessage = sanitizeErrorMessage(rawError);

    expect(safeMessage).toContain('401');
    expect(safeMessage).not.toContain('abc');
    expect(safeMessage).not.toContain('def');
    expect(safeMessage).not.toContain('ghi');
    expect(safeMessage).not.toContain('client_secret');
    expect(safeMessage).not.toContain('access_token');
    expect(safeMessage).not.toContain('refresh_token');
    expect(safeMessage).not.toContain('credentials.json');
  });

  test('sanitiza error de credenciales inexistentes sin imprimir ruta sensible', () => {
    const rawError = new Error('ENOENT: no such file or directory, open secrets/credentials.json');
    rawError.code = 'ENOENT';

    const safeMessage = sanitizeErrorMessage(rawError);

    expect(safeMessage).toContain('credenciales OAuth locales');
    expect(safeMessage).not.toContain('credentials.json');
    expect(safeMessage).not.toContain('secrets/');
  });
});