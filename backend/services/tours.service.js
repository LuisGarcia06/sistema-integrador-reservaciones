const pool = require('../config/database');

const columnasTour = `
    id_tour,
    nombre,
    descripcion,
    activo
`;

const obtenerTours = async () => {
    const query = `
        SELECT
            ${columnasTour}
        FROM tours
        ORDER BY
            nombre ASC,
            id_tour ASC
    `;

    const result = await pool.query(query);

    return result.rows;
};

const obtenerTourPorId = async (idTour) => {
    const query = `
        SELECT
            ${columnasTour}
        FROM tours
        WHERE id_tour = $1
        LIMIT 1
    `;

    const result = await pool.query(query, [idTour]);

    return result.rows[0];
};

module.exports = {
    obtenerTours,
    obtenerTourPorId
};
