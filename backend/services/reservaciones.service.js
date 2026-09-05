const pool = require('../config/database');
const bitacoraService = require('./bitacora.service');
const { ACCIONES_BITACORA } = require('../constants/bitacora.actions');
const { camposEditablesReservacion } = require('../constants/reservaciones.fields');
const {
    obtenerCambiosReservacion,
    obtenerCamposActualizacionDesdeCambios,
    generarDescripcionCambios
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

module.exports = {
    obtenerReservaciones,
    obtenerReservacionPorId,
    crearReservacion,
    actualizarReservacionParcial,
    cancelarReservacion
};
