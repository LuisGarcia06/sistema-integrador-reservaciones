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

const crearPais = async (pais) => {
    const query = `
        INSERT INTO paises (
            nombre
        )
        VALUES ($1)
        RETURNING
            ${columnasPais}
    `;

    const result = await pool.query(query, [pais.nombre]);

    return result.rows[0];
};

module.exports = {
    obtenerPaises,
    crearPais
};
