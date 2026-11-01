const { fakePool, config } = require('./release03aFixtures.cjs');

// Doble SQL estricto: ninguna dependencia de pg, archivos privados ni sockets.
function createDatabase(verification = {}) {
    const checks = fakePool(verification);
    const state = { events: [], sync: null, failInsert: false, calls: [] };
    async function query(sql, values = []) {
        state.calls.push(sql);
        if (sql.includes('notificaciones_elegibles AS')) {
            const latest = state.events.filter((e, index, all) => e.provider !== 'fareharbor' || !all.slice(index + 1)
                .some(next => next.provider === e.provider && next.external_booking_id === e.external_booking_id));
            const events = latest.filter(e => !e.archived_at && e.application_status === 'not_applied'
                && ['pending_review', 'approved'].includes(e.review_status)).map(e => ({
                id_evento_integracion: e.id_evento_integracion, provider: e.provider,
                event_type: e.event_type, review_status: e.review_status,
                start_at: e.normalized_data.availability?.start_at
            }));
            return { rows: [{ environment_database: 'synthetic', environment_host: '127.0.0.1', environment_port: 55000, events }] };
        }
        if (/SELECT[\s\S]+FROM integracion_sync_estado/.test(sql)) return { rows: state.sync ? [state.sync] : [] };
        if (/INSERT INTO integracion_sync_estado/.test(sql)) {
            state.sync = { provider: values[0], source: values[1], last_history_id: values[2], recovery_active: false };
            return { rows: [state.sync] };
        }
        if (/UPDATE integracion_sync_estado/.test(sql)) {
            if (/recovery_active = TRUE/.test(sql)) {
                state.sync = { ...state.sync, recovery_active: true, recovery_target_history_id: values[2] };
            } else state.sync = { ...state.sync, last_error_code: values[2] };
            return { rows: [state.sync] };
        }
        if (/FROM\s+reservas_integracion_link/.test(sql)) return { rows: [] };
        if (sql.startsWith('SELECT id_evento_integracion FROM eventos_integracion')) {
            return { rows: state.events.filter(e => e.provider === values[0]
                && e.external_booking_id.toLowerCase() === values[1].toLowerCase()).slice(0, 1) };
        }
        if (/SELECT[\s\S]+FROM eventos_integracion/.test(sql)) {
            return { rows: state.events.filter(e => e.provider === values[0] && e.external_event_id === values[1]) };
        }
        if (/INSERT INTO eventos_integracion/.test(sql)) {
            if (state.failInsert) throw Object.assign(Error('DATOS_PRIVADOS_SINTETICOS'), { code: '08006' });
            if (state.events.some(e => e.provider === values[0] && e.external_event_id === values[1])) return { rows: [] };
            const row = { id_evento_integracion: 127 + state.events.length, provider: values[0], external_event_id: values[1],
                external_thread_id: values[2], external_booking_id: values[3], event_type: values[4], urgent: values[5],
                review_status: values[6], application_status: 'not_applied', normalized_data: JSON.parse(values[7]),
                source_subject: values[8], source_received_at: values[9], archived_at: null };
            state.events.push(row);
            return { rows: [row] };
        }
        throw Error('SQL_NO_PREVISTO_EN_DOBLE');
    }
    return {
        state, query: jest.fn(query),
        connect: jest.fn(async () => {
            const readonly = await checks.connect();
            let snapshot;
            return {
                async query(sql, values) {
                    if (sql === 'BEGIN') { snapshot = state.events.slice(); return { rows: [] }; }
                    if (sql === 'COMMIT') { snapshot = undefined; return { rows: [] }; }
                    if (sql === 'ROLLBACK') { if (snapshot) state.events = snapshot; return { rows: [] }; }
                    if (sql === 'BEGIN READ ONLY' || sql.includes('current_database() AS database')
                        || sql.includes('system_identifier::text') || sql.includes('AS unsafe') || sql.includes('AS scope_links')) {
                        return readonly.query(sql);
                    }
                    return query(sql, values);
                },
                release() { readonly.release(); }
            };
        })
    };
}

const identity = { ...config, DB_HOST: '127.0.0.1' };
const fixture = require('../../integrations/getyourguide/__fixtures__/new-booking.json');
function message({ id = 'synthetic-message', from = 'GetYourGuide <do-not-reply@notification.getyourguide.com>',
    subject = fixture.subject, text = fixture.text } = {}) {
    return { id, threadId: 'synthetic-thread', internalDate: '1790000000000', payload: {
        mimeType: 'text/plain', headers: [{ name: 'From', value: from }, { name: 'Subject', value: subject }],
        body: { data: Buffer.from(text).toString('base64url') }
    } };
}
function gmail(messages = [message()]) {
    return { users: {
        getProfile: jest.fn(async () => ({ data: { historyId: 'h1' } })),
        history: { list: jest.fn(async () => ({ data: { historyId: 'h2', history: [{
            messagesAdded: messages.map(m => ({ message: { id: m.id } }))
        }] } })) },
        messages: {
            get: jest.fn(async ({ id }) => ({ data: messages.find(m => m.id === id) })),
            list: jest.fn(async () => ({ data: { messages: messages.map(m => ({ id: m.id })) } }))
        }
    } };
}

module.exports = { createDatabase, identity, message, gmail };
