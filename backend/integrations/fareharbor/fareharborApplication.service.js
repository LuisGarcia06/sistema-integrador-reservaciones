const pool = require('../../config/database');
const reservacionesService = require('../../services/reservaciones.service');
const equivalenciasToursExternosService = require('../../services/equivalenciasToursExternos.service');
const { validarDatosReservacion } = require('../../validators/reservaciones.validator');

const PROVIDER_FAREHARBOR = 'fareharbor';
const PLATFORM_NAME_FAREHARBOR = 'FareHarbor';
const PAIS_NO_ESPECIFICADO = 'No especificado';
const ESTADO_INICIAL_RESERVACION = 'Pendiente';
const MONEY_NUMERIC_MAX_MINOR = 9999999999n;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const EVENT_TYPE_NEW_BOOKING = 'new_booking';
const REVIEW_STATUS_APPROVED = 'approved';
const APPLICATION_STATUS_NOT_APPLIED = 'not_applied';
const APPLICATION_STATUS_APPLIED = 'applied';
const LINK_UNIQUE_CONSTRAINT = 'uq_reservas_integracion_link_provider_booking';
const ISSUE_ACTIVIDAD_INICIADA = 'La actividad ya inició y no puede registrarse como una reservación operativa.';
const ISSUE_HORARIO_INICIO_INDETERMINADO = 'No fue posible determinar el horario de inicio de la actividad FareHarbor.';
const CAMPOS_COMPLETAR_FAREHARBOR = [
    'id_tour',
    'turno',
    'pickup_place',
    'pickup_time',
    'ninos',
    'nombre_cliente',
];

function crearResultado(tipo, datos = {}) {
    return {
        tipo,
        ...datos,
    };
}

function obtenerTexto(valor) {
    if (valor === undefined || valor === null) {
        return null;
    }

    return String(valor).trim() || null;
}

function normalizarTelefonoCliente(valor) {
    const texto = obtenerTexto(valor);

    return texto && texto.length <= 30 ? texto : null;
}

function obtenerEnteroPositivo(valor) {
    const numero = Number(valor);

    return Number.isInteger(numero) && numero > 0 ? numero : null;
}

function obtenerEnteroNoNegativo(valor) {
    const numero = Number(valor);

    return Number.isInteger(numero) && numero >= 0 ? numero : null;
}

function agregarUnico(lista, valor) {
    if (valor && !lista.includes(valor)) {
        lista.push(valor);
    }
}

function normalizarCategoria(valor) {
    return obtenerTexto(valor)?.replace(/\s+/g, ' ').toLowerCase() || null;
}

function extraerActivityTitle(normalizedData = {}) {
    return obtenerTexto(normalizedData.availability?.item?.name);
}

function extraerOptionTitle(normalizedData = {}) {
    return (
        obtenerTexto(normalizedData.availability?.item?.headline)
        || obtenerTexto(normalizedData.availability?.headline)
    );
}

function extraerFechaActividad(startAt) {
    const texto = obtenerTexto(startAt);

    if (!texto || !/^\d{4}-\d{2}-\d{2}/.test(texto)) {
        return null;
    }

    return texto.slice(0, 10);
}

function parseFareHarborStartAt(startAt) {
    const texto = obtenerTexto(startAt);

    if (!texto) {
        return null;
    }

    const normalizado = texto.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
    const fecha = new Date(normalizado);

    return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function evaluarTimingActividadFareHarbor(startAt, now = new Date()) {
    const texto = obtenerTexto(startAt);
    const fechaInicio = parseFareHarborStartAt(texto);
    const fechaActual = now instanceof Date ? now : new Date(now);

    if (!fechaInicio || Number.isNaN(fechaActual.getTime())) {
        return {
            start_at: texto,
            has_started: null,
            issue: ISSUE_HORARIO_INICIO_INDETERMINADO,
        };
    }

    const hasStarted = fechaInicio.getTime() <= fechaActual.getTime();

    return {
        start_at: texto,
        has_started: hasStarted,
        issue: hasStarted ? ISSUE_ACTIVIDAD_INICIADA : null,
    };
}

function obtenerCategorias(normalizedData = {}) {
    const categorias = normalizedData.customers?.by_category;

    if (!Array.isArray(categorias)) {
        return [];
    }

    return categorias.map((categoria) => ({
        customer_type_pk: categoria?.customer_type_pk ?? null,
        singular: obtenerTexto(categoria?.singular),
        plural: obtenerTexto(categoria?.plural),
        count: obtenerEnteroNoNegativo(categoria?.count),
    }));
}

function calcularNinos(categorias = [], pax) {
    let ninos = 0;
    const unknownCategories = [];

    categorias.forEach((categoria) => {
        const count = categoria.count;
        const singular = normalizarCategoria(categoria.singular);
        const plural = normalizarCategoria(categoria.plural);
        const tipo = singular || plural;

        if (count === null) {
            unknownCategories.push(categoria);
            return;
        }

        if (singular === 'adult' || (!singular && plural === 'adults')) {
            return;
        }

        if (singular === 'child' || (!singular && plural === 'children')) {
            ninos += count;
            return;
        }

        unknownCategories.push({
            ...categoria,
            normalized_type: tipo,
        });
    });

    if (unknownCategories.length > 0) {
        return {
            ninos: null,
            children_source: 'manual',
            unknown_categories: unknownCategories.map((categoria) => ({
                customer_type_pk: categoria.customer_type_pk,
                singular: categoria.singular,
                plural: categoria.plural,
            })),
            issue: 'Categoria de pasajero FareHarbor no reconocida para calcular ninos.',
        };
    }

    if (pax !== null && (ninos < 0 || ninos > pax)) {
        return {
            ninos: null,
            children_source: 'manual',
            unknown_categories: [],
            issue: 'La cantidad de ninos derivada no es compatible con el total de PAX.',
        };
    }

    return {
        ninos,
        children_source: 'derived',
        unknown_categories: [],
        issue: null,
    };
}

function obtenerPickupData(normalizedData = {}) {
    const pickup = normalizedData.pickup?.pickup;
    const pickupObject = pickup && typeof pickup === 'object' && !Array.isArray(pickup) ? pickup : {};
    const pickupTime = obtenerTexto(pickupObject.time);

    return {
        pickup_place: obtenerTexto(pickupObject.display_text) || obtenerTexto(pickupObject.name),
        pickup_time: pickupTime && TIME_PATTERN.test(pickupTime) ? pickupTime : null,
        pickup_time_rejected: pickupTime && !TIME_PATTERN.test(pickupTime) ? pickupTime : null,
        lodging_present: Boolean(normalizedData.pickup?.lodging),
        arrival_present: Boolean(normalizedData.pickup?.arrival),
    };
}

function parseMinorMoney(valor) {
    if (typeof valor === 'number') {
        if (!Number.isSafeInteger(valor) || valor < 0) {
            return null;
        }

        return BigInt(valor);
    }

    const texto = obtenerTexto(valor);

    if (!texto || !/^\d+$/.test(texto)) {
        return null;
    }

    return BigInt(texto);
}

function formatMinorAsMajor(minor) {
    const entero = minor / 100n;
    const decimal = minor % 100n;

    return `${entero.toString()}.${decimal.toString().padStart(2, '0')}`;
}

function convertirDinero(normalizedData = {}) {
    const money = normalizedData.money || {};
    const currency = obtenerTexto(money.currency)?.toLowerCase() || null;
    const base = {
        currency,
        precio_total: null,
        deposito: null,
        saldo: null,
        money_ready: false,
        money_issue: null,
        receipt_total_display: money.receipt_total_display || null,
        amount_paid_display: money.amount_paid_display || null,
        invoice_price_display: money.invoice_price_display || null,
    };

    if (currency !== 'mxn') {
        return {
            ...base,
            money_issue: 'Moneda FareHarbor no soportada todavía para aplicación.',
        };
    }

    const totalMinor = parseMinorMoney(money.receipt_total);
    const paidMinor = parseMinorMoney(money.amount_paid);

    if (totalMinor === null || paidMinor === null) {
        return {
            ...base,
            money_issue: 'Importes FareHarbor invalidos para convertir desde unidad minima.',
        };
    }

    if (totalMinor > MONEY_NUMERIC_MAX_MINOR || paidMinor > MONEY_NUMERIC_MAX_MINOR) {
        return {
            ...base,
            money_issue: 'Importes FareHarbor exceden la capacidad NUMERIC(10,2).',
        };
    }

    if (paidMinor > totalMinor) {
        return {
            ...base,
            precio_total: formatMinorAsMajor(totalMinor),
            deposito: formatMinorAsMajor(paidMinor),
            money_issue: 'El importe pagado supera el total de la reserva.',
        };
    }

    const balanceMinor = totalMinor - paidMinor;

    return {
        ...base,
        precio_total: formatMinorAsMajor(totalMinor),
        deposito: formatMinorAsMajor(paidMinor),
        saldo: formatMinorAsMajor(balanceMinor),
        money_ready: true,
        money_issue: null,
    };
}

async function obtenerPaisNoEspecificado(db) {
    const result = await db.query(
        `
            SELECT id_pais, nombre
            FROM paises
            WHERE nombre = $1
        `,
        [PAIS_NO_ESPECIFICADO]
    );

    return result.rows.length === 1 ? result.rows[0] : null;
}

async function obtenerPlataformaFareHarbor(db) {
    const result = await db.query(
        `
            SELECT id_plataforma, nombre
            FROM plataformas
            WHERE nombre = $1
        `,
        [PLATFORM_NAME_FAREHARBOR]
    );

    return result.rows.length === 1 ? result.rows[0] : null;
}

async function obtenerTourResumen(db, idTour) {
    if (!idTour) {
        return null;
    }

    const result = await db.query(
        `
            SELECT id_tour, nombre
            FROM tours
            WHERE id_tour = $1
            LIMIT 1
        `,
        [idTour]
    );

    return result.rows[0] || null;
}

async function obtenerTourActivo(db, idTour) {
    if (!idTour) {
        return null;
    }

    const result = await db.query(
        `
            SELECT id_tour, nombre
            FROM tours
            WHERE id_tour = $1
              AND activo = TRUE
            LIMIT 1
        `,
        [idTour]
    );

    return result.rows[0] || null;
}

async function resolverTourTurno(db, { activityTitle, optionTitle }) {
    if (!activityTitle || !optionTitle) {
        return {
            source: 'manual',
            id_tour: null,
            nombre_tour: null,
            turno: null,
            equivalence_id: null,
        };
    }

    const equivalencia = await equivalenciasToursExternosService.resolverEquivalenciaTourExternoConDb(db, {
        provider: PROVIDER_FAREHARBOR,
        activityTitle,
        optionTitle,
    });

    if (!equivalencia) {
        return {
            source: 'manual',
            id_tour: null,
            nombre_tour: null,
            turno: null,
            equivalence_id: null,
        };
    }

    const tour = await obtenerTourResumen(db, equivalencia.id_tour);

    return {
        source: 'equivalence',
        id_tour: equivalencia.id_tour,
        nombre_tour: tour?.nombre || null,
        turno: equivalencia.turno,
        equivalence_id: equivalencia.id_equivalencia_tour_externo,
    };
}

async function construirPreviewNuevaReservaFareHarborConDb(db = pool, evento = {}, opciones = {}) {
    if (evento.provider !== PROVIDER_FAREHARBOR || evento.event_type !== EVENT_TYPE_NEW_BOOKING) {
        return crearResultado('event_type_no_soportado');
    }

    const normalizedData = evento.normalized_data || {};
    const activityTitle = extraerActivityTitle(normalizedData);
    const optionTitle = extraerOptionTitle(normalizedData);
    const categories = obtenerCategorias(normalizedData);
    const pax = obtenerEnteroPositivo(normalizedData.customers?.total);
    const fecha = extraerFechaActividad(normalizedData.availability?.start_at);
    const contactName = obtenerTexto(normalizedData.contact?.name);
    const contactPhone = normalizarTelefonoCliente(normalizedData.contact?.normalized_phone);
    const pickupData = obtenerPickupData(normalizedData);
    const money = convertirDinero(normalizedData);
    const activityTiming = evaluarTimingActividadFareHarbor(normalizedData.availability?.start_at, opciones.now);
    const pais = await obtenerPaisNoEspecificado(db);
    const plataforma = await obtenerPlataformaFareHarbor(db);
    const tour = await resolverTourTurno(db, { activityTitle, optionTitle });
    const children = calcularNinos(categories, pax);
    const missingFields = [];
    const issues = [];

    if (!fecha) {
        agregarUnico(missingFields, 'fecha');
    }

    if (!tour.id_tour) {
        agregarUnico(missingFields, 'id_tour');
    }

    if (!tour.turno) {
        agregarUnico(missingFields, 'turno');
    }

    if (!pais) {
        agregarUnico(missingFields, 'id_pais');
        issues.push('No existe el pais "No especificado" en catalogo.');
    }

    if (!plataforma) {
        agregarUnico(missingFields, 'id_plataforma');
        issues.push('No existe la plataforma "FareHarbor" en catalogo.');
    }

    if (!contactName) {
        agregarUnico(missingFields, 'nombre_cliente');
    }

    if (!pax) {
        agregarUnico(missingFields, 'pax');
    }

    if (children.children_source === 'manual') {
        agregarUnico(missingFields, 'ninos');
    }

    if (children.issue) {
        issues.push(children.issue);
    }

    if (!pickupData.pickup_place) {
        agregarUnico(missingFields, 'pickup_place');
    }

    if (!pickupData.pickup_time) {
        agregarUnico(missingFields, 'pickup_time');
    }

    if (pickupData.pickup_time_rejected) {
        issues.push('Hora de pickup FareHarbor no cumple formato HH:mm o HH:mm:ss.');
    }

    if (!money.money_ready && money.money_issue) {
        issues.push(money.money_issue);
    }

    if (activityTiming.issue) {
        issues.push(activityTiming.issue);
    }

    const reservationCandidate = {
        codigo: null,
        codigo_source: 'generated_on_apply',
        fecha,
        id_tour: tour.id_tour,
        tour: tour.nombre_tour,
        turno: tour.turno,
        id_pais: pais?.id_pais || null,
        pais: pais?.nombre || null,
        id_plataforma: plataforma?.id_plataforma || null,
        plataforma: plataforma?.nombre || null,
        nombre_cliente: contactName,
        telefono_cliente: contactPhone,
        pax,
        ninos: children.ninos,
        pickup_place: pickupData.pickup_place,
        pickup_time: pickupData.pickup_time,
        precio_total: money.precio_total,
        deposito: money.deposito,
        saldo: money.saldo,
        estado: ESTADO_INICIAL_RESERVACION,
        habitacion: null,
        tipo_cambio: null,
        metodo_pago: null,
        observaciones: null,
        vendedor: null,
        idioma: null,
    };
    const readyToApply = (
        missingFields.length === 0
        && money.money_ready
        && activityTiming.has_started === false
    );

    return crearResultado('preview', {
        activity_timing: {
            start_at: activityTiming.start_at,
            has_started: activityTiming.has_started,
        },
        external: {
            activity_title: activityTitle,
            option_title: optionTitle,
            item_pk: normalizedData.availability?.item?.pk ?? null,
            booking_status: normalizedData.booking?.status || null,
            start_at: normalizedData.availability?.start_at || null,
            end_at: normalizedData.availability?.end_at || null,
            categories,
        },
        reservation_candidate: reservationCandidate,
        sources: {
            tour,
            children: {
                source: children.children_source,
                unknown_categories: children.unknown_categories,
            },
            pickup: {
                pickup_place: pickupData.pickup_place ? 'pickup.display_text_or_name' : 'manual',
                pickup_time: pickupData.pickup_time ? 'pickup.time' : 'manual',
                lodging_present: pickupData.lodging_present,
                arrival_present: pickupData.arrival_present,
            },
            country: {
                source: pais ? 'default_no_especificado' : 'missing_catalog',
            },
            platform: {
                source: plataforma ? 'fareharbor_catalog' : 'missing_catalog',
            },
            money: {
                source: money.money_ready ? 'minor_units_mxn' : 'not_ready',
                currency: money.currency,
                receipt_total_display: money.receipt_total_display,
                amount_paid_display: money.amount_paid_display,
                invoice_price_display: money.invoice_price_display,
                issue: money.money_issue,
            },
        },
        money_ready: money.money_ready,
        ready_to_apply: readyToApply,
        missing_fields: missingFields,
        issues,
    });
}

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

async function bloquearEventosBookingFareHarbor(db, externalBookingId) {
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

async function obtenerLinkPorExternalBooking(db, provider, externalBookingId) {
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
        [provider, externalBookingId]
    );

    return result.rows[0] || null;
}

async function crearLinkReservaIntegracion(db, { provider, externalBookingId, idReservacion }) {
    const result = await db.query(
        `
            INSERT INTO reservas_integracion_link (
                provider,
                external_booking_id,
                id_reservacion,
                created_at
            )
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            RETURNING
                id_reserva_integracion_link,
                provider,
                external_booking_id,
                id_reservacion,
                created_at
        `,
        [provider, externalBookingId, idReservacion]
    );

    return result.rows[0];
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

function esUniqueLink(error) {
    return error?.code === '23505' && error?.constraint === LINK_UNIQUE_CONSTRAINT;
}

function obtenerCamposNoPermitidos(completar = {}) {
    return Object.keys(completar).filter((campo) => !CAMPOS_COMPLETAR_FAREHARBOR.includes(campo));
}

function clasificarMoneyIssue(issue) {
    if (!issue) {
        return crearResultado('dinero_invalido');
    }

    if (/moneda/i.test(issue)) {
        return crearResultado('moneda_no_soportada', { reason: issue });
    }

    if (/supera el total/i.test(issue)) {
        return crearResultado('dinero_inconsistente', { reason: issue });
    }

    if (/exceden/i.test(issue)) {
        return crearResultado('dinero_overflow', { reason: issue });
    }

    return crearResultado('dinero_invalido', { reason: issue });
}

function aplicarCampoManualSiNecesario({ completar, preview, campo, candidate, destino = campo, errores }) {
    if (!Object.prototype.hasOwnProperty.call(completar, campo)) {
        return;
    }

    if (!preview.missing_fields.includes(campo)) {
        errores.push(`El campo completar.${campo} no puede sobrescribir un valor derivado de FareHarbor`);
        return;
    }

    candidate[destino] = completar[campo];
}

async function construirReservacionFareHarborParaAplicacion(db, evento, completar = {}, opciones = {}) {
    const camposNoPermitidos = obtenerCamposNoPermitidos(completar);

    if (camposNoPermitidos.length > 0) {
        return crearResultado('completar_invalido', {
            errores: camposNoPermitidos.map((campo) => `El campo completar.${campo} no esta permitido para FareHarbor`),
        });
    }

    const preview = await construirPreviewNuevaReservaFareHarborConDb(db, evento, opciones);

    if (preview.tipo !== 'preview') {
        return preview;
    }

    if (preview.activity_timing?.has_started === true) {
        return crearResultado('actividad_iniciada', {
            reason: ISSUE_ACTIVIDAD_INICIADA,
            preview,
        });
    }

    if (preview.activity_timing?.has_started !== false) {
        return crearResultado('horario_inicio_indeterminado', {
            reason: ISSUE_HORARIO_INICIO_INDETERMINADO,
            preview,
        });
    }

    const candidate = { ...preview.reservation_candidate };
    const erroresOverride = [];

    CAMPOS_COMPLETAR_FAREHARBOR.forEach((campo) => {
        aplicarCampoManualSiNecesario({
            completar,
            preview,
            campo,
            candidate,
            errores: erroresOverride,
        });
    });

    if (erroresOverride.length > 0) {
        return crearResultado('override_prohibido', { errores: erroresOverride });
    }

    const missingFields = preview.missing_fields.filter((campo) => (
        candidate[campo] === null
        || candidate[campo] === undefined
        || candidate[campo] === ''
    ));

    if (missingFields.length > 0) {
        return crearResultado('faltan_datos', {
            missingFields,
            warnings: preview.issues,
        });
    }

    if (!preview.money_ready) {
        return clasificarMoneyIssue(preview.sources?.money?.issue);
    }

    if (preview.sources?.tour?.source === 'manual') {
        const tour = await obtenerTourActivo(db, candidate.id_tour);

        if (!tour) {
            return crearResultado('referencia_invalida', { campo: 'id_tour' });
        }

        candidate.tour = tour.nombre;
    }

    if (preview.sources?.country?.source === 'missing_catalog') {
        return crearResultado('catalogo_no_encontrado', { campo: 'id_pais' });
    }

    if (preview.sources?.platform?.source === 'missing_catalog') {
        return crearResultado('catalogo_no_encontrado', { campo: 'id_plataforma' });
    }

    const reservationData = {
        fecha: candidate.fecha,
        id_tour: candidate.id_tour,
        id_pais: candidate.id_pais,
        id_plataforma: candidate.id_plataforma,
        nombre_cliente: candidate.nombre_cliente,
        telefono_cliente: candidate.telefono_cliente,
        habitacion: null,
        pax: candidate.pax,
        ninos: candidate.ninos,
        pickup_place: candidate.pickup_place,
        pickup_time: candidate.pickup_time,
        turno: candidate.turno,
        idioma: null,
        precio_total: candidate.precio_total,
        deposito: candidate.deposito,
        saldo: candidate.saldo,
        tipo_cambio: null,
        metodo_pago: null,
        vendedor: null,
        observaciones: null,
        estado: ESTADO_INICIAL_RESERVACION,
    };
    const { errores, reservacion } = validarDatosReservacion(reservationData);

    if (errores.length > 0) {
        return crearResultado('datos_invalidos', { errores });
    }

    return crearResultado('preparado', {
        preview,
        reservationData: reservacion,
    });
}

async function aplicarNewBookingConDb(client, evento, usuarioId, completar, opciones = {}) {
    if (!evento.external_booking_id) {
        return crearResultado('faltan_datos', { missingFields: ['external_booking_id'] });
    }

    const eventosBooking = await bloquearEventosBookingFareHarbor(client, evento.external_booking_id);
    const snapshotMasReciente = eventosBooking[0];

    if (
        !snapshotMasReciente
        || Number(snapshotMasReciente.id_evento_integracion) !== Number(evento.id_evento_integracion)
    ) {
        return crearResultado('snapshot_obsoleto');
    }

    const linkExistente = await obtenerLinkPorExternalBooking(
        client,
        evento.provider,
        evento.external_booking_id
    );

    if (linkExistente) {
        return crearResultado('ya_vinculado', { link: linkExistente });
    }

    const preparacion = await construirReservacionFareHarborParaAplicacion(client, evento, completar, opciones);

    if (preparacion.tipo !== 'preparado') {
        return preparacion;
    }

    const reservacion = await reservacionesService.crearReservacionConDb(
        client,
        preparacion.reservationData,
        usuarioId
    );

    let link;

    try {
        link = await crearLinkReservaIntegracion(client, {
            provider: evento.provider,
            externalBookingId: evento.external_booking_id,
            idReservacion: reservacion.id_reservacion,
        });
    } catch (error) {
        if (esUniqueLink(error)) {
            return crearResultado('ya_vinculado');
        }

        throw error;
    }

    const eventoAplicado = await marcarEventoAplicado(client, {
        idEventoIntegracion: evento.id_evento_integracion,
        idUsuario: usuarioId,
    });

    if (!eventoAplicado) {
        return crearResultado('ya_aplicado');
    }

    return crearResultado('aplicado', {
        reservacion,
        link,
        evento: eventoAplicado,
        reservationData: preparacion.reservationData,
    });
}

async function aplicarNuevaReservaFareHarbor(idEventoIntegracion, usuarioId, completar = {}, dbPool = pool, opciones = {}) {
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

        if (evento.event_type !== EVENT_TYPE_NEW_BOOKING) {
            await client.query('ROLLBACK');
            return crearResultado('event_type_no_soportado');
        }

        if (evento.review_status !== REVIEW_STATUS_APPROVED) {
            await client.query('ROLLBACK');
            return crearResultado('no_aprobado');
        }

        if (evento.application_status === APPLICATION_STATUS_APPLIED) {
            await client.query('ROLLBACK');
            return crearResultado('ya_aplicado');
        }

        const resultado = await aplicarNewBookingConDb(client, evento, usuarioId, completar, opciones);

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
    CAMPOS_COMPLETAR_FAREHARBOR,
    EVENT_TYPE_NEW_BOOKING,
    ISSUE_ACTIVIDAD_INICIADA,
    ISSUE_HORARIO_INICIO_INDETERMINADO,
    LINK_UNIQUE_CONSTRAINT,
    MONEY_NUMERIC_MAX_MINOR,
    PLATFORM_NAME_FAREHARBOR,
    PROVIDER_FAREHARBOR,
    REVIEW_STATUS_APPROVED,
    aplicarNuevaReservaFareHarbor,
    construirReservacionFareHarborParaAplicacion,
    construirPreviewNuevaReservaFareHarborConDb,
    convertirDinero,
    evaluarTimingActividadFareHarbor,
    extraerActivityTitle,
    extraerFechaActividad,
    extraerOptionTitle,
    calcularNinos,
};
