const {
    convertirEnteroPositivo,
    esFechaValida,
    esHoraValida,
    esValorVacio
} = require('./reservaciones.validator');

const camposOperacionPermitidos = [
    'fecha',
    'id_tour',
    'turno',
    'numero_grupo',
    'hora_inicio',
    'id_guia',
    'estado'
];

const camposObligatoriosOperacion = [
    'fecha',
    'id_tour',
    'turno',
    'numero_grupo',
    'hora_inicio',
];

const filtrosOperacionesPermitidos = [
    'fecha'
];

const filtrosOperacionesSugeridasPermitidos = [
    'fecha'
];

const tieneCampo = (objeto, campo) => Object.prototype.hasOwnProperty.call(objeto, campo);

const normalizarTexto = (valor) => (
    typeof valor === 'string' ? valor.trim() : valor
);

const normalizarHora = (valor) => {
    const hora = normalizarTexto(valor);

    if (typeof hora !== 'string' || !esHoraValida(hora)) {
        return null;
    }

    return hora.length === 5 ? `${hora}:00` : hora;
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

const validarTurno = (valor) => {
    if (typeof valor !== 'string') {
        return null;
    }

    const turno = valor.trim();

    return turno === 'Mañana' || turno === 'Tarde'
        ? turno
        : null;
};

const validarNumeroGrupo = (valor) => {
    const numeroGrupo = Number(valor);

    if (!Number.isInteger(numeroGrupo) || numeroGrupo < 1 || numeroGrupo > 2) {
        return null;
    }

    return numeroGrupo;
};

const validarIdOperacion = (id) => convertirEnteroPositivo(id);

const validarIdGuia = (valor) => {
    if (valor === null) {
        return {
            valido: true,
            valor: null
        };
    }

    if (esValorVacio(valor)) {
        return {
            valido: false
        };
    }

    const idGuia = convertirEnteroPositivo(valor);

    return idGuia === null
        ? { valido: false }
        : { valido: true, valor: idGuia };
};

const validarCampoOperacion = (campo, valor) => {
    if (campo === 'fecha') {
        const fecha = normalizarTexto(valor);

        return esFechaValida(fecha)
            ? { valido: true, valor: fecha }
            : { valido: false, mensaje: 'El campo fecha debe tener formato YYYY-MM-DD y ser una fecha válida' };
    }

    if (campo === 'id_tour') {
        const idTour = convertirEnteroPositivo(valor);

        return idTour === null
            ? { valido: false, mensaje: 'El campo id_tour debe ser un entero positivo' }
            : { valido: true, valor: idTour };
    }

    if (campo === 'turno') {
        const turno = validarTurno(valor);

        return turno === null
            ? { valido: false, mensaje: 'El campo turno debe ser Mañana o Tarde' }
            : { valido: true, valor: turno };
    }

    if (campo === 'numero_grupo') {
        const numeroGrupo = validarNumeroGrupo(valor);

        return numeroGrupo === null
            ? { valido: false, mensaje: 'El campo numero_grupo debe ser 1 o 2' }
            : { valido: true, valor: numeroGrupo };
    }

    if (campo === 'hora_inicio') {
        const horaInicio = normalizarHora(valor);

        return horaInicio === null
            ? { valido: false, mensaje: 'El campo hora_inicio debe ser una hora válida' }
            : { valido: true, valor: horaInicio };
    }

    if (campo === 'id_guia') {
        const resultado = validarIdGuia(valor);

        return resultado.valido
            ? resultado
            : { valido: false, mensaje: 'El campo id_guia debe ser NULL o un entero positivo' };
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

    if (tieneCampo(datos, 'id_operacion_tour')) {
        errores.push(mensajeId);
    }

    camposEnviados.forEach((campo) => {
        if (campo === 'id_operacion_tour') {
            return;
        }

        if (!camposOperacionPermitidos.includes(campo)) {
            errores.push(`El campo ${campo} no está permitido`);
        }
    });
};

const validarDatosOperacion = (datos) => {
    const errores = [];
    const operacion = {};

    validarCamposNoPermitidos(datos, errores, 'No se permite enviar id_operacion_tour');

    camposObligatoriosOperacion.forEach((campo) => {
        if (esValorVacio(datos[campo])) {
            errores.push(`El campo ${campo} es obligatorio`);
        }
    });

    camposOperacionPermitidos.forEach((campo) => {
        if (!tieneCampo(datos, campo)) {
            return;
        }

        const resultado = validarCampoOperacion(campo, datos[campo]);

        if (!resultado.valido) {
            errores.push(resultado.mensaje);
            return;
        }

        operacion[campo] = resultado.valor;
    });

    if (!tieneCampo(operacion, 'id_guia')) {
        operacion.id_guia = null;
    }

    if (!tieneCampo(operacion, 'estado')) {
        operacion.estado = 'Activa';
    }

    return {
        errores,
        operacion
    };
};

const validarDatosActualizacionOperacion = (datos) => {
    const errores = [];
    const camposActualizacion = {};
    const camposEnviados = Object.keys(datos);

    if (camposEnviados.length === 0) {
        errores.push('Debe enviar al menos un campo para actualizar');
    }

    validarCamposNoPermitidos(datos, errores, 'No se permite modificar id_operacion_tour');

    camposOperacionPermitidos.forEach((campo) => {
        if (!tieneCampo(datos, campo)) {
            return;
        }

        const resultado = validarCampoOperacion(campo, datos[campo]);

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

const validarFiltrosOperaciones = (query) => {
    const errores = [];
    const filtros = {};
    const parametrosEnviados = Object.keys(query);

    parametrosEnviados.forEach((parametro) => {
        if (!filtrosOperacionesPermitidos.includes(parametro)) {
            errores.push(`El filtro ${parametro} no está permitido`);
        }
    });

    if (!tieneCampo(query, 'fecha')) {
        return {
            errores,
            filtros
        };
    }

    const fecha = normalizarTexto(query.fecha);

    if (!esFechaValida(fecha)) {
        errores.push('El filtro fecha debe tener formato YYYY-MM-DD y ser una fecha válida');

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

const validarFiltrosOperacionesSugeridas = (query) => {
    const errores = [];
    const filtros = {};
    const parametrosEnviados = Object.keys(query);

    parametrosEnviados.forEach((parametro) => {
        if (!filtrosOperacionesSugeridasPermitidos.includes(parametro)) {
            errores.push(`El filtro ${parametro} no está permitido`);
        }
    });

    if (!tieneCampo(query, 'fecha')) {
        errores.push('El filtro fecha es obligatorio');

        return {
            errores,
            filtros
        };
    }

    const fecha = normalizarTexto(query.fecha);

    if (!esFechaValida(fecha)) {
        errores.push('El filtro fecha debe tener formato YYYY-MM-DD y ser una fecha válida');

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

module.exports = {
    camposOperacionPermitidos,
    camposObligatoriosOperacion,
    filtrosOperacionesPermitidos,
    filtrosOperacionesSugeridasPermitidos,
    validarIdOperacion,
    validarDatosOperacion,
    validarDatosActualizacionOperacion,
    validarFiltrosOperaciones,
    validarFiltrosOperacionesSugeridas,
    normalizarHora
};
