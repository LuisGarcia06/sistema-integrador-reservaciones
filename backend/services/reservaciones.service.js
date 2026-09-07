const pool = require('../config/database');
const bitacoraService = require('./bitacora.service');
const capacidadService = require('./capacidad.service');
const { ACCIONES_BITACORA } = require('../constants/bitacora.actions');
const { camposEditablesReservacion } = require('../constants/reservaciones.fields');
const { validarNinosNoExcedePax } = require('../validators/reservaciones.validator');
const {
    obtenerCambiosReservacion,
    obtenerCamposActualizacionDesdeCambios,
    generarDescripcionCambios,
    normalizarValorParaComparacion
} = require('../utils/cambiosReservacion');

const columnasReservacion = `
    id_reservacion,
    codigo,
    fecha,
    id_tour,
    id_pais,
    id_plataforma,
    nombre_cliente,
    telefono_cliente,
    habitacion,
    pax,
    ninos,
    pickup_place,
    pickup_time,
    precio_total,
    deposito,
    saldo,
    tipo_cambio,
    metodo_pago,
    vendedor,
    observaciones,
    id_transporte_operacion,
    estado,
    fecha_registro,
    ultima_actualizacion
`;

const camposActualizables = camposEditablesReservacion;

const crearErrorSolicitudInvalida = (mensaje) => {
    const error = new Error(mensaje);
    error.statusCode = 400;

    return error;
};

const obtenerReservacionPorIdConDb = async (db, idReservacion, bloquear = false) => {
    const query = `
        SELECT
            ${columnasReservacion}
        FROM reservaciones
        WHERE id_reservacion = $1
        ${bloquear ? 'FOR UPDATE' : ''}
    `;

    const result = await db.query(query, [idReservacion]);

    return result.rows[0];
};

const insertarReservacionConDb = async (db, reservacion) => {
    const query = `
        INSERT INTO reservaciones (
            codigo,
            fecha,
            id_tour,
            id_pais,
            id_plataforma,
            nombre_cliente,
            telefono_cliente,
            habitacion,
            pax,
            ninos,
            pickup_place,
            pickup_time,
            precio_total,
            deposito,
            saldo,
            tipo_cambio,
            metodo_pago,
            vendedor,
            observaciones,
            estado,
            fecha_registro,
            ultima_actualizacion
        )
        VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING
            ${columnasReservacion}
    `;

    const values = [
        reservacion.codigo,
        reservacion.fecha,
        reservacion.id_tour,
        reservacion.id_pais,
        reservacion.id_plataforma,
        reservacion.nombre_cliente,
        reservacion.telefono_cliente,
        reservacion.habitacion,
        reservacion.pax,
        reservacion.ninos,
        reservacion.pickup_place,
        reservacion.pickup_time,
        reservacion.precio_total,
        reservacion.deposito,
        reservacion.saldo,
        reservacion.tipo_cambio,
        reservacion.metodo_pago,
        reservacion.vendedor,
        reservacion.observaciones,
        reservacion.estado
    ];

    const result = await db.query(query, values);

    return result.rows[0];
};

const actualizarReservacionParcialConDb = async (db, idReservacion, campos) => {
    const nombresCampos = Object.keys(campos);
    const asignaciones = nombresCampos.map((campo, index) => {
        if (!camposActualizables.includes(campo)) {
            throw new Error('Campo de actualización no permitido');
        }

        return `${campo} = $${index + 1}`;
    });

    const values = nombresCampos.map((campo) => campos[campo]);
    values.push(idReservacion);

    const query = `
        UPDATE reservaciones
        SET
            ${asignaciones.join(',\n            ')},
            ultima_actualizacion = CURRENT_TIMESTAMP
        WHERE id_reservacion = $${values.length}
        RETURNING
            ${columnasReservacion}
    `;

    const result = await db.query(query, values);

    return result.rows[0];
};

const cancelarReservacionConDb = async (db, idReservacion) => {
    const query = `
        UPDATE reservaciones
        SET
            estado = $1,
            ultima_actualizacion = CURRENT_TIMESTAMP
        WHERE id_reservacion = $2
        RETURNING
            ${columnasReservacion}
    `;

    const result = await db.query(query, ['Cancelada', idReservacion]);

    return result.rows[0];
};

const actualizarTransporteReservacionConDb = async (db, idReservacion, idTransporteOperacion) => {
    const query = `
        UPDATE reservaciones
        SET
            id_transporte_operacion = $1,
            ultima_actualizacion = CURRENT_TIMESTAMP
        WHERE id_reservacion = $2
        RETURNING
            ${columnasReservacion}
    `;

    const result = await db.query(query, [idTransporteOperacion, idReservacion]);

    return result.rows[0];
};

const obtenerTransporteOperacionPorIdConDb = async (db, idTransporteOperacion) => {
    const query = `
        SELECT
            tr.id_transporte_operacion,
            tr.id_operacion_tour,
            ot.fecha,
            ot.id_tour,
            ot.hora_inicio,
            tr.id_vehiculo,
            v.capacidad
        FROM transportes_operacion tr
        INNER JOIN operaciones_tour ot
            ON ot.id_operacion_tour = tr.id_operacion_tour
        LEFT JOIN vehiculos v
            ON v.id_vehiculo = tr.id_vehiculo
        WHERE tr.id_transporte_operacion = $1
        LIMIT 1
    `;

    const result = await db.query(query, [idTransporteOperacion]);

    return result.rows[0];
};

const validarCompatibilidadReservacionTransporte = (reservacion, transporteOperacion) => {
    const fechaReservacion = normalizarValorParaComparacion('fecha', reservacion.fecha);
    const fechaOperacion = normalizarValorParaComparacion('fecha', transporteOperacion.fecha);

    if (fechaReservacion !== fechaOperacion) {
        return 'La reservación y el transporte deben corresponder a la misma fecha';
    }

    if (Number(reservacion.id_tour) !== Number(transporteOperacion.id_tour)) {
        return 'La reservación y el transporte deben corresponder al mismo tour';
    }

    return null;
};

const formatearTransporteReservacion = (valor) => (
    valor === null || valor === undefined
        ? 'sin valor'
        : String(valor)
);

const crearResultadoCapacidadInvalida = (mensaje) => ({
    tipo: 'capacidad_invalida',
    mensaje,
    reservacion: null
});

const tieneCambio = (cambios, campo) => cambios.some((cambio) => cambio.campo === campo);

const proyectarReservacion = (reservacionActual, camposActualizados) => ({
    ...reservacionActual,
    ...camposActualizados
});

const validarIntegridadNinosPax = (reservacion) => {
    const errorNinosPax = validarNinosNoExcedePax(reservacion.pax, reservacion.ninos);

    if (errorNinosPax) {
        throw crearErrorSolicitudInvalida(errorNinosPax);
    }
};

const validarCapacidadPatchAsignado = async (db, reservacionActual, reservacionFinal, cambios) => {
    if (reservacionActual.id_transporte_operacion === null || reservacionActual.id_transporte_operacion === undefined) {
        return;
    }

    const cambiaFecha = tieneCambio(cambios, 'fecha');
    const cambiaTour = tieneCambio(cambios, 'id_tour');
    const cambiaPaxOperativo = (
        capacidadService.obtenerPaxOperativoReservacion(reservacionActual)
        !== capacidadService.obtenerPaxOperativoReservacion(reservacionFinal)
    );

    if (!cambiaFecha && !cambiaTour && !cambiaPaxOperativo) {
        return;
    }

    const transporteOperacionPreliminar = await obtenerTransporteOperacionPorIdConDb(
        db,
        reservacionActual.id_transporte_operacion
    );

    if (!transporteOperacionPreliminar) {
        throw crearErrorSolicitudInvalida('Transporte de operación asignado no encontrado');
    }

    if (cambiaPaxOperativo) {
        const grupoPreliminar = capacidadService.obtenerGrupoTransporteOperacion(transporteOperacionPreliminar);
        const idsTransportesGrupo = await capacidadService.obtenerIdsTransportesGrupo(db, grupoPreliminar);
        const idsOperacionesGrupo = await capacidadService.obtenerIdsOperacionesGrupo(db, grupoPreliminar);

        await capacidadService.bloquearTransportesPorIds(db, idsTransportesGrupo);
        await capacidadService.bloquearOperacionesPorIds(db, idsOperacionesGrupo);
    } else {
        await capacidadService.bloquearTransportesPorIds(
            db,
            [reservacionActual.id_transporte_operacion]
        );
        await capacidadService.bloquearOperacionesPorIds(db, [transporteOperacionPreliminar.id_operacion_tour]);
    }

    const transporteOperacion = await obtenerTransporteOperacionPorIdConDb(
        db,
        reservacionActual.id_transporte_operacion
    );

    if (!transporteOperacion) {
        throw crearErrorSolicitudInvalida('Transporte de operación asignado no encontrado');
    }

    const errorCompatibilidad = validarCompatibilidadReservacionTransporte(
        reservacionFinal,
        transporteOperacion
    );

    if (errorCompatibilidad) {
        throw crearErrorSolicitudInvalida(errorCompatibilidad);
    }

    if (!cambiaPaxOperativo) {
        return;
    }

    const grupo = capacidadService.obtenerGrupoTransporteOperacion(transporteOperacion);
    const paxOperativoFinal = capacidadService.obtenerPaxOperativoReservacion(reservacionFinal);
    const totalTransporteActual = await capacidadService.calcularPaxTransporte(
        db,
        transporteOperacion.id_transporte_operacion,
        { excluirIdReservacion: reservacionActual.id_reservacion }
    );
    const totalTransporteResultante = totalTransporteActual + paxOperativoFinal;
    const errorCapacidadTransporte = capacidadService.validarCapacidadTransporte(
        transporteOperacion,
        totalTransporteResultante
    );

    if (errorCapacidadTransporte) {
        throw crearErrorSolicitudInvalida(errorCapacidadTransporte);
    }

    const totalGrupoActual = await capacidadService.calcularPaxTourTurno(
        db,
        grupo,
        { excluirIdReservacion: reservacionActual.id_reservacion }
    );
    const totalGrupoResultante = totalGrupoActual + paxOperativoFinal;
    const errorMaximoGrupo = capacidadService.validarMaximoTourTurno(totalGrupoResultante);

    if (errorMaximoGrupo) {
        throw crearErrorSolicitudInvalida(errorMaximoGrupo);
    }
};

const validarCancelacionReservacion = async (db, reservacionActual) => {
    if (
        reservacionActual.id_transporte_operacion === null ||
        reservacionActual.id_transporte_operacion === undefined
    ) {
        return;
    }

    const transporteOperacionPreliminar = await obtenerTransporteOperacionPorIdConDb(
        db,
        reservacionActual.id_transporte_operacion
    );

    if (!transporteOperacionPreliminar) {
        throw crearErrorSolicitudInvalida('Transporte de operación asignado no encontrado');
    }

    const grupo = capacidadService.obtenerGrupoTransporteOperacion(transporteOperacionPreliminar);
    const idsTransportesGrupo = await capacidadService.obtenerIdsTransportesGrupo(db, grupo);

    await capacidadService.bloquearTransportesPorIds(db, idsTransportesGrupo);

    const transporteOperacion = await obtenerTransporteOperacionPorIdConDb(
        db,
        reservacionActual.id_transporte_operacion
    );

    if (!transporteOperacion) {
        throw crearErrorSolicitudInvalida('Transporte de operación asignado no encontrado');
    }

    const totalResultante = await capacidadService.calcularPaxTransporte(
        db,
        transporteOperacion.id_transporte_operacion,
        { excluirIdReservacion: reservacionActual.id_reservacion }
    );
    const errorMinimo = capacidadService.validarMinimoTransporteConVehiculo(
        transporteOperacion,
        totalResultante,
        'No se puede cancelar la reservación porque el transporte con vehículo quedaría con menos de 2 pasajeros activos'
    );

    if (errorMinimo) {
        throw crearErrorSolicitudInvalida(errorMinimo);
    }
};

const bloquearTransportesAsignacion = async (db, idTransporteOrigen, transporteDestino) => {
    const idsBloqueo = [idTransporteOrigen];
    const grupoDestino = capacidadService.obtenerGrupoTransporteOperacion(transporteDestino);

    if (transporteDestino) {
        idsBloqueo.push(transporteDestino.id_transporte_operacion);
    }

    if (grupoDestino) {
        const idsGrupoDestino = await capacidadService.obtenerIdsTransportesGrupo(db, grupoDestino);
        idsBloqueo.push(...idsGrupoDestino);
    }

    await capacidadService.bloquearTransportesPorIds(db, idsBloqueo);
};

const validarCapacidadAsignacion = async (
    db,
    reservacion,
    transporteOrigen,
    transporteDestino
) => {
    const paxOperativoReservacion = capacidadService.obtenerPaxOperativoReservacion(reservacion);

    if (paxOperativoReservacion === 0) {
        return null;
    }

    if (transporteOrigen) {
        const totalOrigenResultante = await capacidadService.calcularPaxTransporte(
            db,
            transporteOrigen.id_transporte_operacion,
            { excluirIdReservacion: reservacion.id_reservacion }
        );
        const errorMinimoOrigen = capacidadService.validarMinimoTransporteConVehiculo(
            transporteOrigen,
            totalOrigenResultante,
            'El transporte origen quedaría con menos de 2 pasajeros activos; desasigne el vehículo antes de mover o desasignar reservas'
        );

        if (errorMinimoOrigen) {
            return errorMinimoOrigen;
        }
    }

    if (transporteDestino) {
        const totalDestinoActual = await capacidadService.calcularPaxTransporte(
            db,
            transporteDestino.id_transporte_operacion,
            { excluirIdReservacion: reservacion.id_reservacion }
        );
        const totalDestinoResultante = totalDestinoActual + paxOperativoReservacion;
        const errorCapacidadDestino = capacidadService.validarCapacidadTransporte(
            transporteDestino,
            totalDestinoResultante
        );

        if (errorCapacidadDestino) {
            return errorCapacidadDestino;
        }

        const grupoOrigen = capacidadService.obtenerGrupoTransporteOperacion(transporteOrigen);
        const grupoDestino = capacidadService.obtenerGrupoTransporteOperacion(transporteDestino);
        const cambiaGrupoOperativo = !capacidadService.esMismoGrupoOperativo(grupoOrigen, grupoDestino);

        if (cambiaGrupoOperativo) {
            const totalGrupoDestinoActual = await capacidadService.calcularPaxTourTurno(
                db,
                grupoDestino,
                { excluirIdReservacion: reservacion.id_reservacion }
            );
            const totalGrupoDestinoResultante = totalGrupoDestinoActual + paxOperativoReservacion;
            const errorMaximoGrupo = capacidadService.validarMaximoTourTurno(totalGrupoDestinoResultante);

            if (errorMaximoGrupo) {
                return errorMaximoGrupo;
            }
        }
    }

    return null;
};

const obtenerReservaciones = async (filtros = {}) => {
    const condiciones = [];
    const values = [];

    if (filtros.codigo) {
        values.push(filtros.codigo);
        condiciones.push(`codigo = $${values.length}`);
    }

    if (filtros.nombre) {
        values.push(`%${filtros.nombre}%`);
        condiciones.push(`nombre_cliente ILIKE $${values.length}`);
    }

    if (filtros.fecha) {
        values.push(filtros.fecha);
        condiciones.push(`fecha = $${values.length}`);
    }

    const where = condiciones.length > 0
        ? `WHERE ${condiciones.join('\n            AND ')}`
        : '';

    const query = `
        SELECT
            ${columnasReservacion}
        FROM reservaciones
        ${where}
        ORDER BY fecha_registro DESC, id_reservacion DESC
    `;

    const result = await pool.query(query, values);

    return result.rows;
};

const obtenerReservacionPorId = async (idReservacion) => {
    return obtenerReservacionPorIdConDb(pool, idReservacion);
};

const crearReservacion = async (reservacion, idUsuario) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const reservacionCreada = await insertarReservacionConDb(client, reservacion);

        await bitacoraService.crearEntradaBitacora({
            idUsuario,
            idReservacion: reservacionCreada.id_reservacion,
            accion: ACCIONES_BITACORA.CREAR,
            descripcion: `Reservación creada con código ${reservacionCreada.codigo}`
        }, client);

        await client.query('COMMIT');

        return reservacionCreada;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

const actualizarReservacionParcial = async (idReservacion, campos, idUsuario) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const reservacionActual = await obtenerReservacionPorIdConDb(client, idReservacion, true);

        if (!reservacionActual) {
            await client.query('COMMIT');
            return null;
        }

        const cambios = obtenerCambiosReservacion(reservacionActual, campos);

        if (cambios.length === 0) {
            await client.query('COMMIT');
            return reservacionActual;
        }

        const camposActualizados = obtenerCamposActualizacionDesdeCambios(cambios);
        const reservacionFinal = proyectarReservacion(reservacionActual, camposActualizados);

        validarIntegridadNinosPax(reservacionFinal);

        await validarCapacidadPatchAsignado(
            client,
            reservacionActual,
            reservacionFinal,
            cambios
        );

        const reservacionActualizada = await actualizarReservacionParcialConDb(
            client,
            idReservacion,
            camposActualizados
        );

        await bitacoraService.crearEntradaBitacora({
            idUsuario,
            idReservacion,
            accion: ACCIONES_BITACORA.MODIFICAR,
            descripcion: generarDescripcionCambios(cambios)
        }, client);

        await client.query('COMMIT');

        return reservacionActualizada;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

const cancelarReservacion = async (idReservacion, idUsuario) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const reservacionActual = await obtenerReservacionPorIdConDb(client, idReservacion, true);

        if (!reservacionActual) {
            await client.query('COMMIT');
            return null;
        }

        if (reservacionActual.estado === 'Cancelada') {
            await client.query('COMMIT');
            return {
                reservacion: reservacionActual,
                yaEstabaCancelada: true
            };
        }

        await validarCancelacionReservacion(client, reservacionActual);

        const reservacionCancelada = await cancelarReservacionConDb(client, idReservacion);

        await bitacoraService.crearEntradaBitacora({
            idUsuario,
            idReservacion,
            accion: ACCIONES_BITACORA.CANCELAR,
            descripcion: 'Reservación cancelada'
        }, client);

        await client.query('COMMIT');

        return {
            reservacion: reservacionCancelada,
            yaEstabaCancelada: false
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

const asignarTransporteReservacion = async (idReservacion, idTransporteOperacion, idUsuario) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const reservacionActual = await obtenerReservacionPorIdConDb(client, idReservacion, true);

        if (!reservacionActual) {
            await client.query('COMMIT');
            return {
                tipo: 'no_encontrada',
                reservacion: null
            };
        }

        if (reservacionActual.id_transporte_operacion === idTransporteOperacion) {
            await client.query('COMMIT');
            return {
                tipo: 'sin_cambios',
                reservacion: reservacionActual
            };
        }

        const transporteAnterior = reservacionActual.id_transporte_operacion;
        let transporteDestino = null;
        let transporteOrigen = null;

        if (idTransporteOperacion !== null) {
            const transporteDestinoPreliminar = await obtenerTransporteOperacionPorIdConDb(
                client,
                idTransporteOperacion
            );

            if (!transporteDestinoPreliminar) {
                await client.query('COMMIT');
                return {
                    tipo: 'transporte_no_encontrado',
                    reservacion: null
                };
            }

            await bloquearTransportesAsignacion(client, transporteAnterior, transporteDestinoPreliminar);

            transporteDestino = await obtenerTransporteOperacionPorIdConDb(client, idTransporteOperacion);

            if (!transporteDestino) {
                await client.query('COMMIT');
                return {
                    tipo: 'transporte_no_encontrado',
                    reservacion: null
                };
            }

            const errorCompatibilidad = validarCompatibilidadReservacionTransporte(
                reservacionActual,
                transporteDestino
            );

            if (errorCompatibilidad) {
                await client.query('COMMIT');
                return {
                    tipo: 'incompatible',
                    mensaje: errorCompatibilidad,
                    reservacion: null
                };
            }
        } else {
            await bloquearTransportesAsignacion(client, transporteAnterior, null);
        }

        if (transporteAnterior !== null) {
            transporteOrigen = await obtenerTransporteOperacionPorIdConDb(client, transporteAnterior);
        }

        const errorCapacidad = await validarCapacidadAsignacion(
            client,
            reservacionActual,
            transporteOrigen,
            transporteDestino
        );

        if (errorCapacidad) {
            await client.query('ROLLBACK');
            return crearResultadoCapacidadInvalida(errorCapacidad);
        }

        const reservacionActualizada = await actualizarTransporteReservacionConDb(
            client,
            idReservacion,
            idTransporteOperacion
        );

        await bitacoraService.crearEntradaBitacora({
            idUsuario,
            idReservacion,
            accion: ACCIONES_BITACORA.MODIFICAR,
            descripcion: `id_transporte_operacion: ${formatearTransporteReservacion(transporteAnterior)} -> ${formatearTransporteReservacion(idTransporteOperacion)}`
        }, client);

        await client.query('COMMIT');

        return {
            tipo: 'actualizada',
            reservacion: reservacionActualizada
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    obtenerReservaciones,
    obtenerReservacionPorId,
    crearReservacion,
    actualizarReservacionParcial,
    cancelarReservacion,
    asignarTransporteReservacion
};
