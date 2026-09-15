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

const ESTADOS_RESERVACION_SUGERIDA = [
    'Pendiente',
    'Confirmada',
    'Activa'
];

const MAX_PAX_TOUR_TURNO = 24;

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

const crearGrupoSugerido = (numeroGrupo, operacion) => ({
    numero_grupo: numeroGrupo,
    preparado: Boolean(operacion),
    id_operacion_tour: operacion ? operacion.id_operacion_tour : null,
    hora_inicio: operacion ? operacion.hora_inicio : null,
    id_guia: operacion ? operacion.id_guia : null,
    guia: operacion ? operacion.guia : null,
    estado: operacion ? operacion.estado : null
});

const crearClaveSugerencia = (fecha, idTour, turno) => [
    normalizarFechaResultado(fecha),
    Number(idTour),
    turno
].join('|');

const calcularGruposNecesarios = (paxTotal) => {
    if (paxTotal <= 0) {
        return 0;
    }

    if (paxTotal <= 12) {
        return 1;
    }

    return 2;
};

const mapearSugerencia = (salida, operacionesPorClave) => {
    const fecha = normalizarFechaResultado(salida.fecha);
    const idTour = Number(salida.id_tour);
    const paxTotal = Number(salida.pax_total) || 0;
    const gruposNecesarios = calcularGruposNecesarios(paxTotal);
    const excedeCapacidad = paxTotal > MAX_PAX_TOUR_TURNO;
    const operacionesContexto = operacionesPorClave.get(
        crearClaveSugerencia(fecha, idTour, salida.turno)
    ) || new Map();
    const gruposExistentes = Array.from(operacionesContexto.keys());
    const ultimoGrupo = Math.min(
        2,
        Math.max(gruposNecesarios, ...gruposExistentes, 0)
    );
    const grupos = [];

    for (let numeroGrupo = 1; numeroGrupo <= ultimoGrupo; numeroGrupo += 1) {
        grupos.push(crearGrupoSugerido(numeroGrupo, operacionesContexto.get(numeroGrupo)));
    }

    return {
        fecha,
        id_tour: idTour,
        tour: salida.tour,
        turno: salida.turno,
        total_reservaciones: Number(salida.total_reservaciones) || 0,
        pax_total: paxTotal,
        grupos_necesarios: gruposNecesarios,
        excede_capacidad: excedeCapacidad,
        pax_excedente: Math.max(paxTotal - MAX_PAX_TOUR_TURNO, 0),
        grupos
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
            r.turno,
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

const afectaCompatibilidadReservaciones = (camposActualizados) => (
    tieneCampo(camposActualizados, 'fecha') ||
    tieneCampo(camposActualizados, 'id_tour') ||
    tieneCampo(camposActualizados, 'turno')
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
        Number(reservacion.id_tour) !== Number(operacionFinal.id_tour) ||
        reservacion.turno !== operacionFinal.turno
    ));

    if (!reservacionIncompatible) {
        return null;
    }

    if (normalizarFechaResultado(reservacionIncompatible.fecha) !== fechaOperacion) {
        return 'La nueva fecha de la operación es incompatible con reservaciones asignadas';
    }

    if (Number(reservacionIncompatible.id_tour) !== Number(operacionFinal.id_tour)) {
        return 'El nuevo tour de la operación es incompatible con reservaciones asignadas';
    }

    return 'El nuevo turno de la operación es incompatible con reservaciones asignadas';
};

const validarIntegridadOperacion = async (
    db,
    operacionActual,
    operacionFinal,
    reservacionesAsignadas,
    camposActualizados
) => {
    const errorCompatibilidad = afectaCompatibilidadReservaciones(camposActualizados)
        ? validarReservacionesCompatibles(reservacionesAsignadas, operacionFinal)
        : null;

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

const obtenerOperacionesSugeridas = async (fecha) => {
    const reservacionesQuery = `
        SELECT
            r.fecha,
            r.id_tour,
            t.nombre AS tour,
            r.turno,
            COUNT(*)::int AS total_reservaciones,
            COALESCE(SUM(r.pax), 0)::int AS pax_total
        FROM reservaciones r
        INNER JOIN tours t
            ON t.id_tour = r.id_tour
        WHERE r.fecha = $1
            AND r.turno IS NOT NULL
            AND r.estado = ANY($2::varchar[])
        GROUP BY
            r.fecha,
            r.id_tour,
            t.nombre,
            r.turno
        HAVING COALESCE(SUM(r.pax), 0) > 0
        ORDER BY
            CASE r.turno WHEN 'Mañana' THEN 1 ELSE 2 END ASC,
            t.nombre ASC,
            r.id_tour ASC
    `;
    const operacionesQuery = `
        SELECT
            ${columnasOperacionEnriquecida}
        FROM operaciones_tour ot
        INNER JOIN tours t
            ON t.id_tour = ot.id_tour
        LEFT JOIN guias g
            ON g.id_guia = ot.id_guia
        WHERE ot.fecha = $1
        ORDER BY
            CASE ot.turno WHEN 'Mañana' THEN 1 ELSE 2 END ASC,
            t.nombre ASC,
            ot.numero_grupo ASC,
            ot.id_operacion_tour ASC
    `;
    const sinTurnoQuery = `
        SELECT COUNT(*)::int AS total
        FROM reservaciones
        WHERE fecha = $1
            AND turno IS NULL
            AND estado = ANY($2::varchar[])
    `;

    const [reservacionesResult, operacionesResult, sinTurnoResult] = await Promise.all([
        pool.query(reservacionesQuery, [fecha, ESTADOS_RESERVACION_SUGERIDA]),
        pool.query(operacionesQuery, [fecha]),
        pool.query(sinTurnoQuery, [fecha, ESTADOS_RESERVACION_SUGERIDA])
    ]);
    const operacionesPorClave = new Map();

    operacionesResult.rows.map(mapearOperacion).forEach((operacion) => {
        const clave = crearClaveSugerencia(
            operacion.fecha,
            operacion.id_tour,
            operacion.turno
        );

        if (!operacionesPorClave.has(clave)) {
            operacionesPorClave.set(clave, new Map());
        }

        operacionesPorClave.get(clave).set(Number(operacion.numero_grupo), operacion);
    });

    return {
        fecha,
        total_salidas_detectadas: reservacionesResult.rows.length,
        reservaciones_sin_turno: Number(sinTurnoResult.rows[0].total) || 0,
        datos: reservacionesResult.rows.map((salida) => mapearSugerencia(salida, operacionesPorClave))
    };
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
                reservacionesAsignadas,
                camposActualizados
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
    obtenerOperacionesSugeridas,
    obtenerOperacionPorId,
    crearOperacion,
    actualizarOperacionParcial,
};
