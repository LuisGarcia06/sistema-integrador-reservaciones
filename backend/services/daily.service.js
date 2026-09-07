const pool = require('../config/database');
const { obtenerTurno } = require('../utils/turno');

const ESTADO_CANCELADA = 'Cancelada';

const normalizarFechaResultado = (fecha) => {
    if (fecha instanceof Date) {
        return fecha.toISOString().slice(0, 10);
    }

    return fecha;
};

const normalizarHoraResultado = (hora) => {
    if (typeof hora !== 'string') {
        return hora;
    }

    return hora.split('.')[0];
};

const obtenerPaxActivo = (reservacion) => (
    reservacion.estado === ESTADO_CANCELADA
        ? 0
        : Number(reservacion.pax) || 0
);

const mapearReservacionOperativa = (reservacion) => ({
    id_reservacion: reservacion.id_reservacion,
    codigo: reservacion.codigo,
    fecha: normalizarFechaResultado(reservacion.fecha),
    id_tour: reservacion.id_tour,
    tour: reservacion.tour,
    id_pais: reservacion.id_pais,
    pais: reservacion.pais,
    id_plataforma: reservacion.id_plataforma,
    plataforma: reservacion.plataforma,
    nombre_cliente: reservacion.nombre_cliente,
    telefono_cliente: reservacion.telefono_cliente,
    habitacion: reservacion.habitacion,
    pax: reservacion.pax,
    ninos: reservacion.ninos,
    pickup_place: reservacion.pickup_place,
    pickup_time: normalizarHoraResultado(reservacion.pickup_time),
    precio_total: reservacion.precio_total,
    deposito: reservacion.deposito,
    saldo: reservacion.saldo,
    tipo_cambio: reservacion.tipo_cambio,
    metodo_pago: reservacion.metodo_pago,
    vendedor: reservacion.vendedor,
    observaciones: reservacion.observaciones,
    estado: reservacion.estado,
    id_transporte_operacion: reservacion.id_transporte_operacion
});

const consultarReservacionesDailyPorFecha = async (fecha) => {
    const query = `
        SELECT
            r.id_reservacion,
            r.codigo,
            r.fecha,
            t.nombre AS tour,
            p.nombre AS pais,
            pl.nombre AS plataforma,
            r.nombre_cliente,
            r.habitacion,
            r.pax,
            r.ninos,
            r.pickup_place,
            r.pickup_time,
            r.precio_total,
            r.deposito,
            r.saldo,
            r.tipo_cambio,
            r.metodo_pago,
            r.estado
        FROM reservaciones r
        INNER JOIN tours t
            ON t.id_tour = r.id_tour
        INNER JOIN paises p
            ON p.id_pais = r.id_pais
        INNER JOIN plataformas pl
            ON pl.id_plataforma = r.id_plataforma
        WHERE r.fecha = $1
        ORDER BY
            r.pickup_time ASC,
            t.nombre ASC,
            r.nombre_cliente ASC,
            r.id_reservacion ASC
    `;

    const result = await pool.query(query, [fecha]);

    return result.rows;
};

const consultarOperacionesOperativasPorFecha = async (fecha) => {
    const query = `
        SELECT
            ot.id_operacion_tour,
            ot.id_tour,
            t.nombre AS tour,
            ot.hora_inicio,
            ot.id_guia,
            g.nombre AS guia,
            ot.estado
        FROM operaciones_tour ot
        INNER JOIN tours t
            ON t.id_tour = ot.id_tour
        LEFT JOIN guias g
            ON g.id_guia = ot.id_guia
        WHERE ot.fecha = $1
        ORDER BY
            ot.hora_inicio ASC,
            t.nombre ASC,
            ot.id_operacion_tour ASC
    `;

    const result = await pool.query(query, [fecha]);

    return result.rows;
};

const consultarTransportesOperativosPorFecha = async (fecha) => {
    const query = `
        SELECT
            tr.id_transporte_operacion,
            tr.id_operacion_tour,
            tr.id_vehiculo,
            v.identificador AS vehiculo,
            v.placas,
            v.color,
            v.capacidad,
            tr.id_operador,
            o.nombre AS operador,
            tr.observaciones_operador,
            tr.estado
        FROM transportes_operacion tr
        INNER JOIN operaciones_tour ot
            ON ot.id_operacion_tour = tr.id_operacion_tour
        LEFT JOIN vehiculos v
            ON v.id_vehiculo = tr.id_vehiculo
        LEFT JOIN operadores o
            ON o.id_operador = tr.id_operador
        WHERE ot.fecha = $1
        ORDER BY
            CASE WHEN v.identificador IS NULL THEN 1 ELSE 0 END ASC,
            v.identificador ASC,
            tr.id_transporte_operacion ASC
    `;

    const result = await pool.query(query, [fecha]);

    return result.rows;
};

const consultarReservacionesAsignadasOperativasPorFecha = async (fecha) => {
    const query = `
        SELECT
            r.id_reservacion,
            r.codigo,
            r.fecha,
            r.id_tour,
            t.nombre AS tour,
            r.id_pais,
            p.nombre AS pais,
            r.id_plataforma,
            pl.nombre AS plataforma,
            r.nombre_cliente,
            r.telefono_cliente,
            r.habitacion,
            r.pax,
            r.ninos,
            r.pickup_place,
            r.pickup_time,
            r.precio_total,
            r.deposito,
            r.saldo,
            r.tipo_cambio,
            r.metodo_pago,
            r.vendedor,
            r.observaciones,
            r.estado,
            r.id_transporte_operacion
        FROM reservaciones r
        INNER JOIN transportes_operacion tr
            ON tr.id_transporte_operacion = r.id_transporte_operacion
        INNER JOIN operaciones_tour ot
            ON ot.id_operacion_tour = tr.id_operacion_tour
        INNER JOIN tours t
            ON t.id_tour = r.id_tour
        INNER JOIN paises p
            ON p.id_pais = r.id_pais
        INNER JOIN plataformas pl
            ON pl.id_plataforma = r.id_plataforma
        WHERE ot.fecha = $1
        ORDER BY
            r.pickup_time ASC NULLS LAST,
            r.nombre_cliente ASC,
            r.id_reservacion ASC
    `;

    const result = await pool.query(query, [fecha]);

    return result.rows;
};

const consultarReservacionesSinAsignarOperativasPorFecha = async (fecha) => {
    const query = `
        SELECT
            r.id_reservacion,
            r.codigo,
            r.fecha,
            r.id_tour,
            t.nombre AS tour,
            r.id_pais,
            p.nombre AS pais,
            r.id_plataforma,
            pl.nombre AS plataforma,
            r.nombre_cliente,
            r.telefono_cliente,
            r.habitacion,
            r.pax,
            r.ninos,
            r.pickup_place,
            r.pickup_time,
            r.precio_total,
            r.deposito,
            r.saldo,
            r.tipo_cambio,
            r.metodo_pago,
            r.vendedor,
            r.observaciones,
            r.estado,
            r.id_transporte_operacion
        FROM reservaciones r
        INNER JOIN tours t
            ON t.id_tour = r.id_tour
        INNER JOIN paises p
            ON p.id_pais = r.id_pais
        INNER JOIN plataformas pl
            ON pl.id_plataforma = r.id_plataforma
        WHERE r.fecha = $1
            AND r.id_transporte_operacion IS NULL
        ORDER BY
            r.pickup_time ASC NULLS LAST,
            t.nombre ASC,
            r.nombre_cliente ASC,
            r.id_reservacion ASC
    `;

    const result = await pool.query(query, [fecha]);

    return result.rows;
};

const crearOperacionOperativa = (operacion) => {
    const horaInicio = normalizarHoraResultado(operacion.hora_inicio);

    return {
        id_operacion_tour: operacion.id_operacion_tour,
        id_tour: operacion.id_tour,
        tour: operacion.tour,
        hora_inicio: horaInicio,
        turno: obtenerTurno(horaInicio),
        id_guia: operacion.id_guia,
        guia: operacion.guia,
        estado: operacion.estado,
        total_pax_activos: 0,
        transportes: []
    };
};

const crearTransporteOperativo = (transporte) => ({
    id_transporte_operacion: transporte.id_transporte_operacion,
    id_vehiculo: transporte.id_vehiculo,
    vehiculo: transporte.vehiculo,
    placas: transporte.placas,
    color: transporte.color,
    capacidad: transporte.capacidad,
    id_operador: transporte.id_operador,
    operador: transporte.operador,
    observaciones_operador: transporte.observaciones_operador,
    estado: transporte.estado,
    total_reservaciones: 0,
    total_pax_activos: 0,
    reservaciones: []
});

const agruparDailyOperativo = ({
    operaciones,
    transportes,
    reservacionesAsignadas,
    reservacionesSinAsignar
}) => {
    const operacionesPorId = new Map();
    const transportesPorId = new Map();

    operaciones.forEach((operacion) => {
        operacionesPorId.set(
            operacion.id_operacion_tour,
            crearOperacionOperativa(operacion)
        );
    });

    transportes.forEach((transporte) => {
        const operacion = operacionesPorId.get(transporte.id_operacion_tour);

        if (!operacion) {
            return;
        }

        const transporteOperativo = crearTransporteOperativo(transporte);
        transportesPorId.set(transporte.id_transporte_operacion, transporteOperativo);
        operacion.transportes.push(transporteOperativo);
    });

    reservacionesAsignadas.forEach((reservacion) => {
        const transporte = transportesPorId.get(reservacion.id_transporte_operacion);

        if (!transporte) {
            return;
        }

        const reservacionOperativa = mapearReservacionOperativa(reservacion);
        const paxActivo = obtenerPaxActivo(reservacionOperativa);

        transporte.reservaciones.push(reservacionOperativa);
        transporte.total_reservaciones += 1;
        transporte.total_pax_activos += paxActivo;
    });

    const operacionesOperativas = [...operacionesPorId.values()];

    operacionesOperativas.forEach((operacion) => {
        operacion.total_pax_activos = operacion.transportes.reduce(
            (total, transporte) => total + transporte.total_pax_activos,
            0
        );
    });

    const reservacionesSinAsignarOperativas = reservacionesSinAsignar.map(mapearReservacionOperativa);
    const totalReservacionesAsignadas = reservacionesAsignadas.length;
    const totalReservacionesSinAsignar = reservacionesSinAsignarOperativas.length;
    const totalPaxActivosAsignados = operacionesOperativas.reduce(
        (total, operacion) => total + operacion.total_pax_activos,
        0
    );
    const totalPaxActivosSinAsignar = reservacionesSinAsignarOperativas.reduce(
        (total, reservacion) => total + obtenerPaxActivo(reservacion),
        0
    );

    return {
        operaciones: operacionesOperativas,
        reservaciones_sin_asignar: reservacionesSinAsignarOperativas,
        total_operaciones: operacionesOperativas.length,
        total_transportes: transportes.length,
        total_reservaciones: totalReservacionesAsignadas + totalReservacionesSinAsignar,
        total_reservaciones_asignadas: totalReservacionesAsignadas,
        total_reservaciones_sin_asignar: totalReservacionesSinAsignar,
        total_pax_activos: totalPaxActivosAsignados + totalPaxActivosSinAsignar
    };
};

const obtenerObservacionesPorFecha = async (fecha) => {
    const query = `
        SELECT
            observaciones
        FROM daily_observaciones
        WHERE fecha = $1
        LIMIT 1
    `;

    const result = await pool.query(query, [fecha]);

    return result.rows[0]?.observaciones || '';
};

const guardarObservacionesPorFecha = async (fecha, observaciones) => {
    const query = `
        INSERT INTO daily_observaciones (
            fecha,
            observaciones
        )
        VALUES ($1, $2)
        ON CONFLICT (fecha)
        DO UPDATE SET
            observaciones = EXCLUDED.observaciones,
            ultima_actualizacion = CURRENT_TIMESTAMP
        RETURNING
            id_daily_observacion,
            fecha,
            observaciones,
            ultima_actualizacion
    `;

    const result = await pool.query(query, [fecha, observaciones]);

    return result.rows[0];
};

const consultarDailyPorFecha = async (fecha) => {
    const [datos, observaciones] = await Promise.all([
        consultarReservacionesDailyPorFecha(fecha),
        obtenerObservacionesPorFecha(fecha)
    ]);

    return {
        observaciones,
        datos
    };
};

const consultarDailyOperativoPorFecha = async (fecha) => {
    const [
        operaciones,
        transportes,
        reservacionesAsignadas,
        reservacionesSinAsignar
    ] = await Promise.all([
        consultarOperacionesOperativasPorFecha(fecha),
        consultarTransportesOperativosPorFecha(fecha),
        consultarReservacionesAsignadasOperativasPorFecha(fecha),
        consultarReservacionesSinAsignarOperativasPorFecha(fecha)
    ]);

    return agruparDailyOperativo({
        operaciones,
        transportes,
        reservacionesAsignadas,
        reservacionesSinAsignar
    });
};

module.exports = {
    consultarDailyPorFecha,
    consultarDailyOperativoPorFecha,
    obtenerObservacionesPorFecha,
    guardarObservacionesPorFecha
};
