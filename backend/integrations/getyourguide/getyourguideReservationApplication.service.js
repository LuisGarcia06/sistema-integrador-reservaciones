const pool = require('../../config/database');
const reservacionesService = require('../../services/reservaciones.service');
const equivalenciasToursExternosService = require('../../services/equivalenciasToursExternos.service');
const {
    validarCancelacionReservacion,
    validarDatosReservacion,
} = require('../../validators/reservaciones.validator');
const {
    mapGetYourGuideNewBookingToReservation,
} = require('./getyourguideReservation.mapper');
const { obtenerPreviewModificationGetYourGuideConDb } = require('./getyourguideModificationDiff.service');

const PROVIDER_GETYOURGUIDE = 'getyourguide';
const PLATFORM_NAME_GETYOURGUIDE = 'GetYourGuide';
const PAIS_NO_ESPECIFICADO = 'No especificado';
const EVENT_TYPE_NEW_BOOKING = 'new_booking';
const EVENT_TYPE_CANCELLATION = 'cancellation';
const EVENT_TYPE_MODIFICATION = 'modification';
const REVIEW_STATUS_APPROVED = 'approved';
const APPLICATION_STATUS_NOT_APPLIED = 'not_applied';
const APPLICATION_STATUS_APPLIED = 'applied';
const LINK_UNIQUE_CONSTRAINT = 'uq_reservas_integracion_link_provider_booking';

function crearResultado(tipo, datos = {}) {
    return {
        tipo,
        ...datos,
    };
}

async function obtenerEventoParaAplicacion(db, idEventoIntegracion) {
    const result = await db.query(
        `
            SELECT
                id_evento_integracion,
                provider,
                external_booking_id,
                event_type,
                review_status,
                application_status,
                applied_at,
                applied_by,
                normalized_data,
                source_received_at
            FROM eventos_integracion
            WHERE id_evento_integracion = $1
            FOR UPDATE
        `,
        [idEventoIntegracion]
    );

    return result.rows[0] || null;
}

async function obtenerPlataformaGetYourGuide(db) {
    const result = await db.query(
        `
            SELECT id_plataforma, nombre
            FROM plataformas
            WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1))
            LIMIT 1
        `,
        [PLATFORM_NAME_GETYOURGUIDE]
    );

    return result.rows[0] || null;
}

async function existeTour(db, idTour) {
    const result = await db.query(
        'SELECT id_tour FROM tours WHERE id_tour = $1 LIMIT 1',
        [idTour]
    );

    return Boolean(result.rows[0]);
}

async function existePais(db, idPais) {
    const result = await db.query(
        'SELECT id_pais FROM paises WHERE id_pais = $1 LIMIT 1',
        [idPais]
    );

    return Boolean(result.rows[0]);
}

async function obtenerPaisNoEspecificado(db) {
    const result = await db.query(
        `
            SELECT id_pais, nombre
            FROM paises
            WHERE nombre = $1
        `,
        [PAIS_NO_ESPECIFICADO]
    );

    if (result.rows.length !== 1) {
        return null;
    }

    return result.rows[0];
}

async function obtenerLinkPorExternalBooking(db, provider, externalBookingId) {
    const result = await db.query(
        `
            SELECT
                id_reserva_integracion_link,
                provider,
                external_booking_id,
                id_reservacion,
                created_at
            FROM reservas_integracion_link
            WHERE provider = $1
              AND external_booking_id = $2
            LIMIT 1
        `,
        [provider, externalBookingId]
    );

    return result.rows[0] || null;
}

async function crearLinkReservaIntegracion(db, { provider, externalBookingId, idReservacion }) {
    const result = await db.query(
        `
            INSERT INTO reservas_integracion_link (
                provider,
                external_booking_id,
                id_reservacion,
                created_at
            )
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            RETURNING
                id_reserva_integracion_link,
                provider,
                external_booking_id,
                id_reservacion,
                created_at
        `,
        [provider, externalBookingId, idReservacion]
    );

    return result.rows[0];
}

async function marcarEventoAplicado(db, { idEventoIntegracion, idUsuario }) {
    const result = await db.query(
        `
            UPDATE eventos_integracion
            SET
                application_status = $1,
                applied_at = CURRENT_TIMESTAMP,
                applied_by = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id_evento_integracion = $3
              AND application_status = $4
            RETURNING
                id_evento_integracion,
                application_status,
                applied_at,
                applied_by
        `,
        [APPLICATION_STATUS_APPLIED, idUsuario, idEventoIntegracion, APPLICATION_STATUS_NOT_APPLIED]
    );

    return result.rows[0] || null;
}

async function obtenerCompletarDerivadoDesdeEquivalencia(db, evento) {
    const equivalencia = await equivalenciasToursExternosService.resolverEquivalenciaTourExternoConDb(db, {
        provider: PROVIDER_GETYOURGUIDE,
        activityTitle: evento?.normalized_data?.activity_title,
        optionTitle: evento?.normalized_data?.option_title,
    });

    if (!equivalencia) {
        return {};
    }

    return {
        id_tour: equivalencia.id_tour,
        turno: equivalencia.turno,
    };
}

async function obtenerCompletarDerivadoDesdePaisGenerico(db, evento, completar = {}) {
    if (evento?.provider !== PROVIDER_GETYOURGUIDE) {
        return {};
    }

    if (Object.prototype.hasOwnProperty.call(completar, 'id_pais')) {
        return {};
    }

    const pais = await obtenerPaisNoEspecificado(db);

    if (!pais) {
        return {};
    }

    return {
        id_pais: pais.id_pais,
    };
}

async function prepararNuevaReservaGetYourGuideConDb(db, evento, completar = {}) {
    const plataforma = await obtenerPlataformaGetYourGuide(db);

    if (!plataforma) {
        return crearResultado('configuracion_incompleta', {
            missingFields: ['id_plataforma'],
            warnings: ['plataforma_getyourguide_no_configurada'],
        });
    }

    const completarDerivado = {
        ...(await obtenerCompletarDerivadoDesdeEquivalencia(db, evento)),
        ...(await obtenerCompletarDerivadoDesdePaisGenerico(db, evento, completar)),
    };
    const completarFinal = {
        ...completarDerivado,
        ...completar,
    };

    const preparacion = mapGetYourGuideNewBookingToReservation(evento, {
        completar: completarFinal,
        idPlataforma: plataforma.id_plataforma,
    });

    return crearResultado('preparado', preparacion);
}

async function validarReferenciasInternas(db, reservationData) {
    if (reservationData.id_tour && !(await existeTour(db, reservationData.id_tour))) {
        return 'id_tour';
    }

    if (reservationData.id_pais && !(await existePais(db, reservationData.id_pais))) {
        return 'id_pais';
    }

    return null;
}

function validarReservacionFinal(reservationData) {
    const { errores, reservacion } = validarDatosReservacion(reservationData);

    if (errores.length > 0) {
        return {
            valido: false,
            errores,
        };
    }

    return {
        valido: true,
        reservacion,
    };
}

function esUniqueLink(error) {
    return error?.code === '23505' && error?.constraint === LINK_UNIQUE_CONSTRAINT;
}

async function aplicarNewBookingConDb(client, evento, usuarioId, completar) {
    const linkExistente = await obtenerLinkPorExternalBooking(
        client,
        evento.provider,
        evento.external_booking_id
    );

    if (linkExistente) {
        return crearResultado('ya_vinculado', { link: linkExistente });
    }

    const preparacion = await prepararNuevaReservaGetYourGuideConDb(client, evento, completar);

    if (preparacion.tipo !== 'preparado') {
        return preparacion;
    }

    if (preparacion.missingFields.length > 0) {
        return crearResultado('faltan_datos', {
            missingFields: preparacion.missingFields,
            warnings: preparacion.warnings,
        });
    }

    const referenciaInvalida = await validarReferenciasInternas(client, preparacion.reservationData);

    if (referenciaInvalida) {
        return crearResultado('referencia_invalida', { campo: referenciaInvalida });
    }

    const validacion = validarReservacionFinal(preparacion.reservationData);

    if (!validacion.valido) {
        return crearResultado('datos_invalidos', { errores: validacion.errores });
    }

    const reservacion = await reservacionesService.crearReservacionConDb(
        client,
        validacion.reservacion,
        usuarioId
    );

    let link;

    try {
        link = await crearLinkReservaIntegracion(client, {
            provider: evento.provider,
            externalBookingId: evento.external_booking_id,
            idReservacion: reservacion.id_reservacion,
        });
    } catch (error) {
        if (esUniqueLink(error)) {
            return crearResultado('ya_vinculado');
        }

        throw error;
    }

    const eventoAplicado = await marcarEventoAplicado(client, {
        idEventoIntegracion: evento.id_evento_integracion,
        idUsuario: usuarioId,
    });

    if (!eventoAplicado) {
        return crearResultado('ya_aplicado');
    }

    return crearResultado('aplicado', {
        reservacion,
        link,
        evento: eventoAplicado,
    });
}

function obtenerMotivoCancelacion(completar = {}) {
    if (!Object.prototype.hasOwnProperty.call(completar, 'motivo_cancelacion')) {
        return crearResultado('faltan_datos', { missingFields: ['motivo_cancelacion'] });
    }

    const { errores, cancelacion } = validarCancelacionReservacion({
        motivo_cancelacion: completar.motivo_cancelacion,
    });

    if (errores.length > 0) {
        return crearResultado('datos_invalidos', { errores });
    }

    return crearResultado('motivo_valido', {
        motivoCancelacion: cancelacion.motivo_cancelacion,
    });
}

async function aplicarCancellationConDb(client, evento, usuarioId, completar) {
    const motivo = obtenerMotivoCancelacion(completar);

    if (motivo.tipo !== 'motivo_valido') {
        return motivo;
    }

    const link = await obtenerLinkPorExternalBooking(
        client,
        evento.provider,
        evento.external_booking_id
    );

    if (!link) {
        return crearResultado('reserva_no_vinculada');
    }

    const resultadoCancelacion = await reservacionesService.cancelarReservacionConDb(
        client,
        link.id_reservacion,
        usuarioId,
        motivo.motivoCancelacion
    );

    if (!resultadoCancelacion) {
        return crearResultado('reserva_no_encontrada');
    }

    const eventoAplicado = await marcarEventoAplicado(client, {
        idEventoIntegracion: evento.id_evento_integracion,
        idUsuario: usuarioId,
    });

    if (!eventoAplicado) {
        return crearResultado('ya_aplicado');
    }

    return crearResultado('aplicado', {
        reservacion: resultadoCancelacion.reservacion,
        yaEstabaCancelada: resultadoCancelacion.yaEstabaCancelada,
        link,
        evento: eventoAplicado,
    });
}

const CAMPOS_APLICABLES_MODIFICATION = [
    'fecha',
    'pax',
    'pickup_place',
    'id_tour',
    'turno',
    'idioma',
];

function construirPatchDesdeDiff(diff = {}) {
    return CAMPOS_APLICABLES_MODIFICATION.reduce((patch, campo) => {
        if (diff[campo]?.cambio === true) {
            patch[campo] = diff[campo].nuevo;
        }

        return patch;
    }, {});
}

function obtenerCamposModificadosDesdePatch(patch = {}) {
    return Object.keys(patch);
}

function mapearPreviewNoAplicable(preview) {
    if (!preview) {
        return crearResultado('modification_no_aplicable');
    }

    if (preview.reason === 'sin_reservacion_vinculada') {
        return crearResultado('reserva_no_vinculada', { reason: preview.reason });
    }

    if (preview.reason === 'reservacion_vinculada_no_encontrada') {
        return crearResultado('reserva_no_encontrada', { reason: preview.reason });
    }

    return crearResultado('modification_no_aplicable', {
        reason: preview.reason,
        warnings: preview.warnings || [],
    });
}

async function aplicarModificationConDb(client, evento, usuarioId) {
    const previewResultado = await obtenerPreviewModificationGetYourGuideConDb(client, evento, {
        bloquearReservacion: true,
        incluirInternos: true,
    });

    if (previewResultado.tipo !== 'preview') {
        return previewResultado;
    }

    const { preview } = previewResultado;

    if (!preview.aplicable) {
        return mapearPreviewNoAplicable(preview);
    }

    const patch = construirPatchDesdeDiff(preview.diff);
    const camposModificados = obtenerCamposModificadosDesdePatch(patch);
    let reservacion = preview.reservacion;

    if (camposModificados.length > 0) {
        try {
            reservacion = await reservacionesService.actualizarReservacionParcialConDb(
                client,
                preview.id_reservacion,
                patch,
                usuarioId
            );
        } catch (error) {
            if (error.statusCode) {
                return crearResultado('datos_invalidos', { errores: [error.message] });
            }

            throw error;
        }
    }

    const eventoAplicado = await marcarEventoAplicado(client, {
        idEventoIntegracion: evento.id_evento_integracion,
        idUsuario: usuarioId,
    });

    if (!eventoAplicado) {
        return crearResultado('ya_aplicado');
    }

    return crearResultado('aplicado', {
        reservacion,
        link: preview.link,
        evento: eventoAplicado,
        camposModificados,
    });
}
async function aplicarEventoGetYourGuide(eventoId, usuarioId, completar = {}, dbPool = pool) {
    const client = await dbPool.connect();

    try {
        await client.query('BEGIN');

        const evento = await obtenerEventoParaAplicacion(client, eventoId);

        if (!evento) {
            await client.query('ROLLBACK');
            return crearResultado('no_encontrado');
        }

        if (evento.provider !== PROVIDER_GETYOURGUIDE) {
            await client.query('ROLLBACK');
            return crearResultado('provider_no_soportado');
        }

        if (evento.review_status !== REVIEW_STATUS_APPROVED) {
            await client.query('ROLLBACK');
            return crearResultado('no_aprobado');
        }

        if (evento.application_status === APPLICATION_STATUS_APPLIED) {
            await client.query('ROLLBACK');
            return crearResultado('ya_aplicado');
        }

        if (!evento.external_booking_id) {
            await client.query('ROLLBACK');
            return crearResultado('faltan_datos', { missingFields: ['external_booking_id'] });
        }

        let resultado;

        if (evento.event_type === EVENT_TYPE_NEW_BOOKING) {
            resultado = await aplicarNewBookingConDb(client, evento, usuarioId, completar);
        } else if (evento.event_type === EVENT_TYPE_CANCELLATION) {
            resultado = await aplicarCancellationConDb(client, evento, usuarioId, completar);
        } else if (evento.event_type === EVENT_TYPE_MODIFICATION) {
            resultado = await aplicarModificationConDb(client, evento, usuarioId);
        } else {
            await client.query('ROLLBACK');
            return crearResultado('event_type_no_soportado');
        }

        if (resultado.tipo !== 'aplicado') {
            await client.query('ROLLBACK');
            return resultado;
        }

        await client.query('COMMIT');
        return resultado;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

const aplicarNuevaReservaGetYourGuide = aplicarEventoGetYourGuide;

module.exports = {
    APPLICATION_STATUS_APPLIED,
    APPLICATION_STATUS_NOT_APPLIED,
    LINK_UNIQUE_CONSTRAINT,
    aplicarEventoGetYourGuide,
    aplicarNuevaReservaGetYourGuide,
    prepararNuevaReservaGetYourGuideConDb,
};
