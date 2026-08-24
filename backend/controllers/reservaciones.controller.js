const reservacionesService = require('../services/reservaciones.service');

const camposObligatorios = [
    'codigo',
    'fecha',
    'id_tour',
    'id_pais',
    'id_plataforma',
    'nombre_cliente',
    'pax',
    'pickup_place',
    'pickup_time',
    'precio_total',
    'estado'
];

const esValorVacio = (valor) => (
    valor === undefined ||
    valor === null ||
    (typeof valor === 'string' && valor.trim() === '')
);

const convertirEnteroPositivo = (valor) => {
    const numero = Number(valor);

    if (!Number.isInteger(numero) || numero <= 0) {
        return null;
    }

    return numero;
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

const obtenerOpcional = (valor) => {
    if (esValorVacio(valor)) {
        return null;
    }

    return valor;
};

const validarDatosReservacion = (datos) => {
    const errores = [];

    if (Object.prototype.hasOwnProperty.call(datos, 'id_reservacion')) {
        errores.push('No se permite enviar id_reservacion');
    }

    camposObligatorios.forEach((campo) => {
        if (esValorVacio(datos[campo])) {
            errores.push(`El campo ${campo} es obligatorio`);
        }
    });

    const idTour = convertirEnteroPositivo(datos.id_tour);
    const idPais = convertirEnteroPositivo(datos.id_pais);
    const idPlataforma = convertirEnteroPositivo(datos.id_plataforma);
    const pax = convertirEnteroPositivo(datos.pax);
    const precioTotal = convertirNumero(datos.precio_total);

    if (!esValorVacio(datos.id_tour) && idTour === null) {
        errores.push('El campo id_tour debe ser un entero positivo');
    }

    if (!esValorVacio(datos.id_pais) && idPais === null) {
        errores.push('El campo id_pais debe ser un entero positivo');
    }

    if (!esValorVacio(datos.id_plataforma) && idPlataforma === null) {
        errores.push('El campo id_plataforma debe ser un entero positivo');
    }

    if (!esValorVacio(datos.pax) && pax === null) {
        errores.push('El campo pax debe ser un entero positivo');
    }

    let ninos = null;

    if (!esValorVacio(datos.ninos)) {
        ninos = convertirEnteroNoNegativo(datos.ninos);

        if (ninos === null) {
            errores.push('El campo ninos debe ser un entero mayor o igual a 0');
        }
    }

    if (!esValorVacio(datos.precio_total) && precioTotal === null) {
        errores.push('El campo precio_total debe ser numérico válido');
    }

    const deposito = obtenerOpcional(datos.deposito);
    const saldo = obtenerOpcional(datos.saldo);
    const tipoCambio = obtenerOpcional(datos.tipo_cambio);

    if (deposito !== null && convertirNumero(deposito) === null) {
        errores.push('El campo deposito debe ser numérico válido');
    }

    if (saldo !== null && convertirNumero(saldo) === null) {
        errores.push('El campo saldo debe ser numérico válido');
    }

    if (tipoCambio !== null && convertirNumero(tipoCambio) === null) {
        errores.push('El campo tipo_cambio debe ser numérico válido');
    }

    return {
        errores,
        reservacion: {
            codigo: datos.codigo,
            fecha: datos.fecha,
            id_tour: idTour,
            id_pais: idPais,
            id_plataforma: idPlataforma,
            nombre_cliente: datos.nombre_cliente,
            habitacion: obtenerOpcional(datos.habitacion),
            pax,
            ninos,
            pickup_place: datos.pickup_place,
            pickup_time: datos.pickup_time,
            precio_total: precioTotal,
            deposito: deposito === null ? null : convertirNumero(deposito),
            saldo: saldo === null ? null : convertirNumero(saldo),
            tipo_cambio: tipoCambio === null ? null : convertirNumero(tipoCambio),
            metodo_pago: obtenerOpcional(datos.metodo_pago),
            estado: datos.estado
        }
    };
};

const listarReservaciones = async (req, res) => {
    try {
        const reservaciones = await reservacionesService.obtenerReservaciones();

        res.status(200).json({
            mensaje: 'Reservaciones consultadas correctamente',
            total: reservaciones.length,
            datos: reservaciones
        });
    } catch (error) {
        console.error('Error al consultar reservaciones:', error);

        res.status(500).json({
            mensaje: 'Error al consultar reservaciones'
        });
    }
};

const crearReservacion = async (req, res) => {
    const { errores, reservacion } = validarDatosReservacion(req.body || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Datos inválidos',
            errores
        });
    }

    try {
        const reservacionCreada = await reservacionesService.crearReservacion(reservacion);

        return res.status(201).json({
            mensaje: 'Reservación creada correctamente',
            datos: reservacionCreada
        });
    } catch (error) {
        if (error.code === '23503') {
            return res.status(400).json({
                mensaje: 'Datos relacionados inválidos'
            });
        }

        if (error.code === '23505') {
            return res.status(409).json({
                mensaje: 'El código de reservación ya existe'
            });
        }

        if (error.code && error.code.startsWith('22')) {
            return res.status(400).json({
                mensaje: 'Datos inválidos'
            });
        }

        console.error('Error al crear la reservación:', error);

        return res.status(500).json({
            mensaje: 'Error al crear la reservación'
        });
    }
};

const obtenerReservacionPorId = async (req, res) => {
    const idReservacion = Number(req.params.id);

    if (!Number.isInteger(idReservacion) || idReservacion <= 0) {
        return res.status(400).json({
            mensaje: 'El id de la reservación debe ser un entero válido'
        });
    }

    try {
        const reservacion = await reservacionesService.obtenerReservacionPorId(idReservacion);

        if (!reservacion) {
            return res.status(404).json({
                mensaje: 'Reservación no encontrada'
            });
        }

        return res.status(200).json({
            mensaje: 'Reservación consultada correctamente',
            datos: reservacion
        });
    } catch (error) {
        console.error('Error al consultar la reservación:', error);

        return res.status(500).json({
            mensaje: 'Error al consultar la reservación'
        });
    }
};

module.exports = {
    listarReservaciones,
    crearReservacion,
    obtenerReservacionPorId
};
