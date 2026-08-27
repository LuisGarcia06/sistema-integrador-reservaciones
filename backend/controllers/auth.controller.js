const authService = require('../services/auth.service');
const { validarLogin } = require('../validators/auth.validator');

const login = async (req, res) => {
    const { errores, credenciales } = validarLogin(req.body || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Datos inválidos',
            errores
        });
    }

    try {
        const resultado = await authService.iniciarSesion(credenciales);

        if (!resultado.autenticado) {
            return res.status(resultado.status).json({
                mensaje: resultado.mensaje
            });
        }

        return res.status(200).json({
            mensaje: 'Inicio de sesión correcto',
            token: resultado.token,
            usuario: resultado.usuario
        });
    } catch (error) {
        console.error('Error al iniciar sesión:', error.message);

        return res.status(500).json({
            mensaje: 'Error al iniciar sesión'
        });
    }
};

module.exports = {
    login
};
