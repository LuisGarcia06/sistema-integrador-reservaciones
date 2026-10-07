const {
    ACCION_APPROVE,
    ACCION_DISMISS,
    REVIEW_STATUS_APPROVED,
    REVIEW_STATUS_DISMISSED,
    REVIEW_STATUS_PENDING,
} = require('../services/eventosIntegracion.service');

const REVIEW_STATUSES_PERMITIDOS = [
    REVIEW_STATUS_PENDING,
    REVIEW_STATUS_APPROVED,
    REVIEW_STATUS_DISMISSED,
];
const ACCIONES_REVISION_PERMITIDAS = [ACCION_APPROVE, ACCION_DISMISS];
const LIMITES_PAGINACION_EVENTOS = [25, 50, 100];
const CAMPOS_FILTROS_EVENTOS = ['review_status', 'provider', 'event_type', 'urgent', 'page', 'limit'];
const CAMPOS_REVISION_EVENTOS = ['accion', 'nota'];
const CAMPOS_APLICACION_EVENTOS = ['completar'];
const MAX_TEXTO_FILTRO = 50;
const MAX_NOTA_REVISION = 500;
const { CAMPOS_COMPLETAR_PERMITIDOS } = require('../integrations/getyourguide/getyourguideReservation.mapper');
const { validarCancelacionReservacion } = require('./reservaciones.validator');
const CAMPOS_COMPLETAR_EVENTO_PERMITIDOS = [
    ...CAMPOS_COMPLETAR_PERMITIDOS,
    'motivo_cancelacion',
];

const PATRON_TEXTO_SEGURO = /^[a-zA-Z0-9_-]+$/;

const tieneCampo = (objeto, campo) => Object.prototype.hasOwnProperty.call(objeto, campo);

const convertirEnteroPositivo = (valor) => {
    const numero = Number(valor);

    if (!Number.isInteger(numero) || numero <= 0) {
        return null;
    }

    return numero;
};

const normalizarTexto = (valor) => (
    typeof valor === 'string' ? valor.trim() : valor
);

const validarIdEventoIntegracion = (id) => convertirEnteroPositivo(id);

const validarTextoSeguro = (valor, campo) => {
    const texto = normalizarTexto(valor);

    if (typeof texto !== 'string' || texto === '') {
        return {
            valido: false,
            mensaje: `El filtro ${campo} no puede estar vacio`,
        };
    }

    if (texto.length > MAX_TEXTO_FILTRO || !PATRON_TEXTO_SEGURO.test(texto)) {
        return {
            valido: false,
            mensaje: `El filtro ${campo} debe ser texto seguro y no exceder ${MAX_TEXTO_FILTRO} caracteres`,
        };
    }

    return {
        valido: true,
        valor: texto,
    };
};

const validarBooleanoFiltro = (valor) => {
    const texto = normalizarTexto(valor);

    if (texto === true || texto === 'true' || texto === '1') {
        return {
            valido: true,
            valor: true,
        };
    }

    if (texto === false || texto === 'false' || texto === '0') {
        return {
            valido: true,
            valor: false,
        };
    }

    return {
        valido: false,
        mensaje: 'El filtro urgent debe ser true, false, 1 o 0',
    };
};

const validarFiltrosEventosIntegracion = (query) => {
    const errores = [];
    const filtros = {
        review_status: REVIEW_STATUS_PENDING,
    };
    const paginacion = {
        page: 1,
        limit: 25,
    };

    Object.keys(query).forEach((campo) => {
        if (!CAMPOS_FILTROS_EVENTOS.includes(campo)) {
            errores.push(`El filtro ${campo} no esta permitido`);
        }
    });

    if (tieneCampo(query, 'review_status')) {
        const reviewStatus = normalizarTexto(query.review_status);

        if (!REVIEW_STATUSES_PERMITIDOS.includes(reviewStatus)) {
            errores.push('El filtro review_status debe ser pending_review, approved o dismissed');
        } else {
            filtros.review_status = reviewStatus;
        }
    }

    ['provider', 'event_type'].forEach((campo) => {
        if (!tieneCampo(query, campo)) {
            return;
        }

        const resultado = validarTextoSeguro(query[campo], campo);

        if (!resultado.valido) {
            errores.push(resultado.mensaje);
            return;
        }

        filtros[campo] = resultado.valor;
    });

    if (tieneCampo(query, 'urgent')) {
        const resultado = validarBooleanoFiltro(query.urgent);

        if (!resultado.valido) {
            errores.push(resultado.mensaje);
        } else {
            filtros.urgent = resultado.valor;
        }
    }

    if (tieneCampo(query, 'page')) {
        const page = convertirEnteroPositivo(query.page);

        if (page === null) {
            errores.push('El parametro page debe ser un entero positivo');
        } else {
            paginacion.page = page;
        }
    }

    if (tieneCampo(query, 'limit')) {
        const limit = convertirEnteroPositivo(query.limit);

        if (limit === null || !LIMITES_PAGINACION_EVENTOS.includes(limit)) {
            errores.push('El parametro limit debe ser 25, 50 o 100');
        } else {
            paginacion.limit = limit;
        }
    }

    return {
        errores,
        filtros,
        paginacion,
    };
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

const esFechaValida = (valor) => (
    typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)
);

const esHoraValida = (valor) => (
    typeof valor === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(valor)
);

const esTurnoValido = (valor) => valor === 'Mañana' || valor === 'Tarde';

const normalizarTextoOpcional = (valor, maximo) => {
    if (valor === null || valor === undefined) {
        return {
            valido: true,
            valor: null,
        };
    }

    if (typeof valor !== 'string') {
        return {
            valido: false,
        };
    }

    const texto = valor.trim();

    if (texto === '') {
        return {
            valido: true,
            valor: null,
        };
    }

    if (maximo && texto.length > maximo) {
        return {
            valido: false,
        };
    }

    return {
        valido: true,
        valor: texto,
    };
};

const validarMotivoCancelacionCompletar = (valor) => {
    const { errores, cancelacion } = validarCancelacionReservacion({
        motivo_cancelacion: valor,
    });

    if (errores.length > 0) {
        return {
            valido: false,
            mensaje: errores[0],
        };
    }

    return {
        valido: true,
        valor: cancelacion.motivo_cancelacion,
    };
};

const validarCampoCompletar = (campo, valor) => {
    if (campo === 'motivo_cancelacion') {
        return validarMotivoCancelacionCompletar(valor);
    }

    if (campo === 'id_tour' || campo === 'id_pais' || campo === 'pax') {
        const numero = convertirEnteroPositivo(valor);
        return numero === null
            ? { valido: false, mensaje: `El campo completar.${campo} debe ser un entero positivo` }
            : { valido: true, valor: numero };
    }

    if (campo === 'ninos') {
        const numero = convertirEnteroNoNegativo(valor);
        return numero === null
            ? { valido: false, mensaje: 'El campo completar.ninos debe ser un entero mayor o igual a 0' }
            : { valido: true, valor: numero };
    }

    if (['precio_total', 'deposito', 'saldo', 'tipo_cambio'].includes(campo)) {
        const numero = convertirNumero(valor);
        return numero === null
            ? { valido: false, mensaje: `El campo completar.${campo} debe ser numerico` }
            : { valido: true, valor: numero };
    }

    if (campo === 'fecha') {
        return esFechaValida(valor)
            ? { valido: true, valor }
            : { valido: false, mensaje: 'El campo completar.fecha debe tener formato YYYY-MM-DD' };
    }

    if (campo === 'pickup_time') {
        return esHoraValida(valor)
            ? { valido: true, valor }
            : { valido: false, mensaje: 'El campo completar.pickup_time debe ser una hora valida' };
    }

    if (campo === 'turno') {
        return esTurnoValido(valor)
            ? { valido: true, valor }
            : { valido: false, mensaje: 'El campo completar.turno debe ser Mañana o Tarde' };
    }

    const maximos = {
        nombre_cliente: 120,
        telefono_cliente: 30,
        habitacion: 50,
        pickup_place: 120,
        idioma: 50,
        metodo_pago: 50,
        vendedor: 120,
    };
    const resultadoTexto = normalizarTextoOpcional(valor, maximos[campo]);

    return resultadoTexto.valido
        ? resultadoTexto
        : { valido: false, mensaje: `El campo completar.${campo} debe ser texto valido` };
};

const validarAplicacionEventoIntegracion = (body) => {
    const errores = [];
    const aplicacion = {
        completar: {},
    };
    const datos = body || {};

    Object.keys(datos).forEach((campo) => {
        if (!CAMPOS_APLICACION_EVENTOS.includes(campo)) {
            errores.push(`El campo ${campo} no esta permitido`);
        }
    });

    if (!tieneCampo(datos, 'completar')) {
        return {
            errores,
            aplicacion,
        };
    }

    if (!datos.completar || typeof datos.completar !== 'object' || Array.isArray(datos.completar)) {
        errores.push('El campo completar debe ser un objeto');
        return {
            errores,
            aplicacion,
        };
    }

    Object.keys(datos.completar).forEach((campo) => {
        if (!CAMPOS_COMPLETAR_EVENTO_PERMITIDOS.includes(campo)) {
            errores.push(`El campo completar.${campo} no esta permitido`);
            return;
        }

        const resultado = validarCampoCompletar(campo, datos.completar[campo]);

        if (!resultado.valido) {
            errores.push(resultado.mensaje);
            return;
        }

        aplicacion.completar[campo] = resultado.valor;
    });

    return {
        errores,
        aplicacion,
    };
};
const validarRevisionEventoIntegracion = (body) => {
    const errores = [];
    const revision = {};
    const datos = body || {};

    Object.keys(datos).forEach((campo) => {
        if (!CAMPOS_REVISION_EVENTOS.includes(campo)) {
            errores.push(`El campo ${campo} no esta permitido`);
        }
    });

    const accion = normalizarTexto(datos.accion);

    if (!ACCIONES_REVISION_PERMITIDAS.includes(accion)) {
        errores.push('El campo accion debe ser approve o dismiss');
    } else {
        revision.accion = accion;
    }

    if (tieneCampo(datos, 'nota')) {
        if (datos.nota === null || datos.nota === undefined) {
            revision.nota = null;
        } else if (typeof datos.nota !== 'string') {
            errores.push('El campo nota debe ser texto');
        } else {
            const nota = datos.nota.trim();

            if (nota.length > MAX_NOTA_REVISION) {
                errores.push(`El campo nota no puede exceder ${MAX_NOTA_REVISION} caracteres`);
            } else {
                revision.nota = nota || null;
            }
        }
    }

    return {
        errores,
        revision,
    };
};

module.exports = {
    LIMITES_PAGINACION_EVENTOS,
    REVIEW_STATUSES_PERMITIDOS,
    validarFiltrosEventosIntegracion,
    validarAplicacionEventoIntegracion,
    validarIdEventoIntegracion,
    validarRevisionEventoIntegracion,
};

