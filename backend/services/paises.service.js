const pool = require('../config/database');

const columnasPais = `
    id_pais,
    nombre
`;

const obtenerPaises = async () => {
    const query = `
        SELECT
            ${columnasPais}
        FROM paises
        ORDER BY
            nombre ASC,
            id_pais ASC
    `;

    const result = await pool.query(query);

    return result.rows;
};

module.exports = {
    obtenerPaises
};
