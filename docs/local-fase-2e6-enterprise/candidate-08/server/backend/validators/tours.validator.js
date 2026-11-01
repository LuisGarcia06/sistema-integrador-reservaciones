const {
    tieneCampo,
    validarIdCatalogo,
    validarTextoRequerido,
    validarBooleano
} = require('./catalogosOperativos.validator');

const camposTourPermitidos = [
    'nombre',
    'descripcion',
    'activo'
];

const validarIdTourCatalogo = (id) => validarIdCatalogo(id);

const validarDescripcion = (valor) => {
    if (typeof valor !== 'string') {
        return {
            valido: false,
            mensaje: 'El campo descripcion debe ser texto'
        };
    }

    return {
        valido: true,
        valor: valor.trim()
    };
};

const validarCampoTour = (campo, valor) => {
    if (campo === 'nombre') {
        return validarTextoRequerido(valor, campo, 150);
    }

    if (campo === 'descripcion') {
        return validarDescripcion(valor);
    }

    if (campo === 'activo') {
        return validarBooleano(valor, campo);
    }

    return {
        valido: false,
        mensaje: `El campo ${campo} no está permitido`
    };
};

const validarCamposNoPermitidos = (datos, errores, mensajeId) => {
    const camposEnviados = Object.keys(datos);

    if (tieneCampo(datos, 'id_tour')) {
        errores.push(mensajeId);
    }

    camposEnviados.forEach((campo) => {
        if (campo === 'id_tour') {
            return;
        }

        if (!camposTourPermitidos.includes(campo)) {
            errores.push(`El campo ${campo} no está permitido`);
        }
    });
};

const validarDatosTour = (datos) => {
    const errores = [];
    const tour = {};

    validarCamposNoPermitidos(datos, errores, 'No se permite enviar id_tour');

    if (!tieneCampo(datos, 'nombre')) {
        errores.push('El campo nombre es obligatorio');
    }

    camposTourPermitidos.forEach((campo) => {
        if (!tieneCampo(datos, campo)) {
            return;
        }

        const resultado = validarCampoTour(campo, datos[campo]);

        if (!resultado.valido) {
            errores.push(resultado.mensaje);
            return;
        }

        tour[campo] = resultado.valor;
    });

    if (!tieneCampo(tour, 'descripcion')) {
        tour.descripcion = '';
    }

    if (!tieneCampo(tour, 'activo')) {
        tour.activo = true;
    }

    return {
        errores,
        tour
    };
};

const validarDatosActualizacionTour = (datos) => {
    const errores = [];
    const camposActualizacion = {};
    const camposEnviados = Object.keys(datos);

    if (camposEnviados.length === 0) {
        errores.push('Debe enviar al menos un campo para actualizar');
    }

    validarCamposNoPermitidos(datos, errores, 'No se permite modificar id_tour');

    camposTourPermitidos.forEach((campo) => {
        if (!tieneCampo(datos, campo)) {
            return;
        }

        const resultado = validarCampoTour(campo, datos[campo]);

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
    camposTourPermitidos,
    validarIdTourCatalogo,
    validarDatosTour,
    validarDatosActualizacionTour
};
