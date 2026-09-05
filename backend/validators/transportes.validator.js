const {
    convertirEnteroPositivo,
    esFechaValida,
    esValorVacio
} = require('./reservaciones.validator');

const camposTransportePermitidos = [
    'id_operacion_tour',
    'id_vehiculo',
    'id_operador',
    'observaciones_operador',
    'estado'
];

const camposObligatoriosTransporte = [
    'id_operacion_tour',
    'estado'
];

const filtrosTransportesPermitidos = [
    'id_operacion_tour',
    'fecha'
];

const tieneCampo = (objeto, campo) => Object.prototype.hasOwnProperty.call(objeto, campo);

const normalizarTexto = (valor) => (
    typeof valor === 'string' ? valor.trim() : valor
);

const validarEnteroPositivoRequerido = (valor, campo) => {
    const id = convertirEnteroPositivo(valor);

    return id === null
        ? { valido: false, mensaje: `El campo ${campo} debe ser un entero positivo` }
        : { valido: true, valor: id };
};

const validarEnteroPositivoNullable = (valor, campo) => {
    if (valor === null) {
        return {
            valido: true,
            valor: null
        };
    }

    if (esValorVacio(valor)) {
        return {
            valido: false,
            mensaje: `El campo ${campo} debe ser NULL o un entero positivo`
        };
    }

    const id = convertirEnteroPositivo(valor);

    return id === null
        ? { valido: false, mensaje: `El campo ${campo} debe ser NULL o un entero positivo` }
        : { valido: true, valor: id };
};

const validarObservacionesOperador = (valor) => {
    if (valor === undefined || valor === null) {
        return {
            valido: true,
            valor: null
        };
    }

    if (typeof valor !== 'string') {
        return {
            valido: false,
            mensaje: 'El campo observaciones_operador debe ser texto'
        };
    }

    const observaciones = valor.trim();

    return {
        valido: true,
        valor: observaciones === '' ? null : observaciones
    };
};

const validarEstado = (valor) => {
    if (typeof valor !== 'string') {
        return null;
    }

    const estado = valor.trim();

    if (estado === '' || estado.length > 30) {
        return null;
    }

    return estado;
};

const validarCampoTransporte = (campo, valor) => {
    if (campo === 'id_operacion_tour') {
        return validarEnteroPositivoRequerido(valor, campo);
    }

    if (campo === 'id_vehiculo' || campo === 'id_operador') {
        return validarEnteroPositivoNullable(valor, campo);
    }

    if (campo === 'observaciones_operador') {
        return validarObservacionesOperador(valor);
    }

    if (campo === 'estado') {
        const estado = validarEstado(valor);

        return estado === null
            ? { valido: false, mensaje: 'El campo estado debe ser texto no vacío y no exceder 30 caracteres' }
            : { valido: true, valor: estado };
    }

    return {
        valido: false,
        mensaje: `El campo ${campo} no está permitido`
    };
};

const validarCamposNoPermitidos = (datos, errores, mensajeId) => {
    const camposEnviados = Object.keys(datos);

    if (tieneCampo(datos, 'id_transporte_operacion')) {
        errores.push(mensajeId);
    }

    camposEnviados.forEach((campo) => {
        if (campo === 'id_transporte_operacion') {
            return;
        }

        if (!camposTransportePermitidos.includes(campo)) {
            errores.push(`El campo ${campo} no está permitido`);
        }
    });
};

const validarIdTransporte = (id) => convertirEnteroPositivo(id);

const validarDatosTransporte = (datos) => {
    const errores = [];
    const transporte = {};

    validarCamposNoPermitidos(datos, errores, 'No se permite enviar id_transporte_operacion');

    camposObligatoriosTransporte.forEach((campo) => {
        if (esValorVacio(datos[campo])) {
            errores.push(`El campo ${campo} es obligatorio`);
        }
    });

    camposTransportePermitidos.forEach((campo) => {
        if (!tieneCampo(datos, campo)) {
            return;
        }

        const resultado = validarCampoTransporte(campo, datos[campo]);

        if (!resultado.valido) {
            errores.push(resultado.mensaje);
            return;
        }

        transporte[campo] = resultado.valor;
    });

    ['id_vehiculo', 'id_operador', 'observaciones_operador'].forEach((campo) => {
        if (!tieneCampo(transporte, campo)) {
            transporte[campo] = null;
        }
    });

    return {
        errores,
        transporte
    };
};

const validarDatosActualizacionTransporte = (datos) => {
    const errores = [];
    const camposActualizacion = {};
    const camposEnviados = Object.keys(datos);

    if (camposEnviados.length === 0) {
        errores.push('Debe enviar al menos un campo para actualizar');
    }

    validarCamposNoPermitidos(datos, errores, 'No se permite modificar id_transporte_operacion');

    camposTransportePermitidos.forEach((campo) => {
        if (!tieneCampo(datos, campo)) {
            return;
        }

        const resultado = validarCampoTransporte(campo, datos[campo]);

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

const validarFiltrosTransportes = (query) => {
    const errores = [];
    const filtros = {};
    const parametrosEnviados = Object.keys(query);

    parametrosEnviados.forEach((parametro) => {
        if (!filtrosTransportesPermitidos.includes(parametro)) {
            errores.push(`El filtro ${parametro} no está permitido`);
        }
    });

    if (tieneCampo(query, 'id_operacion_tour')) {
        const idOperacionTour = convertirEnteroPositivo(query.id_operacion_tour);

        if (idOperacionTour === null) {
            errores.push('El filtro id_operacion_tour debe ser un entero positivo');
        } else {
            filtros.id_operacion_tour = idOperacionTour;
        }
    }

    if (tieneCampo(query, 'fecha')) {
        const fecha = normalizarTexto(query.fecha);

        if (!esFechaValida(fecha)) {
            errores.push('El filtro fecha debe tener formato YYYY-MM-DD y ser una fecha válida');
        } else {
            filtros.fecha = fecha;
        }
    }

    return {
        errores,
        filtros
    };
};

module.exports = {
    camposTransportePermitidos,
    camposObligatoriosTransporte,
    filtrosTransportesPermitidos,
    validarIdTransporte,
    validarDatosTransporte,
    validarDatosActualizacionTransporte,
    validarFiltrosTransportes
};
