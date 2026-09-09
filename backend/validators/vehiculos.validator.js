const {
    tieneCampo,
    validarIdCatalogo,
    validarTextoRequerido,
    validarTextoOpcional,
    validarBooleano,
    validarFiltrosEstado
} = require('./catalogosOperativos.validator');

const camposVehiculoPermitidos = [
    'identificador',
    'placas',
    'color',
    'capacidad',
    'estado'
];

const validarIdVehiculo = (id) => validarIdCatalogo(id);

const validarCapacidad = (valor) => {
    if (typeof valor !== 'number' || !Number.isInteger(valor)) {
        return {
            valido: false,
            mensaje: 'El campo capacidad debe ser un número entero'
        };
    }

    if (valor <= 0 || valor > 12) {
        return {
            valido: false,
            mensaje: 'El campo capacidad debe ser mayor a 0 y menor o igual a 12'
        };
    }

    return {
        valido: true,
        valor
    };
};

const validarCampoVehiculo = (campo, valor) => {
    if (campo === 'identificador') {
        return validarTextoRequerido(valor, campo, 50);
    }

    if (campo === 'placas') {
        return validarTextoOpcional(valor, campo, 20);
    }

    if (campo === 'color') {
        return validarTextoOpcional(valor, campo, 50);
    }

    if (campo === 'capacidad') {
        return validarCapacidad(valor);
    }

    if (campo === 'estado') {
        return validarBooleano(valor, campo);
    }

    return {
        valido: false,
        mensaje: `El campo ${campo} no está permitido`
    };
};

const validarCamposNoPermitidos = (datos, errores, mensajeId) => {
    const camposEnviados = Object.keys(datos);

    if (tieneCampo(datos, 'id_vehiculo')) {
        errores.push(mensajeId);
    }

    camposEnviados.forEach((campo) => {
        if (campo === 'id_vehiculo') {
            return;
        }

        if (!camposVehiculoPermitidos.includes(campo)) {
            errores.push(`El campo ${campo} no está permitido`);
        }
    });
};

const validarDatosVehiculo = (datos) => {
    const errores = [];
    const vehiculo = {};

    validarCamposNoPermitidos(datos, errores, 'No se permite enviar id_vehiculo');

    ['identificador', 'capacidad'].forEach((campo) => {
        if (!tieneCampo(datos, campo)) {
            errores.push(`El campo ${campo} es obligatorio`);
        }
    });

    camposVehiculoPermitidos.forEach((campo) => {
        if (!tieneCampo(datos, campo)) {
            return;
        }

        const resultado = validarCampoVehiculo(campo, datos[campo]);

        if (!resultado.valido) {
            errores.push(resultado.mensaje);
            return;
        }

        vehiculo[campo] = resultado.valor;
    });

    ['placas', 'color'].forEach((campo) => {
        if (!tieneCampo(vehiculo, campo)) {
            vehiculo[campo] = null;
        }
    });

    if (!tieneCampo(vehiculo, 'estado')) {
        vehiculo.estado = true;
    }

    return {
        errores,
        vehiculo
    };
};

const validarDatosActualizacionVehiculo = (datos) => {
    const errores = [];
    const camposActualizacion = {};
    const camposEnviados = Object.keys(datos);

    if (camposEnviados.length === 0) {
        errores.push('Debe enviar al menos un campo para actualizar');
    }

    validarCamposNoPermitidos(datos, errores, 'No se permite modificar id_vehiculo');

    camposVehiculoPermitidos.forEach((campo) => {
        if (!tieneCampo(datos, campo)) {
            return;
        }

        const resultado = validarCampoVehiculo(campo, datos[campo]);

        if (!resultado.valido) {
            errores.push(resultado.mensaje);
            return;
        }

        camposActualizacion[campo] = resultado.valor;
    });

    return {
        errores,
        camposActualizacion
    };
};

module.exports = {
    camposVehiculoPermitidos,
    validarIdVehiculo,
    validarDatosVehiculo,
    validarDatosActualizacionVehiculo,
    validarFiltrosVehiculos: validarFiltrosEstado
};
