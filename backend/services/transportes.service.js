const pool = require('../config/database');
const { obtenerTurno } = require('../utils/turno');

const camposActualizables = [
    'id_operacion_tour',
    'id_vehiculo',
    'id_operador',
    'observaciones_operador',
    'estado'
];

const columnasTransporteEnriquecido = `
    tr.id_transporte_operacion,
    tr.id_operacion_tour,
    ot.fecha,
    ot.hora_inicio,
    t.nombre AS tour,
    tr.id_vehiculo,
    v.identificador AS vehiculo,
    v.placas,
    v.color,
    v.capacidad,
    tr.id_operador,
    o.nombre AS operador,
    tr.observaciones_operador,
    tr.estado
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

const mapearTransporte = (transporte) => {
    if (!transporte) {
        return transporte;
    }

    const horaInicio = normalizarHoraResultado(transporte.hora_inicio);

    return {
        ...transporte,
        fecha: normalizarFechaResultado(transporte.fecha),
        hora_inicio: horaInicio,
        turno: obtenerTurno(horaInicio)
    };
};

const obtenerTransporteEnriquecidoPorIdConDb = async (db, idTransporte) => {
    const query = `
        SELECT
            ${columnasTransporteEnriquecido}
        FROM transportes_operacion tr
        INNER JOIN operaciones_tour ot
            ON ot.id_operacion_tour = tr.id_operacion_tour
        INNER JOIN tours t
            ON t.id_tour = ot.id_tour
        LEFT JOIN vehiculos v
            ON v.id_vehiculo = tr.id_vehiculo
        LEFT JOIN operadores o
            ON o.id_operador = tr.id_operador
        WHERE tr.id_transporte_operacion = $1
        LIMIT 1
    `;

    const result = await db.query(query, [idTransporte]);

    return mapearTransporte(result.rows[0]);
};

const obtenerTransporteBasicoPorIdConDb = async (db, idTransporte, bloquear = false) => {
    const query = `
        SELECT
            id_transporte_operacion,
            id_operacion_tour,
            id_vehiculo,
            id_operador,
            observaciones_operador,
            estado
        FROM transportes_operacion
        WHERE id_transporte_operacion = $1
        ${bloquear ? 'FOR UPDATE' : ''}
    `;

    const result = await db.query(query, [idTransporte]);

    return result.rows[0];
};

const obtenerTransportes = async (filtros = {}) => {
    const condiciones = [];
    const values = [];

    if (filtros.id_operacion_tour) {
        values.push(filtros.id_operacion_tour);
        condiciones.push(`tr.id_operacion_tour = $${values.length}`);
    }

    if (filtros.fecha) {
        values.push(filtros.fecha);
        condiciones.push(`ot.fecha = $${values.length}`);
    }

    const where = condiciones.length > 0
        ? `WHERE ${condiciones.join('\n            AND ')}`
        : '';

    const query = `
        SELECT
            ${columnasTransporteEnriquecido}
        FROM transportes_operacion tr
        INNER JOIN operaciones_tour ot
            ON ot.id_operacion_tour = tr.id_operacion_tour
        INNER JOIN tours t
            ON t.id_tour = ot.id_tour
        LEFT JOIN vehiculos v
            ON v.id_vehiculo = tr.id_vehiculo
        LEFT JOIN operadores o
            ON o.id_operador = tr.id_operador
        ${where}
        ORDER BY
            ot.fecha ASC,
            ot.hora_inicio ASC,
            t.nombre ASC,
            tr.id_transporte_operacion ASC
    `;

    const result = await pool.query(query, values);

    return result.rows.map(mapearTransporte);
};

const obtenerTransportePorId = async (idTransporte) => {
    return obtenerTransporteEnriquecidoPorIdConDb(pool, idTransporte);
};

const crearTransporte = async (transporte) => {
    const query = `
        INSERT INTO transportes_operacion (
            id_operacion_tour,
            id_vehiculo,
            id_operador,
            observaciones_operador,
            estado
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
            id_transporte_operacion
    `;

    const values = [
        transporte.id_operacion_tour,
        transporte.id_vehiculo,
        transporte.id_operador,
        transporte.observaciones_operador,
        transporte.estado
    ];

    const result = await pool.query(query, values);

    return obtenerTransportePorId(result.rows[0].id_transporte_operacion);
};

const obtenerCambiosTransporte = (transporteActual, campos) => (
    Object.keys(campos).filter((campo) => transporteActual[campo] !== campos[campo])
);

const actualizarTransporteConDb = async (db, idTransporte, campos) => {
    const nombresCampos = Object.keys(campos);
    const asignaciones = nombresCampos.map((campo, index) => {
        if (!camposActualizables.includes(campo)) {
            throw new Error('Campo de actualización no permitido');
        }

        return `${campo} = $${index + 1}`;
    });

    const values = nombresCampos.map((campo) => campos[campo]);
    values.push(idTransporte);

    const query = `
        UPDATE transportes_operacion
        SET
            ${asignaciones.join(',\n            ')}
        WHERE id_transporte_operacion = $${values.length}
        RETURNING
            id_transporte_operacion
    `;

    const result = await db.query(query, values);

    return result.rows[0];
};

const actualizarTransporteParcial = async (idTransporte, campos) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const transporteActual = await obtenerTransporteBasicoPorIdConDb(client, idTransporte, true);

        if (!transporteActual) {
            await client.query('COMMIT');
            return null;
        }

        const camposConCambios = obtenerCambiosTransporte(transporteActual, campos);

        if (camposConCambios.length === 0) {
            const transporteSinCambios = await obtenerTransporteEnriquecidoPorIdConDb(client, idTransporte);

            await client.query('COMMIT');

            return transporteSinCambios;
        }

        const camposActualizados = {};

        camposConCambios.forEach((campo) => {
            camposActualizados[campo] = campos[campo];
        });

        await actualizarTransporteConDb(client, idTransporte, camposActualizados);

        const transporteActualizado = await obtenerTransporteEnriquecidoPorIdConDb(client, idTransporte);

        await client.query('COMMIT');

        return transporteActualizado;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    obtenerTransportes,
    obtenerTransportePorId,
    crearTransporte,
    actualizarTransporteParcial
};
