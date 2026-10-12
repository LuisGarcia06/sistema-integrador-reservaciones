const crypto = require('node:crypto');
const pool = require('../../config/database');
const equivalenciasToursExternosService = require('../../services/equivalenciasToursExternos.service');

const PROVIDER_FAREHARBOR = 'fareharbor';
const EVENT_TYPE_MODIFICATION = 'modification';
const APPLICATION_STATUS_APPLIED = 'applied';
const APPLICATION_STATUS_NOT_APPLIED = 'not_applied';
const ESTADO_CANCELADA = 'Cancelada';
const ESTADO_COMPLETADA = 'Completada';
const MONEY_NUMERIC_MAX_MINOR = 9999999999n;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const BOOKING_STATUSES_RECONOCIDOS = ['booked', 'rebooked'];

const crearResultado = (tipo, datos = {}) => ({
    tipo,
    ...datos,
});

const tieneValor = (valor) => (
    valor !== undefined && valor !== null && !(typeof valor === 'string' && valor.trim() === '')
);

const normalizarTexto = (valor) => (tieneValor(valor) ? String(valor).trim() : null);

const normalizarFecha = (valor) => {
    if (!tieneValor(valor)) {
        return null;
    }

    if (valor instanceof Date) {
        return valor.toISOString().slice(0, 10);
    }

    const texto = String(valor);

    return /^\d{4}-\d{2}-\d{2}/.test(texto) ? texto.slice(0, 10) : null;
};

const normalizarHora = (valor) => {
    const texto = normalizarTexto(valor);

    if (!texto || !TIME_PATTERN.test(texto)) {
        return null;
    }

    const [hora, minuto, segundo = '00'] = texto.split(':');

    return `${hora.padStart(2, '0')}:${minuto.padStart(2, '0')}:${segundo.padStart(2, '0')}`;
};

const normalizarEnteroPositivo = (valor) => {
    if (!tieneValor(valor)) {
        return null;
    }

    const numero = Number(valor);

    return Number.isInteger(numero) && numero > 0 ? numero : null;
};

const normalizarEnteroNoNegativo = (valor) => {
    if (!tieneValor(valor)) {
        return null;
    }

    const numero = Number(valor);

    return Number.isInteger(numero) && numero >= 0 ? numero : null;
};

const normalizarNumeroDecimal = (valor) => {
    if (!tieneValor(valor)) {
        return null;
    }

    const numero = Number(valor);

    return Number.isFinite(numero) ? numero.toFixed(2) : null;
};

const valoresIguales = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const agregarUnico = (lista, valor) => {
    if (valor && !lista.includes(valor)) {
        lista.push(valor);
    }
};

const normalizarCategoria = (valor) => normalizarTexto(valor)?.replace(/\s+/g, ' ').toLowerCase() || null;

const extraerActivityTitle = (normalizedData = {}) => normalizarTexto(normalizedData.availability?.item?.name);

const extraerOptionTitle = (normalizedData = {}) => (
    normalizarTexto(normalizedData.availability?.item?.headline)
    || normalizarTexto(normalizedData.availability?.headline)
);

const extraerFechaActividad = (normalizedData = {}) => normalizarFecha(normalizedData.availability?.start_at);

const parseFareHarborStartAt = (startAt) => {
    const texto = normalizarTexto(startAt);

    if (!texto) {
        return null;
    }

    const normalizado = texto.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
    const fecha = new Date(normalizado);

    return Number.isNaN(fecha.getTime()) ? null : fecha;
};

const actividadIniciada = (normalizedData = {}, now = new Date()) => {
    const fechaInicio = parseFareHarborStartAt(normalizedData.availability?.start_at);
    const fechaActual = now instanceof Date ? now : new Date(now);

    if (!fechaInicio || Number.isNaN(fechaActual.getTime())) {
        return null;
    }

    return fechaInicio.getTime() <= fechaActual.getTime();
};

const obtenerPickup = (normalizedData = {}) => {
    const pickup = normalizedData.pickup?.pickup;
    const pickupObject = pickup && typeof pickup === 'object' && !Array.isArray(pickup) ? pickup : {};
    const pickupTime = normalizarTexto(pickupObject.time);

    return {
        pickup_place: normalizarTexto(pickupObject.display_text) || normalizarTexto(pickupObject.name),
        pickup_time: normalizarHora(pickupTime),
    };
};

const obtenerCategorias = (normalizedData = {}) => (
    Array.isArray(normalizedData.customers?.by_category)
        ? normalizedData.customers.by_category.map((categoria) => ({
            customer_type_pk: categoria?.customer_type_pk ?? null,
            singular: normalizarTexto(categoria?.singular),
            plural: normalizarTexto(categoria?.plural),
            count: normalizarEnteroNoNegativo(categoria?.count),
        }))
        : []
);

const calcularNinos = (normalizedData = {}) => {
    const categorias = obtenerCategorias(normalizedData);
    let ninos = 0;
    const unknownCategories = [];

    categorias.forEach((categoria) => {
        const singular = normalizarCategoria(categoria.singular);
        const plural = normalizarCategoria(categoria.plural);

        if (categoria.count === null) {
            unknownCategories.push(categoria);
            return;
        }

        if (singular === 'adult' || (!singular && plural === 'adults')) {
            return;
        }

        if (singular === 'child' || (!singular && plural === 'children')) {
            ninos += categoria.count;
            return;
        }

        unknownCategories.push(categoria);
    });

    if (unknownCategories.length > 0) {
        return {
            value: null,
            source: 'manual',
            unknown_categories: unknownCategories,
        };
    }

    return {
        value: ninos,
        source: 'fareharbor_categories',
        unknown_categories: [],
    };
};

const parseMinorMoney = (valor) => {
    if (typeof valor === 'number') {
        if (!Number.isSafeInteger(valor) || valor < 0) {
            return null;
        }

        return BigInt(valor);
    }

    const texto = normalizarTexto(valor);

    if (!texto || !/^\d+$/.test(texto)) {
        return null;
    }

    return BigInt(texto);
};

const formatMinorAsMajor = (minor) => {
    const entero = minor / 100n;
    const decimal = minor % 100n;

    return `${entero.toString()}.${decimal.toString().padStart(2, '0')}`;
};

const convertirDinero = (normalizedData = {}) => {
    const money = normalizedData.money || {};
    const currency = normalizarTexto(money.currency)?.toLowerCase() || null;

    if (currency !== 'mxn') {
        return {
            value: null,
            ready: false,
            issue: 'currency_no_mxn',
        };
    }

    const totalMinor = parseMinorMoney(money.receipt_total);
    const paidMinor = parseMinorMoney(money.amount_paid);

    if (totalMinor === null || paidMinor === null) {
        return {
            value: null,
            ready: false,
            issue: 'money_invalid',
        };
    }

    if (totalMinor > MONEY_NUMERIC_MAX_MINOR || paidMinor > MONEY_NUMERIC_MAX_MINOR) {
        return {
            value: null,
            ready: false,
            issue: 'money_overflow',
        };
    }

    if (paidMinor > totalMinor) {
        return {
            value: null,
            ready: false,
            issue: 'paid_greater_than_total',
        };
    }

    return {
        value: {
            precio_total: formatMinorAsMajor(totalMinor),
            deposito: formatMinorAsMajor(paidMinor),
            saldo: formatMinorAsMajor(totalMinor - paidMinor),
        },
        ready: true,
        issue: null,
    };
};

async function resolverTourTurno(db, normalizedData = {}) {
    const activityTitle = extraerActivityTitle(normalizedData);
    const optionTitle = extraerOptionTitle(normalizedData);

    if (!activityTitle || !optionTitle) {
        return {
            value: null,
            source: 'manual_or_unknown',
            activity_title: activityTitle,
            option_title: optionTitle,
        };
    }

    const equivalencia = await equivalenciasToursExternosService.resolverEquivalenciaTourExternoConDb(db, {
        provider: PROVIDER_FAREHARBOR,
        activityTitle,
        optionTitle,
    });

    if (!equivalencia) {
        return {
            value: null,
            source: 'manual_or_unknown',
            activity_title: activityTitle,
            option_title: optionTitle,
        };
    }

    return {
        value: {
            id_tour: Number(equivalencia.id_tour),
            turno: equivalencia.turno,
        },
        source: 'equivalence',
        equivalence_id: equivalencia.id_equivalencia_tour_externo,
        activity_title: activityTitle,
        option_title: optionTitle,
    };
}

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
                id_tour,
                nombre_cliente,
                telefono_cliente,
                pax,
                ninos,
                pickup_place,
                pickup_time,
                turno,
                precio_total,
                deposito,
                saldo,
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

async function obtenerBaselineAplicado(db, evento) {
    const result = await db.query(
        `
            SELECT
                id_evento_integracion,
                provider,
                external_booking_id,
                event_type,
                application_status,
                normalized_data,
                source_received_at,
                created_at
            FROM eventos_integracion
            WHERE provider = $1
              AND external_booking_id = $2
              AND id_evento_integracion <> $3
              AND application_status = $4
            ORDER BY
                COALESCE(source_received_at, created_at) DESC,
                id_evento_integracion DESC
            LIMIT 1
        `,
        [
            evento.provider,
            evento.external_booking_id,
            evento.id_evento_integracion,
            APPLICATION_STATUS_APPLIED,
        ]
    );

    return result.rows[0] || null;
}

async function esLatestSnapshot(db, evento) {
    const result = await db.query(
        `
            SELECT id_evento_integracion
            FROM eventos_integracion
            WHERE provider = $1
              AND external_booking_id = $2
              AND (
                COALESCE(source_received_at, created_at) > COALESCE($3::timestamp, $4::timestamp)
                OR (
                    COALESCE(source_received_at, created_at) = COALESCE($3::timestamp, $4::timestamp)
                    AND id_evento_integracion > $5
                )
              )
            LIMIT 1
        `,
        [
            evento.provider,
            evento.external_booking_id,
            evento.source_received_at,
            evento.created_at,
            evento.id_evento_integracion,
        ]
    );

    return !result.rows[0];
}

function crearCambio({
    field,
    baselineExternal,
    internalCurrent,
    fareharborNew,
    source,
    operational = false,
    manualBaselineReason = 'baseline_external_missing',
}) {
    const baselineKnown = baselineExternal !== null && baselineExternal !== undefined;
    const externalChanged = !valoresIguales(baselineExternal, fareharborNew);
    const internalDiverged = baselineKnown ? !valoresIguales(internalCurrent, baselineExternal) : null;
    const manualBaselineConflict = !baselineKnown && fareharborNew !== null && fareharborNew !== undefined;
    const conflict = Boolean(internalDiverged || manualBaselineConflict);
    let proposedAction = 'none';
    let reason = null;

    if (externalChanged) {
        proposedAction = conflict ? 'manual' : 'future_apply';
    }

    if (manualBaselineConflict) {
        reason = manualBaselineReason;
    } else if (internalDiverged) {
        reason = 'internal_diverged_from_baseline';
    }

    if (operational && externalChanged) {
        proposedAction = 'manual';
        reason = reason || 'operational_change_requires_review';
    }

    return {
        field,
        baseline_external: baselineExternal,
        internal_current: internalCurrent,
        fareharbor_new: fareharborNew,
        external_changed: externalChanged,
        internal_diverged_from_baseline: internalDiverged,
        source,
        conflict,
        proposed_action: proposedAction,
        reason,
    };
}

function agregarCambioSiRelevante(changes, cambio) {
    if (cambio.external_changed || cambio.internal_diverged_from_baseline) {
        changes.push(cambio);
    }
}

function crearContextoReservacion(reservacion) {
    return {
        estado: reservacion?.estado || null,
        assigned_to_transport: Boolean(reservacion?.id_transporte_operacion),
        id_transporte_operacion: reservacion?.id_transporte_operacion || null,
        ultima_actualizacion: reservacion?.ultima_actualizacion || null,
    };
}

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

function crearDiffFingerprint(diff) {
    const payload = normalizarValorFingerprint({
        id_evento_integracion: diff.current_event?.id_evento_integracion || null,
        latest_snapshot_id: diff.current_event?.is_latest_snapshot
            ? diff.current_event?.id_evento_integracion || null
            : null,
        id_reservacion: diff.id_reservacion || null,
        reservacion_ultima_actualizacion: diff.reservation_context?.ultima_actualizacion || null,
        baseline_id: diff.baseline?.id_evento_integracion || null,
        baseline_source_received_at: diff.baseline?.source_received_at || null,
        baseline_created_at: diff.baseline?.created_at || null,
        changes: diff.changes || [],
        blocking_issues: diff.blocking_issues || [],
    });

    return crypto
        .createHash('sha256')
        .update(JSON.stringify(payload))
        .digest('hex');
}

function agregarBloqueosReservacion(reservacion, blockingIssues) {
    if (reservacion?.estado === ESTADO_CANCELADA) {
        agregarUnico(
            blockingIssues,
            'No se puede aplicar una modificación FareHarbor sobre una reservación interna cancelada sin una decisión explícita de negocio.'
        );
    }

    if (reservacion?.estado === ESTADO_COMPLETADA) {
        agregarUnico(
            blockingIssues,
            'No se puede aplicar una modificación FareHarbor sobre una reservación interna completada sin una decisión explícita de negocio.'
        );
    }
}

function agregarWarningsStatus(normalizedData, warnings) {
    const status = normalizarTexto(normalizedData.booking?.status)?.toLowerCase() || null;

    if (status && !BOOKING_STATUSES_RECONOCIDOS.includes(status)) {
        agregarUnico(warnings, 'Estado FareHarbor no reconocido para modificación.');
    }
}

function agregarBloqueosDinero(dinero, blockingIssues, prefijo) {
    if (!dinero.issue) {
        return;
    }

    if (dinero.issue === 'currency_no_mxn') {
        agregarUnico(blockingIssues, `${prefijo}: moneda FareHarbor no MXN.`);
        return;
    }

    if (dinero.issue === 'paid_greater_than_total') {
        agregarUnico(blockingIssues, `${prefijo}: el importe pagado supera el total.`);
        return;
    }

    agregarUnico(blockingIssues, `${prefijo}: importes FareHarbor no son aplicables.`);
}

function marcarRiesgosOperativos(changes, reservacion, blockingIssues) {
    if (!reservacion?.id_transporte_operacion) {
        return;
    }

    const camposOperativos = ['fecha', 'id_tour', 'turno', 'pax', 'ninos'];
    const hayCambioOperativo = changes.some((change) => (
        camposOperativos.includes(change.field)
        && change.external_changed
    ));

    if (hayCambioOperativo) {
        agregarUnico(
            blockingIssues,
            'La reservación tiene transporte asignado; los cambios operativos requieren revisión manual y validación de capacidad.'
        );
    }
}

async function construirDiff(db, { evento, baseline, reservacion, opciones = {} }) {
    const baselineData = baseline.normalized_data || {};
    const currentData = evento.normalized_data || {};
    const baselineTourTurno = await resolverTourTurno(db, baselineData);
    const currentTourTurno = await resolverTourTurno(db, currentData);
    const baselinePickup = obtenerPickup(baselineData);
    const currentPickup = obtenerPickup(currentData);
    const baselineNinos = calcularNinos(baselineData);
    const currentNinos = calcularNinos(currentData);
    const baselineMoney = convertirDinero(baselineData);
    const currentMoney = convertirDinero(currentData);
    const blockingIssues = [];
    const warnings = [];
    const changes = [];
    const assigned = Boolean(reservacion.id_transporte_operacion);

    agregarWarningsStatus(currentData, warnings);
    agregarBloqueosReservacion(reservacion, blockingIssues);
    agregarBloqueosDinero(baselineMoney, blockingIssues, 'baseline money');
    agregarBloqueosDinero(currentMoney, blockingIssues, 'current money');

    if (actividadIniciada(currentData, opciones.now) === true) {
        agregarUnico(blockingIssues, 'La actividad FareHarbor ya inició y no puede modificarse como reservación operativa.');
    }

    agregarCambioSiRelevante(changes, crearCambio({
        field: 'fecha',
        baselineExternal: extraerFechaActividad(baselineData),
        internalCurrent: normalizarFecha(reservacion.fecha),
        fareharborNew: extraerFechaActividad(currentData),
        source: 'availability.start_at',
        operational: assigned,
    }));

    agregarCambioSiRelevante(changes, crearCambio({
        field: 'id_tour',
        baselineExternal: baselineTourTurno.value?.id_tour ?? null,
        internalCurrent: normalizarEnteroPositivo(reservacion.id_tour),
        fareharborNew: currentTourTurno.value?.id_tour ?? null,
        source: currentTourTurno.source,
        operational: assigned,
        manualBaselineReason: 'baseline_tour_manual_or_unknown',
    }));

    agregarCambioSiRelevante(changes, crearCambio({
        field: 'turno',
        baselineExternal: baselineTourTurno.value?.turno ?? null,
        internalCurrent: normalizarTexto(reservacion.turno),
        fareharborNew: currentTourTurno.value?.turno ?? null,
        source: currentTourTurno.source,
        operational: assigned,
        manualBaselineReason: 'baseline_turno_manual_or_unknown',
    }));

    agregarCambioSiRelevante(changes, crearCambio({
        field: 'pax',
        baselineExternal: normalizarEnteroPositivo(baselineData.customers?.total),
        internalCurrent: normalizarEnteroPositivo(reservacion.pax),
        fareharborNew: normalizarEnteroPositivo(currentData.customers?.total),
        source: 'customers.total',
        operational: assigned,
    }));

    const cambioNinos = crearCambio({
        field: 'ninos',
        baselineExternal: baselineNinos.value,
        internalCurrent: normalizarEnteroNoNegativo(reservacion.ninos),
        fareharborNew: currentNinos.value,
        source: currentNinos.source,
        operational: assigned,
        manualBaselineReason: 'baseline_ninos_manual_or_unknown',
    });

    if (baselineNinos.source === 'manual' || currentNinos.source === 'manual') {
        cambioNinos.conflict = true;
        cambioNinos.proposed_action = 'manual';
        cambioNinos.reason = 'unknown_customer_category';
        agregarUnico(warnings, 'Categoría de pasajero FareHarbor no reconocida para calcular niños.');
    }

    agregarCambioSiRelevante(changes, cambioNinos);

    agregarCambioSiRelevante(changes, crearCambio({
        field: 'pickup_place',
        baselineExternal: baselinePickup.pickup_place,
        internalCurrent: normalizarTexto(reservacion.pickup_place),
        fareharborNew: currentPickup.pickup_place,
        source: 'pickup.display_text_or_name',
        manualBaselineReason: 'baseline_pickup_manual_or_unknown',
    }));

    agregarCambioSiRelevante(changes, crearCambio({
        field: 'pickup_time',
        baselineExternal: baselinePickup.pickup_time,
        internalCurrent: normalizarHora(reservacion.pickup_time),
        fareharborNew: currentPickup.pickup_time,
        source: 'pickup.time',
        manualBaselineReason: 'baseline_pickup_manual_or_unknown',
    }));

    agregarCambioSiRelevante(changes, crearCambio({
        field: 'nombre_cliente',
        baselineExternal: normalizarTexto(baselineData.contact?.name),
        internalCurrent: normalizarTexto(reservacion.nombre_cliente),
        fareharborNew: normalizarTexto(currentData.contact?.name),
        source: 'contact.name',
    }));

    agregarCambioSiRelevante(changes, crearCambio({
        field: 'telefono_cliente',
        baselineExternal: normalizarTexto(baselineData.contact?.normalized_phone),
        internalCurrent: normalizarTexto(reservacion.telefono_cliente),
        fareharborNew: normalizarTexto(currentData.contact?.normalized_phone),
        source: 'contact.normalized_phone',
    }));

    if (baselineMoney.ready || currentMoney.ready) {
        agregarCambioSiRelevante(changes, crearCambio({
            field: 'money_group',
            baselineExternal: baselineMoney.value,
            internalCurrent: {
                precio_total: normalizarNumeroDecimal(reservacion.precio_total),
                deposito: normalizarNumeroDecimal(reservacion.deposito),
                saldo: normalizarNumeroDecimal(reservacion.saldo),
            },
            fareharborNew: currentMoney.value,
            source: 'money.receipt_total_amount_paid_mxn',
            manualBaselineReason: 'baseline_money_manual_or_unknown',
        }));
    }

    const paxChange = changes.find((change) => change.field === 'pax');

    if (paxChange) {
        paxChange.delta_pax = (
            typeof paxChange.fareharbor_new === 'number'
            && typeof paxChange.baseline_external === 'number'
        )
            ? paxChange.fareharbor_new - paxChange.baseline_external
            : null;

        if (assigned && paxChange.external_changed) {
            paxChange.requires_capacity_validation = true;
        }
    }

    marcarRiesgosOperativos(changes, reservacion, blockingIssues);

    return {
        changes,
        blockingIssues,
        warnings,
    };
}

function construirPreviewBase(evento, datos = {}) {
    const diff = {
        external_booking_id: evento?.external_booking_id || null,
        id_reservacion: datos.idReservacion || null,
        baseline_status: datos.baselineStatus || 'unknown',
        baseline: datos.baseline || null,
        current_event: datos.currentEvent || {
            id_evento_integracion: evento?.id_evento_integracion || null,
            source_received_at: evento?.source_received_at || null,
            is_latest_snapshot: false,
        },
        reservation_context: datos.reservationContext || null,
        changes: datos.changes || [],
        has_relevant_changes: Boolean(datos.changes?.length),
        blocking_issues: datos.blockingIssues || [],
        warnings: datos.warnings || [],
        actionable: false,
    };

    diff.diff_fingerprint = crearDiffFingerprint(diff);

    return {
        fareharbor_modification_diff: diff,
    };
}

async function obtenerPreviewModificationFareHarborConDb(db, evento, opciones = {}) {
    if (!evento) {
        return crearResultado('no_encontrado');
    }

    if (evento.provider !== PROVIDER_FAREHARBOR) {
        return crearResultado('provider_no_soportado');
    }

    if (evento.event_type !== EVENT_TYPE_MODIFICATION) {
        return crearResultado('event_type_no_soportado');
    }

    const normalizedExternalBookingId = normalizarTexto(evento.normalized_data?.external_booking_id);
    const externalBookingId = normalizedExternalBookingId || normalizarTexto(evento.external_booking_id);

    if (!externalBookingId) {
        return crearResultado('preview', construirPreviewBase(evento, {
            blockingIssues: ['external_booking_id_faltante'],
        }));
    }

    const eventoNormalizado = {
        ...evento,
        external_booking_id: externalBookingId,
    };
    const isLatestSnapshot = await esLatestSnapshot(db, eventoNormalizado);
    const currentEvent = {
        id_evento_integracion: evento.id_evento_integracion,
        source_received_at: evento.source_received_at,
        is_latest_snapshot: isLatestSnapshot,
    };
    const blockingIssues = [];

    if (evento.application_status !== APPLICATION_STATUS_NOT_APPLIED) {
        agregarUnico(blockingIssues, 'El evento de modificación FareHarbor no está pendiente de aplicación.');
    }

    if (!isLatestSnapshot) {
        agregarUnico(blockingIssues, 'Existe un snapshot FareHarbor más reciente para este booking.');
    }

    const link = await obtenerLinkPorExternalBooking(db, PROVIDER_FAREHARBOR, externalBookingId);

    if (!link) {
        return crearResultado('preview', construirPreviewBase(eventoNormalizado, {
            currentEvent,
            blockingIssues: blockingIssues.concat(['sin_reservacion_vinculada']),
        }));
    }

    const reservacion = await obtenerReservacionVinculada(db, link.id_reservacion);

    if (!reservacion) {
        return crearResultado('preview', construirPreviewBase(eventoNormalizado, {
            idReservacion: link.id_reservacion,
            currentEvent,
            blockingIssues: blockingIssues.concat(['reservacion_vinculada_no_encontrada']),
        }));
    }

    const baseline = await obtenerBaselineAplicado(db, eventoNormalizado);
    const reservationContext = crearContextoReservacion(reservacion);

    if (!baseline) {
        return crearResultado('preview', construirPreviewBase(eventoNormalizado, {
            idReservacion: reservacion.id_reservacion,
            baselineStatus: 'missing',
            currentEvent,
            reservationContext,
            blockingIssues: blockingIssues.concat(['baseline_aplicado_faltante']),
        }));
    }

    const diff = await construirDiff(db, {
        evento: eventoNormalizado,
        baseline,
        reservacion,
        opciones,
    });
    const baselineInfo = {
        id_evento_integracion: baseline.id_evento_integracion,
        event_type: baseline.event_type,
        source_received_at: baseline.source_received_at,
    };

    return crearResultado('preview', construirPreviewBase(eventoNormalizado, {
        idReservacion: reservacion.id_reservacion,
        baselineStatus: 'found',
        baseline: baselineInfo,
        currentEvent,
        reservationContext,
        changes: diff.changes,
        blockingIssues: blockingIssues.concat(diff.blockingIssues),
        warnings: diff.warnings,
    }));
}

async function obtenerDiffModificationFareHarbor(idEventoIntegracion, db = pool, opciones = {}) {
    const evento = await obtenerEventoModification(db, idEventoIntegracion);

    return obtenerPreviewModificationFareHarborConDb(db, evento, opciones);
}

module.exports = {
    EVENT_TYPE_MODIFICATION,
    PROVIDER_FAREHARBOR,
    obtenerDiffModificationFareHarbor,
    obtenerPreviewModificationFareHarborConDb,
};
