const filtrosBitacoraPermitidos = [
    'fecha_desde',
    'fecha_hasta'
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

const validarFiltroFecha = (valor, nombreFiltro) => {
    const fecha = normalizarTextoFiltro(valor);

    if (!esFechaValida(fecha)) {
        return {
            valido: false,
            mensaje: `El filtro ${nombreFiltro} debe tener formato YYYY-MM-DD y ser una fecha válida`
        };
    }

    return {
        valido: true,
        valor: fecha
    };
};

const validarFiltrosBitacora = (query) => {
    const errores = [];
    const filtros = {};
    const filtrosEnviados = Object.keys(query);

    filtrosEnviados.forEach((filtro) => {
        if (!filtrosBitacoraPermitidos.includes(filtro)) {
            errores.push(`El filtro ${filtro} no está permitido`);
        }
    });

    filtrosBitacoraPermitidos.forEach((filtro) => {
        if (!tieneCampo(query, filtro)) {
            return;
        }

        const resultado = validarFiltroFecha(query[filtro], filtro);

        if (!resultado.valido) {
            errores.push(resultado.mensaje);
            return;
        }

        filtros[filtro] = resultado.valor;
    });

    if (
        filtros.fecha_desde &&
        filtros.fecha_hasta &&
        filtros.fecha_desde > filtros.fecha_hasta
    ) {
        errores.push('El filtro fecha_desde debe ser menor o igual a fecha_hasta');
    }

    return {
        errores,
        filtros
    };
};

module.exports = {
    filtrosBitacoraPermitidos,
    validarFiltrosBitacora
};
