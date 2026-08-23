const pool = require('../config/database');

const obtenerReservaciones = async () => {
    const query = `
        SELECT
            id_reservacion,
            codigo,
            fecha,
            id_tour,
            id_pais,
            id_plataforma,
            nombre_cliente,
            habitacion,
            pax,
            ninos,
            pickup_place,
            pickup_time,
            precio_total,
            deposito,
            saldo,
            tipo_cambio,
            metodo_pago,
            estado,
            fecha_registro,
            ultima_actualizacion
        FROM reservaciones
        ORDER BY fecha_registro DESC, id_reservacion DESC
    `;

    const result = await pool.query(query);

    return result.rows;
};

const obtenerReservacionPorId = async (idReservacion) => {
    const query = `
        SELECT
            id_reservacion,
            codigo,
            fecha,
            id_tour,
            id_pais,
            id_plataforma,
            nombre_cliente,
            habitacion,
            pax,
            ninos,
            pickup_place,
            pickup_time,
            precio_total,
            deposito,
            saldo,
            tipo_cambio,
            metodo_pago,
            estado,
            fecha_registro,
            ultima_actualizacion
        FROM reservaciones
        WHERE id_reservacion = $1
    `;

    const result = await pool.query(query, [idReservacion]);

    return result.rows[0];
};

module.exports = {
    obtenerReservaciones,
    obtenerReservacionPorId
};
