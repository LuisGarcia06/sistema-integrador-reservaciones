const {
    tieneCampo,
    validarIdCatalogo,
    validarTextoRequerido,
    validarBooleano,
    validarFiltrosEstado
} = require('./catalogosOperativos.validator');

const camposOperadorPermitidos = [
    'nombre',
    'estado'
];

const validarIdOperador = (id) => validarIdCatalogo(id);

const validarCampoOperador = (campo, valor) => {
    if (campo === 'nombre') {
        return validarTextoRequerido(valor, campo, 120);
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

    if (tieneCampo(datos, 'id_operador')) {
        errores.push(mensajeId);
    }

    camposEnviados.forEach((campo) => {
        if (campo === 'id_operador') {
            return;
        }

        if (!camposOperadorPermitidos.includes(campo)) {
            errores.push(`El campo ${campo} no está permitido`);
        }
    });
};

const validarDatosOperador = (datos) => {
    const errores = [];
    const operador = {};

    validarCamposNoPermitidos(datos, errores, 'No se permite enviar id_operador');

    if (!tieneCampo(datos, 'nombre')) {
        errores.push('El campo nombre es obligatorio');
    }

    camposOperadorPermitidos.forEach((campo) => {
        if (!tieneCampo(datos, campo)) {
            return;
        }

        const resultado = validarCampoOperador(campo, datos[campo]);

        if (!resultado.valido) {
            errores.push(resultado.mensaje);
            return;
        }

        operador[campo] = resultado.valor;
    });

    if (!tieneCampo(operador, 'estado')) {
        operador.estado = true;
    }

    return {
        errores,
        operador
    };
};

const validarDatosActualizacionOperador = (datos) => {
    const errores = [];
    const camposActualizacion = {};
    const camposEnviados = Object.keys(datos);

    if (camposEnviados.length === 0) {
        errores.push('Debe enviar al menos un campo para actualizar');
    }

    validarCamposNoPermitidos(datos, errores, 'No se permite modificar id_operador');

    camposOperadorPermitidos.forEach((campo) => {
        if (!tieneCampo(datos, campo)) {
            return;
        }

        const resultado = validarCampoOperador(campo, datos[campo]);

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
    camposOperadorPermitidos,
    validarIdOperador,
    validarDatosOperador,
    validarDatosActualizacionOperador,
    validarFiltrosOperadores: validarFiltrosEstado
};
