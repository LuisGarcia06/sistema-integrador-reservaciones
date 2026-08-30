const pool = require('../config/database');

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

module.exports = {
    consultarDailyPorFecha,
    obtenerObservacionesPorFecha,
    guardarObservacionesPorFecha
};
