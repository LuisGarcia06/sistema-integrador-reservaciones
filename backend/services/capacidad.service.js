const { obtenerTurno } = require('../utils/turno');

const MAX_PAX_TRANSPORTE = 12;
const MAX_PAX_TOUR_TURNO = 24;
const ESTADO_CANCELADA = 'Cancelada';

const normalizarFechaResultado = (fecha) => {
    if (fecha instanceof Date) {
        return fecha.toISOString().slice(0, 10);
    }

    return fecha;
};

const normalizarHoraResultado = (horaInicio) => {
    if (typeof horaInicio !== 'string') {
        return horaInicio;
    }

    return horaInicio.split('.')[0];
};

const obtenerPaxOperativoReservacion = (reservacion) => {
    if (!reservacion || reservacion.estado === ESTADO_CANCELADA) {
        return 0;
    }

    return Number(reservacion.pax) || 0;
};

const obtenerGrupoTransporteOperacion = (transporteOperacion) => {
    if (!transporteOperacion) {
        return null;
    }

    const horaInicio = normalizarHoraResultado(transporteOperacion.hora_inicio);

    return {
        fecha: normalizarFechaResultado(transporteOperacion.fecha),
        id_tour: Number(transporteOperacion.id_tour),
        turno: obtenerTurno(horaInicio)
    };
};

const esMismoGrupoOperativo = (grupoA, grupoB) => {
    if (!grupoA || !grupoB) {
        return false;
    }

    return grupoA.fecha === grupoB.fecha
        && Number(grupoA.id_tour) === Number(grupoB.id_tour)
        && grupoA.turno === grupoB.turno;
};

const obtenerIdsOrdenadosUnicos = (ids) => (
    [...new Set(ids.filter((id) => id !== null && id !== undefined).map(Number))]
        .sort((a, b) => a - b)
);

const bloquearTransportesPorIds = async (db, ids) => {
    const idsOrdenados = obtenerIdsOrdenadosUnicos(ids);

    if (idsOrdenados.length === 0) {
        return [];
    }

    const query = `
        SELECT id_transporte_operacion
        FROM transportes_operacion
        WHERE id_transporte_operacion = ANY($1::int[])
        ORDER BY id_transporte_operacion ASC
        FOR UPDATE
    `;

    const result = await db.query(query, [idsOrdenados]);

    return result.rows.map((row) => row.id_transporte_operacion);
};

const obtenerIdsTransportesGrupo = async (db, grupo) => {
    if (!grupo) {
        return [];
    }

    const query = `
        SELECT tr.id_transporte_operacion
        FROM transportes_operacion tr
        INNER JOIN operaciones_tour ot
            ON ot.id_operacion_tour = tr.id_operacion_tour
        WHERE ot.fecha = $1
            AND ot.id_tour = $2
            AND (
                CASE
                    WHEN ot.hora_inicio <= TIME '12:00' THEN 'Mañana'
                    ELSE 'Tarde'
                END
            ) = $3
        ORDER BY tr.id_transporte_operacion ASC
    `;

    const result = await db.query(query, [grupo.fecha, grupo.id_tour, grupo.turno]);

    return result.rows.map((row) => row.id_transporte_operacion);
};

const calcularPaxTransporte = async (db, idTransporteOperacion, opciones = {}) => {
    const values = [idTransporteOperacion];
    const condiciones = [
        'r.id_transporte_operacion = $1',
        'r.estado <> $2'
    ];

    values.push(ESTADO_CANCELADA);

    if (opciones.excluirIdReservacion) {
        values.push(opciones.excluirIdReservacion);
        condiciones.push(`r.id_reservacion <> $${values.length}`);
    }

    const query = `
        SELECT COALESCE(SUM(r.pax), 0)::int AS total_pax
        FROM reservaciones r
        WHERE ${condiciones.join('\n            AND ')}
    `;

    const result = await db.query(query, values);

    return Number(result.rows[0].total_pax) || 0;
};

const calcularPaxTourTurno = async (db, grupo, opciones = {}) => {
    const values = [grupo.fecha, grupo.id_tour, grupo.turno, ESTADO_CANCELADA];
    const condiciones = [
        'ot.fecha = $1',
        'ot.id_tour = $2',
        `(
            CASE
                WHEN ot.hora_inicio <= TIME '12:00' THEN 'Mañana'
                ELSE 'Tarde'
            END
        ) = $3`,
        'r.estado <> $4'
    ];

    if (opciones.excluirIdReservacion) {
        values.push(opciones.excluirIdReservacion);
        condiciones.push(`r.id_reservacion <> $${values.length}`);
    }

    const query = `
        SELECT COALESCE(SUM(r.pax), 0)::int AS total_pax
        FROM reservaciones r
        INNER JOIN transportes_operacion tr
            ON tr.id_transporte_operacion = r.id_transporte_operacion
        INNER JOIN operaciones_tour ot
            ON ot.id_operacion_tour = tr.id_operacion_tour
        WHERE ${condiciones.join('\n            AND ')}
    `;

    const result = await db.query(query, values);

    return Number(result.rows[0].total_pax) || 0;
};

const validarCapacidadTransporte = (transporteOperacion, totalPax, opciones = {}) => {
    if (totalPax > MAX_PAX_TRANSPORTE) {
        return `El transporte excede el máximo operativo de ${MAX_PAX_TRANSPORTE} pasajeros`;
    }

    if (!transporteOperacion || transporteOperacion.id_vehiculo === null || transporteOperacion.id_vehiculo === undefined) {
        return null;
    }

    const capacidadVehiculo = Number(transporteOperacion.capacidad);

    if (Number.isFinite(capacidadVehiculo) && totalPax > capacidadVehiculo) {
        return 'El transporte excede la capacidad del vehículo asignado';
    }

    if (opciones.validarMinimo !== false && totalPax < 2) {
        return opciones.mensajeMinimo
            || 'El transporte con vehículo debe tener al menos 2 pasajeros activos';
    }

    return null;
};

const validarMinimoTransporteConVehiculo = (transporteOperacion, totalPax, mensaje) => {
    if (!transporteOperacion || transporteOperacion.id_vehiculo === null || transporteOperacion.id_vehiculo === undefined) {
        return null;
    }

    if (totalPax < 2) {
        return mensaje || 'El transporte con vehículo debe tener al menos 2 pasajeros activos';
    }

    return null;
};

const validarMaximoTourTurno = (totalPax) => {
    if (totalPax > MAX_PAX_TOUR_TURNO) {
        return `El tour excede el máximo operativo de ${MAX_PAX_TOUR_TURNO} pasajeros para la fecha y turno`;
    }

    return null;
};

module.exports = {
    MAX_PAX_TRANSPORTE,
    MAX_PAX_TOUR_TURNO,
    ESTADO_CANCELADA,
    normalizarFechaResultado,
    normalizarHoraResultado,
    obtenerPaxOperativoReservacion,
    obtenerGrupoTransporteOperacion,
    esMismoGrupoOperativo,
    obtenerIdsOrdenadosUnicos,
    bloquearTransportesPorIds,
    obtenerIdsTransportesGrupo,
    calcularPaxTransporte,
    calcularPaxTourTurno,
    validarCapacidadTransporte,
    validarMinimoTransporteConVehiculo,
    validarMaximoTourTurno
};
