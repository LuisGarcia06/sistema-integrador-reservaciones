const { ESTADO_INICIAL_RESERVACION } = require('../../validators/reservaciones.validator');

const CAMPOS_COMPLETAR_PERMITIDOS = [
    'fecha',
    'id_tour',
    'id_pais',
    'nombre_cliente',
    'telefono_cliente',
    'habitacion',
    'pax',
    'ninos',
    'pickup_place',
    'pickup_time',
    'turno',
    'idioma',
    'precio_total',
    'deposito',
    'saldo',
    'tipo_cambio',
    'metodo_pago',
    'vendedor',
    'observaciones',
];

const CAMPOS_OBLIGATORIOS_APLICACION = [
    'fecha',
    'id_tour',
    'id_pais',
    'id_plataforma',
    'nombre_cliente',
    'pax',
    'pickup_place',
    'pickup_time',
    'turno',
    'precio_total',
    'estado',
];

const MINUTOS_INICIO_MANANA = 8 * 60;
const MINUTOS_FIN_MANANA = 12 * 60;
const MESES_ESPANOL = {
    enero: 1,
    febrero: 2,
    marzo: 3,
    abril: 4,
    mayo: 5,
    junio: 6,
    julio: 7,
    agosto: 8,
    septiembre: 9,
    octubre: 10,
    noviembre: 11,
    diciembre: 12,
};

const MESES_INGLES = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
};

function tieneValor(valor) {
    return valor !== undefined && valor !== null && !(typeof valor === 'string' && valor.trim() === '');
}

function normalizarTexto(valor) {
    return typeof valor === 'string' ? valor.trim() : valor;
}

function esFechaSegura(valor) {
    return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor);
}

function construirFechaIso(year, month, day) {
    const fechaUtc = new Date(Date.UTC(year, month - 1, day));

    if (
        fechaUtc.getUTCFullYear() !== year
        || fechaUtc.getUTCMonth() !== month - 1
        || fechaUtc.getUTCDate() !== day
    ) {
        return null;
    }

    return [
        String(year).padStart(4, '0'),
        String(month).padStart(2, '0'),
        String(day).padStart(2, '0'),
    ].join('-');
}

function normalizarFechaEspanol(valor) {
    if (typeof valor !== 'string') {
        return null;
    }

    const match = valor
        .trim()
        .replace(/\s+/g, ' ')
        .match(/^(\d{1,2}) de ([a-záéíóúñ]+) de (\d{4})(?:,\s*(?:[01]?\d|2[0-3]):[0-5]\d)?$/i);

    if (!match) {
        return null;
    }

    const day = Number(match[1]);
    const monthName = match[2]
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const month = MESES_ESPANOL[monthName];
    const year = Number(match[3]);

    if (!month || day < 1 || day > 31) {
        return null;
    }

    return construirFechaIso(year, month, day);
}

function normalizarFechaIngles(valor) {
    if (typeof valor !== 'string') {
        return null;
    }

    const match = valor
        .trim()
        .replace(/\s+/g, ' ')
        .match(/^([A-Za-z]+) (\d{1,2}), (\d{4})(?:\s+(?:0?[1-9]|1[0-2]):[0-5]\d\s*(?:AM|PM))?$/i);

    if (!match) {
        return null;
    }

    const month = MESES_INGLES[match[1].toLowerCase()];
    const day = Number(match[2]);
    const year = Number(match[3]);

    if (!month || day < 1 || day > 31) {
        return null;
    }

    return construirFechaIso(year, month, day);
}

function normalizarFechaGetYourGuide(valor) {
    if (esFechaSegura(valor)) {
        return valor;
    }

    return normalizarFechaEspanol(valor) || normalizarFechaIngles(valor);
}

function esHoraSegura(valor) {
    return typeof valor === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(valor);
}

function obtenerMinutosHora(valor) {
    if (!esHoraSegura(valor)) {
        return null;
    }

    const [horas, minutos] = valor.split(':').map(Number);
    return (horas * 60) + minutos;
}

function derivarTurnoDesdeStartTime(startTime) {
    const minutos = obtenerMinutosHora(startTime);

    if (minutos === null) {
        return null;
    }

    if (minutos >= MINUTOS_INICIO_MANANA && minutos <= MINUTOS_FIN_MANANA) {
        return 'Mañana';
    }

    if (minutos > MINUTOS_FIN_MANANA) {
        return 'Tarde';
    }

    return null;
}

function copiarSiTieneValor(destino, campo, valor) {
    if (tieneValor(valor)) {
        destino[campo] = normalizarTexto(valor);
    }
}

function construirDatosDesdeNormalizedData(normalizedData = {}) {
    const reservationData = {};
    const warnings = [];

    const fechaNormalizada = normalizarFechaGetYourGuide(normalizedData.date);

    if (fechaNormalizada) {
        reservationData.fecha = fechaNormalizada;
    } else if (tieneValor(normalizedData.date)) {
        warnings.push('date_no_tiene_formato_seguro');
    }

    if (esHoraSegura(normalizedData.pickup_time)) {
        reservationData.pickup_time = normalizedData.pickup_time;
    } else if (tieneValor(normalizedData.pickup_time)) {
        warnings.push('pickup_time_no_tiene_formato_seguro');
    }

    if (tieneValor(normalizedData.start_time)) {
        const turno = derivarTurnoDesdeStartTime(normalizedData.start_time);

        if (turno) {
            reservationData.turno = turno;
        } else {
            warnings.push('start_time_no_permite_derivar_turno');
        }
    }

    copiarSiTieneValor(reservationData, 'nombre_cliente', normalizedData.customer_name);
    copiarSiTieneValor(reservationData, 'telefono_cliente', normalizedData.customer_phone);
    copiarSiTieneValor(reservationData, 'idioma', normalizedData.tour_language);
    copiarSiTieneValor(reservationData, 'pickup_place', normalizedData.pickup_place);

    if (Number.isInteger(Number(normalizedData.pax)) && Number(normalizedData.pax) > 0) {
        reservationData.pax = Number(normalizedData.pax);
    }

    if (Number.isFinite(Number(normalizedData.price))) {
        reservationData.precio_total = Number(normalizedData.price);
    }

    return {
        reservationData,
        warnings,
    };
}

function filtrarCamposCompletables(completar = {}) {
    return CAMPOS_COMPLETAR_PERMITIDOS.reduce((campos, campo) => {
        if (Object.prototype.hasOwnProperty.call(completar, campo)) {
            campos[campo] = completar[campo];
        }

        return campos;
    }, {});
}

function mapGetYourGuideNewBookingToReservation(evento, {
    completar = {},
    idPlataforma,
} = {}) {
    const datosBase = construirDatosDesdeNormalizedData(evento?.normalized_data || {});
    const completionData = filtrarCamposCompletables(completar);
    const reservationData = {
        ...datosBase.reservationData,
        ...completionData,
        id_plataforma: idPlataforma,
        estado: ESTADO_INICIAL_RESERVACION,
    };
    const missingFields = CAMPOS_OBLIGATORIOS_APLICACION.filter((campo) => !tieneValor(reservationData[campo]));

    return {
        reservationData,
        missingFields,
        warnings: datosBase.warnings,
    };
}

module.exports = {
    CAMPOS_COMPLETAR_PERMITIDOS,
    CAMPOS_OBLIGATORIOS_APLICACION,
    derivarTurnoDesdeStartTime,
    mapGetYourGuideNewBookingToReservation,
    normalizarFechaEspanol,
    normalizarFechaGetYourGuide,
    normalizarFechaIngles,
};
