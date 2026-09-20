const {
    tieneCampo,
    validarTextoRequerido
} = require('./catalogosOperativos.validator');

const camposPaisPermitidos = [
    'nombre'
];

const validarDatosPais = (datos) => {
    const errores = [];
    const pais = {};
    const camposEnviados = Object.keys(datos);

    if (tieneCampo(datos, 'id_pais')) {
        errores.push('No se permite enviar id_pais');
    }

    camposEnviados.forEach((campo) => {
        if (campo === 'id_pais') {
            return;
        }

        if (!camposPaisPermitidos.includes(campo)) {
            errores.push(`El campo ${campo} no está permitido`);
        }
    });

    if (!tieneCampo(datos, 'nombre')) {
        errores.push('El campo nombre es obligatorio');
    } else {
        const resultado = validarTextoRequerido(datos.nombre, 'nombre', 150);

        if (!resultado.valido) {
            errores.push(resultado.mensaje);
        } else {
            pais.nombre = resultado.valor;
        }
    }

    return {
        errores,
        pais
    };
};

module.exports = {
    camposPaisPermitidos,
    validarDatosPais
};
