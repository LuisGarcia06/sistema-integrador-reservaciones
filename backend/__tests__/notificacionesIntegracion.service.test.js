jest.mock('../config/database', () => ({ query: jest.fn() }));
const { obtenerResumenNotificaciones } = require('../services/notificacionesIntegracion.service');
const now = new Date('2026-10-17T18:00:00Z');
const event = (id, overrides = {}) => ({ id_evento_integracion: id, provider: 'getyourguide', event_type: 'new_booking', review_status: 'pending_review', ...overrides });
const setup = events => ({ query: jest.fn().mockResolvedValue({ rows: [{ environment_database: 'synthetic_notifications', environment_host: '127.0.0.1', environment_port: 55000, events }] }) });
test('73 eventos: conteos completos en una consulta sin LIMIT ni datos personales', async () => {
    const db = setup(Array.from({ length: 73 }, (_, i) => event(i + 1, { nombre_cliente: 'Nunca transmitir', normalized_data: { private: 'Nunca transmitir' } })));
    const r = await obtenerResumenNotificaciones(db, now);
    expect(r.counts).toEqual({ pending: 73, actionable: 73, requires_archive: 0, requires_schedule_review: 0 });
    expect(db.query).toHaveBeenCalledTimes(1); expect(db.query.mock.calls[0][0]).not.toMatch(/\bLIMIT\b/);
    expect(JSON.stringify(r)).not.toContain('Nunca transmitir'); expect(r.environment_id).toMatch(/^[a-f0-9]{24}$/);
    expect(JSON.stringify(r)).not.toContain('synthetic_notifications');
});
test.each([['2026-10-17T13:01:00-0500', 'actionable'], ['2026-10-17T13:00:00-0500', 'requires_archive'], ['2020-01-05T06:00:00-05:00', 'requires_archive'], ['no es fecha', 'requires_schedule_review'], [null, 'requires_schedule_review']])('alta FH %p: %s', async (start_at, attention) => {
    const db = setup([event(1, { provider: 'fareharbor', start_at })]);
    expect((await obtenerResumenNotificaciones(db, now)).events[0].attention).toBe(attention);
    expect(db.query.mock.calls[0][0]).not.toMatch(/start_at\s*::/);
});
test.each(['fareharbor', 'getyourguide'])('modificación/cancelación antigua %s conserva elegibilidad', async provider => {
    const db = setup(['modification', 'cancellation'].map((event_type, i) => event(i + 1, { provider, event_type, start_at: '2020-01-01', review_status: 'approved' })));
    const r = await obtenerResumenNotificaciones(db, now); expect(r.counts.actionable).toBe(2); expect(r.events.every(e => e.review_status === 'approved')).toBe(true);
});
test('solo publicados, excluye aplicado/descartado/archivado; sin ranking ni cutoff', async () => {
    const previous = process.env.INTEGRATION_DASHBOARD_CUTOFF_AT; process.env.INTEGRATION_DASHBOARD_CUTOFF_AT = '2026-01-01T00:00:00Z';
    try {
        const db = setup([]); expect((await obtenerResumenNotificaciones(db, now)).counts.pending).toBe(0);
        const [sql, values] = db.query.mock.calls[0];
        expect(sql).toContain('aviso_publicado = true'); expect(sql).toContain('archived_at IS NULL');
        expect(sql).toContain("application_status = 'not_applied'"); expect(sql).toContain("review_status IN ('pending_review','approved')");
        expect(sql).not.toMatch(/ROW_NUMBER|NOT EXISTS|COALESCE\(source_received_at, created_at\) >=/); expect(values).toEqual([]);
    } finally { if (previous === undefined) delete process.env.INTEGRATION_DASHBOARD_CUTOFF_AT; else process.env.INTEGRATION_DASHBOARD_CUTOFF_AT = previous; }
});
test('error de esquema/conexión nunca se convierte en cero', async () => {
    await expect(obtenerResumenNotificaciones({ query: jest.fn().mockRejectedValue(Object.assign(Error('sintético'), { code: '42703' })) }, now)).rejects.toHaveProperty('code', '42703');
});
