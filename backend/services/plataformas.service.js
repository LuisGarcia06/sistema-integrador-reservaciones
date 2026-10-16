const pool = require('../config/database');
const { construirFiltroAlcanceReservaciones } = require('../utils/alcanceReservaciones');

const columnasPlataforma = `
    id_plataforma,
    nombre
`;

const obtenerPlataformas = async (alcance) => {
    const values = [];
    const filtroAlcance = construirFiltroAlcanceReservaciones(alcance, 'id_plataforma', values);
    const query = `
        SELECT
            ${columnasPlataforma}
        FROM plataformas
        ${filtroAlcance ? `WHERE ${filtroAlcance}` : ''}
        ORDER BY
            nombre ASC,
            id_plataforma ASC
    `;

    const result = await pool.query(query, values);

    return result.rows;
};

const crearPlataforma = async (plataforma) => {
    const query = `
        INSERT INTO plataformas (
            nombre
        )
        VALUES ($1)
        RETURNING
            ${columnasPlataforma}
    `;

    const result = await pool.query(query, [plataforma.nombre]);

    return result.rows[0];
};

module.exports = {
    obtenerPlataformas,
    crearPlataforma
};
