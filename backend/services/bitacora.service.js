const pool = require('../config/database');

const columnasBitacora = `
    id_bitacora,
    id_usuario,
    id_reservacion,
    accion,
    descripcion,
    fecha
`;

const crearEntradaBitacora = async ({
    idUsuario,
    idReservacion,
    accion,
    descripcion
}, db = pool) => {
    const query = `
        INSERT INTO bitacora (
            id_usuario,
            id_reservacion,
            accion,
            descripcion,
            fecha
        )
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        RETURNING
            ${columnasBitacora}
    `;

    const values = [
        idUsuario,
        idReservacion,
        accion,
        descripcion
    ];

    const result = await db.query(query, values);

    return result.rows[0];
};

const consultarBitacora = async (filtros = {}) => {
    const condiciones = [];
    const values = [];

    if (filtros.fecha_desde) {
        values.push(filtros.fecha_desde);
        condiciones.push(`b.fecha >= $${values.length}::date`);
    }

    if (filtros.fecha_hasta) {
        values.push(filtros.fecha_hasta);
        condiciones.push(`b.fecha < ($${values.length}::date + INTERVAL '1 day')`);
    }

    const where = condiciones.length > 0
        ? `WHERE ${condiciones.join('\n            AND ')}`
        : '';

    const query = `
        SELECT
            b.id_bitacora,
            b.id_usuario,
            u.nombre AS usuario,
            u.correo AS usuario_correo,
            b.id_reservacion,
            r.codigo AS codigo_reservacion,
            b.accion,
            b.descripcion,
            b.fecha
        FROM bitacora b
        INNER JOIN usuarios u
            ON u.id_usuario = b.id_usuario
        INNER JOIN reservaciones r
            ON r.id_reservacion = b.id_reservacion
        ${where}
        ORDER BY b.fecha DESC, b.id_bitacora DESC
    `;

    const result = await pool.query(query, values);

    return result.rows;
};

module.exports = {
    crearEntradaBitacora,
    consultarBitacora
};
