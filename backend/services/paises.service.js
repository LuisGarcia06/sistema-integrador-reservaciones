const pool = require('../config/database');
const auditoria = require('./bitacora.service');
const transactions = require('../config/operationalTransactions');

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

    return transactions.creation(pool, async db => {
        const result = await db.query(query, [pais.nombre]);
        const nuevo = result.rows[0];
        if (auditoria.catalogosActivos()) await auditoria.registrarAuditoriaEstructurada({recurso:'paises',anterior:null,nuevo}, db);
        return nuevo;
    });
};

module.exports = {
    obtenerPaises,
    crearPais
};
