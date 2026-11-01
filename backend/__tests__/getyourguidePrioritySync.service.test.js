jest.mock('../config/database', () => ({ query: jest.fn(() => { throw Error('REAL_DATABASE_FORBIDDEN'); }) }));
const { createContinuousSync } = require('../integrations/getyourguide/getyourguideContinuous.service');
const realSync = require('../integrations/getyourguide/getyourguideGmailSync.service');
const sender = 'do-not-reply@notification.getyourguide.com';
function message(id, type = 'new_booking', from = sender) {
    const subjects = { new_booking: 'Reserva - GYGTEST0001', modification: 'Cambio en los detalles de la reserva: GYGTEST0001', cancellation: 'Se ha cancelado una reserva - GYGTEST0001' };
    return { id, threadId: id, internalDate: '1792611427000', payload: { mimeType: 'text/plain', headers: [
        { name: 'From', value: from }, { name: 'Subject', value: subjects[type] || 'Mensaje desconocido' }
    ], body: { data: Buffer.from('Referencia: GYGTEST0001\nActividad: Tour de prueba\nFecha: 30 de octubre de 2026\nParticipantes: 2').toString('base64url') } } };
}
function fixture({ active = true, historicalActive = true, recent = null } = {}) {
    const rows = new Map([['gmail', { last_history_id: '10', recovery_target_history_id: '20', recovery_active: historicalActive, recovery_page_token: historicalActive ? 'old2' : null }]]);
    if (recent) rows.set('gmail_recent', recent);
    const events = new Map(), order = [], emails = new Map([['new', message('new')], ['old', message('old')]]);
    const clock = { value: 1000000 }, state = {};
    state.obtenerEstadoSync = jest.fn(async ({ source }) => structuredClone(rows.get(source) || null));
    state.guardarCheckpointIncrementalSync = jest.fn(async ({ lastHistoryId, pageToken = null, completed }) => {
        const row = { ...rows.get('gmail_recent'), last_history_id: lastHistoryId, recovery_page_token: pageToken, backoff_until: null };
        if (completed) row.last_successful_sync_at = new Date(clock.value);
        rows.set('gmail_recent', row); return structuredClone(row);
    });
    state.reflejarSyncRecienteExitoso = jest.fn();
    state.guardarBaselineSync = jest.fn(async ({ lastHistoryId }) => { rows.set('gmail', { last_history_id: lastHistoryId }); });
    state.iniciarRecoverySync = jest.fn(async ({ recoveryTargetHistoryId }) => {
        const row = { ...rows.get('gmail'), recovery_active: true, recovery_target_history_id: recoveryTargetHistoryId, recovery_page_token: null };
        rows.set('gmail', row); order.push('reset-history'); return structuredClone(row);
    });
    state.guardarCheckpointRecoverySync = jest.fn(async ({ recoveryPageToken }) => { rows.get('gmail').recovery_page_token = recoveryPageToken; });
    state.finalizarRecoverySync = jest.fn(async ({ lastHistoryId }) => { rows.set('gmail', { last_history_id: lastHistoryId, recovery_active: false, recovery_page_token: null }); });
    state.registrarErrorSync = jest.fn(async () => {});
    state.registrarBackoffIncrementalSync = jest.fn(async ({ backoffUntil }) => { rows.get('gmail_recent').backoff_until = backoffUntil; });
    state.registrarBackoffRecoverySync = jest.fn(async ({ backoffUntil }) => { rows.get('gmail').backoff_until = backoffUntil; });
    const guard = { release: jest.fn(), query: jest.fn(async (sql, values) => {
        if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }] };
        if (sql.includes('SELECT external_event_id')) return { rows: (values[1] || []).filter(id => events.has(id)).map(id => ({ external_event_id: id })) };
        return { rows: [] };
    }) };
    const gmail = { users: { getProfile: jest.fn(async () => ({ data: { historyId: '500' } })),
        messages: { list: jest.fn(async ({ pageToken }) => ({ data: pageToken === 'old2'
            ? { messages: [{ id: 'old' }], nextPageToken: 'old3' }
            : { messages: [{ id: 'new' }] } })),
        get: jest.fn(async ({ id }) => { if (!emails.has(id)) throw { code: 404 }; return { data: emails.get(id) }; }) },
        history: { list: jest.fn(async () => ({ data: { historyId: '99', history: [] } })) } } };
    const register = jest.fn(async event => {
        order.push(event.external_event_id);
        if (events.has(event.external_event_id)) return { duplicate: true, event: events.get(event.external_event_id) };
        const stored = { ...event, application_status: 'not_applied', aviso_publicado: active };
        events.set(event.external_event_id, stored); return { duplicate: false, event: stored };
    });
    const options = { db: { connect: jest.fn(async () => guard) }, identity: {}, getGmailClient: jest.fn(async () => gmail),
        verify: jest.fn(), stateService: state, syncService: realSync, register, now: () => clock.value };
    return { rows, events, order, emails, clock, state, guard, gmail, register, options, run: createContinuousSync(options) };
}

test('primero registra correo reciente y despues continua el checkpoint historico', async () => {
    const f = fixture(); await f.run();
    expect(f.order).toEqual(['new', 'old']);
    expect(f.gmail.users.history.list).toHaveBeenCalledWith(expect.objectContaining({ startHistoryId: '20' }));
    expect(f.rows.get('gmail_recent').last_history_id).toBe('99');
    expect(f.rows.get('gmail').recovery_page_token).toBe('old3');
    expect(f.state.iniciarRecoverySync).not.toHaveBeenCalled();
});
test('historial completado permanece terminado entre ciclos y reinicios', async () => {
    const f = fixture({ historicalActive: false }); await f.run(); await createContinuousSync(f.options)();
    expect(f.gmail.users.messages.list).toHaveBeenCalledTimes(2);
    expect(f.state.iniciarRecoverySync).not.toHaveBeenCalled();
    expect(f.events.size).toBe(1);
});
test.each(['new_booking', 'modification', 'cancellation'])('captura %s con pausa sin consultar ni modificar controles', async type => {
    const f = fixture({ active: false }); f.emails.set('new', message('new', type)); await f.run();
    expect(f.events.get('new')).toMatchObject({ event_type: type, review_status: 'pending_review', application_status: 'not_applied', aviso_publicado: false });
    expect(f.guard.query.mock.calls.some(([sql]) => /avisos_activados|(?:UPDATE|INSERT INTO) reservaciones/.test(sql))).toBe(false);
});
test('misma identidad en cabecera, History, historico y reinicio solo se registra una vez', async () => {
    const f = fixture();
    f.gmail.users.history.list.mockResolvedValue({ data: { historyId: '99', history: [{ messagesAdded: [{ message: { id: 'new' } }] }] } });
    await f.run(); await createContinuousSync(f.options)();
    expect(f.register.mock.calls.filter(([event]) => event.external_event_id === 'new')).toHaveLength(1);
    expect(f.gmail.users.messages.get.mock.calls.filter(([arg]) => arg.id === 'new' && arg.format === 'full')).toHaveLength(1);
});
test('paginacion reciente conserva inicio y token independientemente del historico', async () => {
    const f = fixture(); f.gmail.users.history.list.mockResolvedValueOnce({ data: { historyId: '99', history: [], nextPageToken: 'recent2' } });
    await f.run(); expect(f.rows.get('gmail_recent')).toMatchObject({ last_history_id: '20', recovery_page_token: 'recent2' });
    f.emails.set('new2', message('new2')); f.gmail.users.messages.list.mockImplementation(async ({ pageToken }) => ({ data: pageToken ? { messages: [] } : { messages: [{ id: 'new2' }] } }));
    await createContinuousSync(f.options)();
    expect(f.events.has('new2')).toBe(true);
    expect(f.gmail.users.history.list.mock.calls.at(-1)[0]).toMatchObject({ startHistoryId: '20', pageToken: 'recent2' });
    expect(f.rows.get('gmail_recent')).toMatchObject({ last_history_id: '99', recovery_page_token: null });
});
test('fallo despues de persistir parte de pagina no avanza cursor ni pierde el resto', async () => {
    const f = fixture({ historicalActive: false }); f.emails.set('second', message('second')); f.emails.set('third', message('third'));
    f.gmail.users.history.list.mockResolvedValue({ data: { historyId: '99', history: [{ messagesAdded: ['second','third'].map(id => ({ message: { id } })) }] } });
    const original = f.register.getMockImplementation(); let failed = false;
    f.register.mockImplementation(async event => { if (event.external_event_id === 'third' && !failed) { failed = true; throw Error('isolated'); } return original(event); });
    await expect(f.run()).rejects.toThrow('GYG_SYNC_ERROR');
    expect(f.rows.get('gmail_recent').last_history_id).toBe('20'); expect(f.events.has('second')).toBe(true);
    await createContinuousSync(f.options)(); expect(f.events.size).toBe(3); expect(f.rows.get('gmail_recent').last_history_id).toBe('99');
});
test('History solo descarga metadatos de mensajes ajenos y no sus cuerpos', async () => {
    const f = fixture({ historicalActive: false }); f.emails.set('other', message('other', 'new_booking', 'other@example.invalid'));
    f.gmail.users.history.list.mockResolvedValue({ data: { historyId: '99', history: [{ messagesAdded: [{ message: { id: 'other' } }] }] } });
    await f.run(); expect(f.events.has('other')).toBe(false);
    expect(f.gmail.users.messages.get.mock.calls.filter(([arg]) => arg.id === 'other').map(([arg]) => arg.format)).toEqual(['metadata']);
});
test('429 persiste backoff y respeta Retry-After sin gastar cuota en otros recorridos', async () => {
    const f = fixture(); f.gmail.users.history.list.mockRejectedValueOnce({ response: { status: 429, headers: { 'retry-after': '180' } } });
    await expect(f.run()).rejects.toThrow('GYG_SYNC_HTTP_429');
    expect(f.rows.get('gmail_recent').backoff_until.getTime()).toBe(f.clock.value + 180000);
    const count = f.gmail.users.messages.list.mock.calls.length; expect(await f.run()).toEqual({ backoff: true });
    expect(f.gmail.users.messages.list).toHaveBeenCalledTimes(count);
    f.clock.value += 180001; await f.run(); expect(f.rows.get('gmail_recent').last_history_id).toBe('99');
});
test('History caducado recupera ventana y sigue dando prioridad a novedades', async () => {
    const f = fixture(); f.gmail.users.history.list.mockRejectedValueOnce({ code: 404 }); await f.run();
    expect(f.order.indexOf('new')).toBeLessThan(f.order.indexOf('reset-history'));
    expect(f.rows.get('gmail_recent').last_history_id).toBe('500');
    expect(f.state.iniciarRecoverySync).toHaveBeenCalledTimes(1);
});
test('token reciente invalido reinicia solo su paginacion, no el historico', async () => {
    const f = fixture({ recent: { last_history_id: '20', recovery_page_token: 'bad' } });
    f.gmail.users.history.list.mockRejectedValueOnce({ code: 400 }); await expect(f.run()).rejects.toThrow('GYG_SYNC_HTTP_400');
    expect(f.rows.get('gmail_recent')).toMatchObject({ last_history_id: '20', recovery_page_token: null });
    expect(f.rows.get('gmail').recovery_page_token).toBe('old2'); expect(f.state.iniciarRecoverySync).not.toHaveBeenCalled();
});
test('error historico no impide capturar una novedad en el ciclo siguiente', async () => {
    const f = fixture(); const original = f.gmail.users.messages.get.getMockImplementation();
    f.gmail.users.messages.get.mockImplementation(async arg => { if (arg.id === 'old') throw Error('historical parser/network error'); return original(arg); });
    expect((await f.run()).historical.error).toBe('GYG_SYNC_ERROR');
    f.emails.set('new2', message('new2')); f.gmail.users.messages.list.mockImplementation(async ({ pageToken }) => ({ data: { messages: [{ id: pageToken ? 'old' : 'new2' }] } }));
    await f.run(); expect(f.events.has('new2')).toBe(true);
});
test('presupuesto historico cede con checkpoint intacto y progresa al reintentar', async () => {
    const f = fixture(); f.emails.set('old2msg', message('old2msg'));
    f.gmail.users.messages.list.mockImplementation(async ({ pageToken }) => ({ data: pageToken ? { messages: [{ id: 'old' },{ id: 'old2msg' }], nextPageToken: 'old3' } : { messages: [{ id: 'new' }] } }));
    const original = f.register.getMockImplementation(); f.register.mockImplementation(async event => { const value = await original(event); if (event.external_event_id === 'old') f.clock.value += 21000; return value; });
    expect((await f.run()).historical.yielded).toBe(true); expect(f.rows.get('gmail').recovery_page_token).toBe('old2');
    await f.run(); expect(f.events.has('old2msg')).toBe(true); expect(f.rows.get('gmail').recovery_page_token).toBe('old3');
});
test('segundo ejecutor ocupado no accede a Gmail', async () => {
    const f = fixture(); f.guard.query.mockResolvedValueOnce({ rows: [{ locked: false }] });
    expect(await f.run()).toEqual({ busy: true }); expect(f.options.getGmailClient).not.toHaveBeenCalled();
});
test('cuota historica respeta Retry-After largo y detiene llamadas del siguiente ciclo', async () => {
    const f = fixture(); const original = f.gmail.users.messages.list.getMockImplementation();
    f.gmail.users.messages.list.mockImplementation(async args => {
        if (args.pageToken === 'old2') throw { response: { status: 429, headers: { 'retry-after': '300' } } };
        return original(args);
    });
    const before = Date.now(); expect((await f.run()).quotaLimited).toBe(true);
    expect(f.rows.get('gmail').backoff_until.getTime()).toBeGreaterThanOrEqual(before + 300000);
    const calls = f.gmail.users.messages.list.mock.calls.length;
    expect(await f.run()).toEqual({ backoff: true }); expect(f.gmail.users.messages.list).toHaveBeenCalledTimes(calls);
});
test('Retry-After admite fecha HTTP y Headers sin adelantar la reanudacion', () => {
    const now = Date.parse('2026-10-21T20:00:00Z');
    expect(realSync.obtenerRetryAfterMs({ response: { headers: { 'retry-after': 'Wed, 21 Oct 2026 20:05:00 GMT' } } }, now)).toBe(300000);
    expect(realSync.obtenerRetryAfterMs({ response: { headers: { get: () => '180' } } }, now)).toBe(180000);
    expect(realSync.obtenerRetryAfterMs({ response: { headers: { 'retry-after': 'invalid' } } }, now)).toBe(0);
});
