const parametrosDailyPermitidos = [
    'fecha'
];

const camposBodyObservacionesPermitidos = [
    'observaciones'
];

const tieneCampo = (objeto, campo) => Object.prototype.hasOwnProperty.call(objeto, campo);

const normalizarTextoFiltro = (valor) => (
    typeof valor === 'string' ? valor.trim() : valor
);

const esFechaValida = (valor) => {
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
        return false;
    }

    const [anio, mes, dia] = valor.split('-').map(Number);
    const fecha = new Date(Date.UTC(anio, mes - 1, dia));

    return (
        fecha.getUTCFullYear() === anio &&
        fecha.getUTCMonth() === mes - 1 &&
        fecha.getUTCDate() === dia
    );
};

const validarConsultaDaily = (query) => {
    const errores = [];
    const filtros = {};
    const parametrosEnviados = Object.keys(query);

    parametrosEnviados.forEach((parametro) => {
        if (!parametrosDailyPermitidos.includes(parametro)) {
            errores.push(`El parámetro ${parametro} no está permitido`);
        }
    });

    if (!tieneCampo(query, 'fecha')) {
        errores.push('El parámetro fecha es obligatorio');

        return {
            errores,
            filtros
        };
    }

    const fecha = normalizarTextoFiltro(query.fecha);

    if (!esFechaValida(fecha)) {
        errores.push('El parámetro fecha debe tener formato YYYY-MM-DD y ser una fecha válida');

        return {
            errores,
            filtros
        };
    }

    filtros.fecha = fecha;

    return {
        errores,
        filtros
    };
};

const validarBodyObservacionesDaily = (body) => {
    const errores = [];
    const datos = {};
    const camposEnviados = Object.keys(body);

    camposEnviados.forEach((campo) => {
        if (!camposBodyObservacionesPermitidos.includes(campo)) {
            errores.push(`El campo ${campo} no está permitido`);
        }
    });

    if (!tieneCampo(body, 'observaciones')) {
        errores.push('El campo observaciones es obligatorio');

        return {
            errores,
            datos
        };
    }

    if (typeof body.observaciones !== 'string') {
        errores.push('El campo observaciones debe ser texto');

        return {
            errores,
            datos
        };
    }

    datos.observaciones = body.observaciones.trim();

    return {
        errores,
        datos
    };
};

module.exports = {
    parametrosDailyPermitidos,
    camposBodyObservacionesPermitidos,
    validarConsultaDaily,
    validarBodyObservacionesDaily,
    esFechaValida
};
