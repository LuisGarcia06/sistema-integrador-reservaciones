const pool = require('../config/database');
const capacidadService = require('./capacidad.service');
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

const obtenerOperacionBasicaPorIdConDb = async (db, idOperacion, bloquear = false) => {
    const query = `
        SELECT
            id_operacion_tour,
            fecha,
            id_tour,
            hora_inicio
        FROM operaciones_tour
        WHERE id_operacion_tour = $1
        ${bloquear ? 'FOR UPDATE' : ''}
    `;

    const result = await db.query(query, [idOperacion]);

    return mapearTransporte(result.rows[0]);
};

const bloquearOperacionesPorIds = async (db, ids) => {
    const idsOrdenados = capacidadService.obtenerIdsOrdenadosUnicos(ids);

    if (idsOrdenados.length === 0) {
        return;
    }

    await db.query(`
        SELECT id_operacion_tour
        FROM operaciones_tour
        WHERE id_operacion_tour = ANY($1::int[])
        ORDER BY id_operacion_tour ASC
        FOR UPDATE
    `, [idsOrdenados]);
};

const obtenerVehiculoPorIdConDb = async (db, idVehiculo, bloquear = false) => {
    const query = `
        SELECT
            id_vehiculo,
            capacidad
        FROM vehiculos
        WHERE id_vehiculo = $1
        ${bloquear ? 'FOR UPDATE' : ''}
    `;

    const result = await db.query(query, [idVehiculo]);

    return result.rows[0];
};

const obtenerReservacionesTransporteConDb = async (db, idTransporte) => {
    const query = `
        SELECT
            id_reservacion,
            fecha,
            id_tour,
            pax,
            estado
        FROM reservaciones
        WHERE id_transporte_operacion = $1
        ORDER BY id_reservacion ASC
    `;

    const result = await db.query(query, [idTransporte]);

    return result.rows;
};

const crearResultadoCapacidadInvalida = (mensaje) => ({
    tipo: 'capacidad_invalida',
    mensaje,
    transporte: null
});

const validarReservacionesCompatiblesOperacion = (reservaciones, operacionDestino) => {
    const fechaOperacion = capacidadService.normalizarFechaResultado(operacionDestino.fecha);

    const reservacionIncompatible = reservaciones.find((reservacion) => (
        capacidadService.normalizarFechaResultado(reservacion.fecha) !== fechaOperacion
        || Number(reservacion.id_tour) !== Number(operacionDestino.id_tour)
    ));

    if (reservacionIncompatible) {
        return 'El transporte tiene reservaciones asignadas incompatibles con la nueva operación por fecha o tour';
    }

    return null;
};

const validarCambioVehiculo = async (db, idTransporte, vehiculoDestino) => {
    if (!vehiculoDestino) {
        return null;
    }

    const totalPax = await capacidadService.calcularPaxTransporte(db, idTransporte);
    const errorCapacidad = capacidadService.validarCapacidadTransporte({
        id_vehiculo: vehiculoDestino.id_vehiculo,
        capacidad: vehiculoDestino.capacidad
    }, totalPax);

    return errorCapacidad;
};

const validarCambioOperacion = async (
    db,
    transporteActual,
    operacionActual,
    operacionDestino
) => {
    if (!operacionDestino) {
        return null;
    }

    const reservacionesAsignadas = await obtenerReservacionesTransporteConDb(
        db,
        transporteActual.id_transporte_operacion
    );
    const errorCompatibilidad = validarReservacionesCompatiblesOperacion(
        reservacionesAsignadas,
        operacionDestino
    );

    if (errorCompatibilidad) {
        return errorCompatibilidad;
    }

    const paxTransporte = await capacidadService.calcularPaxTransporte(
        db,
        transporteActual.id_transporte_operacion
    );

    if (paxTransporte === 0) {
        return null;
    }

    const grupoActual = capacidadService.obtenerGrupoTransporteOperacion(operacionActual);
    const grupoDestino = capacidadService.obtenerGrupoTransporteOperacion(operacionDestino);
    const cambiaGrupo = !capacidadService.esMismoGrupoOperativo(grupoActual, grupoDestino);

    if (!cambiaGrupo) {
        return null;
    }

    const idsGrupoDestino = await capacidadService.obtenerIdsTransportesGrupo(db, grupoDestino);
    await capacidadService.bloquearTransportesPorIds(db, idsGrupoDestino);

    const totalGrupoDestino = await capacidadService.calcularPaxTourTurno(db, grupoDestino, {
        excluirIdTransporteOperacion: transporteActual.id_transporte_operacion
    });
    const totalGrupoResultante = totalGrupoDestino + paxTransporte;

    return capacidadService.validarMaximoTourTurno(totalGrupoResultante);
};

const validarIntegridadTransporte = async (db, transporteActual, camposActualizados) => {
    const cambiaVehiculo = Object.prototype.hasOwnProperty.call(camposActualizados, 'id_vehiculo');
    const cambiaOperacion = Object.prototype.hasOwnProperty.call(camposActualizados, 'id_operacion_tour');

    if (!cambiaVehiculo && !cambiaOperacion) {
        return null;
    }

    const idsOperaciones = [
        transporteActual.id_operacion_tour,
        cambiaOperacion ? camposActualizados.id_operacion_tour : null
    ];

    await bloquearOperacionesPorIds(db, idsOperaciones);

    const operacionActual = await obtenerOperacionBasicaPorIdConDb(
        db,
        transporteActual.id_operacion_tour
    );
    const operacionDestino = cambiaOperacion
        ? await obtenerOperacionBasicaPorIdConDb(db, camposActualizados.id_operacion_tour)
        : operacionActual;

    if (cambiaOperacion && operacionDestino) {
        const errorOperacion = await validarCambioOperacion(
            db,
            transporteActual,
            operacionActual,
            operacionDestino
        );

        if (errorOperacion) {
            return errorOperacion;
        }
    }

    if (cambiaVehiculo && camposActualizados.id_vehiculo !== null) {
        const vehiculoDestino = await obtenerVehiculoPorIdConDb(
            db,
            camposActualizados.id_vehiculo,
            true
        );
        const errorVehiculo = await validarCambioVehiculo(
            db,
            transporteActual.id_transporte_operacion,
            vehiculoDestino
        );

        if (errorVehiculo) {
            return errorVehiculo;
        }
    }

    return null;
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
    if (transporte.id_vehiculo !== null && transporte.id_vehiculo !== undefined) {
        return crearResultadoCapacidadInvalida(
            'No se puede crear un transporte con vehículo; primero debe tener al menos 2 pasajeros activos'
        );
    }

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

        const errorIntegridad = await validarIntegridadTransporte(
            client,
            transporteActual,
            camposActualizados
        );

        if (errorIntegridad) {
            await client.query('ROLLBACK');
            return crearResultadoCapacidadInvalida(errorIntegridad);
        }

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
