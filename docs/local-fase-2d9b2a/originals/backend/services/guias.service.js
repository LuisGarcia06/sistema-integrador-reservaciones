const pool = require('../config/database');

const camposActualizables = [
    'nombre',
    'estado'
];

const columnasGuia = `
    id_guia,
    nombre,
    estado
`;

const obtenerGuiaPorIdConDb = async (db, idGuia, bloquear = false) => {
    const query = `
        SELECT
            ${columnasGuia}
        FROM guias
        WHERE id_guia = $1
        ${bloquear ? 'FOR UPDATE' : ''}
    `;

    const result = await db.query(query, [idGuia]);

    return result.rows[0];
};

const obtenerGuias = async (filtros = {}) => {
    const condiciones = [];
    const values = [];

    if (Object.prototype.hasOwnProperty.call(filtros, 'estado')) {
        values.push(filtros.estado);
        condiciones.push(`estado = $${values.length}`);
    }

    const where = condiciones.length > 0
        ? `WHERE ${condiciones.join('\n            AND ')}`
        : '';

    const query = `
        SELECT
            ${columnasGuia}
        FROM guias
        ${where}
        ORDER BY
            estado DESC,
            nombre ASC,
            id_guia ASC
    `;

    const result = await pool.query(query, values);

    return result.rows;
};

const obtenerGuiaPorId = async (idGuia) => {
    return obtenerGuiaPorIdConDb(pool, idGuia);
};

const crearGuia = async (guia) => {
    const query = `
        INSERT INTO guias (
            nombre,
            estado
        )
        VALUES ($1, $2)
        RETURNING
            id_guia
    `;

    const result = await pool.query(query, [guia.nombre, guia.estado]);

    return obtenerGuiaPorId(result.rows[0].id_guia);
};

const obtenerCambiosGuia = (guiaActual, campos) => (
    Object.keys(campos).filter((campo) => guiaActual[campo] !== campos[campo])
);

const actualizarGuiaConDb = async (db, idGuia, campos) => {
    const nombresCampos = Object.keys(campos);
    const asignaciones = nombresCampos.map((campo, index) => {
        if (!camposActualizables.includes(campo)) {
            throw new Error('Campo de actualización no permitido');
        }

        return `${campo} = $${index + 1}`;
    });

    const values = nombresCampos.map((campo) => campos[campo]);
    values.push(idGuia);

    const query = `
        UPDATE guias
        SET
            ${asignaciones.join(',\n            ')}
        WHERE id_guia = $${values.length}
        RETURNING
            id_guia
    `;

    const result = await db.query(query, values);

    return result.rows[0];
};

const actualizarGuiaParcial = async (idGuia, campos) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const guiaActual = await obtenerGuiaPorIdConDb(client, idGuia, true);

        if (!guiaActual) {
            await client.query('COMMIT');
            return null;
        }

        const camposConCambios = obtenerCambiosGuia(guiaActual, campos);

        if (camposConCambios.length === 0) {
            await client.query('COMMIT');
            return guiaActual;
        }

        const camposActualizados = {};

        camposConCambios.forEach((campo) => {
            camposActualizados[campo] = campos[campo];
        });

        await actualizarGuiaConDb(client, idGuia, camposActualizados);

        const guiaActualizada = await obtenerGuiaPorIdConDb(client, idGuia);

        await client.query('COMMIT');

        return guiaActualizada;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    obtenerGuias,
    obtenerGuiaPorId,
    crearGuia,
    actualizarGuiaParcial
};
