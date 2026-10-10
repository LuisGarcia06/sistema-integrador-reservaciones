const pool = require('../../config/database');
const equivalenciasToursExternosService = require('../../services/equivalenciasToursExternos.service');

const PROVIDER_FAREHARBOR = 'fareharbor';
const PLATFORM_NAME_FAREHARBOR = 'FareHarbor';
const PAIS_NO_ESPECIFICADO = 'No especificado';
const ESTADO_INICIAL_RESERVACION = 'Pendiente';
const MONEY_NUMERIC_MAX_MINOR = 9999999999n;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

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

async function construirPreviewNuevaReservaFareHarborConDb(db = pool, evento = {}) {
    if (evento.provider !== PROVIDER_FAREHARBOR || evento.event_type !== 'new_booking') {
        return crearResultado('event_type_no_soportado');
    }

    const normalizedData = evento.normalized_data || {};
    const activityTitle = extraerActivityTitle(normalizedData);
    const optionTitle = extraerOptionTitle(normalizedData);
    const categories = obtenerCategorias(normalizedData);
    const pax = obtenerEnteroPositivo(normalizedData.customers?.total);
    const fecha = extraerFechaActividad(normalizedData.availability?.start_at);
    const contactName = obtenerTexto(normalizedData.contact?.name);
    const contactPhone = obtenerTexto(normalizedData.contact?.normalized_phone);
    const pickupData = obtenerPickupData(normalizedData);
    const money = convertirDinero(normalizedData);
    const [pais, plataforma, tour] = await Promise.all([
        obtenerPaisNoEspecificado(db),
        obtenerPlataformaFareHarbor(db),
        resolverTourTurno(db, { activityTitle, optionTitle }),
    ]);
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
    const readyToApply = missingFields.length === 0 && money.money_ready;

    return crearResultado('preview', {
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

module.exports = {
    MONEY_NUMERIC_MAX_MINOR,
    PLATFORM_NAME_FAREHARBOR,
    PROVIDER_FAREHARBOR,
    construirPreviewNuevaReservaFareHarborConDb,
    convertirDinero,
    extraerActivityTitle,
    extraerFechaActividad,
    extraerOptionTitle,
    calcularNinos,
};
