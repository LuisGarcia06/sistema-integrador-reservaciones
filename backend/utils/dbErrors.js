const obtenerRespuestaErrorPostgres = (error) => {
    if (error.code === '23503') {
        return {
            status: 400,
            body: {
                mensaje: 'Datos relacionados inválidos'
            }
        };
    }

    if (
        error.code === '23505' &&
        error.constraint === 'usuarios_correo_key'
    ) {
        return {
            status: 409,
            body: {
                mensaje: 'Ya existe un usuario con ese correo.'
            }
        };
    }

    if (
        error.code === '23505' &&
        (
            error.constraint === 'uq_operaciones_tour_fecha_tour_hora' ||
            error.constraint === 'uq_operaciones_tour_fecha_tour_turno_grupo'
        )
    ) {
        return {
            status: 409,
            body: {
                mensaje: 'Ya existe ese grupo para el tour, fecha y turno.'
            }
        };
    }

    if (
        error.code === '23505' &&
        error.constraint === 'uq_transportes_operacion_operacion'
    ) {
        return {
            status: 409,
            body: {
                mensaje: 'Esta operación ya tiene un transporte asignado.'
            }
        };
    }

    if (
        error.code === '23505' &&
        error.constraint === 'uq_transportes_operacion_operacion_vehiculo'
    ) {
        return {
            status: 409,
            body: {
                mensaje: 'Ya existe un transporte con ese vehículo para la operación'
            }
        };
    }

    if (
        error.code === '23505' &&
        error.constraint === 'vehiculos_identificador_key'
    ) {
        return {
            status: 409,
            body: {
                mensaje: 'Ya existe un vehículo con ese identificador'
            }
        };
    }

    if (
        error.code === '23505' &&
        error.constraint === 'vehiculos_placas_key'
    ) {
        return {
            status: 409,
            body: {
                mensaje: 'Ya existe un vehículo con esas placas'
            }
        };
    }

    if (
        error.code === '23514' &&
        error.constraint === 'chk_vehiculos_capacidad'
    ) {
        return {
            status: 400,
            body: {
                mensaje: 'La capacidad del vehículo debe ser mayor a 0 y menor o igual a 12'
            }
        };
    }

    if (error.code === '23505') {
        return {
            status: 409,
            body: {
                mensaje: 'El código de reservación ya existe'
            }
        };
    }

    if (error.code && error.code.startsWith('22')) {
        return {
            status: 400,
            body: {
                mensaje: 'Datos inválidos'
            }
        };
    }

    return null;
};

module.exports = {
    obtenerRespuestaErrorPostgres
};
