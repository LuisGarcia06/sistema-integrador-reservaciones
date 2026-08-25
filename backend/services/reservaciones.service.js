const pool = require('../config/database');

const columnasReservacion = `
    id_reservacion,
    codigo,
    fecha,
    id_tour,
    id_pais,
    id_plataforma,
    nombre_cliente,
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
    estado,
    fecha_registro,
    ultima_actualizacion
`;

const camposActualizables = [
    'codigo',
    'fecha',
    'id_tour',
    'id_pais',
    'id_plataforma',
    'nombre_cliente',
    'habitacion',
    'pax',
    'ninos',
    'pickup_place',
    'pickup_time',
    'precio_total',
    'deposito',
    'saldo',
    'tipo_cambio',
    'metodo_pago',
    'estado'
];

const obtenerReservaciones = async () => {
    const query = `
        SELECT
            ${columnasReservacion}
        FROM reservaciones
        ORDER BY fecha_registro DESC, id_reservacion DESC
    `;

    const result = await pool.query(query);

    return result.rows;
};

const obtenerReservacionPorId = async (idReservacion) => {
    const query = `
        SELECT
            ${columnasReservacion}
        FROM reservaciones
        WHERE id_reservacion = $1
    `;

    const result = await pool.query(query, [idReservacion]);

    return result.rows[0];
};

const crearReservacion = async (reservacion) => {
    const query = `
        INSERT INTO reservaciones (
            codigo,
            fecha,
            id_tour,
            id_pais,
            id_plataforma,
            nombre_cliente,
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
            estado,
            fecha_registro,
            ultima_actualizacion
        )
        VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15,
            $16, $17, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
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
        reservacion.estado
    ];

    const result = await pool.query(query, values);

    return result.rows[0];
};

const actualizarReservacionParcial = async (idReservacion, campos) => {
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

    const result = await pool.query(query, values);

    return result.rows[0];
};

const cancelarReservacion = async (idReservacion) => {
    const query = `
        UPDATE reservaciones
        SET
            estado = $1,
            ultima_actualizacion = CURRENT_TIMESTAMP
        WHERE id_reservacion = $2
        RETURNING
            ${columnasReservacion}
    `;

    const result = await pool.query(query, ['Cancelada', idReservacion]);

    return result.rows[0];
};

module.exports = {
    obtenerReservaciones,
    obtenerReservacionPorId,
    crearReservacion,
    actualizarReservacionParcial,
    cancelarReservacion
};
