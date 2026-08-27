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

module.exports = {
    crearEntradaBitacora
};
