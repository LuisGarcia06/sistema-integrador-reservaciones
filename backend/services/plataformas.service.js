const pool = require('../config/database');

const columnasPlataforma = `
    id_plataforma,
    nombre
`;

const obtenerPlataformas = async () => {
    const query = `
        SELECT
            ${columnasPlataforma}
        FROM plataformas
        ORDER BY
            nombre ASC,
            id_plataforma ASC
    `;

    const result = await pool.query(query);

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
