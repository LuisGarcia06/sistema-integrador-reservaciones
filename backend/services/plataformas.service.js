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

module.exports = {
    obtenerPlataformas
};
