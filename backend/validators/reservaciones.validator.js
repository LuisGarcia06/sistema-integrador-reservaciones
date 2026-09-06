const {
    camposObligatoriosReservacion,
    camposEditablesReservacion
} = require('../constants/reservaciones.fields');

const camposObligatorios = camposObligatoriosReservacion;
const camposEditables = camposEditablesReservacion;

const filtrosReservacionesPermitidos = [
    'codigo',
    'nombre',
    'fecha'
];

const camposResultadoReservacion = [
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

const camposValidacionCreacion = [
    'id_tour',
    'id_pais',
    'id_plataforma',
    'pax',
    'fecha',
    'pickup_time',
    'ninos',
    'precio_total',
    'deposito',
    'saldo',
    'tipo_cambio'
];

const esValorVacio = (valor) => (
    valor === undefined ||
    valor === null ||
    (typeof valor === 'string' && valor.trim() === '')
);

const tieneCampo = (objeto, campo) => Object.prototype.hasOwnProperty.call(objeto, campo);

const validarNinosNoExcedePax = (pax, ninos) => {
    if (ninos === null || ninos === undefined) {
        return null;
    }

    const paxNumero = Number(pax);
    const ninosNumero = Number(ninos);

    if (!Number.isFinite(paxNumero) || !Number.isFinite(ninosNumero)) {
        return null;
    }

    return ninosNumero > paxNumero
        ? 'El campo ninos no puede ser mayor que pax'
        : null;
};

const resultadoValido = (valor) => ({
    valido: true,
    valor
});

const resultadoInvalido = (valor = null) => ({
    valido: false,
    valor
});

const convertirEnteroPositivo = (valor) => {
    const numero = Number(valor);

    if (!Number.isInteger(numero) || numero <= 0) {
        return null;
    }

    return numero;
};

const convertirEnteroNoNegativo = (valor) => {
    const numero = Number(valor);

    if (!Number.isInteger(numero) || numero < 0) {
        return null;
    }

    return numero;
};

const convertirNumero = (valor) => {
    const numero = Number(valor);

    if (!Number.isFinite(numero)) {
        return null;
    }

    return numero;
};

const esFechaValida = (valor) => {
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
        return false;
    }

    const fecha = new Date(`${valor}T00:00:00`);

    if (Number.isNaN(fecha.getTime())) {
        return false;
    }

    return fecha.toISOString().slice(0, 10) === valor;
};

const esHoraValida = (valor) => (
    typeof valor === 'string' &&
    /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(valor)
);

const obtenerOpcional = (valor) => {
    if (esValorVacio(valor)) {
        return null;
    }

    return valor;
};

const convertirNumeroOpcional = (valor) => {
    const valorOpcional = obtenerOpcional(valor);

    if (valorOpcional === null) {
        return resultadoValido(null);
    }

    const numero = convertirNumero(valorOpcional);

    return numero === null
        ? resultadoInvalido()
        : resultadoValido(numero);
};

const convertirEnteroNoNegativoOpcional = (valor) => {
    const valorOpcional = obtenerOpcional(valor);

    if (valorOpcional === null) {
        return resultadoValido(null);
    }

    const numero = convertirEnteroNoNegativo(valorOpcional);

    return numero === null
        ? resultadoInvalido()
        : resultadoValido(numero);
};

const convertirCon = (convertidor) => (valor) => {
    const valorConvertido = convertidor(valor);

    return valorConvertido === null
        ? resultadoInvalido()
        : resultadoValido(valorConvertido);
};

const conservarValor = (valor) => resultadoValido(valor);

const validarTextoNoVacio = (valor) => (
    esValorVacio(valor)
        ? resultadoInvalido(valor)
        : resultadoValido(valor)
);

const validarFecha = (valor) => (
    esFechaValida(valor)
        ? resultadoValido(valor)
        : resultadoInvalido(valor)
);

const validarHora = (valor) => (
    esHoraValida(valor)
        ? resultadoValido(valor)
        : resultadoInvalido(valor)
);

const obtenerTextoOpcional = (valor) => resultadoValido(obtenerOpcional(valor));

const crearTransformadorTextoOpcional = ({ maximo } = {}) => (valor) => {
    if (valor === undefined || valor === null) {
        return resultadoValido(null);
    }

    if (typeof valor !== 'string') {
        return resultadoInvalido();
    }

    const texto = valor.trim();

    if (texto === '') {
        return resultadoValido(null);
    }

    if (maximo && texto.length > maximo) {
        return resultadoInvalido();
    }

    return resultadoValido(texto);
};

const obtenerTelefonoClienteOpcional = crearTransformadorTextoOpcional({ maximo: 30 });
const obtenerVendedorOpcional = crearTransformadorTextoOpcional({ maximo: 120 });
const obtenerObservacionesOpcional = crearTransformadorTextoOpcional();

const reglasReservacion = {
    codigo: {
        transformarCreacion: conservarValor,
        transformarActualizacion: validarTextoNoVacio,
        mensajeActualizacion: 'El campo codigo no puede estar vacío'
    },
    fecha: {
        transformarCreacion: validarFecha,
        transformarActualizacion: validarFecha,
        mensajeCreacion: 'El campo fecha debe ser una fecha válida',
        mensajeActualizacion: 'El campo fecha debe ser una fecha válida'
    },
    id_tour: {
        transformarCreacion: convertirCon(convertirEnteroPositivo),
        transformarActualizacion: convertirCon(convertirEnteroPositivo),
        mensajeCreacion: 'El campo id_tour debe ser un entero positivo',
        mensajeActualizacion: 'El campo id_tour debe ser un entero positivo'
    },
    id_pais: {
        transformarCreacion: convertirCon(convertirEnteroPositivo),
        transformarActualizacion: convertirCon(convertirEnteroPositivo),
        mensajeCreacion: 'El campo id_pais debe ser un entero positivo',
        mensajeActualizacion: 'El campo id_pais debe ser un entero positivo'
    },
    id_plataforma: {
        transformarCreacion: convertirCon(convertirEnteroPositivo),
        transformarActualizacion: convertirCon(convertirEnteroPositivo),
        mensajeCreacion: 'El campo id_plataforma debe ser un entero positivo',
        mensajeActualizacion: 'El campo id_plataforma debe ser un entero positivo'
    },
    nombre_cliente: {
        transformarCreacion: conservarValor,
        transformarActualizacion: validarTextoNoVacio,
        mensajeActualizacion: 'El campo nombre_cliente no puede estar vacío'
    },
    telefono_cliente: {
        transformarCreacion: obtenerTelefonoClienteOpcional,
        transformarActualizacion: obtenerTelefonoClienteOpcional,
        mensajeCreacion: 'El campo telefono_cliente debe ser texto y no exceder 30 caracteres',
        mensajeActualizacion: 'El campo telefono_cliente debe ser texto y no exceder 30 caracteres'
    },
    habitacion: {
        transformarCreacion: obtenerTextoOpcional,
        transformarActualizacion: obtenerTextoOpcional
    },
    pax: {
        transformarCreacion: convertirCon(convertirEnteroPositivo),
        transformarActualizacion: convertirCon(convertirEnteroPositivo),
        mensajeCreacion: 'El campo pax debe ser un entero positivo',
        mensajeActualizacion: 'El campo pax debe ser un entero positivo'
    },
    ninos: {
        transformarCreacion: convertirEnteroNoNegativoOpcional,
        transformarActualizacion: convertirEnteroNoNegativoOpcional,
        mensajeCreacion: 'El campo ninos debe ser un entero mayor o igual a 0',
        mensajeActualizacion: 'El campo ninos debe ser un entero mayor o igual a 0'
    },
    pickup_place: {
        transformarCreacion: conservarValor,
        transformarActualizacion: validarTextoNoVacio,
        mensajeActualizacion: 'El campo pickup_place no puede estar vacío'
    },
    pickup_time: {
        transformarCreacion: validarHora,
        transformarActualizacion: validarHora,
        mensajeCreacion: 'El campo pickup_time debe ser una hora válida',
        mensajeActualizacion: 'El campo pickup_time debe ser una hora válida'
    },
    precio_total: {
        transformarCreacion: convertirCon(convertirNumero),
        transformarActualizacion: convertirCon(convertirNumero),
        mensajeCreacion: 'El campo precio_total debe ser numérico válido',
        mensajeActualizacion: 'El campo precio_total debe ser numérico válido'
    },
    deposito: {
        transformarCreacion: convertirNumeroOpcional,
        transformarActualizacion: convertirNumeroOpcional,
        mensajeCreacion: 'El campo deposito debe ser numérico válido',
        mensajeActualizacion: 'El campo deposito debe ser numérico válido'
    },
    saldo: {
        transformarCreacion: convertirNumeroOpcional,
        transformarActualizacion: convertirNumeroOpcional,
        mensajeCreacion: 'El campo saldo debe ser numérico válido',
        mensajeActualizacion: 'El campo saldo debe ser numérico válido'
    },
    tipo_cambio: {
        transformarCreacion: convertirNumeroOpcional,
        transformarActualizacion: convertirNumeroOpcional,
        mensajeCreacion: 'El campo tipo_cambio debe ser numérico válido',
        mensajeActualizacion: 'El campo tipo_cambio debe ser numérico válido'
    },
    metodo_pago: {
        transformarCreacion: obtenerTextoOpcional,
        transformarActualizacion: obtenerTextoOpcional
    },
    vendedor: {
        transformarCreacion: obtenerVendedorOpcional,
        transformarActualizacion: obtenerVendedorOpcional,
        mensajeCreacion: 'El campo vendedor debe ser texto y no exceder 120 caracteres',
        mensajeActualizacion: 'El campo vendedor debe ser texto y no exceder 120 caracteres'
    },
    observaciones: {
        transformarCreacion: obtenerObservacionesOpcional,
        transformarActualizacion: obtenerObservacionesOpcional,
        mensajeCreacion: 'El campo observaciones debe ser texto',
        mensajeActualizacion: 'El campo observaciones debe ser texto'
    },
    estado: {
        transformarCreacion: conservarValor,
        transformarActualizacion: validarTextoNoVacio,
        mensajeActualizacion: 'El campo estado no puede estar vacío'
    }
};

const normalizarTextoFiltro = (valor) => (
    typeof valor === 'string' ? valor.trim() : valor
);

const crearValidadorFiltroTexto = ({ maximo, mensajeVacio, mensajeInvalido }) => (valor) => {
    const valorNormalizado = normalizarTextoFiltro(valor);

    if (esValorVacio(valorNormalizado)) {
        return {
            valido: false,
            mensaje: mensajeVacio
        };
    }

    if (typeof valorNormalizado !== 'string' || valorNormalizado.length > maximo) {
        return {
            valido: false,
            mensaje: mensajeInvalido
        };
    }

    return {
        valido: true,
        valor: valorNormalizado
    };
};

const reglasFiltrosReservaciones = {
    codigo: {
        validar: crearValidadorFiltroTexto({
            maximo: 30,
            mensajeVacio: 'El filtro codigo no puede estar vacío',
            mensajeInvalido: 'El filtro codigo no puede exceder 30 caracteres'
        })
    },
    nombre: {
        validar: crearValidadorFiltroTexto({
            maximo: 120,
            mensajeVacio: 'El filtro nombre no puede estar vacío',
            mensajeInvalido: 'El filtro nombre no puede exceder 120 caracteres'
        })
    },
    fecha: {
        validar: (valor) => {
            const fecha = normalizarTextoFiltro(valor);

            if (!esFechaValida(fecha)) {
                return {
                    valido: false,
                    mensaje: 'El filtro fecha debe tener formato YYYY-MM-DD y ser una fecha válida'
                };
            }

            return {
                valido: true,
                valor: fecha
            };
        }
    }
};

const transformarCampoReservacion = (campo, valor, tipoValidacion) => {
    const regla = reglasReservacion[campo];
    const transformar = tipoValidacion === 'actualizacion'
        ? regla.transformarActualizacion
        : regla.transformarCreacion;

    return transformar(valor);
};

const obtenerTransformacionesReservacion = (datos, tipoValidacion) => {
    const transformaciones = {};

    camposResultadoReservacion.forEach((campo) => {
        transformaciones[campo] = transformarCampoReservacion(
            campo,
            datos[campo],
            tipoValidacion
        );
    });

    return transformaciones;
};

const obtenerReservacionTransformada = (transformaciones) => {
    const reservacion = {};

    camposResultadoReservacion.forEach((campo) => {
        reservacion[campo] = transformaciones[campo].valor;
    });

    return reservacion;
};

const validarCampoPresente = (datos, campo, errores) => {
    if (esValorVacio(datos[campo])) {
        errores.push(`El campo ${campo} es obligatorio`);
    }
};

const aplicarReglaCreacion = (datos, transformaciones, campo, errores) => {
    const regla = reglasReservacion[campo];

    if (esValorVacio(datos[campo])) {
        return;
    }

    if (!transformaciones[campo].valido) {
        errores.push(regla.mensajeCreacion);
    }
};

const aplicarReglaActualizacion = (datos, campo, errores, camposActualizacion) => {
    if (!tieneCampo(datos, campo)) {
        return;
    }

    const regla = reglasReservacion[campo];
    const resultado = transformarCampoReservacion(campo, datos[campo], 'actualizacion');

    if (!resultado.valido) {
        errores.push(regla.mensajeActualizacion);
        return;
    }

    camposActualizacion[campo] = resultado.valor;
};

const validarIdReservacion = (id) => convertirEnteroPositivo(id);

const validarAsignacionTransporteReservacion = (datos) => {
    const errores = [];
    const camposEnviados = Object.keys(datos);
    const asignacion = {};

    if (camposEnviados.length === 0) {
        errores.push('Debe enviar id_transporte_operacion');
    }

    camposEnviados.forEach((campo) => {
        if (campo !== 'id_transporte_operacion') {
            errores.push(`El campo ${campo} no está permitido`);
        }
    });

    if (!tieneCampo(datos, 'id_transporte_operacion')) {
        return {
            errores,
            asignacion
        };
    }

    if (datos.id_transporte_operacion === null) {
        asignacion.id_transporte_operacion = null;

        return {
            errores,
            asignacion
        };
    }

    const idTransporteOperacion = datos.id_transporte_operacion;

    if (
        typeof idTransporteOperacion !== 'number' ||
        !Number.isInteger(idTransporteOperacion) ||
        idTransporteOperacion <= 0
    ) {
        errores.push('El campo id_transporte_operacion debe ser NULL o un entero positivo');

        return {
            errores,
            asignacion
        };
    }

    asignacion.id_transporte_operacion = idTransporteOperacion;

    return {
        errores,
        asignacion
    };
};

const validarFiltrosReservaciones = (query) => {
    const errores = [];
    const filtros = {};
    const filtrosEnviados = Object.keys(query);

    filtrosEnviados.forEach((filtro) => {
        if (!filtrosReservacionesPermitidos.includes(filtro)) {
            errores.push(`El filtro ${filtro} no está permitido`);
        }
    });

    filtrosReservacionesPermitidos.forEach((filtro) => {
        if (!tieneCampo(query, filtro)) {
            return;
        }

        const resultado = reglasFiltrosReservaciones[filtro].validar(query[filtro]);

        if (!resultado.valido) {
            errores.push(resultado.mensaje);
            return;
        }

        filtros[filtro] = resultado.valor;
    });

    return {
        errores,
        filtros
    };
};

const validarDatosReservacion = (datos) => {
    const errores = [];
    const transformaciones = obtenerTransformacionesReservacion(datos, 'creacion');
    const camposEnviados = Object.keys(datos);

    if (tieneCampo(datos, 'id_reservacion')) {
        errores.push('No se permite enviar id_reservacion');
    }

    camposEnviados.forEach((campo) => {
        if (campo === 'id_reservacion') {
            return;
        }

        if (!camposResultadoReservacion.includes(campo)) {
            errores.push(`El campo ${campo} no está permitido`);
        }
    });

    camposObligatorios.forEach((campo) => {
        validarCampoPresente(datos, campo, errores);
    });

    camposValidacionCreacion.forEach((campo) => {
        aplicarReglaCreacion(datos, transformaciones, campo, errores);
    });

    ['telefono_cliente', 'vendedor', 'observaciones'].forEach((campo) => {
        aplicarReglaCreacion(datos, transformaciones, campo, errores);
    });

    const errorNinosPax = validarNinosNoExcedePax(
        transformaciones.pax.valor,
        transformaciones.ninos.valor
    );

    if (errorNinosPax) {
        errores.push(errorNinosPax);
    }

    return {
        errores,
        reservacion: obtenerReservacionTransformada(transformaciones)
    };
};

const validarDatosActualizacionReservacion = (datos) => {
    const errores = [];
    const camposEnviados = Object.keys(datos);

    if (camposEnviados.length === 0) {
        errores.push('Debe enviar al menos un campo para actualizar');
    }

    if (tieneCampo(datos, 'id_reservacion')) {
        errores.push('No se permite modificar id_reservacion');
    }

    if (tieneCampo(datos, 'fecha_registro')) {
        errores.push('No se permite modificar fecha_registro');
    }

    camposEnviados.forEach((campo) => {
        if (!camposEditables.includes(campo)) {
            errores.push(`El campo ${campo} no se puede actualizar`);
        }
    });

    const camposActualizacion = {};

    camposEditables.forEach((campo) => {
        aplicarReglaActualizacion(datos, campo, errores, camposActualizacion);
    });

    return {
        errores,
        camposActualizacion
    };
};

module.exports = {
    camposObligatorios,
    camposEditables,
    filtrosReservacionesPermitidos,
    validarIdReservacion,
    validarFiltrosReservaciones,
    validarDatosReservacion,
    validarDatosActualizacionReservacion,
    validarAsignacionTransporteReservacion,
    validarNinosNoExcedePax,
    esValorVacio,
    convertirEnteroPositivo,
    convertirEnteroNoNegativo,
    convertirNumero,
    esFechaValida,
    esHoraValida,
    obtenerOpcional
};
