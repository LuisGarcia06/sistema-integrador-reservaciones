const pool = require('../../config/database');
const equivalenciasToursExternosService = require('../../services/equivalenciasToursExternos.service');
const { normalizarFechaGetYourGuide } = require('./getyourguideReservation.mapper');

const PROVIDER_GETYOURGUIDE = 'getyourguide';
const EVENT_TYPE_MODIFICATION = 'modification';
const APPLICATION_STATUS_APPLIED = 'applied';
const ESTADO_CANCELADA = 'Cancelada';
const ESTADO_COMPLETADA = 'Completada';

const crearResultado = (tipo, datos = {}) => ({
    tipo,
    ...datos,
});

const tieneValor = (valor) => (
    valor !== undefined && valor !== null && !(typeof valor === 'string' && valor.trim() === '')
);

const normalizarFechaComparacion = (valor) => {
    if (!tieneValor(valor)) {
        return null;
    }

    if (valor instanceof Date) {
        return valor.toISOString().slice(0, 10);
    }

    return String(valor).slice(0, 10);
};

const normalizarTextoComparacion = (valor) => {
    if (!tieneValor(valor)) {
        return null;
    }

    return String(valor).trim();
};

const normalizarEnteroComparacion = (valor) => {
    if (!tieneValor(valor)) {
        return null;
    }

    const numero = Number(valor);

    return Number.isInteger(numero) ? numero : null;
};

const crearDiffCampo = (actual, nuevo) => ({
    actual,
    nuevo,
    cambio: actual !== nuevo,
});

async function obtenerEventoModification(db, idEventoIntegracion) {
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
                source_received_at
            FROM eventos_integracion
            WHERE id_evento_integracion = $1
            LIMIT 1
        `,
        [idEventoIntegracion]
    );

    return result.rows[0] || null;
}

async function obtenerLinkPorExternalBooking(db, provider, externalBookingId) {
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
        [provider, externalBookingId]
    );

    return result.rows[0] || null;
}

async function obtenerReservacionVinculada(db, idReservacion) {
    const result = await db.query(
        `
            SELECT
                id_reservacion,
                fecha,
                pax,
                pickup_place,
                id_tour,
                turno,
                idioma,
                estado,
                id_transporte_operacion
            FROM reservaciones
            WHERE id_reservacion = $1
            LIMIT 1
        `,
        [idReservacion]
    );

    return result.rows[0] || null;
}

async function existeEventoMasNuevoAplicado(db, evento) {
    if (!evento.source_received_at) {
        return false;
    }

    const result = await db.query(
        `
            SELECT id_evento_integracion
            FROM eventos_integracion
            WHERE provider = $1
              AND external_booking_id = $2
              AND id_evento_integracion <> $3
              AND event_type IN ('modification', 'cancellation')
              AND application_status = $4
              AND source_received_at > $5
            LIMIT 1
        `,
        [
            evento.provider,
            evento.external_booking_id,
            evento.id_evento_integracion,
            APPLICATION_STATUS_APPLIED,
            evento.source_received_at,
        ]
    );

    return Boolean(result.rows[0]);
}

function agregarDiffSiTieneValor(diff, campo, actual, nuevo) {
    if (nuevo === null || nuevo === undefined) {
        return;
    }

    diff[campo] = crearDiffCampo(actual, nuevo);
}

function construirValoresPropuestosBasicos(normalizedData, warnings) {
    const propuestos = {};

    if (tieneValor(normalizedData.date)) {
        const fecha = normalizarFechaGetYourGuide(normalizedData.date);

        if (fecha) {
            propuestos.fecha = fecha;
        } else {
            warnings.push('date_no_tiene_formato_seguro');
        }
    }

    if (tieneValor(normalizedData.pax)) {
        const pax = Number(normalizedData.pax);

        if (Number.isInteger(pax) && pax > 0) {
            propuestos.pax = pax;
        } else {
            warnings.push('pax_no_tiene_formato_seguro');
        }
    }

    if (tieneValor(normalizedData.pickup_place)) {
        propuestos.pickup_place = String(normalizedData.pickup_place).trim();
    }

    if (tieneValor(normalizedData.tour_language)) {
        propuestos.idioma = String(normalizedData.tour_language).trim();
    }

    return propuestos;
}

async function construirPropuestosDesdeNormalizedData(db, evento, warnings) {
    const normalizedData = evento.normalized_data || {};
    const propuestos = construirValoresPropuestosBasicos(normalizedData, warnings);
    const tieneActivityTitle = tieneValor(normalizedData.activity_title);
    const tieneOptionTitle = tieneValor(normalizedData.option_title);

    if (tieneActivityTitle || tieneOptionTitle) {
        if (!tieneActivityTitle || !tieneOptionTitle) {
            return {
                propuestos,
                bloqueaAplicacion: true,
                reason: 'equivalencia_tour_no_encontrada',
                warnings: ['equivalencia_tour_datos_incompletos'],
            };
        }

        const equivalencia = await equivalenciasToursExternosService.resolverEquivalenciaTourExternoConDb(db, {
            provider: PROVIDER_GETYOURGUIDE,
            activityTitle: normalizedData.activity_title,
            optionTitle: normalizedData.option_title,
        });

        if (!equivalencia) {
            return {
                propuestos,
                bloqueaAplicacion: true,
                reason: 'equivalencia_tour_no_encontrada',
                warnings: ['equivalencia_tour_no_encontrada'],
            };
        }

        propuestos.id_tour = equivalencia.id_tour;
        propuestos.turno = equivalencia.turno;
    }

    return {
        propuestos,
        bloqueaAplicacion: false,
        reason: null,
        warnings: [],
    };
}

function construirDiff(reservacion, propuestos) {
    const diff = {};

    agregarDiffSiTieneValor(
        diff,
        'fecha',
        normalizarFechaComparacion(reservacion.fecha),
        normalizarFechaComparacion(propuestos.fecha)
    );
    agregarDiffSiTieneValor(
        diff,
        'pax',
        normalizarEnteroComparacion(reservacion.pax),
        normalizarEnteroComparacion(propuestos.pax)
    );
    agregarDiffSiTieneValor(
        diff,
        'pickup_place',
        normalizarTextoComparacion(reservacion.pickup_place),
        normalizarTextoComparacion(propuestos.pickup_place)
    );
    agregarDiffSiTieneValor(
        diff,
        'id_tour',
        normalizarEnteroComparacion(reservacion.id_tour),
        normalizarEnteroComparacion(propuestos.id_tour)
    );
    agregarDiffSiTieneValor(
        diff,
        'turno',
        normalizarTextoComparacion(reservacion.turno),
        normalizarTextoComparacion(propuestos.turno)
    );
    agregarDiffSiTieneValor(
        diff,
        'idioma',
        normalizarTextoComparacion(reservacion.idioma),
        normalizarTextoComparacion(propuestos.idioma)
    );

    return diff;
}

function diffTieneCambios(diff) {
    return Object.values(diff).some((campo) => campo.cambio === true);
}

function requiereValidacionOperativa(reservacion, diff) {
    if (!reservacion.id_transporte_operacion) {
        return false;
    }

    return ['fecha', 'id_tour', 'turno'].some((campo) => diff[campo]?.cambio === true);
}

function obtenerReasonEstadoReservacion(reservacion) {
    if (reservacion.estado === ESTADO_CANCELADA) {
        return 'reservacion_cancelada';
    }

    if (reservacion.estado === ESTADO_COMPLETADA) {
        return 'reservacion_completada';
    }

    return null;
}

async function obtenerDiffModificationGetYourGuide(idEventoIntegracion, db = pool) {
    const evento = await obtenerEventoModification(db, idEventoIntegracion);

    if (!evento) {
        return crearResultado('no_encontrado');
    }

    if (evento.provider !== PROVIDER_GETYOURGUIDE) {
        return crearResultado('provider_no_soportado');
    }

    if (evento.event_type !== EVENT_TYPE_MODIFICATION) {
        return crearResultado('event_type_no_soportado');
    }

    if (!evento.external_booking_id) {
        return crearResultado('preview', {
            preview: {
                id_evento_integracion: evento.id_evento_integracion,
                id_reservacion: null,
                aplicable: false,
                reason: 'external_booking_id_faltante',
                diff_has_changes: false,
                requiere_validacion_operativa: false,
                diff: {},
                warnings: [],
            },
        });
    }

    const link = await obtenerLinkPorExternalBooking(db, evento.provider, evento.external_booking_id);

    if (!link) {
        return crearResultado('preview', {
            preview: {
                id_evento_integracion: evento.id_evento_integracion,
                id_reservacion: null,
                aplicable: false,
                reason: 'sin_reservacion_vinculada',
                diff_has_changes: false,
                requiere_validacion_operativa: false,
                diff: {},
                warnings: [],
            },
        });
    }

    const reservacion = await obtenerReservacionVinculada(db, link.id_reservacion);

    if (!reservacion) {
        return crearResultado('preview', {
            preview: {
                id_evento_integracion: evento.id_evento_integracion,
                id_reservacion: link.id_reservacion,
                aplicable: false,
                reason: 'reservacion_vinculada_no_encontrada',
                diff_has_changes: false,
                requiere_validacion_operativa: false,
                diff: {},
                warnings: [],
            },
        });
    }

    const warnings = [];
    const propuestos = await construirPropuestosDesdeNormalizedData(db, evento, warnings);
    warnings.push(...propuestos.warnings);

    const diff = construirDiff(reservacion, propuestos.propuestos);
    const eventoMasNuevoAplicado = await existeEventoMasNuevoAplicado(db, evento);
    const reasonEstado = obtenerReasonEstadoReservacion(reservacion);
    const reason = eventoMasNuevoAplicado
        ? 'evento_mas_nuevo_ya_aplicado'
        : reasonEstado || propuestos.reason;

    return crearResultado('preview', {
        preview: {
            id_evento_integracion: evento.id_evento_integracion,
            id_reservacion: reservacion.id_reservacion,
            aplicable: !reason,
            reason,
            diff_has_changes: diffTieneCambios(diff),
            requiere_validacion_operativa: requiereValidacionOperativa(reservacion, diff),
            diff,
            warnings,
        },
    });
}

module.exports = {
    EVENT_TYPE_MODIFICATION,
    obtenerDiffModificationGetYourGuide,
};
