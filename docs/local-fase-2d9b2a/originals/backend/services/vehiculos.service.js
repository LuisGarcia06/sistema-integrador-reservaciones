const pool = require('../config/database');

const camposActualizables = [
    'identificador',
    'placas',
    'color',
    'capacidad',
    'estado'
];

const columnasVehiculo = `
    id_vehiculo,
    identificador,
    placas,
    color,
    capacidad,
    estado
`;

const crearErrorSolicitudInvalida = (mensaje) => {
    const error = new Error(mensaje);
    error.statusCode = 400;

    return error;
};

const obtenerVehiculoPorIdConDb = async (db, idVehiculo, bloquear = false) => {
    const query = `
        SELECT
            ${columnasVehiculo}
        FROM vehiculos
        WHERE id_vehiculo = $1
        ${bloquear ? 'FOR UPDATE' : ''}
    `;

    const result = await db.query(query, [idVehiculo]);

    return result.rows[0];
};

const obtenerIdsTransportesPorVehiculoConDb = async (db, idVehiculo) => {
    const query = `
        SELECT id_transporte_operacion
        FROM transportes_operacion
        WHERE id_vehiculo = $1
        ORDER BY id_transporte_operacion ASC
    `;

    const result = await db.query(query, [idVehiculo]);

    return result.rows.map((row) => row.id_transporte_operacion);
};

const bloquearTransportesPorIdsConDb = async (db, idsTransportes) => {
    if (idsTransportes.length === 0) {
        return;
    }

    const query = `
        SELECT id_transporte_operacion
        FROM transportes_operacion
        WHERE id_transporte_operacion = ANY($1::int[])
        ORDER BY id_transporte_operacion ASC
        FOR UPDATE
    `;

    await db.query(query, [idsTransportes]);
};

const obtenerTransporteExcedidoConDb = async (db, idVehiculo, capacidad) => {
    const query = `
        SELECT
            tr.id_transporte_operacion,
            COALESCE(SUM(r.pax), 0)::int AS total_pax_activos
        FROM transportes_operacion tr
        LEFT JOIN reservaciones r
            ON r.id_transporte_operacion = tr.id_transporte_operacion
            AND r.estado <> $3
        WHERE tr.id_vehiculo = $1
        GROUP BY tr.id_transporte_operacion
        HAVING COALESCE(SUM(r.pax), 0) > $2
        ORDER BY tr.id_transporte_operacion ASC
        LIMIT 1
    `;

    const result = await db.query(query, [idVehiculo, capacidad, 'Cancelada']);

    return result.rows[0];
};

const obtenerVehiculos = async (filtros = {}) => {
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
            ${columnasVehiculo}
        FROM vehiculos
        ${where}
        ORDER BY
            estado DESC,
            identificador ASC,
            id_vehiculo ASC
    `;

    const result = await pool.query(query, values);

    return result.rows;
};

const obtenerVehiculoPorId = async (idVehiculo) => {
    return obtenerVehiculoPorIdConDb(pool, idVehiculo);
};

const crearVehiculo = async (vehiculo) => {
    const query = `
        INSERT INTO vehiculos (
            identificador,
            placas,
            color,
            capacidad,
            estado
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
            id_vehiculo
    `;

    const values = [
        vehiculo.identificador,
        vehiculo.placas,
        vehiculo.color,
        vehiculo.capacidad,
        vehiculo.estado
    ];

    const result = await pool.query(query, values);

    return obtenerVehiculoPorId(result.rows[0].id_vehiculo);
};

const obtenerCambiosVehiculo = (vehiculoActual, campos) => (
    Object.keys(campos).filter((campo) => vehiculoActual[campo] !== campos[campo])
);

const actualizarVehiculoConDb = async (db, idVehiculo, campos) => {
    const nombresCampos = Object.keys(campos);
    const asignaciones = nombresCampos.map((campo, index) => {
        if (!camposActualizables.includes(campo)) {
            throw new Error('Campo de actualización no permitido');
        }

        return `${campo} = $${index + 1}`;
    });

    const values = nombresCampos.map((campo) => campos[campo]);
    values.push(idVehiculo);

    const query = `
        UPDATE vehiculos
        SET
            ${asignaciones.join(',\n            ')}
        WHERE id_vehiculo = $${values.length}
        RETURNING
            id_vehiculo
    `;

    const result = await db.query(query, values);

    return result.rows[0];
};

const validarReduccionCapacidad = async (db, vehiculoActual, camposActualizados) => {
    if (!Object.prototype.hasOwnProperty.call(camposActualizados, 'capacidad')) {
        return;
    }

    if (Number(camposActualizados.capacidad) >= Number(vehiculoActual.capacidad)) {
        return;
    }

    const idsTransportes = await obtenerIdsTransportesPorVehiculoConDb(
        db,
        vehiculoActual.id_vehiculo
    );

    await bloquearTransportesPorIdsConDb(db, idsTransportes);

    const transporteExcedido = await obtenerTransporteExcedidoConDb(
        db,
        vehiculoActual.id_vehiculo,
        camposActualizados.capacidad
    );

    if (transporteExcedido) {
        throw crearErrorSolicitudInvalida(
            `No se puede reducir la capacidad: el transporte ${transporteExcedido.id_transporte_operacion} tiene ${transporteExcedido.total_pax_activos} PAX activos`
        );
    }
};

const actualizarVehiculoParcial = async (idVehiculo, campos) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const vehiculoActual = await obtenerVehiculoPorIdConDb(client, idVehiculo, true);

        if (!vehiculoActual) {
            await client.query('COMMIT');
            return null;
        }

        const camposConCambios = obtenerCambiosVehiculo(vehiculoActual, campos);

        if (camposConCambios.length === 0) {
            await client.query('COMMIT');
            return vehiculoActual;
        }

        const camposActualizados = {};

        camposConCambios.forEach((campo) => {
            camposActualizados[campo] = campos[campo];
        });

        await validarReduccionCapacidad(client, vehiculoActual, camposActualizados);
        await actualizarVehiculoConDb(client, idVehiculo, camposActualizados);

        const vehiculoActualizado = await obtenerVehiculoPorIdConDb(client, idVehiculo);

        await client.query('COMMIT');

        return vehiculoActualizado;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    obtenerVehiculos,
    obtenerVehiculoPorId,
    crearVehiculo,
    actualizarVehiculoParcial
};
