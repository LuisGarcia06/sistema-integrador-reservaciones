const pool = require('../../config/database');
const reservacionesService = require('../../services/reservaciones.service');
const {
    obtenerPreviewModificationFareHarborConDb,
} = require('./fareharborModificationDiff.service');

const PROVIDER_FAREHARBOR = 'fareharbor';
const EVENT_TYPE_MODIFICATION = 'modification';
const REVIEW_STATUS_APPROVED = 'approved';
const APPLICATION_STATUS_APPLIED = 'applied';
const APPLICATION_STATUS_NOT_APPLIED = 'not_applied';
const DECISION_APPLY_EXTERNAL = 'apply_external';
const DECISION_KEEP_INTERNAL = 'keep_internal';
const DECISION_MANUAL = 'manual';
const DECISION_VALUES = [DECISION_APPLY_EXTERNAL, DECISION_KEEP_INTERNAL, DECISION_MANUAL];
const DECISION_KEYS = [
    'fecha',
    'tour_turno_group',
    'passengers_group',
    'pickup_place',
    'pickup_time',
    'nombre_cliente',
    'telefono_cliente',
    'money_group',
];
const COMPLETAR_KEYS = ['id_tour', 'turno', 'ninos'];
const TURNOS_VALIDOS = ['Mañana', 'Tarde'];
const MONEY_FIELDS = ['precio_total', 'deposito', 'saldo'];
const EVENT_BLOCKER_PATTERNS = [
    /^external_booking_id_faltante$/,
    /^sin_reservacion_vinculada$/,
    /^reservacion_vinculada_no_encontrada$/,
    /^baseline_aplicado_faltante$/,
    /^El evento de modificación FareHarbor no está pendiente de aplicación\.$/,
    /^Existe un snapshot FareHarbor más reciente para este booking\.$/,
    /cancelada/i,
    /completada/i,
    /ya inició/i,
];

const crearResultado = (tipo, datos = {}) => ({
    tipo,
    ...datos,
});

const tieneValor = (valor) => (
    valor !== undefined && valor !== null && !(typeof valor === 'string' && valor.trim() === '')
);

const normalizarTexto = (valor) => (tieneValor(valor) ? String(valor).trim() : null);

const normalizarEnteroPositivo = (valor) => {
    const numero = Number(valor);

    return Number.isInteger(numero) && numero > 0 ? numero : null;
};

const normalizarEnteroNoNegativo = (valor) => {
    const numero = Number(valor);

    return Number.isInteger(numero) && numero >= 0 ? numero : null;
};

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
                normalized_data,
                source_received_at,
                created_at
            FROM eventos_integracion
            WHERE id_evento_integracion = $1
            FOR UPDATE
        `,
        [idEventoIntegracion]
    );

    return result.rows[0] || null;
}

async function bloquearSnapshotsBooking(db, externalBookingId) {
    const result = await db.query(
        `
            SELECT id_evento_integracion
            FROM eventos_integracion
            WHERE provider = $1
              AND external_booking_id = $2
            ORDER BY
                COALESCE(source_received_at, created_at) DESC,
                id_evento_integracion DESC
            FOR UPDATE
        `,
        [PROVIDER_FAREHARBOR, externalBookingId]
    );

    return result.rows;
}

async function obtenerLinkPorExternalBooking(db, externalBookingId) {
    const result = await db.query(
        `
            SELECT
                id_reserva_integracion_link,
                provider,
                external_booking_id,
                id_reservacion
            FROM reservas_integracion_link
            WHERE provider = $1
              AND external_booking_id = $2
            LIMIT 1
        `,
        [PROVIDER_FAREHARBOR, externalBookingId]
    );

    return result.rows[0] || null;
}

async function obtenerReservacionBloqueada(db, idReservacion) {
    const result = await db.query(
        `
            SELECT
                id_reservacion,
                codigo,
                fecha,
                id_tour,
                nombre_cliente,
                telefono_cliente,
                pax,
                ninos,
                pickup_place,
                pickup_time,
                turno,
                precio_total,
                deposito,
                saldo,
                estado,
                id_transporte_operacion,
                ultima_actualizacion
            FROM reservaciones
            WHERE id_reservacion = $1
            FOR UPDATE
        `,
        [idReservacion]
    );

    return result.rows[0] || null;
}

async function obtenerTourActivo(db, idTour) {
    const result = await db.query(
        `
            SELECT id_tour, activo
            FROM tours
            WHERE id_tour = $1
            LIMIT 1
        `,
        [idTour]
    );

    const tour = result.rows[0];

    return tour && tour.activo !== false ? tour : null;
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
                review_status,
                application_status,
                applied_at,
                applied_by
        `,
        [APPLICATION_STATUS_APPLIED, idUsuario, idEventoIntegracion, APPLICATION_STATUS_NOT_APPLIED]
    );

    return result.rows[0] || null;
}

function obtenerCambio(changes, field) {
    return changes.find((change) => change.field === field) || null;
}

function crearIndiceCambios(changes = []) {
    return changes.reduce((indice, change) => {
        indice[change.field] = change;
        return indice;
    }, {});
}

function obtenerGruposRequeridos(changes = []) {
    const grupos = new Set();

    changes.forEach((change) => {
        if (change.field === 'id_tour' || change.field === 'turno') {
            grupos.add('tour_turno_group');
            return;
        }

        if (change.field === 'pax' || change.field === 'ninos') {
            grupos.add('passengers_group');
            return;
        }

        grupos.add(change.field);
    });

    return grupos;
}

function obtenerEventBlockers(blockingIssues = []) {
    return blockingIssues.filter((issue) => (
        EVENT_BLOCKER_PATTERNS.some((pattern) => pattern.test(issue))
    ));
}

function tieneMoneyIssue(blockingIssues = []) {
    return blockingIssues.some((issue) => /^current money:/i.test(issue));
}

function validarDecisions(decisions = {}, gruposRequeridos) {
    const errores = [];
    const staleKeys = [];

    Object.keys(decisions).forEach((key) => {
        if (!DECISION_KEYS.includes(key)) {
            errores.push(`decision.${key} no esta permitida`);
            return;
        }

        if (!gruposRequeridos.has(key)) {
            staleKeys.push(key);
            return;
        }

        if (!DECISION_VALUES.includes(decisions[key])) {
            errores.push(`decision.${key} debe ser apply_external, keep_internal o manual`);
        }
    });

    gruposRequeridos.forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(decisions, key)) {
            errores.push(`decision.${key} es requerida`);
        }
    });

    return { errores, staleKeys };
}

function validarCompletarPermitido(completar = {}, requerimientos = {}) {
    const errores = [];
    const allowed = new Set();

    if (requerimientos.tourTurnoManual) {
        allowed.add('id_tour');
        allowed.add('turno');
    }

    if (requerimientos.ninosManual) {
        allowed.add('ninos');
    }

    Object.keys(completar).forEach((key) => {
        if (!COMPLETAR_KEYS.includes(key)) {
            errores.push(`completar.${key} no esta permitido`);
            return;
        }

        if (!allowed.has(key)) {
            errores.push(`completar.${key} no corresponde a una decision manual vigente`);
        }
    });

    return errores;
}

function agregarPatchSiTieneValor(patch, campo, valor) {
    if (!tieneValor(valor)) {
        throw new Error(`No hay valor FareHarbor determinable para ${campo}`);
    }

    patch[campo] = valor;
}

function valoresDifieren(actual, nuevo) {
    if (actual instanceof Date) {
        return actual.toISOString().slice(0, 10) !== String(nuevo).slice(0, 10);
    }

    if (actual === null || actual === undefined) {
        return nuevo !== null && nuevo !== undefined;
    }

    return String(actual) !== String(nuevo);
}

function filtrarPatchConCambios(patch, reservacion) {
    return Object.keys(patch).reduce((resultado, campo) => {
        if (valoresDifieren(reservacion[campo], patch[campo])) {
            resultado[campo] = patch[campo];
        }

        return resultado;
    }, {});
}

function cambioOperativoBloqueadoPorTransporte(reservacion, campos) {
    if (!reservacion.id_transporte_operacion) {
        return false;
    }

    return Object.keys(campos).some((campo) => valoresDifieren(reservacion[campo], campos[campo]));
}

async function aplicarDecisionFecha({ decision, change, patch, reservacion }) {
    if (decision === DECISION_MANUAL) {
        return crearResultado('decision_invalida', { errores: ['decision.fecha no permite manual'] });
    }

    if (decision === DECISION_KEEP_INTERNAL) {
        return crearResultado('ok');
    }

    if (!tieneValor(change.fareharbor_new)) {
        return crearResultado('decision_bloqueada', { reason: 'fecha_fareharbor_no_determinada' });
    }

    if (reservacion.id_transporte_operacion && valoresDifieren(reservacion.fecha, change.fareharbor_new)) {
        return crearResultado('decision_bloqueada', { reason: 'fecha_con_transporte_asignado' });
    }

    patch.fecha = change.fareharbor_new;
    return crearResultado('ok');
}

async function aplicarDecisionTourTurno({ db, decision, changesByField, completar, patch, reservacion }) {
    const tourChange = changesByField.id_tour;
    const turnoChange = changesByField.turno;
    const source = tourChange?.source || turnoChange?.source;

    if (decision === DECISION_KEEP_INTERNAL) {
        return crearResultado('ok');
    }

    let idTour;
    let turno;

    if (decision === DECISION_APPLY_EXTERNAL) {
        if (source !== 'equivalence') {
            return crearResultado('decision_bloqueada', { reason: 'tour_turno_sin_equivalencia' });
        }

        idTour = tourChange ? tourChange.fareharbor_new : reservacion.id_tour;
        turno = turnoChange ? turnoChange.fareharbor_new : reservacion.turno;
    } else if (decision === DECISION_MANUAL) {
        idTour = normalizarEnteroPositivo(completar.id_tour);
        turno = normalizarTexto(completar.turno);

        if (!idTour || !TURNOS_VALIDOS.includes(turno)) {
            return crearResultado('datos_invalidos', {
                errores: ['completar.id_tour y completar.turno son requeridos para tour_turno_group manual'],
            });
        }

        const tour = await obtenerTourActivo(db, idTour);

        if (!tour) {
            return crearResultado('referencia_invalida', { campo: 'id_tour' });
        }
    }

    const campos = { id_tour: idTour, turno };

    if (cambioOperativoBloqueadoPorTransporte(reservacion, campos)) {
        return crearResultado('decision_bloqueada', { reason: 'tour_turno_con_transporte_asignado' });
    }

    patch.id_tour = idTour;
    patch.turno = turno;
    return crearResultado('ok');
}

async function aplicarDecisionPassengers({ decision, changesByField, completar, patch, reservacion }) {
    const paxChange = changesByField.pax;
    const ninosChange = changesByField.ninos;
    const pax = paxChange ? paxChange.fareharbor_new : reservacion.pax;
    let ninos = ninosChange ? ninosChange.fareharbor_new : reservacion.ninos;

    if (decision === DECISION_KEEP_INTERNAL) {
        return crearResultado('ok');
    }

    if (!normalizarEnteroPositivo(pax)) {
        return crearResultado('decision_bloqueada', { reason: 'pax_fareharbor_no_determinado' });
    }

    if (decision === DECISION_MANUAL) {
        if (!ninosChange || ninosChange.reason !== 'unknown_customer_category') {
            return crearResultado('decision_invalida', { errores: ['decision.passengers_group manual solo aplica con categorias desconocidas'] });
        }

        ninos = normalizarEnteroNoNegativo(completar.ninos);

        if (ninos === null || ninos > Number(pax)) {
            return crearResultado('datos_invalidos', { errores: ['completar.ninos debe ser entero entre 0 y pax'] });
        }
    } else if (ninos === null || ninos === undefined) {
        return crearResultado('decision_bloqueada', { reason: 'ninos_fareharbor_no_determinados' });
    }

    patch.pax = Number(pax);
    patch.ninos = Number(ninos);
    return crearResultado('ok');
}

function aplicarDecisionCampoSimple({ key, decision, change, patch }) {
    if (decision === DECISION_KEEP_INTERNAL) {
        return crearResultado('ok');
    }

    if (decision === DECISION_MANUAL) {
        return crearResultado('decision_invalida', { errores: [`decision.${key} no permite manual`] });
    }

    if (!tieneValor(change.fareharbor_new)) {
        return crearResultado('decision_bloqueada', { reason: `${key}_fareharbor_no_determinado` });
    }

    patch[key] = change.fareharbor_new;
    return crearResultado('ok');
}

function aplicarDecisionMoney({ decision, change, patch, blockingIssues }) {
    if (decision === DECISION_KEEP_INTERNAL) {
        return crearResultado('ok');
    }

    if (decision === DECISION_MANUAL) {
        return crearResultado('decision_invalida', { errores: ['decision.money_group no permite manual'] });
    }

    if (tieneMoneyIssue(blockingIssues)) {
        return crearResultado('decision_bloqueada', { reason: 'money_fareharbor_invalido' });
    }

    const money = change?.fareharbor_new;

    if (!money || typeof money !== 'object' || MONEY_FIELDS.some((field) => !tieneValor(money[field]))) {
        return crearResultado('decision_bloqueada', { reason: 'money_fareharbor_no_determinado' });
    }

    MONEY_FIELDS.forEach((field) => {
        patch[field] = money[field];
    });

    return crearResultado('ok');
}

async function construirPatchDesdeDecisiones({ db, diff, decisions, completar, reservacion }) {
    const changesByField = crearIndiceCambios(diff.changes);
    const grupos = obtenerGruposRequeridos(diff.changes);
    const patch = {};
    const manualRequirements = {
        tourTurnoManual: decisions.tour_turno_group === DECISION_MANUAL && grupos.has('tour_turno_group'),
        ninosManual: decisions.passengers_group === DECISION_MANUAL && grupos.has('passengers_group'),
    };
    const erroresCompletar = validarCompletarPermitido(completar, manualRequirements);

    if (erroresCompletar.length > 0) {
        return crearResultado('datos_invalidos', { errores: erroresCompletar });
    }

    if (grupos.has('fecha')) {
        const resultado = await aplicarDecisionFecha({
            decision: decisions.fecha,
            change: changesByField.fecha,
            patch,
            reservacion,
        });

        if (resultado.tipo !== 'ok') {
            return resultado;
        }
    }

    if (grupos.has('tour_turno_group')) {
        const resultado = await aplicarDecisionTourTurno({
            db,
            decision: decisions.tour_turno_group,
            changesByField,
            completar,
            patch,
            reservacion,
        });

        if (resultado.tipo !== 'ok') {
            return resultado;
        }
    }

    if (grupos.has('passengers_group')) {
        const resultado = await aplicarDecisionPassengers({
            decision: decisions.passengers_group,
            changesByField,
            completar,
            patch,
            reservacion,
        });

        if (resultado.tipo !== 'ok') {
            return resultado;
        }
    }

    ['pickup_place', 'pickup_time', 'nombre_cliente', 'telefono_cliente'].forEach((key) => {
        if (!grupos.has(key)) {
            return;
        }

        const resultado = aplicarDecisionCampoSimple({
            key,
            decision: decisions[key],
            change: changesByField[key],
            patch,
        });

        if (resultado.tipo !== 'ok') {
            throw Object.assign(new Error(resultado.reason || 'decision invalida'), { resultado });
        }
    });

    if (grupos.has('money_group')) {
        const resultado = aplicarDecisionMoney({
            decision: decisions.money_group,
            change: changesByField.money_group,
            patch,
            blockingIssues: diff.blocking_issues,
        });

        if (resultado.tipo !== 'ok') {
            return resultado;
        }
    }

    return crearResultado('ok', {
        patch: filtrarPatchConCambios(patch, reservacion),
    });
}

async function aplicarModificationConDb(client, evento, usuarioId, aplicacion) {
    const normalizedExternalBookingId = normalizarTexto(evento.normalized_data?.external_booking_id);
    const externalBookingId = normalizedExternalBookingId || normalizarTexto(evento.external_booking_id);

    if (!externalBookingId) {
        return crearResultado('event_blocked', { reason: 'external_booking_id_faltante' });
    }

    const eventoNormalizado = {
        ...evento,
        external_booking_id: externalBookingId,
    };

    await bloquearSnapshotsBooking(client, externalBookingId);

    const link = await obtenerLinkPorExternalBooking(client, externalBookingId);

    if (link) {
        await obtenerReservacionBloqueada(client, link.id_reservacion);
    }

    const previewResultado = await obtenerPreviewModificationFareHarborConDb(client, eventoNormalizado);

    if (previewResultado.tipo !== 'preview') {
        return previewResultado;
    }

    const diff = previewResultado.fareharbor_modification_diff;

    if (diff.diff_fingerprint !== aplicacion.diff_fingerprint) {
        return crearResultado('diff_obsoleto');
    }

    const eventBlockers = obtenerEventBlockers(diff.blocking_issues);

    if (eventBlockers.length > 0) {
        return crearResultado('event_blocked', { reason: eventBlockers[0], blockingIssues: eventBlockers });
    }

    const reservacion = link ? await obtenerReservacionBloqueada(client, link.id_reservacion) : null;

    if (!reservacion) {
        return crearResultado('event_blocked', { reason: 'reservacion_vinculada_no_encontrada' });
    }

    const gruposRequeridos = obtenerGruposRequeridos(diff.changes);
    const { errores, staleKeys } = validarDecisions(aplicacion.decisions, gruposRequeridos);

    if (errores.length > 0) {
        return crearResultado('datos_invalidos', { errores });
    }

    if (staleKeys.length > 0) {
        return crearResultado('diff_obsoleto', { staleKeys });
    }

    let patchResultado;

    try {
        patchResultado = await construirPatchDesdeDecisiones({
            db: client,
            diff,
            decisions: aplicacion.decisions,
            completar: aplicacion.completar,
            reservacion,
        });
    } catch (error) {
        if (error.resultado) {
            patchResultado = error.resultado;
        } else {
            throw error;
        }
    }

    if (patchResultado.tipo !== 'ok') {
        return patchResultado;
    }

    const patch = patchResultado.patch;
    const updatedFields = Object.keys(patch);
    let reservacionFinal = reservacion;

    if (updatedFields.length > 0) {
        try {
            reservacionFinal = await reservacionesService.actualizarReservacionParcialConDb(
                client,
                reservacion.id_reservacion,
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
        reservacion: reservacionFinal,
        evento: eventoAplicado,
        updatedFields,
        noChangesApplied: updatedFields.length === 0,
    });
}

async function aplicarModificationFareHarbor(idEventoIntegracion, usuarioId, aplicacion, dbPool = pool) {
    const client = await dbPool.connect();

    try {
        await client.query('BEGIN');

        const evento = await obtenerEventoParaAplicacion(client, idEventoIntegracion);

        if (!evento) {
            await client.query('ROLLBACK');
            return crearResultado('no_encontrado');
        }

        if (evento.provider !== PROVIDER_FAREHARBOR) {
            await client.query('ROLLBACK');
            return crearResultado('provider_no_soportado');
        }

        if (evento.event_type !== EVENT_TYPE_MODIFICATION) {
            await client.query('ROLLBACK');
            return crearResultado('event_type_no_soportado');
        }

        if (evento.review_status !== REVIEW_STATUS_APPROVED) {
            await client.query('ROLLBACK');
            return crearResultado('no_aprobado');
        }

        if (evento.application_status === APPLICATION_STATUS_APPLIED) {
            await client.query('ROLLBACK');
            return crearResultado('ya_aplicado');
        }

        const resultado = await aplicarModificationConDb(client, evento, usuarioId, aplicacion);

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

module.exports = {
    DECISION_APPLY_EXTERNAL,
    DECISION_KEEP_INTERNAL,
    DECISION_MANUAL,
    DECISION_KEYS,
    aplicarModificationFareHarbor,
};
