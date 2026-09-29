const camposObligatoriosReservacion = [
    'fecha',
    'id_tour',
    'id_pais',
    'id_plataforma',
    'nombre_cliente',
    'pax',
    'pickup_place',
    'pickup_time',
    'turno',
    'precio_total',
    'estado'
];

const camposEditablesReservacion = [
    'fecha',
    'id_tour',
    'id_pais',
    'id_plataforma',
    'nombre_cliente',
    'telefono_cliente',
    'habitacion',
    'pax',
    'ninos',
    'pickup_place',
    'pickup_time',
    'turno',
    'idioma',
    'notificado',
    'precio_total',
    'deposito',
    'saldo',
    'tipo_cambio',
    'metodo_pago',
    'vendedor',
    'observaciones',
    'motivo_cancelacion',
    'estado'
];

module.exports = {
    camposObligatoriosReservacion,
    camposEditablesReservacion
};
