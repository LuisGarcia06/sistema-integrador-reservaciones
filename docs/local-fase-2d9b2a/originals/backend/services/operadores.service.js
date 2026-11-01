const pool = require('../config/database');

const camposActualizables = [
    'nombre',
    'estado'
];

const columnasOperador = `
    id_operador,
    nombre,
    estado
`;

const obtenerOperadorPorIdConDb = async (db, idOperador, bloquear = false) => {
    const query = `
        SELECT
            ${columnasOperador}
        FROM operadores
        WHERE id_operador = $1
        ${bloquear ? 'FOR UPDATE' : ''}
    `;

    const result = await db.query(query, [idOperador]);

    return result.rows[0];
};

const obtenerOperadores = async (filtros = {}) => {
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
            ${columnasOperador}
        FROM operadores
        ${where}
        ORDER BY
            estado DESC,
            nombre ASC,
            id_operador ASC
    `;

    const result = await pool.query(query, values);

    return result.rows;
};

const obtenerOperadorPorId = async (idOperador) => {
    return obtenerOperadorPorIdConDb(pool, idOperador);
};

const crearOperador = async (operador) => {
    const query = `
        INSERT INTO operadores (
            nombre,
            estado
        )
        VALUES ($1, $2)
        RETURNING
            id_operador
    `;

    const result = await pool.query(query, [operador.nombre, operador.estado]);

    return obtenerOperadorPorId(result.rows[0].id_operador);
};

const obtenerCambiosOperador = (operadorActual, campos) => (
    Object.keys(campos).filter((campo) => operadorActual[campo] !== campos[campo])
);

const actualizarOperadorConDb = async (db, idOperador, campos) => {
    const nombresCampos = Object.keys(campos);
    const asignaciones = nombresCampos.map((campo, index) => {
        if (!camposActualizables.includes(campo)) {
            throw new Error('Campo de actualización no permitido');
        }

        return `${campo} = $${index + 1}`;
    });

    const values = nombresCampos.map((campo) => campos[campo]);
    values.push(idOperador);

    const query = `
        UPDATE operadores
        SET
            ${asignaciones.join(',\n            ')}
        WHERE id_operador = $${values.length}
        RETURNING
            id_operador
    `;

    const result = await db.query(query, values);

    return result.rows[0];
};

const actualizarOperadorParcial = async (idOperador, campos) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const operadorActual = await obtenerOperadorPorIdConDb(client, idOperador, true);

        if (!operadorActual) {
            await client.query('COMMIT');
            return null;
        }

        const camposConCambios = obtenerCambiosOperador(operadorActual, campos);

        if (camposConCambios.length === 0) {
            await client.query('COMMIT');
            return operadorActual;
        }

        const camposActualizados = {};

        camposConCambios.forEach((campo) => {
            camposActualizados[campo] = campos[campo];
        });

        await actualizarOperadorConDb(client, idOperador, camposActualizados);

        const operadorActualizado = await obtenerOperadorPorIdConDb(client, idOperador);

        await client.query('COMMIT');

        return operadorActualizado;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    obtenerOperadores,
    obtenerOperadorPorId,
    crearOperador,
    actualizarOperadorParcial
};
