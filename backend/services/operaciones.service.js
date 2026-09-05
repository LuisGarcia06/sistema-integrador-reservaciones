const pool = require('../config/database');
const { obtenerTurno } = require('../utils/turno');

const camposActualizables = [
    'fecha',
    'id_tour',
    'hora_inicio',
    'id_guia',
    'estado'
];

const columnasOperacionEnriquecida = `
    ot.id_operacion_tour,
    ot.fecha,
    ot.id_tour,
    t.nombre AS tour,
    ot.hora_inicio,
    ot.id_guia,
    g.nombre AS guia,
    ot.estado
`;

const normalizarFechaResultado = (fecha) => {
    if (fecha instanceof Date) {
        return fecha.toISOString().slice(0, 10);
    }

    return fecha;
};

const normalizarHoraResultado = (horaInicio) => {
    if (typeof horaInicio !== 'string') {
        return horaInicio;
    }

    return horaInicio.split('.')[0];
};

const mapearOperacion = (operacion) => {
    if (!operacion) {
        return operacion;
    }

    const horaInicio = normalizarHoraResultado(operacion.hora_inicio);

    return {
        ...operacion,
        fecha: normalizarFechaResultado(operacion.fecha),
        hora_inicio: horaInicio,
        turno: obtenerTurno(horaInicio)
    };
};

const obtenerOperacionEnriquecidaPorIdConDb = async (db, idOperacion) => {
    const query = `
        SELECT
            ${columnasOperacionEnriquecida}
        FROM operaciones_tour ot
        INNER JOIN tours t
            ON t.id_tour = ot.id_tour
        LEFT JOIN guias g
            ON g.id_guia = ot.id_guia
        WHERE ot.id_operacion_tour = $1
        LIMIT 1
    `;

    const result = await db.query(query, [idOperacion]);

    return mapearOperacion(result.rows[0]);
};

const obtenerOperacionBasicaPorIdConDb = async (db, idOperacion, bloquear = false) => {
    const query = `
        SELECT
            id_operacion_tour,
            fecha,
            id_tour,
            hora_inicio,
            id_guia,
            estado
        FROM operaciones_tour
        WHERE id_operacion_tour = $1
        ${bloquear ? 'FOR UPDATE' : ''}
    `;

    const result = await db.query(query, [idOperacion]);

    return mapearOperacion(result.rows[0]);
};

const obtenerOperaciones = async (filtros = {}) => {
    const condiciones = [];
    const values = [];

    if (filtros.fecha) {
        values.push(filtros.fecha);
        condiciones.push(`ot.fecha = $${values.length}`);
    }

    const where = condiciones.length > 0
        ? `WHERE ${condiciones.join('\n            AND ')}`
        : '';

    const query = `
        SELECT
            ${columnasOperacionEnriquecida}
        FROM operaciones_tour ot
        INNER JOIN tours t
            ON t.id_tour = ot.id_tour
        LEFT JOIN guias g
            ON g.id_guia = ot.id_guia
        ${where}
        ORDER BY
            ot.fecha ASC,
            ot.hora_inicio ASC,
            t.nombre ASC,
            ot.id_operacion_tour ASC
    `;

    const result = await pool.query(query, values);

    return result.rows.map(mapearOperacion);
};

const obtenerOperacionPorId = async (idOperacion) => {
    return obtenerOperacionEnriquecidaPorIdConDb(pool, idOperacion);
};

const crearOperacion = async (operacion) => {
    const query = `
        INSERT INTO operaciones_tour (
            fecha,
            id_tour,
            hora_inicio,
            id_guia,
            estado
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
            id_operacion_tour
    `;

    const values = [
        operacion.fecha,
        operacion.id_tour,
        operacion.hora_inicio,
        operacion.id_guia,
        operacion.estado
    ];

    const result = await pool.query(query, values);

    return obtenerOperacionPorId(result.rows[0].id_operacion_tour);
};

const obtenerCambiosOperacion = (operacionActual, campos) => (
    Object.keys(campos).filter((campo) => {
        if (campo === 'hora_inicio') {
            return normalizarHoraResultado(operacionActual[campo]) !== campos[campo];
        }

        if (campo === 'fecha') {
            return normalizarFechaResultado(operacionActual[campo]) !== campos[campo];
        }

        return operacionActual[campo] !== campos[campo];
    })
);

const actualizarOperacionConDb = async (db, idOperacion, campos) => {
    const nombresCampos = Object.keys(campos);
    const asignaciones = nombresCampos.map((campo, index) => {
        if (!camposActualizables.includes(campo)) {
            throw new Error('Campo de actualización no permitido');
        }

        return `${campo} = $${index + 1}`;
    });

    const values = nombresCampos.map((campo) => campos[campo]);
    values.push(idOperacion);

    const query = `
        UPDATE operaciones_tour
        SET
            ${asignaciones.join(',\n            ')}
        WHERE id_operacion_tour = $${values.length}
        RETURNING
            id_operacion_tour
    `;

    const result = await db.query(query, values);

    return result.rows[0];
};

const actualizarOperacionParcial = async (idOperacion, campos) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const operacionActual = await obtenerOperacionBasicaPorIdConDb(client, idOperacion, true);

        if (!operacionActual) {
            await client.query('COMMIT');
            return null;
        }

        const camposConCambios = obtenerCambiosOperacion(operacionActual, campos);

        if (camposConCambios.length === 0) {
            const operacionSinCambios = await obtenerOperacionEnriquecidaPorIdConDb(client, idOperacion);

            await client.query('COMMIT');

            return operacionSinCambios;
        }

        const camposActualizados = {};

        camposConCambios.forEach((campo) => {
            camposActualizados[campo] = campos[campo];
        });

        await actualizarOperacionConDb(client, idOperacion, camposActualizados);

        const operacionActualizada = await obtenerOperacionEnriquecidaPorIdConDb(client, idOperacion);

        await client.query('COMMIT');

        return operacionActualizada;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    obtenerOperaciones,
    obtenerOperacionPorId,
    crearOperacion,
    actualizarOperacionParcial,
    obtenerTurno
};
