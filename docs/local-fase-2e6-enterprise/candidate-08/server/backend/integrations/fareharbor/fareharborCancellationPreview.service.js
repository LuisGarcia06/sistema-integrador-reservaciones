const crypto = require('node:crypto');
const pool = require('../../config/database');

const PROVIDER_FAREHARBOR = 'fareharbor';
const EVENT_TYPE_CANCELLATION = 'cancellation';
const BOOKING_STATUS_CANCELLED = 'cancelled';
const APPLICATION_STATUS_NOT_APPLIED = 'not_applied';
const ESTADO_CANCELADA = 'Cancelada';
const RESOLUTION_CANCEL_RESERVATION = 'cancel_reservation';
const RESOLUTION_RECONCILE_ALREADY_CANCELLED = 'reconcile_already_cancelled';
const RESOLUTION_RESOLVE_WITHOUT_LINK = 'resolve_without_link';
const RESOLUTION_LINK_BROKEN = 'link_broken';

const crearResultado = (tipo, datos = {}) => ({
    tipo,
    ...datos,
});

const tieneValor = (valor) => (
    valor !== undefined && valor !== null && !(typeof valor === 'string' && valor.trim() === '')
);

const normalizarTexto = (valor) => (tieneValor(valor) ? String(valor).trim() : null);

const normalizarBookingStatusFareHarbor = (status) => normalizarTexto(status)?.toLowerCase() || null;

const agregarUnico = (lista, valor) => {
    if (valor && !lista.includes(valor)) {
        lista.push(valor);
    }
};

function normalizarValorFingerprint(valor) {
    if (valor instanceof Date) {
        return valor.toISOString();
    }

    if (Array.isArray(valor)) {
        return valor.map(normalizarValorFingerprint);
    }

    if (valor && typeof valor === 'object') {
        return Object.keys(valor).sort().reduce((resultado, key) => {
            resultado[key] = normalizarValorFingerprint(valor[key]);
            return resultado;
        }, {});
    }

    return valor;
}

function crearCancellationFingerprint(preview) {
    const payload = normalizarValorFingerprint({
        id_evento_integracion: preview.current_event?.id_evento_integracion || null,
        external_booking_id: preview.external_booking_id || null,
        booking_status: preview.booking_status || null,
        latest_snapshot_id: preview.current_event?.latest_snapshot_id || null,
        source_received_at: preview.current_event?.source_received_at || null,
        created_at: preview.current_event?.created_at || null,
        resolution_mode: preview.resolution_mode || null,
        id_reservacion: preview.reservation_context?.id_reservacion || null,
        estado: preview.reservation_context?.estado || null,
        ultima_actualizacion: preview.reservation_context?.ultima_actualizacion || null,
        id_transporte_operacion: preview.reservation_context?.id_transporte_operacion || null,
        blocking_issues: [...(preview.blocking_issues || [])].sort(),
    });

    return crypto
        .createHash('sha256')
        .update(JSON.stringify(payload))
        .digest('hex');
}

async function obtenerEventoCancellation(db, idEventoIntegracion) {
    const result = await db.query(
        `
            SELECT
                id_evento_integracion,
                provider,
                external_event_id,
                external_booking_id,
                event_type,
                review_status,
                application_status,
                normalized_data,
                source_received_at,
                created_at
            FROM eventos_integracion
            WHERE id_evento_integracion = $1
            LIMIT 1
        `,
        [idEventoIntegracion]
    );

    return result.rows[0] || null;
}

async function obtenerLatestSnapshotFareHarbor(db, evento) {
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
            LIMIT 1
        `,
        [evento.provider, evento.external_booking_id]
    );

    return result.rows[0] || null;
}

async function obtenerLinkPorExternalBooking(db, externalBookingId) {
    const result = await db.query(
        `
            SELECT
                id_reserva_integracion_link,
                provider,
                external_booking_id,
                id_reservacion
            FROM reservas_integracion_link
            WHERE provider = $1
              AND external_booking_id = $2
            LIMIT 1
        `,
        [PROVIDER_FAREHARBOR, externalBookingId]
    );

    return result.rows[0] || null;
}

async function obtenerReservacionContexto(db, idReservacion) {
    const result = await db.query(
        `
            SELECT
                id_reservacion,
                codigo,
                fecha,
                id_tour,
                turno,
                estado,
                id_transporte_operacion,
                ultima_actualizacion
            FROM reservaciones
            WHERE id_reservacion = $1
            LIMIT 1
        `,
        [idReservacion]
    );

    return result.rows[0] || null;
}

const crearReservationContext = (reservacion) => (reservacion ? {
    id_reservacion: reservacion.id_reservacion,
    codigo: reservacion.codigo,
    fecha: reservacion.fecha,
    id_tour: reservacion.id_tour,
    turno: reservacion.turno,
    estado: reservacion.estado,
    id_transporte_operacion: reservacion.id_transporte_operacion,
    assigned_to_transport: Boolean(reservacion.id_transporte_operacion),
    ultima_actualizacion: reservacion.ultima_actualizacion,
} : null);

function construirPreviewCancellation(evento, datos = {}) {
    const blockingIssues = datos.blockingIssues || [];
    const warnings = datos.warnings || [];
    const reservationContext = datos.reservationContext || null;
    const resolutionMode = datos.resolutionMode || RESOLUTION_RESOLVE_WITHOUT_LINK;
    const preview = {
        type: 'fareharbor_cancellation_preview',
        external_booking_id: evento?.external_booking_id || null,
        booking_status: normalizarBookingStatusFareHarbor(evento?.normalized_data?.booking?.status),
        current_event: datos.currentEvent || {
            id_evento_integracion: evento?.id_evento_integracion || null,
            source_received_at: evento?.source_received_at || null,
            created_at: evento?.created_at || null,
            latest_snapshot_id: null,
            is_latest_snapshot: false,
        },
        resolution_mode: resolutionMode,
        requires_motivo_cancelacion: resolutionMode === RESOLUTION_CANCEL_RESERVATION,
        reservation_context: reservationContext,
        blocking_issues: blockingIssues,
        warnings,
    };

    preview.cancellation_fingerprint = crearCancellationFingerprint(preview);

    return {
        fareharbor_cancellation_preview: preview,
    };
}

async function obtenerPreviewCancellationFareHarborConDb(db, evento) {
    if (!evento) {
        return crearResultado('no_encontrado');
    }

    if (evento.provider !== PROVIDER_FAREHARBOR) {
        return crearResultado('provider_no_soportado');
    }

    if (evento.event_type !== EVENT_TYPE_CANCELLATION) {
        return crearResultado('event_type_no_soportado');
    }

    const normalizedExternalBookingId = normalizarTexto(evento.normalized_data?.external_booking_id);
    const externalBookingId = normalizedExternalBookingId || normalizarTexto(evento.external_booking_id);
    const eventoNormalizado = {
        ...evento,
        external_booking_id: externalBookingId,
    };
    const blockingIssues = [];
    const warnings = [];

    if (!externalBookingId) {
        agregarUnico(blockingIssues, 'external_booking_id_faltante');
        return crearResultado('preview', construirPreviewCancellation(eventoNormalizado, {
            blockingIssues,
        }));
    }

    const latestSnapshot = await obtenerLatestSnapshotFareHarbor(db, eventoNormalizado);
    const currentEvent = {
        id_evento_integracion: evento.id_evento_integracion,
        source_received_at: evento.source_received_at,
        created_at: evento.created_at,
        latest_snapshot_id: latestSnapshot?.id_evento_integracion || null,
        is_latest_snapshot: Number(latestSnapshot?.id_evento_integracion) === Number(evento.id_evento_integracion),
    };
    const bookingStatus = normalizarBookingStatusFareHarbor(evento.normalized_data?.booking?.status);

    if (evento.application_status !== APPLICATION_STATUS_NOT_APPLIED) {
        agregarUnico(blockingIssues, 'El evento de cancelación FareHarbor no está pendiente de aplicación.');
    }

    if (bookingStatus !== BOOKING_STATUS_CANCELLED) {
        agregarUnico(blockingIssues, 'booking.status FareHarbor no confirma una cancelación.');
    }

    if (!currentEvent.is_latest_snapshot) {
        agregarUnico(blockingIssues, 'Existe un snapshot FareHarbor más reciente para este booking.');
    }

    const link = await obtenerLinkPorExternalBooking(db, externalBookingId);

    if (!link) {
        return crearResultado('preview', construirPreviewCancellation(eventoNormalizado, {
            currentEvent,
            resolutionMode: RESOLUTION_RESOLVE_WITHOUT_LINK,
            blockingIssues,
            warnings,
        }));
    }

    const reservacion = await obtenerReservacionContexto(db, link.id_reservacion);

    if (!reservacion) {
        agregarUnico(blockingIssues, 'reservacion_vinculada_no_encontrada');
        return crearResultado('preview', construirPreviewCancellation(eventoNormalizado, {
            currentEvent,
            resolutionMode: RESOLUTION_LINK_BROKEN,
            reservationContext: { id_reservacion: link.id_reservacion },
            blockingIssues,
            warnings,
        }));
    }

    const reservationContext = crearReservationContext(reservacion);
    const resolutionMode = reservacion.estado === ESTADO_CANCELADA
        ? RESOLUTION_RECONCILE_ALREADY_CANCELLED
        : RESOLUTION_CANCEL_RESERVATION;

    if (reservacion.id_transporte_operacion) {
        agregarUnico(
            warnings,
            'La reservación tiene transporte asignado. La cancelación estará sujeta a reglas operativas de capacidad al aplicarse.'
        );
    }

    return crearResultado('preview', construirPreviewCancellation(eventoNormalizado, {
        currentEvent,
        resolutionMode,
        reservationContext,
        blockingIssues,
        warnings,
    }));
}

async function obtenerDiffCancellationFareHarbor(idEventoIntegracion, db = pool) {
    const evento = await obtenerEventoCancellation(db, idEventoIntegracion);

    return obtenerPreviewCancellationFareHarborConDb(db, evento);
}

module.exports = {
    BOOKING_STATUS_CANCELLED,
    EVENT_TYPE_CANCELLATION,
    PROVIDER_FAREHARBOR,
    RESOLUTION_CANCEL_RESERVATION,
    RESOLUTION_LINK_BROKEN,
    RESOLUTION_RECONCILE_ALREADY_CANCELLED,
    RESOLUTION_RESOLVE_WITHOUT_LINK,
    crearCancellationFingerprint,
    obtenerDiffCancellationFareHarbor,
    obtenerPreviewCancellationFareHarborConDb,
};
