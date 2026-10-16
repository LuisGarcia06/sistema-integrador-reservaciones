const {
    tieneCampo,
    validarBooleano,
    validarIdCatalogo,
    validarTextoRequerido
} = require('./catalogosOperativos.validator');

const camposUsuarioPermitidos = [
    'nombre',
    'correo',
    'id_rol',
    'estado',
    'alcance_plataformas',
    'platform_ids'
];

const camposCrearUsuarioPermitidos = [
    ...camposUsuarioPermitidos,
    'password'
];

const validarIdUsuario = (id) => validarIdCatalogo(id);

const validarCorreo = (valor) => {
    if (typeof valor !== 'string') {
        return {
            valido: false,
            mensaje: 'El campo correo debe ser un correo válido'
        };
    }

    const correo = valor.trim().toLowerCase();

    if (
        correo === '' ||
        correo.length > 100 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)
    ) {
        return {
            valido: false,
            mensaje: 'El campo correo debe ser un correo válido'
        };
    }

    return {
        valido: true,
        valor: correo
    };
};

const validarPassword = (valor) => {
    if (typeof valor !== 'string') {
        return {
            valido: false,
            mensaje: 'El campo contraseña debe ser texto'
        };
    }

    if (valor.length < 8) {
        return {
            valido: false,
            mensaje: 'La contraseña debe tener al menos 8 caracteres'
        };
    }

    return {
        valido: true,
        valor
    };
};

const validarIdRol = (valor) => {
    const idRol = validarIdCatalogo(valor);

    if (idRol === null) {
        return {
            valido: false,
            mensaje: 'El campo id_rol debe ser un entero positivo'
        };
    }

    return {
        valido: true,
        valor: idRol
    };
};

const validarCampoUsuario = (campo, valor) => {
    if (campo === 'nombre') {
        return validarTextoRequerido(valor, campo, 100);
    }

    if (campo === 'correo') {
        return validarCorreo(valor);
    }

    if (campo === 'id_rol') {
        return validarIdRol(valor);
    }

    if (campo === 'estado') {
        return validarBooleano(valor, campo);
    }

    if (campo === 'alcance_plataformas') {
        return ['all', 'selected'].includes(valor)
            ? { valido: true, valor }
            : { valido: false, mensaje: 'El alcance debe ser all o selected' };
    }

    if (campo === 'platform_ids') {
        if (!Array.isArray(valor) || valor.some((id) => !Number.isInteger(id) || id <= 0 || id > 2147483647)) {
            return { valido: false, mensaje: 'platform_ids debe ser una lista de enteros positivos' };
        }
        if (new Set(valor).size !== valor.length) {
            return { valido: false, mensaje: 'No se permiten plataformas duplicadas' };
        }
        return { valido: true, valor: [...valor].sort((a, b) => a - b) };
    }

    if (campo === 'password') {
        return validarPassword(valor);
    }

    return {
        valido: false,
        mensaje: `El campo ${campo} no está permitido`
    };
};

const validarCamposNoPermitidos = (datos, camposPermitidos, errores, mensajeId) => {
    const camposEnviados = Object.keys(datos);

    if (tieneCampo(datos, 'id_usuario')) {
        errores.push(mensajeId);
    }

    camposEnviados.forEach((campo) => {
        if (campo === 'id_usuario') {
            return;
        }

        if (!camposPermitidos.includes(campo)) {
            errores.push(`El campo ${campo} no está permitido`);
        }
    });
};

const validarDatosUsuario = (datos) => {
    const errores = [];
    const usuario = {};
    const camposObligatorios = ['nombre', 'correo', 'password', 'id_rol'];

    validarCamposNoPermitidos(
        datos,
        camposCrearUsuarioPermitidos,
        errores,
        'No se permite enviar id_usuario'
    );

    camposObligatorios.forEach((campo) => {
        if (!tieneCampo(datos, campo)) {
            errores.push(`El campo ${campo} es obligatorio`);
        }
    });

    camposCrearUsuarioPermitidos.forEach((campo) => {
        if (!tieneCampo(datos, campo)) {
            return;
        }

        const resultado = validarCampoUsuario(campo, datos[campo]);

        if (!resultado.valido) {
            errores.push(resultado.mensaje);
            return;
        }

        usuario[campo] = resultado.valor;
    });

    if (!tieneCampo(usuario, 'estado')) {
        usuario.estado = true;
    }

    return {
        errores,
        usuario
    };
};

const validarDatosActualizacionUsuario = (datos) => {
    const errores = [];
    const camposActualizacion = {};
    const camposEnviados = Object.keys(datos);

    if (camposEnviados.length === 0) {
        errores.push('Debe enviar al menos un campo para actualizar');
    }

    validarCamposNoPermitidos(
        datos,
        camposUsuarioPermitidos,
        errores,
        'No se permite modificar id_usuario'
    );

    if (tieneCampo(datos, 'password')) {
        errores.push('La contraseña debe actualizarse desde el endpoint específico');
    }

    camposUsuarioPermitidos.forEach((campo) => {
        if (!tieneCampo(datos, campo)) {
            return;
        }

        const resultado = validarCampoUsuario(campo, datos[campo]);

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

const validarDatosPasswordUsuario = (datos) => {
    const errores = [];
    const camposEnviados = Object.keys(datos);
    let password = null;

    if (camposEnviados.length === 0) {
        errores.push('El campo password es obligatorio');
    }

    camposEnviados.forEach((campo) => {
        if (campo !== 'password') {
            errores.push(`El campo ${campo} no está permitido`);
        }
    });

    if (tieneCampo(datos, 'password')) {
        const resultado = validarPassword(datos.password);

        if (!resultado.valido) {
            errores.push(resultado.mensaje);
        } else {
            password = resultado.valor;
        }
    }

    return {
        errores,
        password
    };
};

module.exports = {
    validarIdUsuario,
    validarDatosUsuario,
    validarDatosActualizacionUsuario,
    validarDatosPasswordUsuario
};
