const {
    detenerWorkerSincronizacion,
    ejecutarCicloSincronizacion,
    esHistoryIdExpirado,
    extraerMessageIdsDeHistory,
    iniciarWorkerSincronizacion,
    procesarMensajeGetYourGuide,
    syncHabilitado,
} = require('../integrations/getyourguide/getyourguideGmailSync.service');

function encodeBase64Url(value) {
    return Buffer.from(value, 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function crearMensaje({
    id = 'msg-1',
    threadId = 'thread-1',
    from = 'GetYourGuide <do-not-reply@notification.getyourguide.com>',
    subject = 'Reserva - STEST001 - GYGTEST001',
    body = 'Actividad: Tour Sian Kaan\nFecha: 2027-01-15\nParticipantes: 2\nCliente: Cliente Prueba',
    internalDate = String(new Date('2027-01-01T00:00:00Z').getTime()),
    dateHeader,
} = {}) {
    const headers = [
        { name: 'From', value: from },
        { name: 'Subject', value: subject },
    ];

    if (dateHeader !== undefined) {
        headers.push({ name: 'Date', value: dateHeader });
    }

    return {
        id,
        threadId,
        internalDate,
        payload: {
            mimeType: 'text/plain',
            headers,
            body: {
                data: encodeBase64Url(body),
            },
        },
    };
}

function crearGmailFake({
    profileHistoryId = 'history-current',
    historyPages = [],
    messages = {},
    recoveryMessages = [],
    historyError,
} = {}) {
    const historyList = jest.fn(async ({ pageToken } = {}) => {
        if (historyError) {
            throw historyError;
        }

        const index = pageToken ? Number(pageToken) : 0;
        return {
            data: historyPages[index] || { history: [], historyId: profileHistoryId },
        };
    });

    const messagesList = jest.fn(async ({ maxResults } = {}) => ({
        data: {
            messages: recoveryMessages.slice(0, maxResults),
        },
    }));

    const messagesGet = jest.fn(async ({ id }) => ({
        data: messages[id],
    }));

    return {
        users: {
            getProfile: jest.fn(async () => ({ data: { historyId: profileHistoryId } })),
            history: {
                list: historyList,
            },
            messages: {
                list: messagesList,
                get: messagesGet,
            },
        },
    };
}

function crearSyncEstadoFake(estadoInicial = null) {
    let estado = estadoInicial;

    return {
        obtenerEstadoSync: jest.fn(async () => estado),
        guardarBaselineSync: jest.fn(async ({ lastHistoryId }) => {
            estado = {
                provider: 'getyourguide',
                source: 'gmail',
                last_history_id: lastHistoryId,
            };
            return estado;
        }),
        actualizarSyncExitoso: jest.fn(async ({ lastHistoryId }) => {
            estado = {
                ...(estado || { provider: 'getyourguide', source: 'gmail' }),
                last_history_id: lastHistoryId,
            };
            return estado;
        }),
        registrarErrorSync: jest.fn(async ({ errorCode }) => {
            estado = {
                ...(estado || { provider: 'getyourguide', source: 'gmail' }),
                last_error_code: errorCode,
            };
            return estado;
        }),
    };
}

const loggerSilencioso = { log: jest.fn() };

describe('getyourguideGmailSync.service', () => {
    afterEach(() => {
        detenerWorkerSincronizacion();
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    test('primera ejecucion guarda baseline historyId y no importa historico', async () => {
        const gmail = crearGmailFake({ profileHistoryId: 'h-baseline' });
        const syncEstado = crearSyncEstadoFake(null);
        const registrarEvento = jest.fn();

        const resultado = await ejecutarCicloSincronizacion({ gmail, syncEstado, registrarEvento, logger: loggerSilencioso });

        expect(resultado.initialized).toBe(true);
        expect(resultado.eventsRegistered).toBe(0);
        expect(syncEstado.guardarBaselineSync).toHaveBeenCalledWith(expect.objectContaining({ lastHistoryId: 'h-baseline' }), undefined);
        expect(gmail.users.history.list).not.toHaveBeenCalled();
        expect(registrarEvento).not.toHaveBeenCalled();
    });

    test('history con messageAdded procesa mensaje new_booking nuevo', async () => {
        const mensaje = crearMensaje({ id: 'msg-new', subject: 'Reserva - S1 - GYGNEW001' });
        const gmail = crearGmailFake({
            historyPages: [{ history: [{ messagesAdded: [{ message: { id: 'msg-new' } }] }], historyId: 'h2' }],
            messages: { 'msg-new': mensaje },
        });
        const syncEstado = crearSyncEstadoFake({ last_history_id: 'h1' });
        const registrarEvento = jest.fn(async () => ({ duplicate: false, event: { review_status: 'pending_review' } }));

        const resultado = await ejecutarCicloSincronizacion({ gmail, syncEstado, registrarEvento, logger: loggerSilencioso });

        expect(resultado.messagesDetected).toBe(1);
        expect(resultado.eventsRegistered).toBe(1);
        expect(registrarEvento).toHaveBeenCalledWith(expect.objectContaining({
            provider: 'getyourguide',
            external_event_id: 'msg-new',
            external_thread_id: 'thread-1',
            event_type: 'new_booking',
            source_received_at: new Date('2027-01-01T00:00:00Z'),
            normalized_data: expect.objectContaining({
                tour: 'Tour Sian Kaan',
                date: '2027-01-15',
                pax: 2,
            }),
        }));
        expect(registrarEvento.mock.calls[0][0]).not.toHaveProperty('data');
        expect(registrarEvento.mock.calls[0][0]).not.toHaveProperty('email_message_id');
        expect(syncEstado.actualizarSyncExitoso).toHaveBeenCalledWith(expect.objectContaining({ lastHistoryId: 'h2' }), undefined);
    });

    test('worker usa Date header como fallback cuando internalDate es invalido', async () => {
        const gmail = crearGmailFake({
            messages: {
                msg: crearMensaje({
                    id: 'msg',
                    internalDate: 'internal-date-invalido',
                    dateHeader: 'Tue, 15 Jun 2027 10:30:00 +0000',
                }),
            },
        });
        const registrarEvento = jest.fn(async () => ({ duplicate: false, event: {} }));

        await procesarMensajeGetYourGuide(gmail, 'msg', { registrarEvento, logger: loggerSilencioso });

        expect(registrarEvento).toHaveBeenCalledWith(expect.objectContaining({
            source_received_at: new Date('2027-06-15T10:30:00.000Z'),
        }));
    });
    test('sender distinto a GYG se ignora', async () => {
        const gmail = crearGmailFake({
            messages: {
                'msg-other': crearMensaje({ id: 'msg-other', from: 'Otro <otro@example.test>' }),
            },
        });
        const registrarEvento = jest.fn();

        const resultado = await procesarMensajeGetYourGuide(gmail, 'msg-other', { registrarEvento, logger: loggerSilencioso });

        expect(resultado.tipo).toBe('ignored_sender');
        expect(registrarEvento).not.toHaveBeenCalled();
    });

    test('modification se persiste', async () => {
        const gmail = crearGmailFake({
            messages: {
                msg: crearMensaje({ id: 'msg', subject: 'Cambio en los detalles de la reserva: S1 - GYGMOD001' }),
            },
        });
        const registrarEvento = jest.fn(async () => ({ duplicate: false, event: {} }));

        await procesarMensajeGetYourGuide(gmail, 'msg', { registrarEvento, logger: loggerSilencioso });

        expect(registrarEvento).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'modification' }));
    });

    test('cancellation se persiste', async () => {
        const gmail = crearGmailFake({
            messages: {
                msg: crearMensaje({ id: 'msg', subject: 'Se ha cancelado una reserva - S1 - GYGCAN001' }),
            },
        });
        const registrarEvento = jest.fn(async () => ({ duplicate: false, event: {} }));

        await procesarMensajeGetYourGuide(gmail, 'msg', { registrarEvento, logger: loggerSilencioso });

        expect(registrarEvento).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'cancellation' }));
    });

    test('duplicate=true no falla', async () => {
        const gmail = crearGmailFake({ messages: { msg: crearMensaje({ id: 'msg' }) } });
        const registrarEvento = jest.fn(async () => ({ duplicate: true, event: {} }));

        const resultado = await procesarMensajeGetYourGuide(gmail, 'msg', { registrarEvento, logger: loggerSilencioso });

        expect(resultado.tipo).toBe('duplicate');
        expect(resultado.duplicate).toBe(1);
    });

    test('unknown se ignora sin persistir', async () => {
        const gmail = crearGmailFake({
            messages: {
                msg: crearMensaje({ id: 'msg', subject: 'Notificacion sin formato esperado GYGUNK001' }),
            },
        });
        const registrarEvento = jest.fn();

        const resultado = await procesarMensajeGetYourGuide(gmail, 'msg', { registrarEvento, logger: loggerSilencioso });

        expect(resultado.tipo).toBe('unknown');
        expect(resultado.unknown).toBe(1);
        expect(registrarEvento).not.toHaveBeenCalled();
    });

    test('multiples mensajes en un ciclo', async () => {
        const gmail = crearGmailFake({
            historyPages: [{
                history: [{ messagesAdded: [{ message: { id: 'a' } }, { message: { id: 'b' } }] }],
                historyId: 'h2',
            }],
            messages: {
                a: crearMensaje({ id: 'a', subject: 'Reserva - S1 - GYGA001' }),
                b: crearMensaje({ id: 'b', subject: 'Reserva - S2 - GYGB001' }),
            },
        });
        const syncEstado = crearSyncEstadoFake({ last_history_id: 'h1' });
        const registrarEvento = jest.fn(async () => ({ duplicate: false, event: {} }));

        const resultado = await ejecutarCicloSincronizacion({ gmail, syncEstado, registrarEvento, logger: loggerSilencioso });

        expect(resultado.messagesDetected).toBe(2);
        expect(resultado.eventsRegistered).toBe(2);
    });

    test('paginacion de history.list acumula mensajes', async () => {
        const ids = extraerMessageIdsDeHistory([
            { messagesAdded: [{ message: { id: 'a' } }] },
            { messagesAdded: [{ message: { id: 'b' } }, { message: { id: 'a' } }] },
        ]);

        expect(ids).toEqual(['a', 'b']);

        const gmail = crearGmailFake({
            historyPages: [
                { history: [{ messagesAdded: [{ message: { id: 'a' } }] }], historyId: 'h1-page', nextPageToken: '1' },
                { history: [{ messagesAdded: [{ message: { id: 'b' } }] }], historyId: 'h2' },
            ],
            messages: {
                a: crearMensaje({ id: 'a', subject: 'Reserva - S1 - GYGA001' }),
                b: crearMensaje({ id: 'b', subject: 'Reserva - S2 - GYGB001' }),
            },
        });
        const syncEstado = crearSyncEstadoFake({ last_history_id: 'h0' });
        const registrarEvento = jest.fn(async () => ({ duplicate: false, event: {} }));

        const resultado = await ejecutarCicloSincronizacion({ gmail, syncEstado, registrarEvento, logger: loggerSilencioso });

        expect(resultado.messagesDetected).toBe(2);
        expect(gmail.users.history.list).toHaveBeenCalledTimes(2);
        expect(syncEstado.actualizarSyncExitoso).toHaveBeenCalledWith(expect.objectContaining({ lastHistoryId: 'h2' }), undefined);
    });

    test('historyId solo avanza tras procesamiento exitoso', async () => {
        const gmail = crearGmailFake({
            historyPages: [{ history: [{ messagesAdded: [{ message: { id: 'msg' } }] }], historyId: 'h2' }],
            messages: { msg: crearMensaje({ id: 'msg' }) },
        });
        const syncEstado = crearSyncEstadoFake({ last_history_id: 'h1' });
        const registrarEvento = jest.fn(async () => { throw new Error('fallo persistencia'); });

        await expect(ejecutarCicloSincronizacion({ gmail, syncEstado, registrarEvento, logger: loggerSilencioso })).rejects.toThrow('fallo persistencia');
        expect(syncEstado.actualizarSyncExitoso).not.toHaveBeenCalled();
        expect(syncEstado.registrarErrorSync).toHaveBeenCalled();
    });

    test('404 history expirado inicia recovery y deduplica con limite', async () => {
        const historyError = new Error('history expired');
        historyError.response = { status: 404, data: { error: { status: 'NOT_FOUND' } } };
        const gmail = crearGmailFake({
            historyError,
            profileHistoryId: 'h-new-baseline',
            recoveryMessages: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
            messages: {
                a: crearMensaje({ id: 'a', subject: 'Reserva - S1 - GYGA001' }),
                b: crearMensaje({ id: 'b', subject: 'Reserva - S2 - GYGB001' }),
                c: crearMensaje({ id: 'c', subject: 'Reserva - S3 - GYGC001' }),
            },
        });
        const syncEstado = crearSyncEstadoFake({ last_history_id: 'old' });
        const registrarEvento = jest.fn(async (_, index = registrarEvento.mock.calls.length) => ({
            duplicate: index > 1,
            event: {},
        }));

        const resultado = await ejecutarCicloSincronizacion({
            gmail,
            syncEstado,
            registrarEvento,
            logger: loggerSilencioso,
            env: { GYG_GMAIL_RECOVERY_MAX_MESSAGES: '2' },
        });

        expect(esHistoryIdExpirado(historyError)).toBe(true);
        expect(resultado.recovery).toBe(true);
        expect(resultado.messagesDetected).toBe(2);
        expect(gmail.users.messages.list).toHaveBeenCalledWith(expect.objectContaining({ maxResults: 2 }));
        expect(syncEstado.actualizarSyncExitoso).toHaveBeenCalledWith(expect.objectContaining({ lastHistoryId: 'h-new-baseline' }), undefined);
    });

    test('Gmail error no history no se trata como recovery', async () => {
        const error = new Error('gmail down');
        error.response = { status: 500 };
        const gmail = crearGmailFake({ historyError: error });
        const syncEstado = crearSyncEstadoFake({ last_history_id: 'h1' });

        await expect(ejecutarCicloSincronizacion({ gmail, syncEstado, logger: loggerSilencioso })).rejects.toThrow('gmail down');
        expect(gmail.users.messages.list).not.toHaveBeenCalled();
        expect(syncEstado.registrarErrorSync).toHaveBeenCalled();
    });

    test('worker disabled no inicia y enabled agenda ciclos', () => {
        jest.useFakeTimers();

        expect(syncHabilitado({ GYG_GMAIL_SYNC_ENABLED: 'false' })).toBe(false);
        expect(iniciarWorkerSincronizacion({ env: { GYG_GMAIL_SYNC_ENABLED: 'false' }, logger: loggerSilencioso })).toEqual({
            started: false,
            reason: 'disabled',
        });

        const iniciado = iniciarWorkerSincronizacion({
            env: { GYG_GMAIL_SYNC_ENABLED: 'true', GYG_GMAIL_SYNC_INTERVAL_MS: '120000' },
            logger: loggerSilencioso,
            gmail: crearGmailFake(),
            syncEstado: crearSyncEstadoFake(null),
        });

        expect(iniciado).toEqual({ started: true, intervalMs: 120000 });
        expect(iniciarWorkerSincronizacion({ env: { GYG_GMAIL_SYNC_ENABLED: 'true' }, logger: loggerSilencioso }).reason).toBe('already_running');
    });

    test('no se guardan secretos en sync state y no se toca reservaciones', async () => {
        const gmail = crearGmailFake({ profileHistoryId: 'h-baseline' });
        const syncEstado = crearSyncEstadoFake(null);

        await ejecutarCicloSincronizacion({ gmail, syncEstado, logger: loggerSilencioso });

        const llamadas = [
            ...syncEstado.guardarBaselineSync.mock.calls,
            ...syncEstado.actualizarSyncExitoso.mock.calls,
            ...syncEstado.registrarErrorSync.mock.calls,
        ];
        expect(JSON.stringify(llamadas)).not.toMatch(/access_token|refresh_token|client_secret|credentials/i);
    });
});
