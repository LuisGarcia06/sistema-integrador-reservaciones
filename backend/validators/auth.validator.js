const reglasLogin = {
    correo: {
        transformar: (valor) => (
            typeof valor === 'string'
                ? valor.trim().toLowerCase()
                : valor
        ),
        validar: (valor) => (
            typeof valor === 'string' &&
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)
        ),
        mensaje: 'El campo correo debe ser un correo válido'
    },
    password: {
        transformar: (valor) => valor,
        validar: (valor) => (
            typeof valor === 'string' &&
            valor.trim() !== ''
        ),
        mensaje: 'El campo contraseña es obligatorio'
    }
};

const tieneCampo = (objeto, campo) => Object.prototype.hasOwnProperty.call(objeto, campo);

const esValorVacio = (valor) => (
    valor === undefined ||
    valor === null ||
    (typeof valor === 'string' && valor.trim() === '')
);

const validarCampoLogin = (datos, campo, credenciales, errores) => {
    const regla = reglasLogin[campo];

    if (!tieneCampo(datos, campo) || esValorVacio(datos[campo])) {
        errores.push(regla.mensaje);
        return;
    }

    const valor = regla.transformar(datos[campo]);

    if (!regla.validar(valor)) {
        errores.push(regla.mensaje);
        return;
    }

    credenciales[campo] = valor;
};

const validarLogin = (datos) => {
    const errores = [];
    const credenciales = {};

    Object.keys(reglasLogin).forEach((campo) => {
        validarCampoLogin(datos, campo, credenciales, errores);
    });

    return {
        errores,
        credenciales
    };
};

module.exports = {
    validarLogin
};
