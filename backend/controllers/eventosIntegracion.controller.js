const eventosIntegracionService = require('../services/eventosIntegracion.service');
const { aplicarNuevaReservaGetYourGuide } = require('../integrations/getyourguide/getyourguideReservationApplication.service');
const {
    validarAplicacionEventoIntegracion,
    validarFiltrosEventosIntegracion,
    validarIdEventoIntegracion,
    validarRevisionEventoIntegracion,
} = require('../validators/eventosIntegracion.validator');

const listarEventosIntegracion = async (req, res) => {
    const { errores, filtros, paginacion } = validarFiltrosEventosIntegracion(req.query || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Filtros invalidos',
            errores,
        });
    }

    try {
        const resultado = await eventosIntegracionService.listarEventosIntegracion(filtros, paginacion);

        return res.status(200).json({
            mensaje: 'Eventos de integracion consultados correctamente',
            ...resultado,
        });
    } catch (error) {
        console.error('Error al consultar eventos de integracion:', error.message);

        return res.status(500).json({
            mensaje: 'Error al consultar eventos de integracion',
        });
    }
};

const obtenerEventoIntegracion = async (req, res) => {
    const idEventoIntegracion = validarIdEventoIntegracion(req.params.id);

    if (idEventoIntegracion === null) {
        return res.status(400).json({
            mensaje: 'El id del evento de integracion debe ser un entero valido',
        });
    }

    try {
        const evento = await eventosIntegracionService.obtenerEventoIntegracion(idEventoIntegracion);

        if (!evento) {
            return res.status(404).json({
                mensaje: 'Evento de integracion no encontrado',
            });
        }

        return res.status(200).json({
            mensaje: 'Evento de integracion consultado correctamente',
            datos: evento,
        });
    } catch (error) {
        console.error('Error al consultar evento de integracion:', error.message);

        return res.status(500).json({
            mensaje: 'Error al consultar evento de integracion',
        });
    }
};

const revisarEventoIntegracion = async (req, res) => {
    const idEventoIntegracion = validarIdEventoIntegracion(req.params.id);

    if (idEventoIntegracion === null) {
        return res.status(400).json({
            mensaje: 'El id del evento de integracion debe ser un entero valido',
        });
    }

    const { errores, revision } = validarRevisionEventoIntegracion(req.body || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Datos invalidos',
            errores,
        });
    }

    try {
        const resultado = await eventosIntegracionService.revisarEventoIntegracion({
            idEventoIntegracion,
            accion: revision.accion,
            idUsuario: req.usuario.id_usuario,
            nota: revision.nota,
        });

        if (resultado.tipo === 'no_encontrado') {
            return res.status(404).json({
                mensaje: 'Evento de integracion no encontrado',
            });
        }

        if (resultado.tipo === 'ya_revisado') {
            return res.status(409).json({
                mensaje: 'El evento de integracion ya fue revisado',
            });
        }

        return res.status(200).json({
            mensaje: 'Evento de integracion revisado correctamente',
            datos: resultado.event,
        });
    } catch (error) {
        console.error('Error al revisar evento de integracion:', error.message);

        return res.status(500).json({
            mensaje: 'Error al revisar evento de integracion',
        });
    }
};


const aplicarEventoIntegracion = async (req, res) => {
    const idEventoIntegracion = validarIdEventoIntegracion(req.params.id);

    if (idEventoIntegracion === null) {
        return res.status(400).json({
            mensaje: 'El id del evento de integracion debe ser un entero valido',
        });
    }

    const { errores, aplicacion } = validarAplicacionEventoIntegracion(req.body || {});

    if (errores.length > 0) {
        return res.status(400).json({
            mensaje: 'Datos invalidos',
            errores,
        });
    }

    try {
        const resultado = await aplicarNuevaReservaGetYourGuide(
            idEventoIntegracion,
            req.usuario.id_usuario,
            aplicacion.completar
        );

        if (resultado.tipo === 'no_encontrado') {
            return res.status(404).json({
                mensaje: 'Evento de integracion no encontrado',
            });
        }

        if (resultado.tipo === 'faltan_datos' || resultado.tipo === 'configuracion_incompleta') {
            return res.status(422).json({
                mensaje: 'El evento requiere informacion adicional',
                missing_fields: resultado.missingFields || [],
                warnings: resultado.warnings || [],
            });
        }

        if (resultado.tipo === 'referencia_invalida') {
            return res.status(422).json({
                mensaje: 'Referencia interna invalida',
                campo: resultado.campo,
            });
        }

        if (resultado.tipo === 'datos_invalidos') {
            return res.status(422).json({
                mensaje: 'El evento requiere informacion adicional',
                errores: resultado.errores,
            });
        }

        if ([
            'provider_no_soportado',
            'event_type_no_soportado',
            'no_aprobado',
            'ya_aplicado',
            'ya_vinculado',
        ].includes(resultado.tipo)) {
            return res.status(409).json({
                mensaje: 'El evento de integracion no puede aplicarse en su estado actual',
            });
        }

        return res.status(201).json({
            mensaje: 'Reserva creada correctamente',
            datos: {
                id_reservacion: resultado.reservacion.id_reservacion,
                codigo: resultado.reservacion.codigo,
                external_booking_id: resultado.link.external_booking_id,
            },
        });
    } catch (error) {
        console.error('Error al aplicar evento de integracion:', error.message);

        return res.status(500).json({
            mensaje: 'Error al aplicar evento de integracion',
        });
    }
};
module.exports = {
    aplicarEventoIntegracion,
    listarEventosIntegracion,
    obtenerEventoIntegracion,
    revisarEventoIntegracion,
};


