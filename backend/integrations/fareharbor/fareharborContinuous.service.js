const crypto = require('node:crypto');
const { persistirWebhookFareHarbor } = require('./fareharborWebhook.service');
const application = require('./fareharborApplication.service');
const events = require('../../services/eventosIntegracion.service');
const { ROLES } = require('../../constants/roles');

// Nunca elegir un usuario por defecto ni completar campos operativos inventados.
async function applyCompleteNewEvent(client, event, userId, deps = {}) {
    if (!Number.isSafeInteger(userId) || userId <= 0) return false;
    const actor = (await client.query(`SELECT u.id_usuario FROM usuarios u JOIN roles r ON r.id_rol=u.id_rol
        WHERE u.id_usuario=$1 AND u.estado=TRUE AND r.nombre=$2`, [userId, ROLES.ADMINISTRADOR])).rows[0];
    if (!actor) return false;
    const service = deps.application || application, review = deps.events || events;
    const prepared = await service.construirReservacionFareHarborParaAplicacion(client, event, {});
    if (prepared.tipo !== 'preparado') return false;
    const approved = await review.revisarEventoIntegracion({ idEventoIntegracion: event.id_evento_integracion,
        accion: 'approve', idUsuario: userId, nota: 'Recepcion continua FareHarbor: datos completos validados.' }, client);
    if (approved.tipo !== 'revisado') return false;
    // El servicio existente conserva sus validadores, capacidad, vínculo y bitácora.
    // Sus límites de transacción se convierten en un savepoint de la transacción de recepción.
    const nested = { query: async (sql, values) => {
        if (sql === 'BEGIN') return client.query('SAVEPOINT fh_application');
        if (sql === 'COMMIT') return client.query('RELEASE SAVEPOINT fh_application');
        if (sql === 'ROLLBACK') {
            await client.query('ROLLBACK TO SAVEPOINT fh_application');
            return client.query('RELEASE SAVEPOINT fh_application');
        }
        return client.query(sql, values);
    }, release() {} };
    const result = await service.aplicarNuevaReservaFareHarbor(event.id_evento_integracion, userId, {},
        { connect: async () => nested });
    return result.tipo === 'aplicado';
}

async function persistContinuousNewBooking(payload, db, { autoApplyUserId = null, ...deps } = {}) {
    const uuid = payload.booking.uuid.toLowerCase();
    const canonical = { ...payload, booking: { ...payload.booking, uuid } };
    const client = await db.connect();
    let transaction = false;
    try {
        await client.query('BEGIN'); transaction = true;
        const key = crypto.createHash('sha256').update(uuid).digest().readInt32BE(0);
        const lock = (await client.query('SELECT pg_try_advisory_xact_lock($1::int,$2::int) AS locked', [0x464852, key])).rows[0];
        if (lock?.locked !== true) throw Error('FH_BOOKING_BUSY');
        const prior = (await client.query(`SELECT id_evento_integracion FROM eventos_integracion
            WHERE provider=$1 AND lower(external_booking_id)=lower($2) LIMIT 1`, ['fareharbor', uuid])).rows;
        const linked = (await client.query(`SELECT id_reservacion FROM reservas_integracion_link
            WHERE provider=$1 AND lower(external_booking_id)=lower($2) LIMIT 1`, ['fareharbor', uuid])).rows;
        if (prior.length || linked.length) {
            await client.query('ROLLBACK'); transaction = false;
            return { received: true, duplicate: true };
        }
        const saved = await (deps.persist || persistirWebhookFareHarbor)(canonical,
            { db: { query: (sql, values) => client.query(sql, values) } });
        if (saved.duplicate || saved.event?.event_type !== 'new_booking'
            || saved.event.review_status !== 'pending_review' || saved.event.application_status !== 'not_applied') {
            throw Error('FH_EVENT_STATE');
        }
        let applied = false;
        if (autoApplyUserId !== null) {
            await client.query('SAVEPOINT fh_auto_apply');
            try { applied = await applyCompleteNewEvent(client, saved.event, autoApplyUserId, deps); }
            catch { applied = false; }
            if (!applied) await client.query('ROLLBACK TO SAVEPOINT fh_auto_apply');
            await client.query('RELEASE SAVEPOINT fh_auto_apply');
        }
        // Solo confirmar HTTP después de persistir. El UUID se consulta también tras reinicios.
        await client.query('COMMIT'); transaction = false;
        return { received: true, application: applied ? 'applied' : 'pending_review' };
    } catch (error) {
        if (transaction) await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally { client.release(); }
}

// Recepcion multievento: solo archiva snapshots pendientes. Nunca invoca los
// servicios de aprobacion, aplicacion, modificacion o cancelacion internas.
async function persistContinuousBookingEvent(payload, db, { autoApplyUserId = null, ...deps } = {}) {
    if (autoApplyUserId !== null) throw Error('FH_MANUAL_REVIEW_REQUIRED');
    const canonical = { ...payload, booking: { ...payload.booking,
        uuid: payload.booking.uuid.toLowerCase(), status: payload.booking.status.trim().toLowerCase() } };
    if (!['booked', 'cancelled'].includes(canonical.booking.status)) throw Error('FH_BOOKING_STATUS_UNSUPPORTED');
    const client = await db.connect();
    let transaction = false;
    try {
        await client.query('BEGIN'); transaction = true;
        const key = crypto.createHash('sha256').update(canonical.booking.uuid).digest().readInt32BE(0);
        const lock = (await client.query('SELECT pg_try_advisory_xact_lock($1::int,$2::int) AS locked', [0x464852, key])).rows[0];
        if (lock?.locked !== true) throw Error('FH_BOOKING_BUSY');
        // El servicio existente deduplica por UUID + fingerprint del snapshot,
        // no por UUID solamente; conserva modificaciones distintas y reintentos.
        const saved = await (deps.persist || persistirWebhookFareHarbor)(canonical,
            { db: { query: (sql, values) => client.query(sql, values) } });
        if (!saved.duplicate && (!['new_booking', 'modification', 'cancellation'].includes(saved.event?.event_type)
            || saved.event.review_status !== 'pending_review' || saved.event.application_status !== 'not_applied')) {
            throw Error('FH_EVENT_STATE');
        }
        await client.query('COMMIT'); transaction = false;
        return { received: true, ...(saved.duplicate ? { duplicate: true } : { application: 'pending_review' }) };
    } catch (error) {
        if (transaction) await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally { client.release(); }
}

module.exports = { persistContinuousNewBooking, persistContinuousBookingEvent, applyCompleteNewEvent };
