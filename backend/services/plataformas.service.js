const pool = require('../config/database');
const auditoria = require('./bitacora.service');
const transactions = require('../config/operationalTransactions');
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

    return transactions.creation(pool, async db => {
        const result = await db.query(query, [plataforma.nombre]);
        const nuevo = result.rows[0];
        if (auditoria.catalogosActivos()) await auditoria.registrarAuditoriaEstructurada({recurso:'plataformas',anterior:null,nuevo}, db);
        return nuevo;
    });
};

module.exports = {
    obtenerPlataformas,
    crearPlataforma
};
