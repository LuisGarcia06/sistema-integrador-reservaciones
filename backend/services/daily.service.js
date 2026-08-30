const pool = require('../config/database');

const consultarDailyPorFecha = async (fecha) => {
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

module.exports = {
    consultarDailyPorFecha
};
