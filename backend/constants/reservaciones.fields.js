const camposObligatoriosReservacion = [
    'codigo',
    'fecha',
    'id_tour',
    'id_pais',
    'id_plataforma',
    'nombre_cliente',
    'pax',
    'pickup_place',
    'pickup_time',
    'precio_total',
    'estado'
];

const camposEditablesReservacion = [
    'codigo',
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
    'precio_total',
    'deposito',
    'saldo',
    'tipo_cambio',
    'metodo_pago',
    'vendedor',
    'observaciones',
    'estado'
];

module.exports = {
    camposObligatoriosReservacion,
    camposEditablesReservacion
};
