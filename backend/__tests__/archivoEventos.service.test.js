jest.mock('../services/reservaciones.service', () => ({ crearReservacionConDb: jest.fn(), actualizarReservacionParcialConDb: jest.fn(), cancelarReservacionConDb: jest.fn() }));
jest.mock('../integrations/fareharbor/fareharborCancellationPreview.service', () => ({
    BOOKING_STATUS_CANCELLED: 'cancelled', EVENT_TYPE_CANCELLATION: 'cancellation', PROVIDER_FAREHARBOR: 'fareharbor',
    RESOLUTION_CANCEL_RESERVATION: 'cancel_reservation', RESOLUTION_LINK_BROKEN: 'link_broken',
    RESOLUTION_RECONCILE_ALREADY_CANCELLED: 'reconcile_already_cancelled', RESOLUTION_RESOLVE_WITHOUT_LINK: 'resolve_without_link',
    obtenerPreviewCancellationFareHarborConDb: jest.fn(async () => ({ tipo: 'preview', fareharbor_cancellation_preview: {
        cancellation_fingerprint: 'a'.repeat(64), resolution_mode: 'resolve_without_link', blocking_issues: []
    } }))
}));
const service = require('../services/eventosIntegracion.service');
const { validarArchivoEventoIntegracion, validarFiltrosEventosIntegracion } = require('../validators/eventosIntegracion.validator');
const { crearEvento, crearPool } = require('./helpers/archivoEventosFake.cjs');
const reservas = require('../services/reservaciones.service');
const { aplicarNuevaReservaGetYourGuide } = require('../integrations/getyourguide/getyourguideReservationApplication.service');
const { aplicarNuevaReservaFareHarbor } = require('../integrations/fareharbor/fareharborApplication.service');
const { aplicarModificationFareHarbor } = require('../integrations/fareharbor/fareharborModificationApplication.service');
const { aplicarCancellationFareHarbor } = require('../integrations/fareharbor/fareharborCancellationApplication.service');
const archivar = (pool, motivo = 'Actividad transcurrida') => service.archivarEventoIntegracion({ idEventoIntegracion: 801, idUsuario: 9, motivo }, pool);
beforeEach(() => jest.clearAllMocks());

test.each(['pending_review', 'approved'])('Archivo conserva revisión %s, aplicación y snapshot; solo actualiza el evento', async review => {
    const original = crearEvento({ review_status: review }); const pool = crearPool(original);
    const result = await archivar(pool, '  Actividad transcurrida  ');
    expect(result.tipo).toBe('archivado');
    expect(pool.state.evento).toMatchObject({ ...original, archived_at: expect.any(String), archived_by: 9, archive_reason: 'Actividad transcurrida' });
    expect(pool.state.writes).toHaveLength(1);
    expect(pool.state.writes[0].split('WHERE')[0]).not.toMatch(/(?:review_status|application_status)\s*=/);
    expect(pool.state.calls.at(-1)).toBe('COMMIT');
});
test.each([undefined, null, '', ' \t\n ', 1, true, [], {}, 'a'.repeat(501)])('Motivo inválido: %p', async motivo => {
    const pool = crearPool();
    const result = await service.archivarEventoIntegracion({ idEventoIntegracion: 801, idUsuario: 9, motivo }, pool);
    expect(result.tipo).toBe('motivo_invalido'); expect(pool.state.calls).toHaveLength(0);
    expect(validarArchivoEventoIntegracion({ motivo }).errores.length).toBeGreaterThan(0);
});
test('Límite 500 caracteres, Unicode y rechazo de suplantación de usuario/fecha', () => {
    expect(validarArchivoEventoIntegracion({ motivo: 'a'.repeat(500) }).errores).toEqual([]);
    expect(validarArchivoEventoIntegracion({ motivo: '😀'.repeat(500) }).errores).toEqual([]);
    expect(validarArchivoEventoIntegracion({ motivo: 'Ok', archived_by: 1, archived_at: '2020-01-01' }).errores.length).toBeGreaterThan(0);
});
test.each([
    [null, 'no_encontrado'], [crearEvento({ archived_at: '2020-01-01', archived_by: 3, archive_reason: 'Original' }), 'ya_archivado'],
    [crearEvento({ application_status: 'applied' }), 'ya_aplicado'], [crearEvento({ review_status: 'dismissed' }), 'revision_no_permitida']
])('Rechazo sin escritura: %s', async (evento, tipo) => {
    const pool = crearPool(evento); expect((await archivar(pool)).tipo).toBe(tipo);
    expect(pool.state.writes).toEqual([]); expect(pool.state.evento).toEqual(evento);
});
test('Doble archivo concurrente conserva al primer responsable y motivo', async () => {
    const pool = crearPool();
    const results = await Promise.all([archivar(pool, 'Primero'), archivar(pool, 'Segundo')]);
    expect(results.map(r => r.tipo)).toEqual(['archivado', 'ya_archivado']);
    expect(pool.state.evento.archive_reason).toBe('Primero'); expect(pool.state.writes).toHaveLength(1);
});
test.each(['archivo', 'aplicacion'])('Concurrencia con servicio real de resolución FH: gana %s', async primero => {
    const pool = crearPool();
    const archivo = () => archivar(pool);
    const aplicacion = () => aplicarCancellationFareHarbor(801, 8, { cancellation_fingerprint: 'a'.repeat(64) }, pool);
    const [a, b] = await Promise.all(primero === 'archivo' ? [archivo(), aplicacion()] : [aplicacion(), archivo()]);
    expect([a.tipo, b.tipo]).toEqual(primero === 'archivo' ? ['archivado', 'evento_archivado'] : ['aplicado', 'ya_aplicado']);
    expect(pool.state.writes).toHaveLength(1);
    Object.values(reservas).forEach(fn => expect(fn).not.toHaveBeenCalled());
});
test.each([
    ['getyourguide', 'new_booking', aplicarNuevaReservaGetYourGuide], ['getyourguide', 'modification', aplicarNuevaReservaGetYourGuide],
    ['getyourguide', 'cancellation', aplicarNuevaReservaGetYourGuide], ['fareharbor', 'new_booking', aplicarNuevaReservaFareHarbor],
    ['fareharbor', 'modification', aplicarModificationFareHarbor], ['fareharbor', 'cancellation', aplicarCancellationFareHarbor]
])('Archivado bloquea %s/%s antes de altas, cambios, cancelaciones o resolución sin cambios', async (provider, event_type, apply) => {
    const pool = crearPool(crearEvento({ provider, event_type, archived_at: '2026-10-17' }));
    expect((await apply(801, 9, {}, pool)).tipo).toBe('evento_archivado');
    expect(pool.state.calls.some(sql => /SELECT[\s\S]+archived_at[\s\S]+FOR UPDATE/.test(sql))).toBe(true);
    expect(pool.state.writes).toEqual([]);
    Object.values(reservas).forEach(fn => expect(fn).not.toHaveBeenCalled());
});
test('Historial independiente de revisión, sin corte ni reducción a último snapshot', async () => {
    const validated = validarFiltrosEventosIntegracion({ archived: 'true' });
    expect(validated.errores).toEqual([]); expect(validated.filtros.review_status).toBeUndefined();
    const fuente = service.construirFuenteEventosIntegracion(validated.filtros);
    expect(fuente.from).toContain('archived_at IS NOT NULL'); expect(fuente.prefix).toBe('');
    expect(fuente.from).not.toContain('review_status');
    expect(validarFiltrosEventosIntegracion({ archived: 'true', operational_only: 'true' }).errores.length).toBeGreaterThan(0);
    const db = { query: jest.fn().mockResolvedValueOnce({ rows: [{ total: 1 }] }).mockResolvedValueOnce({ rows: [crearEvento({ archived_at: '2026-10-17' })] }) };
    const response = await service.listarEventosIntegracion(validated.filtros, { page: 1, limit: 25 }, db);
    expect(response.pagination.total).toBe(1); expect(response.data[0].archived_at).toBeTruthy();
    expect(db.query.mock.calls.every(([sql]) => /archived_at IS NOT NULL/.test(sql))).toBe(true);
});
test('FH elige último snapshot antes de excluir archivados: nunca resucita el anterior', async () => {
    const rows = [crearEvento({ id_evento_integracion: 800 }), crearEvento({ id_evento_integracion: 801, archived_at: '2026-10-17' })];
    const fuente = service.construirFuenteEventosIntegracion({ operational_only: true });
    const base = fuente.prefix.split('eventos_fareharbor_latest AS')[0];
    expect(base).not.toContain('archived_at IS NULL');
    expect(fuente.prefix.indexOf('archived_at IS NULL')).toBeGreaterThan(fuente.prefix.indexOf('WHERE operational_row_number = 1'));
    const db = { query: jest.fn(async sql => {
        const latest = rows.at(-1); return { rows: /COUNT/.test(sql) ? [{ total: latest.archived_at ? 0 : 1 }] : [latest] };
    }) };
    expect((await service.listarEventosIntegracion({ operational_only: true }, {}, db)).data).toEqual([]);
    rows.push(crearEvento({ id_evento_integracion: 802, external_event_id: 'nuevo-snapshot' }));
    expect((await service.listarEventosIntegracion({ operational_only: true }, {}, db)).data[0].id_evento_integracion).toBe(802);
});
test('Reentrega idéntica preserva archivo; identidad nueva se inserta como evento nuevo', async () => {
    const archived = crearEvento({ archived_at: '2026-10-17', archive_reason: 'Conservar', archived_by: 9 });
    const query = jest.fn().mockResolvedValueOnce({ rows: [archived] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [crearEvento({ external_event_id: 'nuevo' })] });
    expect((await service.registrarEventoIntegracion(archived, { query })).event.archive_reason).toBe('Conservar');
    expect(query).toHaveBeenCalledTimes(1);
    expect((await service.registrarEventoIntegracion({ ...archived, external_event_id: 'nuevo' }, { query })).duplicate).toBe(false);
    expect(query.mock.calls[2][0]).toContain('DO NOTHING');
    expect(query.mock.calls[2][0]).not.toMatch(/SET archived/);
});
test('Guardia de esquema bloquea versión previa y permite esquema preparado, sin DDL', async () => {
    const { verificarEsquemaArchivoEventos } = require('../config/schemaArchivoEventos');
    const db = { query: jest.fn().mockResolvedValueOnce({ rows: [{ columnas: 0, restricciones: 0 }] }).mockResolvedValueOnce({ rows: [{ columnas: 3, restricciones: 2 }] }) };
    await expect(verificarEsquemaArchivoEventos(db)).rejects.toThrow('migración 017');
    await expect(verificarEsquemaArchivoEventos(db)).resolves.toBeUndefined();
    expect(db.query.mock.calls.every(([sql]) => !/ALTER|INSERT|UPDATE|DELETE/.test(sql))).toBe(true);
});
test.each(['40001', '40P01', 'XX000'])('Error transaccional %s revierte y libera conexión', async code => {
    const release = jest.fn();
    const query = jest.fn(async sql => {
        if (/FOR UPDATE/.test(sql)) return { rows: [crearEvento()] };
        if (/UPDATE eventos_integracion/.test(sql)) throw Object.assign(Error('Fallo sintético'), { code });
        return { rows: [] };
    });
    const db = { connect: async () => ({ query, release }) };
    if (code === 'XX000') await expect(archivar(db)).rejects.toThrow('Fallo sintético');
    else expect((await archivar(db)).tipo).toBe('conflicto');
    expect(query).toHaveBeenCalledWith('ROLLBACK'); expect(release).toHaveBeenCalledTimes(1);
});
