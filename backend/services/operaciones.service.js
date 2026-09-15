const pool = require('../config/database');
const capacidadService = require('./capacidad.service');

const camposActualizables = [
    'fecha',
    'id_tour',
    'turno',
    'numero_grupo',
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
    ot.turno,
    ot.numero_grupo,
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

const crearErrorSolicitudInvalida = (mensaje) => {
    const error = new Error(mensaje);
    error.statusCode = 400;

    return error;
};

const mapearOperacion = (operacion) => {
    if (!operacion) {
        return operacion;
    }

    const horaInicio = normalizarHoraResultado(operacion.hora_inicio);

    return {
        ...operacion,
        fecha: normalizarFechaResultado(operacion.fecha),
        hora_inicio: horaInicio
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
            turno,
            numero_grupo,
            id_guia,
            estado
        FROM operaciones_tour
        WHERE id_operacion_tour = $1
        ${bloquear ? 'FOR UPDATE' : ''}
    `;

    const result = await db.query(query, [idOperacion]);

    return mapearOperacion(result.rows[0]);
};

const obtenerReservacionesOperacionConDb = async (db, idOperacion, bloquear = false) => {
    const query = `
        SELECT
            r.id_reservacion,
            r.fecha,
            r.id_tour,
            r.pax,
            r.estado
        FROM reservaciones r
        INNER JOIN transportes_operacion tr
            ON tr.id_transporte_operacion = r.id_transporte_operacion
        WHERE tr.id_operacion_tour = $1
        ORDER BY r.id_reservacion ASC
        ${bloquear ? 'FOR UPDATE OF r' : ''}
    `;

    const result = await db.query(query, [idOperacion]);

    return result.rows;
};

const proyectarOperacion = (operacionActual, camposActualizados) => ({
    ...operacionActual,
    ...camposActualizados
});

const tieneCampo = (objeto, campo) => Object.prototype.hasOwnProperty.call(objeto, campo);

const afectaGrupoOperativo = (camposActualizados) => (
    tieneCampo(camposActualizados, 'fecha') ||
    tieneCampo(camposActualizados, 'id_tour') ||
    tieneCampo(camposActualizados, 'turno') ||
    tieneCampo(camposActualizados, 'numero_grupo')
);

const bloquearDependenciasOperacion = async (db, operacionActual, operacionFinal) => {
    const grupoFinal = capacidadService.obtenerGrupoTransporteOperacion(operacionFinal);
    const idsReservaciones = await obtenerReservacionesOperacionConDb(
        db,
        operacionActual.id_operacion_tour,
        true
    );
    const idsTransportesOperacion = await capacidadService.obtenerIdsTransportesOperacion(
        db,
        operacionActual.id_operacion_tour
    );
    const idsTransportesGrupoFinal = await capacidadService.obtenerIdsTransportesGrupo(db, grupoFinal);
    const idsOperacionesGrupoFinal = await capacidadService.obtenerIdsOperacionesGrupo(db, grupoFinal);

    await capacidadService.bloquearTransportesPorIds(
        db,
        [
            ...idsTransportesOperacion,
            ...idsTransportesGrupoFinal
        ]
    );
    await capacidadService.bloquearOperacionesPorIds(
        db,
        [
            operacionActual.id_operacion_tour,
            ...idsOperacionesGrupoFinal
        ]
    );

    return idsReservaciones;
};

const validarReservacionesCompatibles = (reservaciones, operacionFinal) => {
    const fechaOperacion = normalizarFechaResultado(operacionFinal.fecha);
    const reservacionIncompatible = reservaciones.find((reservacion) => (
        normalizarFechaResultado(reservacion.fecha) !== fechaOperacion ||
        Number(reservacion.id_tour) !== Number(operacionFinal.id_tour)
    ));

    if (!reservacionIncompatible) {
        return null;
    }

    if (normalizarFechaResultado(reservacionIncompatible.fecha) !== fechaOperacion) {
        return 'La nueva fecha de la operación es incompatible con reservaciones asignadas';
    }

    return 'El nuevo tour de la operación es incompatible con reservaciones asignadas';
};

const validarIntegridadOperacion = async (db, operacionActual, operacionFinal, reservacionesAsignadas) => {
    const errorCompatibilidad = validarReservacionesCompatibles(
        reservacionesAsignadas,
        operacionFinal
    );

    if (errorCompatibilidad) {
        throw crearErrorSolicitudInvalida(errorCompatibilidad);
    }

    const paxActivosOperacion = await capacidadService.calcularPaxOperacion(
        db,
        operacionActual.id_operacion_tour
    );
    const errorMaximoOperacion = capacidadService.validarMaximoOperacion(paxActivosOperacion);

    if (errorMaximoOperacion) {
        throw crearErrorSolicitudInvalida(errorMaximoOperacion);
    }

    if (paxActivosOperacion === 0) {
        return;
    }

    const grupoActual = capacidadService.obtenerGrupoTransporteOperacion(operacionActual);
    const grupoFinal = capacidadService.obtenerGrupoTransporteOperacion(operacionFinal);
    const cambiaGrupo = !capacidadService.esMismoGrupoOperativo(grupoActual, grupoFinal);

    if (!cambiaGrupo) {
        return;
    }

    const totalGrupoDestinoActual = await capacidadService.calcularPaxTourTurno(
        db,
        grupoFinal,
        { excluirIdOperacion: operacionActual.id_operacion_tour }
    );
    const totalGrupoDestinoResultante = totalGrupoDestinoActual + paxActivosOperacion;
    const errorMaximoGrupo = capacidadService.validarMaximoTourTurno(totalGrupoDestinoResultante);

    if (errorMaximoGrupo) {
        throw crearErrorSolicitudInvalida(errorMaximoGrupo);
    }
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
            t.nombre ASC,
            CASE ot.turno WHEN 'Mañana' THEN 1 ELSE 2 END ASC,
            ot.numero_grupo ASC,
            ot.hora_inicio ASC,
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
            turno,
            numero_grupo,
            hora_inicio,
            id_guia,
            estado
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING
            id_operacion_tour
    `;

    const values = [
        operacion.fecha,
        operacion.id_tour,
        operacion.turno,
        operacion.numero_grupo,
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

        const operacionPreliminar = await obtenerOperacionBasicaPorIdConDb(client, idOperacion);

        if (!operacionPreliminar) {
            await client.query('COMMIT');
            return null;
        }

        const camposConCambiosPreliminares = obtenerCambiosOperacion(operacionPreliminar, campos);

        if (camposConCambiosPreliminares.length === 0) {
            const operacionSinCambios = await obtenerOperacionEnriquecidaPorIdConDb(client, idOperacion);

            await client.query('COMMIT');

            return operacionSinCambios;
        }

        const camposActualizadosPreliminares = {};

        camposConCambiosPreliminares.forEach((campo) => {
            camposActualizadosPreliminares[campo] = campos[campo];
        });

        let reservacionesAsignadas = [];

        if (afectaGrupoOperativo(camposActualizadosPreliminares)) {
            reservacionesAsignadas = await bloquearDependenciasOperacion(
                client,
                operacionPreliminar,
                proyectarOperacion(operacionPreliminar, camposActualizadosPreliminares)
            );
        } else {
            await capacidadService.bloquearOperacionesPorIds(client, [idOperacion]);
        }

        const operacionActual = await obtenerOperacionBasicaPorIdConDb(client, idOperacion, true);
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

        if (afectaGrupoOperativo(camposActualizados)) {
            const operacionFinal = proyectarOperacion(operacionActual, camposActualizados);

            await validarIntegridadOperacion(
                client,
                operacionActual,
                operacionFinal,
                reservacionesAsignadas
            );
        }

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
};
