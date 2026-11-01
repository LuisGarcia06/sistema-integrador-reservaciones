jest.mock('../config/database', () => ({ query: jest.fn() }));
const { cambiarControl, listarControles, comprobarFareHarbor } = require('../services/integracionesControl.service');
function fake({ active = false, failAudit = false } = {}) {
    const tx = { release: jest.fn(), query: jest.fn(async sql => {
        if (sql.includes('FOR UPDATE')) return { rows: [{ avisos_activados: active }] };
        if (sql.includes('UPDATE eventos_integracion')) return { rowCount: 73, rows: [] };
        if (sql.includes('INSERT INTO bitacora') && failAudit) throw Error('AUDIT_FAILED');
        return { rows: [{}] };
    }) };
    return { connect: jest.fn(async () => tx), tx };
}
test('reactivar libera todos y audita en la misma transacción, sin aplicar reservas', async () => {
    const db = fake(); expect(await cambiarControl('fareharbor', true, 8, db)).toEqual({ provider: 'fareharbor', activado: true, liberados: 73 });
    const calls = db.tx.query.mock.calls;
    expect(calls[0][0]).toBe('BEGIN'); expect(calls.at(-1)[0]).toBe('COMMIT');
    expect(calls.some(([sql]) => /LIMIT|UPDATE reservaciones|INSERT INTO reservaciones/.test(sql))).toBe(false);
    expect(calls.find(([sql]) => sql.includes('INSERT INTO bitacora'))[1]).toEqual([8, null, 'INTEGRACION_ACTIVADA', expect.stringContaining('fareharbor')]);
    expect(db.tx.release).toHaveBeenCalled();
});
test('pausa no cambia la publicación de históricos', async () => {
    const db = fake({ active: true }); await cambiarControl('getyourguide', false, 8, db);
    expect(db.tx.query.mock.calls.some(([sql]) => sql.includes('UPDATE eventos_integracion'))).toBe(false);
});
test('reintento idempotente no duplica auditoría ni liberación', async () => {
    const db = fake({ active: true }); await cambiarControl('getyourguide', true, 8, db);
    expect(db.tx.query.mock.calls.map(([sql]) => sql)).toHaveLength(3);
});
test('error de auditoría revierte cambio y liberación', async () => {
    const db = fake({ failAudit: true }); await expect(cambiarControl('fareharbor', true, 8, db)).rejects.toThrow('AUDIT_FAILED');
    expect(db.tx.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
});
test.each([['whatsapp', true], ['fareharbor', 'true'], ['getyourguide', null]])('rechaza provider/estado inválidos %s %s', async (provider, state) => {
    const db = fake(); await expect(cambiarControl(provider, state, 8, db)).rejects.toHaveProperty('statusCode', 400);
    expect(db.connect).not.toHaveBeenCalled();
});
test('error técnico Gmail y conexión FH son independientes de los botones', async () => {
    const db = { query: jest.fn().mockResolvedValueOnce({ rows: [{ provider: 'fareharbor', avisos_activados: false }, { provider: 'getyourguide', avisos_activados: true }] })
        .mockResolvedValueOnce({ rows: [{ last_error_at: new Date() }] }).mockResolvedValueOnce({ rows: [{ provider: 'fareharbor', acumulados: 27 }] }) };
    const result = await listarControles({}, db, async () => true);
    expect(result[0]).toMatchObject({ activado: false, conexion: 'receptor_local_disponible', acumulados: 27 });
    expect(result[1]).toMatchObject({ activado: true, conexion: 'error' });
});
test('estado FH consulta listeners Windows sin abrir conexiones de red', async () => {
    const run = jest.fn((file, args, options, callback) => callback(null, '1\r\n'));
    expect(await comprobarFareHarbor(run)).toBe(true);
    expect(run.mock.calls[0][1].join(' ')).toContain('Get-NetTCPConnection -LocalPort 3443');
    expect(run.mock.calls[0][2]).toMatchObject({ windowsHide: true, timeout: 5000 });
    expect(await comprobarFareHarbor((file, args, options, callback) => callback(Error('no permission'), ''))).toBe(false);
});
