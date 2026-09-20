const {
    tieneCampo,
    validarTextoRequerido
} = require('./catalogosOperativos.validator');

const camposPlataformaPermitidos = [
    'nombre'
];

const validarDatosPlataforma = (datos) => {
    const errores = [];
    const plataforma = {};
    const camposEnviados = Object.keys(datos);

    if (tieneCampo(datos, 'id_plataforma')) {
        errores.push('No se permite enviar id_plataforma');
    }

    camposEnviados.forEach((campo) => {
        if (campo === 'id_plataforma') {
            return;
        }

        if (!camposPlataformaPermitidos.includes(campo)) {
            errores.push(`El campo ${campo} no está permitido`);
        }
    });

    if (!tieneCampo(datos, 'nombre')) {
        errores.push('El campo nombre es obligatorio');
    } else {
        const resultado = validarTextoRequerido(datos.nombre, 'nombre', 50);

        if (!resultado.valido) {
            errores.push(resultado.mensaje);
        } else {
            plataforma.nombre = resultado.valor;
        }
    }

    return {
        errores,
        plataforma
    };
};

module.exports = {
    camposPlataformaPermitidos,
    validarDatosPlataforma
};
