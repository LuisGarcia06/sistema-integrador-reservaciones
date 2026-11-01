const {
    tieneCampo,
    validarIdCatalogo,
    validarTextoRequerido,
    validarBooleano,
    validarFiltrosEstado
} = require('./catalogosOperativos.validator');

const camposGuiaPermitidos = [
    'nombre',
    'estado'
];

const validarIdGuiaCatalogo = (id) => validarIdCatalogo(id);

const validarCampoGuia = (campo, valor) => {
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

    if (tieneCampo(datos, 'id_guia')) {
        errores.push(mensajeId);
    }

    camposEnviados.forEach((campo) => {
        if (campo === 'id_guia') {
            return;
        }

        if (!camposGuiaPermitidos.includes(campo)) {
            errores.push(`El campo ${campo} no está permitido`);
        }
    });
};

const validarDatosGuia = (datos) => {
    const errores = [];
    const guia = {};

    validarCamposNoPermitidos(datos, errores, 'No se permite enviar id_guia');

    if (!tieneCampo(datos, 'nombre')) {
        errores.push('El campo nombre es obligatorio');
    }

    camposGuiaPermitidos.forEach((campo) => {
        if (!tieneCampo(datos, campo)) {
            return;
        }

        const resultado = validarCampoGuia(campo, datos[campo]);

        if (!resultado.valido) {
            errores.push(resultado.mensaje);
            return;
        }

        guia[campo] = resultado.valor;
    });

    if (!tieneCampo(guia, 'estado')) {
        guia.estado = true;
    }

    return {
        errores,
        guia
    };
};

const validarDatosActualizacionGuia = (datos) => {
    const errores = [];
    const camposActualizacion = {};
    const camposEnviados = Object.keys(datos);

    if (camposEnviados.length === 0) {
        errores.push('Debe enviar al menos un campo para actualizar');
    }

    validarCamposNoPermitidos(datos, errores, 'No se permite modificar id_guia');

    camposGuiaPermitidos.forEach((campo) => {
        if (!tieneCampo(datos, campo)) {
            return;
        }

        const resultado = validarCampoGuia(campo, datos[campo]);

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
    camposGuiaPermitidos,
    validarIdGuiaCatalogo,
    validarDatosGuia,
    validarDatosActualizacionGuia,
    validarFiltrosGuias: validarFiltrosEstado
};
