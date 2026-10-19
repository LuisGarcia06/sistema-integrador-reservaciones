const crypto = require('node:crypto');
const pool = require('../config/database');
const { construirFuenteEventosIntegracion } = require('./eventosIntegracion.service');
const { evaluarTimingActividadFareHarbor } = require('../integrations/fareharbor/fareharborApplication.service');

// Solo lectura: mismo cutoff/ranking/vínculos/archivo que el listado operacional.
// Una consulta y proyección mínima, sin previews ni llamadas a proveedores.
async function obtenerResumenNotificaciones(db = pool, now = new Date()) {
    const fuente = construirFuenteEventosIntegracion({ operational_only: true });
    const result = await db.query(`
        ${fuente.prefix}, notificaciones_elegibles AS (
            SELECT id_evento_integracion, provider, event_type, review_status,
                normalized_data #>> '{availability,start_at}' AS start_at
            FROM ${fuente.from}
            WHERE provider IN ('getyourguide','fareharbor')
              AND event_type IN ('new_booking','modification','cancellation')
              AND review_status IN ('pending_review','approved')
              AND application_status = 'not_applied'
        )
        SELECT current_database() AS environment_database,
            inet_server_addr()::text AS environment_host, inet_server_port() AS environment_port,
            COALESCE(json_agg(n ORDER BY id_evento_integracion DESC), '[]'::json) AS events
        FROM notificaciones_elegibles n
    `, fuente.values);
    const row = result.rows[0];
    const events = (row.events || []).map(event => {
        let attention = 'actionable';
        if (event.provider === 'fareharbor' && event.event_type === 'new_booking') {
            const timing = evaluarTimingActividadFareHarbor(event.start_at, now);
            attention = timing.has_started === true ? 'requires_archive'
                : timing.has_started === null ? 'requires_schedule_review' : 'actionable';
        }
        return { id_evento_integracion: event.id_evento_integracion, provider: event.provider,
            event_type: event.event_type, review_status: event.review_status, attention };
    });
    return {
        environment_id: crypto.createHash('sha256').update(JSON.stringify([
            row.environment_database, row.environment_host, row.environment_port
        ])).digest('hex').slice(0, 24),
        generated_at: now.toISOString(),
        counts: { pending: events.length, actionable: events.filter(e => e.attention === 'actionable').length,
            requires_archive: events.filter(e => e.attention === 'requires_archive').length,
            requires_schedule_review: events.filter(e => e.attention === 'requires_schedule_review').length },
        events
    };
}
module.exports = { obtenerResumenNotificaciones };
