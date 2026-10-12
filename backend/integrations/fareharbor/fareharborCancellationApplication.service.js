const pool = require('../../config/database');
const reservacionesService = require('../../services/reservaciones.service');
const { validarCancelacionReservacion } = require('../../validators/reservaciones.validator');
const {
    BOOKING_STATUS_CANCELLED,
    EVENT_TYPE_CANCELLATION,
    PROVIDER_FAREHARBOR,
    RESOLUTION_CANCEL_RESERVATION,
    RESOLUTION_LINK_BROKEN,
    RESOLUTION_RECONCILE_ALREADY_CANCELLED,
    RESOLUTION_RESOLVE_WITHOUT_LINK,
    obtenerPreviewCancellationFareHarborConDb,
} = require('./fareharborCancellationPreview.service');

const REVIEW_STATUS_APPROVED = 'approved';
const APPLICATION_STATUS_APPLIED = 'applied';
const APPLICATION_STATUS_NOT_APPLIED = 'not_applied';

const crearResultado = (tipo, datos = {}) => ({
    tipo,
    ...datos,
});

const tieneValor = (valor) => (
    valor !== undefined && valor !== null && !(typeof valor === 'string' && valor.trim() === '')
);

const normalizarTexto = (valor) => (tieneValor(valor) ? String(valor).trim() : null);
const normalizarBookingStatus = (status) => normalizarTexto(status)?.toLowerCase() || null;

async function obtenerEventoParaAplicacion(db, idEventoIntegracion) {
    const result = await db.query(
        `
            SELECT
                id_evento_integracion,
                provider,
                external_booking_id,
                event_type,
                review_status,
                application_status,
                applied_at,
                applied_by,
                normalized_data,
                source_received_at,
                created_at
            FROM eventos_integracion
            WHERE id_evento_integracion = $1
            FOR UPDATE
        `,
        [idEventoIntegracion]
    );

    return result.rows[0] || null;
}

async function bloquearSnapshotsBooking(db, externalBookingId) {
    const result = await db.query(
        `
            SELECT
                id_evento_integracion,
                source_received_at,
                created_at
            FROM eventos_integracion
            WHERE provider = $1
              AND external_booking_id = $2
            ORDER BY
                COALESCE(source_received_at, created_at) DESC,
                id_evento_integracion DESC
            FOR UPDATE
        `,
        [PROVIDER_FAREHARBOR, externalBookingId]
    );

    return result.rows;
}

async function obtenerLinkPorExternalBooking(db, externalBookingId) {
    const result = await db.query(
        `
            SELECT
                id_reserva_integracion_link,
                provider,
                external_booking_id,
                id_reservacion,
                created_at
            FROM reservas_integracion_link
            WHERE provider = $1
              AND external_booking_id = $2
            LIMIT 1
        `,
        [PROVIDER_FAREHARBOR, externalBookingId]
    );

    return result.rows[0] || null;
}

async function bloquearReservacion(db, idReservacion) {
    const result = await db.query(
        `
            SELECT id_reservacion
            FROM reservaciones
            WHERE id_reservacion = $1
            FOR UPDATE
        `,
        [idReservacion]
    );

    return result.rows[0] || null;
}

async function marcarEventoAplicado(db, { idEventoIntegracion, idUsuario }) {
    const result = await db.query(
        `
            UPDATE eventos_integracion
            SET
                application_status = $1,
                applied_at = CURRENT_TIMESTAMP,
                applied_by = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id_evento_integracion = $3
              AND application_status = $4
            RETURNING
                id_evento_integracion,
                review_status,
                application_status,
                applied_at,
                applied_by
        `,
        [APPLICATION_STATUS_APPLIED, idUsuario, idEventoIntegracion, APPLICATION_STATUS_NOT_APPLIED]
    );

    return result.rows[0] || null;
}

function obtenerExternalBookingId(evento) {
    return normalizarTexto(evento?.normalized_data?.external_booking_id)
        || normalizarTexto(evento?.external_booking_id);
}

function obtenerEventBlockers(preview = {}) {
    const blockingIssues = preview.blocking_issues || [];

    if (preview.resolution_mode === RESOLUTION_LINK_BROKEN) {
        return blockingIssues.length > 0 ? blockingIssues : ['reservacion_vinculada_no_encontrada'];
    }

    return blockingIssues;
}

function validarMotivoCancelacion(aplicacion = {}) {
    if (!Object.prototype.hasOwnProperty.call(aplicacion, 'motivo_cancelacion')) {
        return crearResultado('faltan_datos', { missingFields: ['motivo_cancelacion'] });
    }

    const { errores, cancelacion } = validarCancelacionReservacion({
        motivo_cancelacion: aplicacion.motivo_cancelacion,
    });

    if (errores.length > 0) {
        return crearResultado('datos_invalidos', { errores });
    }

    return crearResultado('motivo_valido', {
        motivoCancelacion: cancelacion.motivo_cancelacion,
    });
}

async function resolverCancelReservation({ client, preview, usuarioId, aplicacion }) {
    const motivo = validarMotivoCancelacion(aplicacion);

    if (motivo.tipo !== 'motivo_valido') {
        return motivo;
    }

    try {
        const resultadoCancelacion = await reservacionesService.cancelarReservacionConDb(
            client,
            preview.reservation_context.id_reservacion,
            usuarioId,
            motivo.motivoCancelacion
        );

        if (!resultadoCancelacion) {
            return crearResultado('event_blocked', {
                reason: 'reservacion_vinculada_no_encontrada',
                blockingIssues: ['reservacion_vinculada_no_encontrada'],
            });
        }

        return crearResultado('resuelto', {
            reservacion: resultadoCancelacion.reservacion,
            alreadyCancelled: Boolean(resultadoCancelacion.yaEstabaCancelada),
        });
    } catch (error) {
        if (error.statusCode) {
            return crearResultado('domain_conflict', {
                reason: error.message,
            });
        }

        throw error;
    }
}

function rechazarMotivoInnecesario(aplicacion = {}) {
    if (Object.prototype.hasOwnProperty.call(aplicacion, 'motivo_cancelacion')) {
        return crearResultado('datos_invalidos', {
            errores: ['El campo motivo_cancelacion no esta permitido para este resolution_mode'],
        });
    }

    return null;
}

async function aplicarCancellationConDb(client, evento, usuarioId, aplicacion) {
    const bookingStatus = normalizarBookingStatus(evento.normalized_data?.booking?.status);

    if (bookingStatus !== BOOKING_STATUS_CANCELLED) {
        return crearResultado('event_blocked', {
            reason: 'booking_status_no_cancelled',
            blockingIssues: ['booking.status FareHarbor no confirma una cancelación.'],
        });
    }

    const externalBookingId = obtenerExternalBookingId(evento);

    if (!externalBookingId) {
        return crearResultado('event_blocked', {
            reason: 'external_booking_id_faltante',
            blockingIssues: ['external_booking_id_faltante'],
        });
    }

    const eventoNormalizado = {
        ...evento,
        external_booking_id: externalBookingId,
    };
    const snapshots = await bloquearSnapshotsBooking(client, externalBookingId);
    const snapshotMasReciente = snapshots[0];

    if (
        !snapshotMasReciente
        || Number(snapshotMasReciente.id_evento_integracion) !== Number(evento.id_evento_integracion)
    ) {
        return crearResultado('snapshot_obsoleto');
    }

    const link = await obtenerLinkPorExternalBooking(client, externalBookingId);

    if (link) {
        await bloquearReservacion(client, link.id_reservacion);
    }

    const previewResultado = await obtenerPreviewCancellationFareHarborConDb(client, eventoNormalizado);

    if (previewResultado.tipo !== 'preview') {
        return previewResultado;
    }

    const preview = previewResultado.fareharbor_cancellation_preview;

    if (preview.cancellation_fingerprint !== aplicacion.cancellation_fingerprint) {
        return crearResultado('fingerprint_obsoleto');
    }

    const eventBlockers = obtenerEventBlockers(preview);

    if (eventBlockers.length > 0) {
        return crearResultado('event_blocked', {
            reason: eventBlockers[0],
            blockingIssues: eventBlockers,
        });
    }

    let resolucion;

    if (preview.resolution_mode === RESOLUTION_CANCEL_RESERVATION) {
        resolucion = await resolverCancelReservation({
            client,
            preview,
            usuarioId,
            aplicacion,
        });
    } else if (preview.resolution_mode === RESOLUTION_RECONCILE_ALREADY_CANCELLED) {
        resolucion = rechazarMotivoInnecesario(aplicacion) || crearResultado('resuelto', {
            reservacion: preview.reservation_context,
            alreadyCancelled: true,
        });
    } else if (preview.resolution_mode === RESOLUTION_RESOLVE_WITHOUT_LINK) {
        resolucion = rechazarMotivoInnecesario(aplicacion) || crearResultado('resuelto', {
            noReservationLink: true,
        });
    } else {
        resolucion = crearResultado('event_blocked', {
            reason: preview.resolution_mode || 'resolution_mode_no_soportado',
            blockingIssues: preview.blocking_issues || [],
        });
    }

    if (resolucion.tipo !== 'resuelto') {
        return resolucion;
    }

    const eventoAplicado = await marcarEventoAplicado(client, {
        idEventoIntegracion: evento.id_evento_integracion,
        idUsuario: usuarioId,
    });

    if (!eventoAplicado) {
        return crearResultado('ya_aplicado');
    }

    return crearResultado('aplicado', {
        evento: eventoAplicado,
        reservacion: resolucion.reservacion || null,
        link,
        resolutionMode: preview.resolution_mode,
        alreadyCancelled: Boolean(resolucion.alreadyCancelled),
        noReservationLink: Boolean(resolucion.noReservationLink),
    });
}

async function aplicarCancellationFareHarbor(idEventoIntegracion, usuarioId, aplicacion, dbPool = pool) {
    const client = await dbPool.connect();

    try {
        await client.query('BEGIN');

        const evento = await obtenerEventoParaAplicacion(client, idEventoIntegracion);

        if (!evento) {
            await client.query('ROLLBACK');
            return crearResultado('no_encontrado');
        }

        if (evento.provider !== PROVIDER_FAREHARBOR) {
            await client.query('ROLLBACK');
            return crearResultado('provider_no_soportado');
        }

        if (evento.event_type !== EVENT_TYPE_CANCELLATION) {
            await client.query('ROLLBACK');
            return crearResultado('event_type_no_soportado');
        }

        if (evento.review_status !== REVIEW_STATUS_APPROVED) {
            await client.query('ROLLBACK');
            return crearResultado('no_aprobado');
        }

        if (evento.application_status !== APPLICATION_STATUS_NOT_APPLIED) {
            await client.query('ROLLBACK');
            return crearResultado('ya_aplicado');
        }

        const resultado = await aplicarCancellationConDb(client, evento, usuarioId, aplicacion);

        if (resultado.tipo !== 'aplicado') {
            await client.query('ROLLBACK');
            return resultado;
        }

        await client.query('COMMIT');
        return resultado;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    APPLICATION_STATUS_APPLIED,
    APPLICATION_STATUS_NOT_APPLIED,
    REVIEW_STATUS_APPROVED,
    aplicarCancellationFareHarbor,
};
