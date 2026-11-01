jest.mock('../config/database', () => ({ query: jest.fn() }));
jest.mock('../integrations/getyourguide/getyourguideRecentSync.service', () => ({
    ...jest.requireActual('../integrations/getyourguide/getyourguideRecentSync.service'),
    createPriorityCapture: jest.fn(() => ({ capture: jest.fn(async (_gmail, historical) => ({ historical, checkedAt: '2026-10-21T00:00:00Z' })),
        processIds: jest.fn(), recordFailure: jest.fn(async () => {}) }))
}));
const { createContinuousSync } = require('../integrations/getyourguide/getyourguideContinuous.service');
function setup({ locked = true, initial = true } = {}) {
    const guard = { query: jest.fn(async () => ({ rows: [{ locked }] })), release: jest.fn() };
    const db = { connect: jest.fn(async () => guard) }, gmail = { users: { getProfile: jest.fn(async () => ({ data: { historyId: '500' } })) } };
    const options = { db, identity: {}, getGmailClient: jest.fn(async () => gmail), verify: jest.fn(),
        syncService: { ejecutarRecovery: jest.fn(async () => ({ eventsRegistered: 20 })) }, register: jest.fn(),
        stateService: { obtenerEstadoSync: jest.fn(async () => initial ? { last_history_id: '100' } : null),
            guardarBaselineSync: jest.fn(), iniciarRecoverySync: jest.fn(async () => ({ recovery_active: true })), registrarErrorSync: jest.fn(async () => {}) } };
    return { options, guard, run: createContinuousSync(options) };
}
test('historial terminado no se reinicia; captura continua no consulta el boton', async () => {
    const f = setup(); await f.run(); await f.run(); expect(f.options.syncService.ejecutarRecovery).not.toHaveBeenCalled();
    expect(f.options.getGmailClient).toHaveBeenCalledTimes(1);
    expect(f.options.stateService.iniciarRecoverySync).not.toHaveBeenCalled();
    expect(f.guard.query.mock.calls.flat().join(' ')).not.toContain('avisos_activados');
});
test('recuperación en curso conserva checkpoint y target entre ciclos', async () => {
    const f = setup(); f.options.stateService.obtenerEstadoSync.mockResolvedValue({ recovery_active: true, recovery_page_token: 'page-2' });
    await f.run(); expect(f.options.stateService.iniciarRecoverySync).not.toHaveBeenCalled();
});
test('dos ejecutores comparten bloqueo PostgreSQL; el segundo no accede a Gmail', async () => {
    const f = setup({ locked: false }); expect(await f.run()).toEqual({ busy: true });
    expect(f.options.getGmailClient).not.toHaveBeenCalled(); expect(f.guard.release).toHaveBeenCalled();
});
test('sin cursor crea recuperación completa, no descarta backlog con un baseline', async () => {
    const f = setup({ initial: false }); await f.run();
    expect(f.options.stateService.iniciarRecoverySync).toHaveBeenCalledWith({ recoveryTargetHistoryId: '500' }, f.guard);
    expect(f.guard.query.mock.calls.map(([sql]) => sql)).toContain('COMMIT');
});
test('falla de ciclo libera bloqueo, conserva cursor y reintenta con nuevo cliente', async () => {
    const f = setup(); f.options.verify.mockRejectedValueOnce(Error('token privado'));
    await expect(f.run()).rejects.toThrow('GYG_SYNC_ERROR'); await f.run();
    expect(f.options.getGmailClient).toHaveBeenCalledTimes(1);
    expect(f.guard.query.mock.calls.some(([sql]) => sql.includes('pg_advisory_unlock'))).toBe(true);
    expect(f.options.stateService.guardarBaselineSync).not.toHaveBeenCalled();
});
