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
    recoveryPages,
    historyError,
    messageErrors = {},
    messagesListError,
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

    const messagesList = jest.fn(async ({ maxResults, pageToken } = {}) => {
        if (messagesListError) {
            throw messagesListError;
        }

        if (recoveryPages) {
            return {
                data: recoveryPages[pageToken || 'first'] || { messages: [] },
            };
        }

        return {
            data: {
                messages: recoveryMessages.slice(0, maxResults),
            },
        };
    });

    const messagesGet = jest.fn(async ({ id }) => {
        if (messageErrors[id]) {
            throw messageErrors[id];
        }

        return {
            data: messages[id],
        };
    });

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
    const base = () => estado || { provider: 'getyourguide', source: 'gmail' };

    return {
        obtenerEstadoSync: jest.fn(async () => estado),
        guardarBaselineSync: jest.fn(async ({ lastHistoryId }) => {
            estado = {
                ...base(),
                provider: 'getyourguide',
                source: 'gmail',
                last_history_id: lastHistoryId,
                last_error_at: null,
                last_error_code: null,
                recovery_active: false,
                recovery_page_token: null,
                recovery_target_history_id: null,
                recovery_started_at: null,
                backoff_until: null,
            };
            return estado;
        }),
        actualizarSyncExitoso: jest.fn(async ({ lastHistoryId }) => {
            estado = {
                ...base(),
                last_history_id: lastHistoryId,
                last_error_at: null,
                last_error_code: null,
                recovery_active: false,
                recovery_page_token: null,
                recovery_target_history_id: null,
                recovery_started_at: null,
                backoff_until: null,
            };
            return estado;
        }),
        iniciarRecoverySync: jest.fn(async ({ recoveryTargetHistoryId }) => {
            estado = {
                ...base(),
                recovery_active: true,
                recovery_page_token: null,
                recovery_target_history_id: recoveryTargetHistoryId,
                recovery_started_at: new Date('2027-01-01T00:00:00Z'),
                backoff_until: null,
                last_error_at: null,
                last_error_code: null,
            };
            return estado;
        }),
        guardarCheckpointRecoverySync: jest.fn(async ({ recoveryPageToken }) => {
            estado = {
                ...base(),
                recovery_active: true,
                recovery_page_token: recoveryPageToken,
            };
            return estado;
        }),
        finalizarRecoverySync: jest.fn(async ({ lastHistoryId }) => {
            estado = {
                ...base(),
                last_history_id: lastHistoryId,
                last_error_at: null,
                last_error_code: null,
                recovery_active: false,
                recovery_page_token: null,
                recovery_target_history_id: null,
                recovery_started_at: null,
                backoff_until: null,
            };
            return estado;
        }),
        registrarBackoffRecoverySync: jest.fn(async ({ errorCode, backoffUntil }) => {
            estado = {
                ...base(),
                last_error_at: new Date('2027-01-01T00:00:00Z'),
                last_error_code: errorCode,
                backoff_until: backoffUntil,
            };
            return estado;
        }),
        registrarErrorSync: jest.fn(async ({ errorCode }) => {
            estado = {
                ...base(),
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

    test('history.list 404 valido inicia recovery y captura target historyId al inicio', async () => {
        const historyError = new Error('history expired');
        historyError.response = { status: 404, data: { error: { status: 'NOT_FOUND' } } };
        const gmail = crearGmailFake({
            historyError,
            profileHistoryId: 'h-target',
            recoveryMessages: [{ id: 'a' }],
            messages: { a: crearMensaje({ id: 'a', subject: 'Reserva - S1 - GYGA001' }) },
        });
        const syncEstado = crearSyncEstadoFake({ last_history_id: 'old', recovery_active: false });
        const registrarEvento = jest.fn(async () => ({ duplicate: false, event: {} }));

        const resultado = await ejecutarCicloSincronizacion({ gmail, syncEstado, registrarEvento, logger: loggerSilencioso });

        expect(esHistoryIdExpirado(historyError)).toBe(true);
        expect(resultado.recovery).toBe(true);
        expect(gmail.users.getProfile).toHaveBeenCalledTimes(1);
        expect(syncEstado.iniciarRecoverySync).toHaveBeenCalledWith(expect.objectContaining({ recoveryTargetHistoryId: 'h-target' }), undefined);
    });

    test('messages.get 404 se salta y no inicia recovery', async () => {
        const notFound = new Error('message not found');
        notFound.response = { status: 404, data: { error: { status: 'NOT_FOUND' } } };
        const gmail = crearGmailFake({
            historyPages: [{ history: [{ messagesAdded: [{ message: { id: 'missing' } }, { message: { id: 'ok' } }] }], historyId: 'h2' }],
            messages: { ok: crearMensaje({ id: 'ok', subject: 'Reserva - S1 - GYGOK001' }) },
            messageErrors: { missing: notFound },
        });
        const syncEstado = crearSyncEstadoFake({ last_history_id: 'h1', recovery_active: false });
        const registrarEvento = jest.fn(async () => ({ duplicate: false, event: {} }));

        const resultado = await ejecutarCicloSincronizacion({ gmail, syncEstado, registrarEvento, logger: loggerSilencioso });

        expect(resultado.skipped).toBe(1);
        expect(resultado.eventsRegistered).toBe(1);
        expect(syncEstado.iniciarRecoverySync).not.toHaveBeenCalled();
        expect(syncEstado.actualizarSyncExitoso).toHaveBeenCalledWith(expect.objectContaining({ lastHistoryId: 'h2' }), undefined);
    });

    test('recovery procesa maximo batch size 25 por ciclo', async () => {
        const recoveryMessages = Array.from({ length: 30 }, (_, index) => ({ id: `msg-${index}` }));
        const messages = Object.fromEntries(recoveryMessages.map(({ id }) => [id, crearMensaje({ id, subject: `Reserva - S1 - GYG${id.toUpperCase()}` })]));
        const gmail = crearGmailFake({ recoveryMessages, messages });
        const syncEstado = crearSyncEstadoFake({
            last_history_id: 'old',
            recovery_active: true,
            recovery_target_history_id: 'h-target',
        });
        const registrarEvento = jest.fn(async () => ({ duplicate: false, event: {} }));

        const resultado = await ejecutarCicloSincronizacion({ gmail, syncEstado, registrarEvento, logger: loggerSilencioso });

        expect(gmail.users.messages.list).toHaveBeenCalledWith(expect.objectContaining({ maxResults: 25 }));
        expect(resultado.messagesDetected).toBe(25);
        expect(gmail.users.messages.get).toHaveBeenCalledTimes(25);
    });

    test('pagina completa con nextPageToken guarda checkpoint sin avanzar last_history_id', async () => {
        const gmail = crearGmailFake({
            recoveryPages: { first: { messages: [{ id: 'a' }], nextPageToken: 'page-2' } },
            messages: { a: crearMensaje({ id: 'a', subject: 'Reserva - S1 - GYGA001' }) },
        });
        const syncEstado = crearSyncEstadoFake({ last_history_id: 'old', recovery_active: true, recovery_target_history_id: 'h-target' });
        const registrarEvento = jest.fn(async () => ({ duplicate: false, event: {} }));

        const resultado = await ejecutarCicloSincronizacion({ gmail, syncEstado, registrarEvento, logger: loggerSilencioso });

        expect(resultado.recoveryCompleted).toBe(false);
        expect(syncEstado.guardarCheckpointRecoverySync).toHaveBeenCalledWith(expect.objectContaining({ recoveryPageToken: 'page-2' }), undefined);
        expect(syncEstado.finalizarRecoverySync).not.toHaveBeenCalled();
    });

    test('siguiente ciclo usa recovery_page_token persistido', async () => {
        const gmail = crearGmailFake({
            recoveryPages: { 'page-2': { messages: [{ id: 'b' }] } },
            messages: { b: crearMensaje({ id: 'b', subject: 'Reserva - S1 - GYGB001' }) },
        });
        const syncEstado = crearSyncEstadoFake({
            last_history_id: 'old',
            recovery_active: true,
            recovery_page_token: 'page-2',
            recovery_target_history_id: 'h-target',
        });
        const registrarEvento = jest.fn(async () => ({ duplicate: false, event: {} }));

        await ejecutarCicloSincronizacion({ gmail, syncEstado, registrarEvento, logger: loggerSilencioso });

        expect(gmail.users.messages.list).toHaveBeenCalledWith(expect.objectContaining({ pageToken: 'page-2' }));
    });

    test('error a mitad de pagina no avanza checkpoint', async () => {
        const gmail = crearGmailFake({
            recoveryPages: { first: { messages: [{ id: 'a' }, { id: 'b' }], nextPageToken: 'page-2' } },
            messages: {
                a: crearMensaje({ id: 'a', subject: 'Reserva - S1 - GYGA001' }),
                b: crearMensaje({ id: 'b', subject: 'Reserva - S1 - GYGB001' }),
            },
        });
        const syncEstado = crearSyncEstadoFake({ last_history_id: 'old', recovery_active: true, recovery_target_history_id: 'h-target' });
        const registrarEvento = jest.fn(async (_, index = registrarEvento.mock.calls.length) => {
            if (index > 1) throw new Error('fallo mitad pagina');
            return { duplicate: false, event: {} };
        });

        await expect(ejecutarCicloSincronizacion({ gmail, syncEstado, registrarEvento, logger: loggerSilencioso })).rejects.toThrow('fallo mitad pagina');
        expect(syncEstado.guardarCheckpointRecoverySync).not.toHaveBeenCalled();
    });

    test('duplicados al repetir pagina no crean eventos nuevos', async () => {
        const gmail = crearGmailFake({
            recoveryMessages: [{ id: 'a' }, { id: 'b' }],
            messages: {
                a: crearMensaje({ id: 'a', subject: 'Reserva - S1 - GYGA001' }),
                b: crearMensaje({ id: 'b', subject: 'Reserva - S1 - GYGB001' }),
            },
        });
        const syncEstado = crearSyncEstadoFake({ last_history_id: 'old', recovery_active: true, recovery_target_history_id: 'h-target' });
        const registrarEvento = jest.fn(async () => ({ duplicate: true, event: {} }));

        const resultado = await ejecutarCicloSincronizacion({ gmail, syncEstado, registrarEvento, logger: loggerSilencioso });

        expect(resultado.eventsRegistered).toBe(0);
        expect(resultado.duplicates).toBe(2);
    });

    test('quota exceeded guarda backoff y conserva checkpoint', async () => {
        const quota = new Error('Quota exceeded');
        quota.response = { status: 429, data: { error: { status: 'RESOURCE_EXHAUSTED' } } };
        const gmail = crearGmailFake({
            recoveryPages: { first: { messages: [{ id: 'a' }, { id: 'b' }], nextPageToken: 'page-2' } },
            messages: { a: crearMensaje({ id: 'a', subject: 'Reserva - S1 - GYGA001' }) },
            messageErrors: { b: quota },
        });
        const syncEstado = crearSyncEstadoFake({ last_history_id: 'old', recovery_active: true, recovery_target_history_id: 'h-target' });
        const registrarEvento = jest.fn(async () => ({ duplicate: false, event: {} }));

        const resultado = await ejecutarCicloSincronizacion({
            gmail,
            syncEstado,
            registrarEvento,
            logger: loggerSilencioso,
            env: { GYG_GMAIL_QUOTA_BACKOFF_MS: '900000' },
        });

        expect(resultado.quotaLimited).toBe(true);
        expect(syncEstado.registrarBackoffRecoverySync).toHaveBeenCalledWith(expect.objectContaining({ errorCode: expect.any(String), backoffUntil: expect.any(Date) }), undefined);
        expect(syncEstado.guardarCheckpointRecoverySync).not.toHaveBeenCalled();
        expect(syncEstado.finalizarRecoverySync).not.toHaveBeenCalled();
    });

    test('ciclo durante backoff no llama Gmail', async () => {
        const gmail = crearGmailFake();
        const syncEstado = crearSyncEstadoFake({
            last_history_id: 'old',
            recovery_active: true,
            recovery_target_history_id: 'h-target',
            backoff_until: new Date(Date.now() + 60000),
        });

        const resultado = await ejecutarCicloSincronizacion({ gmail, syncEstado, logger: loggerSilencioso });

        expect(resultado.backoff).toBe(true);
        expect(gmail.users.messages.list).not.toHaveBeenCalled();
        expect(gmail.users.messages.get).not.toHaveBeenCalled();
    });

    test('recovery final usa target inicial y no obtiene historyId nuevo al final', async () => {
        const gmail = crearGmailFake({
            profileHistoryId: 'h-should-not-use-at-end',
            recoveryMessages: [{ id: 'a' }],
            messages: { a: crearMensaje({ id: 'a', subject: 'Reserva - S1 - GYGA001' }) },
        });
        const syncEstado = crearSyncEstadoFake({ last_history_id: 'old', recovery_active: true, recovery_target_history_id: 'h-target' });
        const registrarEvento = jest.fn(async () => ({ duplicate: false, event: {} }));

        const resultado = await ejecutarCicloSincronizacion({ gmail, syncEstado, registrarEvento, logger: loggerSilencioso });

        expect(resultado.recoveryCompleted).toBe(true);
        expect(resultado.historyId).toBe('h-target');
        expect(syncEstado.finalizarRecoverySync).toHaveBeenCalledWith(expect.objectContaining({ lastHistoryId: 'h-target' }), undefined);
        expect(gmail.users.getProfile).not.toHaveBeenCalled();
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
