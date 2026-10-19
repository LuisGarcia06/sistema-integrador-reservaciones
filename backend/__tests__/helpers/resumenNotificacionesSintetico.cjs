// Contrato del simulador, sin pg, configuración de aplicación ni clientes externos.
function resumenNotificacionesSintetico(rows = [], environment = '0'.repeat(24)) {
    const events = rows.filter(e => !e.archived_at && e.application_status !== 'applied'
        && ['pending_review', 'approved'].includes(e.review_status)
        && ['getyourguide', 'fareharbor'].includes(e.provider)).map(e => {
        const start = new Date(e.fareharbor_summary?.availability?.start_at || e.normalized_data?.availability?.start_at || 'invalid');
        return { id_evento_integracion: e.id_evento_integracion, provider: e.provider, event_type: e.event_type, review_status: e.review_status,
            attention: e.provider !== 'fareharbor' || e.event_type !== 'new_booking' ? 'actionable' : Number.isNaN(start.getTime()) ? 'requires_schedule_review' : start <= new Date() ? 'requires_archive' : 'actionable' };
    });
    return { datos: { environment_id: environment, generated_at: new Date().toISOString(), counts: {
        pending: events.length, actionable: events.filter(e => e.attention === 'actionable').length,
        requires_archive: events.filter(e => e.attention === 'requires_archive').length,
        requires_schedule_review: events.filter(e => e.attention === 'requires_schedule_review').length
    }, events } };
}
module.exports = { resumenNotificacionesSintetico };
