const { convertirEnteroPositivo } = require('./reservaciones.validator');

const tieneCampo = (objeto, campo) => Object.prototype.hasOwnProperty.call(objeto, campo);

const normalizarTexto = (valor) => (
    typeof valor === 'string' ? valor.trim() : valor
);

const validarIdCatalogo = (id) => convertirEnteroPositivo(id);

const validarTextoRequerido = (valor, campo, maximo) => {
    if (typeof valor !== 'string') {
        return {
            valido: false,
            mensaje: `El campo ${campo} debe ser texto`
        };
    }

    const texto = valor.trim();

    if (texto === '') {
        return {
            valido: false,
            mensaje: `El campo ${campo} es obligatorio`
        };
    }

    if (texto.length > maximo) {
        return {
            valido: false,
            mensaje: `El campo ${campo} no debe exceder ${maximo} caracteres`
        };
    }

    return {
        valido: true,
        valor: texto
    };
};

const validarTextoOpcional = (valor, campo, maximo) => {
    if (valor === null || valor === undefined) {
        return {
            valido: true,
            valor: null
        };
    }

    if (typeof valor !== 'string') {
        return {
            valido: false,
            mensaje: `El campo ${campo} debe ser texto o NULL`
        };
    }

    const texto = valor.trim();

    if (texto === '') {
        return {
            valido: true,
            valor: null
        };
    }

    if (texto.length > maximo) {
        return {
            valido: false,
            mensaje: `El campo ${campo} no debe exceder ${maximo} caracteres`
        };
    }

    return {
        valido: true,
        valor: texto
    };
};

const validarBooleano = (valor, campo) => (
    typeof valor === 'boolean'
        ? { valido: true, valor }
        : { valido: false, mensaje: `El campo ${campo} debe ser booleano` }
);

const validarFiltroEstado = (query, errores, filtros) => {
    if (!tieneCampo(query, 'estado')) {
        return;
    }

    if (query.estado === 'true') {
        filtros.estado = true;
        return;
    }

    if (query.estado === 'false') {
        filtros.estado = false;
        return;
    }

    errores.push('El filtro estado debe ser true o false');
};

const validarFiltrosEstado = (query) => {
    const errores = [];
    const filtros = {};
    const parametrosPermitidos = ['estado'];

    Object.keys(query).forEach((parametro) => {
        if (!parametrosPermitidos.includes(parametro)) {
            errores.push(`El filtro ${parametro} no está permitido`);
        }
    });

    validarFiltroEstado(query, errores, filtros);

    return {
        errores,
        filtros
    };
};

module.exports = {
    tieneCampo,
    normalizarTexto,
    validarIdCatalogo,
    validarTextoRequerido,
    validarTextoOpcional,
    validarBooleano,
    validarFiltrosEstado
};
