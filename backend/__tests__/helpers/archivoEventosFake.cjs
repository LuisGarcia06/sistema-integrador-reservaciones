// Bloqueo transaccional en memoria; no sustituye la comprobación persistente pendiente.
function crearEvento(overrides = {}) {
    return { id_evento_integracion: 801, provider: 'fareharbor', external_event_id: 'fh:synthetic:hash',
        external_booking_id: 'synthetic', event_type: 'cancellation', urgent: false,
        review_status: 'approved', application_status: 'not_applied', reviewed_by: 7,
        reviewed_at: '2026-10-16T12:00:00Z', review_note: 'Aprobación sintética',
        archived_at: null, archived_by: null, archive_reason: null,
        normalized_data: { booking: { status: 'cancelled', display_id: '#SYN-801' } },
        created_at: '2026-10-16T12:00:00Z', source_received_at: '2026-10-16T12:00:00Z', ...overrides };
}
function crearPool(evento = crearEvento()) {
    const state = { evento, writes: [], calls: [] };
    let tail = Promise.resolve();
    const pool = { state, async connect() {
        let unlock = null, backup = null;
        const client = { release() {}, async query(sql, values = []) {
            sql = String(sql); state.calls.push(sql);
            if (sql === 'BEGIN') return { rows: [] };
            if (sql === 'COMMIT' || sql === 'ROLLBACK') {
                if (sql === 'ROLLBACK' && backup) state.evento = backup;
                if (unlock) { unlock(); unlock = null; }
                return { rows: [] };
            }
            if (/FROM eventos_integracion[\s\S]+WHERE id_evento_integracion = \$1[\s\S]+FOR UPDATE/.test(sql)) {
                const previous = tail;
                tail = new Promise(resolve => { unlock = resolve; });
                await previous;
                backup = state.evento ? structuredClone(state.evento) : null;
                return { rows: state.evento && Number(values[0]) === state.evento.id_evento_integracion ? [structuredClone(state.evento)] : [] };
            }
            if (/FROM eventos_integracion/.test(sql) && /external_booking_id = \$2/.test(sql)) return { rows: [state.evento] };
            if (/FROM reservas_integracion_link/.test(sql)) return { rows: [] };
            if (/UPDATE eventos_integracion/.test(sql)) {
                if (state.evento.archived_at || state.evento.application_status !== 'not_applied') return { rows: [] };
                state.writes.push(sql);
                if (/SET archived_at/.test(sql)) Object.assign(state.evento, { archived_at: '2026-10-17T18:00:00Z', archived_by: values[1], archive_reason: values[2] });
                else Object.assign(state.evento, { application_status: values[0], applied_by: values[1] });
                return { rows: [structuredClone(state.evento)] };
            }
            throw Error('SQL inesperado en prueba aislada: ' + sql);
        } };
        return client;
    } };
    return pool;
}
module.exports = { crearEvento, crearPool };
