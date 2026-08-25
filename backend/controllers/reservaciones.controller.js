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

const camposEditables = [
    'codigo',
    'fecha',
    'id_tour',
    'id_pais',
    'id_plataforma',
    'nombre_cliente',
    'habitacion',
    'pax',
    'ninos',
    'pickup_place',
    'pickup_time',
    'precio_total',
    'deposito',
    'saldo',
    'tipo_cambio',
    'metodo_pago',
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

const esFechaValida = (valor) => {
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
        return false;
    }

    const fecha = new Date(`${valor}T00:00:00`);

    if (Number.isNaN(fecha.getTime())) {
        return false;
    }

    return fecha.toISOString().slice(0, 10) === valor;
};

const esHoraValida = (valor) => (
    typeof valor === 'string' &&
    /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(valor)
);

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

const validarDatosActualizacionReservacion = (datos) => {
    const errores = [];
    const camposEnviados = Object.keys(datos);

    if (camposEnviados.length === 0) {
        errores.push('Debe enviar al menos un campo para actualizar');
    }

    if (Object.prototype.hasOwnProperty.call(datos, 'id_reservacion')) {
        errores.push('No se permite modificar id_reservacion');
    }

    if (Object.prototype.hasOwnProperty.call(datos, 'fecha_registro')) {
        errores.push('No se permite modificar fecha_registro');
    }

    camposEnviados.forEach((campo) => {
        if (!camposEditables.includes(campo)) {
            errores.push(`El campo ${campo} no se puede actualizar`);
        }
    });

    const camposActualizacion = {};

    if (Object.prototype.hasOwnProperty.call(datos, 'codigo')) {
        if (esValorVacio(datos.codigo)) {
            errores.push('El campo codigo no puede estar vacío');
        } else {
            camposActualizacion.codigo = datos.codigo;
        }
    }

    if (Object.prototype.hasOwnProperty.call(datos, 'fecha')) {
        if (!esFechaValida(datos.fecha)) {
            errores.push('El campo fecha debe ser una fecha válida');
        } else {
            camposActualizacion.fecha = datos.fecha;
        }
    }

    if (Object.prototype.hasOwnProperty.call(datos, 'id_tour')) {
        const idTour = convertirEnteroPositivo(datos.id_tour);

        if (idTour === null) {
            errores.push('El campo id_tour debe ser un entero positivo');
        } else {
            camposActualizacion.id_tour = idTour;
        }
    }

    if (Object.prototype.hasOwnProperty.call(datos, 'id_pais')) {
        const idPais = convertirEnteroPositivo(datos.id_pais);

        if (idPais === null) {
            errores.push('El campo id_pais debe ser un entero positivo');
        } else {
            camposActualizacion.id_pais = idPais;
        }
    }

    if (Object.prototype.hasOwnProperty.call(datos, 'id_plataforma')) {
        const idPlataforma = convertirEnteroPositivo(datos.id_plataforma);

        if (idPlataforma === null) {
            errores.push('El campo id_plataforma debe ser un entero positivo');
        } else {
            camposActualizacion.id_plataforma = idPlataforma;
        }
    }

    if (Object.prototype.hasOwnProperty.call(datos, 'nombre_cliente')) {
        if (esValorVacio(datos.nombre_cliente)) {
            errores.push('El campo nombre_cliente no puede estar vacío');
        } else {
            camposActualizacion.nombre_cliente = datos.nombre_cliente;
        }
    }

    if (Object.prototype.hasOwnProperty.call(datos, 'habitacion')) {
        camposActualizacion.habitacion = obtenerOpcional(datos.habitacion);
    }

    if (Object.prototype.hasOwnProperty.call(datos, 'pax')) {
        const pax = convertirEnteroPositivo(datos.pax);

        if (pax === null) {
            errores.push('El campo pax debe ser un entero positivo');
        } else {
            camposActualizacion.pax = pax;
        }
    }

    if (Object.prototype.hasOwnProperty.call(datos, 'ninos')) {
        const ninos = convertirEnteroNoNegativo(datos.ninos);

        if (ninos === null) {
            errores.push('El campo ninos debe ser un entero mayor o igual a 0');
        } else {
            camposActualizacion.ninos = ninos;
        }
    }

    if (Object.prototype.hasOwnProperty.call(datos, 'pickup_place')) {
        if (esValorVacio(datos.pickup_place)) {
            errores.push('El campo pickup_place no puede estar vacío');
        } else {
            camposActualizacion.pickup_place = datos.pickup_place;
        }
    }

    if (Object.prototype.hasOwnProperty.call(datos, 'pickup_time')) {
        if (!esHoraValida(datos.pickup_time)) {
            errores.push('El campo pickup_time debe ser una hora válida');
        } else {
            camposActualizacion.pickup_time = datos.pickup_time;
        }
    }

    if (Object.prototype.hasOwnProperty.call(datos, 'precio_total')) {
        const precioTotal = convertirNumero(datos.precio_total);

        if (precioTotal === null) {
            errores.push('El campo precio_total debe ser numérico válido');
        } else {
            camposActualizacion.precio_total = precioTotal;
        }
    }

    if (Object.prototype.hasOwnProperty.call(datos, 'deposito')) {
        const deposito = convertirNumero(datos.deposito);

        if (deposito === null) {
            errores.push('El campo deposito debe ser numérico válido');
        } else {
            camposActualizacion.deposito = deposito;
        }
    }

    if (Object.prototype.hasOwnProperty.call(datos, 'saldo')) {
        const saldo = convertirNumero(datos.saldo);

        if (saldo === null) {
            errores.push('El campo saldo debe ser numérico válido');
        } else {
            camposActualizacion.saldo = saldo;
        }
    }

    if (Object.prototype.hasOwnProperty.call(datos, 'tipo_cambio')) {
        const tipoCambio = convertirNumero(datos.tipo_cambio);

        if (tipoCambio === null) {
            errores.push('El campo tipo_cambio debe ser numérico válido');
        } else {
            camposActualizacion.tipo_cambio = tipoCambio;
        }
    }

    if (Object.prototype.hasOwnProperty.call(datos, 'metodo_pago')) {
        camposActualizacion.metodo_pago = obtenerOpcional(datos.metodo_pago);
    }

    if (Object.prototype.hasOwnProperty.call(datos, 'estado')) {
        if (esValorVacio(datos.estado)) {
            errores.push('El campo estado no puede estar vacío');
        } else {
            camposActualizacion.estado = datos.estado;
        }
    }

    return {
        errores,
        camposActualizacion
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

const actualizarReservacionParcial = async (req, res) => {
    const idReservacion = Number(req.params.id);

    if (!Number.isInteger(idReservacion) || idReservacion <= 0) {
        return res.status(400).json({
            mensaje: 'El id de la reservación debe ser un entero válido'
        });
    }

    const { errores, camposActualizacion } = validarDatosActualizacionReservacion(req.body || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Datos inválidos',
            errores
        });
    }

    try {
        const reservacionActual = await reservacionesService.obtenerReservacionPorId(idReservacion);

        if (!reservacionActual) {
            return res.status(404).json({
                mensaje: 'Reservación no encontrada'
            });
        }

        const reservacionActualizada = await reservacionesService.actualizarReservacionParcial(
            idReservacion,
            camposActualizacion
        );

        return res.status(200).json({
            mensaje: 'Reservación actualizada correctamente',
            datos: reservacionActualizada
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

        console.error('Error al actualizar la reservación:', error);

        return res.status(500).json({
            mensaje: 'Error al actualizar la reservación'
        });
    }
};

const cancelarReservacion = async (req, res) => {
    const idReservacion = Number(req.params.id);

    if (!Number.isInteger(idReservacion) || idReservacion <= 0) {
        return res.status(400).json({
            mensaje: 'El id de la reservación debe ser un entero válido'
        });
    }

    try {
        const reservacionActual = await reservacionesService.obtenerReservacionPorId(idReservacion);

        if (!reservacionActual) {
            return res.status(404).json({
                mensaje: 'Reservación no encontrada'
            });
        }

        if (reservacionActual.estado === 'Cancelada') {
            return res.status(200).json({
                mensaje: 'La reservación ya estaba cancelada',
                datos: reservacionActual
            });
        }

        const reservacionCancelada = await reservacionesService.cancelarReservacion(idReservacion);

        return res.status(200).json({
            mensaje: 'Reservación cancelada correctamente',
            datos: reservacionCancelada
        });
    } catch (error) {
        console.error('Error al cancelar la reservación:', error);

        return res.status(500).json({
            mensaje: 'Error al cancelar la reservación'
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
    actualizarReservacionParcial,
    cancelarReservacion,
    obtenerReservacionPorId
};
