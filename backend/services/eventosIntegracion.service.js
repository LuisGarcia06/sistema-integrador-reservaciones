const pool = require('../config/database');

const REVIEW_STATUS_PENDING = 'pending_review';
const REVIEW_STATUS_DISMISSED = 'dismissed';
const REVIEW_STATUS_APPROVED = 'approved';
const REVIEW_STATUS_APPLIED = 'applied';
const UNIQUE_EVENT_CONSTRAINT = 'uq_eventos_integracion_provider_external_event';
const ACCION_APPROVE = 'approve';
const ACCION_DISMISS = 'dismiss';

const SECRET_KEY_PATTERN = /^(access_token|refresh_token|client_secret|credentials|gmail-token|gmail_token|authorization)$/i;

const columnasEventoIntegracion = `
    id_evento_integracion,
    provider,
    external_event_id,
    external_thread_id,
    external_booking_id,
    event_type,
    urgent,
    review_status,
    application_status,
    applied_by,
    applied_at,
    reviewed_by,
    reviewed_at,
    review_note,
    normalized_data,
    source_subject,
    source_received_at,
    created_at,
    updated_at
`;

const columnasListadoEventoIntegracion = `
    id_evento_integracion,
    provider,
    external_event_id,
    external_booking_id,
    event_type,
    urgent,
    review_status,
    application_status,
    applied_by,
    applied_at,
    reviewed_by,
    reviewed_at,
    review_note,
    normalized_data,
    source_subject,
    source_received_at,
    created_at,
    updated_at
`;

function tienePropiedad(objeto, propiedad) {
    return Object.prototype.hasOwnProperty.call(objeto, propiedad);
}


function limpiarSecretos(value) {
    if (Array.isArray(value)) {
        return value
            .map(limpiarSecretos)
            .filter((item) => item !== undefined);
    }

    if (value && typeof value === 'object') {
        return Object.entries(value).reduce((limpio, [key, item]) => {
            if (SECRET_KEY_PATTERN.test(key)) {
                return limpio;
            }

            const valorLimpio = limpiarSecretos(item);

            if (valorLimpio !== undefined) {
                limpio[key] = valorLimpio;
            }

            return limpio;
        }, {});
    }

    if (value === undefined) {
        return undefined;
    }

    return value;
}

function normalizarTextoObligatorio(valor, campo) {
    const texto = String(valor || '').trim();

    if (!texto) {
        throw new Error(`El campo ${campo} es requerido`);
    }

    return texto;
}

function normalizarTextoOpcional(valor) {
    if (valor === undefined || valor === null || valor === '') {
        return null;
    }

    return String(valor).trim() || null;
}

function normalizarFechaOpcional(valor) {
    if (!valor) {
        return null;
    }

    const fecha = valor instanceof Date
        ? valor
        : new Date(valor);

    return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function normalizarEventoIntegracion(evento) {
    if (!tienePropiedad(evento, 'normalized_data')) {
        throw new Error('El campo normalized_data es requerido');
    }

    return {
        provider: normalizarTextoObligatorio(evento.provider, 'provider'),
        external_event_id: normalizarTextoObligatorio(
            evento.external_event_id,
            'external_event_id'
        ),
        external_thread_id: normalizarTextoOpcional(evento.external_thread_id),
        external_booking_id: normalizarTextoOpcional(evento.external_booking_id),
        event_type: normalizarTextoObligatorio(evento.event_type, 'event_type'),
        urgent: Boolean(evento.urgent),
        review_status: normalizarTextoOpcional(evento.review_status) || REVIEW_STATUS_PENDING,
        normalized_data: limpiarSecretos(evento.normalized_data || {}),
        source_subject: normalizarTextoOpcional(evento.source_subject),
        source_received_at: normalizarFechaOpcional(evento.source_received_at),
    };
}

async function obtenerEventoPorIdentidad(db, provider, externalEventId) {
    const result = await db.query(
        `
            SELECT
                ${columnasEventoIntegracion}
            FROM eventos_integracion
            WHERE provider = $1
              AND external_event_id = $2
            LIMIT 1
        `,
        [provider, externalEventId]
    );

    return result.rows[0] || null;
}

function construirValoresInsertEventoIntegracion(evento) {
    return [
        evento.provider,
        evento.external_event_id,
        evento.external_thread_id,
        evento.external_booking_id,
        evento.event_type,
        evento.urgent,
        evento.review_status,
        JSON.stringify(evento.normalized_data),
        evento.source_subject,
        evento.source_received_at,
    ];
}

async function insertarEventoIntegracion(db, evento) {
    const query = `
        INSERT INTO eventos_integracion (
            provider,
            external_event_id,
            external_thread_id,
            external_booking_id,
            event_type,
            urgent,
            review_status,
            normalized_data,
            source_subject,
            source_received_at,
            created_at,
            updated_at
        )
        VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8::jsonb, $9, $10,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT ON CONSTRAINT uq_eventos_integracion_provider_external_event
        DO NOTHING
        RETURNING
            ${columnasEventoIntegracion}
    `;

    const values = construirValoresInsertEventoIntegracion(evento);

    const result = await db.query(query, values);

    return result.rows[0] || null;
}

function esDuplicadoEventoIntegracion(error) {
    return error?.code === '23505' && error?.constraint === UNIQUE_EVENT_CONSTRAINT;
}

async function registrarEventoIntegracion(evento, db = pool) {
    const eventoNormalizado = normalizarEventoIntegracion(evento);
    const existente = await obtenerEventoPorIdentidad(
        db,
        eventoNormalizado.provider,
        eventoNormalizado.external_event_id
    );

    if (existente) {
        return {
            duplicate: true,
            event: existente,
        };
    }

    try {
        const insertado = await insertarEventoIntegracion(db, eventoNormalizado);

        if (insertado) {
            return {
                duplicate: false,
                event: insertado,
            };
        }

        const duplicado = await obtenerEventoPorIdentidad(
            db,
            eventoNormalizado.provider,
            eventoNormalizado.external_event_id
        );

        return {
            duplicate: true,
            event: duplicado,
        };
    } catch (error) {
        if (esDuplicadoEventoIntegracion(error)) {
            const duplicado = await obtenerEventoPorIdentidad(
                db,
                eventoNormalizado.provider,
                eventoNormalizado.external_event_id
            );

            return {
                duplicate: true,
                event: duplicado,
            };
        }

        throw error;
    }
}

function obtenerDashboardCutoffAt(env = process.env) {
    const raw = String(env.INTEGRATION_DASHBOARD_CUTOFF_AT || '').trim();

    if (!raw) {
        return null;
    }

    const fecha = new Date(raw);

    return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function tieneValorOperativo(value) {
    if (value === undefined || value === null) {
        return false;
    }

    if (Array.isArray(value)) {
        return value.length > 0;
    }

    if (typeof value === 'object') {
        return Object.keys(value).length > 0;
    }

    return String(value).trim() !== '';
}

function crearResumenFareHarborSeguro(normalizedData = {}) {
    const booking = normalizedData.booking || {};
    const availability = normalizedData.availability || {};
    const item = availability.item || {};
    const customers = normalizedData.customers || {};
    const money = normalizedData.money || {};
    const pickup = normalizedData.pickup || {};

    return {
        booking: {
            display_id: booking.display_id || null,
            status: booking.status || null,
        },
        availability: {
            start_at: availability.start_at || null,
            end_at: availability.end_at || null,
            item: {
                pk: item.pk || null,
                name: item.name || null,
                headline: item.headline || null,
            },
        },
        customers: {
            total: customers.total ?? null,
            by_category: Array.isArray(customers.by_category)
                ? customers.by_category.map((category) => ({
                    singular: category?.singular || null,
                    plural: category?.plural || null,
                    count: category?.count ?? null,
                }))
                : [],
        },
        money: {
            invoice_price: money.invoice_price ?? null,
            invoice_price_display: money.invoice_price_display || null,
            receipt_total: money.receipt_total ?? null,
            receipt_total_display: money.receipt_total_display || null,
            amount_paid: money.amount_paid ?? null,
            amount_paid_display: money.amount_paid_display || null,
            currency: money.currency || null,
        },
        pickup: {
            pickup_present: tieneValorOperativo(pickup.pickup),
            lodging_present: tieneValorOperativo(pickup.lodging),
            arrival_present: tieneValorOperativo(pickup.arrival),
        },
        fingerprint_present: Boolean(normalizedData.fingerprint),
    };
}

function prepararEventoListadoIntegracion(evento = {}) {
    const {
        normalized_data: normalizedData,
        external_event_id: _externalEventId,
        ...eventoSeguro
    } = evento;

    if (evento.provider === 'fareharbor') {
        return {
            ...eventoSeguro,
            fareharbor_summary: crearResumenFareHarborSeguro(normalizedData || {}),
        };
    }

    return eventoSeguro;
}

function prepararEventoDetalleIntegracion(evento = {}) {
    if (!evento || evento.provider !== 'fareharbor') {
        return evento;
    }

    const { normalized_data: normalizedData, ...eventoSeguro } = evento;

    return {
        ...eventoSeguro,
        fareharbor_summary: crearResumenFareHarborSeguro(normalizedData || {}),
    };
}

function construirFiltrosEventosIntegracion(filtros = {}) {
    const condiciones = [];
    const values = [];

    if (filtros.review_status) {
        values.push(filtros.review_status);
        condiciones.push(`review_status = $${values.length}`);
    }

    if (filtros.provider) {
        values.push(filtros.provider);
        condiciones.push(`provider = $${values.length}`);
    }

    if (filtros.event_type) {
        values.push(filtros.event_type);
        condiciones.push(`event_type = $${values.length}`);
    }

    if (filtros.urgent !== undefined) {
        values.push(filtros.urgent);
        condiciones.push(`urgent = $${values.length}`);
    }

    if (filtros.operational_only) {
        const cutoffAt = obtenerDashboardCutoffAt();

        if (cutoffAt) {
            values.push(cutoffAt);
            condiciones.push(`(provider = 'fareharbor' OR COALESCE(source_received_at, created_at) >= $${values.length})`);
        }

        condiciones.push(`
            (
                provider <> 'fareharbor'
                OR NOT EXISTS (
                    SELECT 1
                    FROM reservas_integracion_link ril
                    WHERE ril.provider = eventos_integracion.provider
                      AND ril.external_booking_id = eventos_integracion.external_booking_id
                )
            )
        `);
    }

    return {
        where: condiciones.length > 0 ? `WHERE ${condiciones.join('\n            AND ')}` : '',
        values,
    };
}

function construirFuenteEventosIntegracion(filtros = {}) {
    const { where, values } = construirFiltrosEventosIntegracion(filtros);

    if (!filtros.operational_only) {
        return {
            prefix: '',
            from: `eventos_integracion ${where}`,
            values,
            orderBy: 'created_at DESC, id_evento_integracion DESC',
        };
    }

    return {
        prefix: `
            WITH eventos_filtrados AS (
                SELECT
                    ${columnasEventoIntegracion},
                    CASE
                        WHEN provider = 'fareharbor' THEN ROW_NUMBER() OVER (
                            PARTITION BY provider, external_booking_id
                            ORDER BY
                                COALESCE(source_received_at, created_at) DESC,
                                id_evento_integracion DESC
                        )
                        ELSE 1
                    END AS operational_row_number
                FROM eventos_integracion
                ${where}
            ),
            eventos_operational AS (
                SELECT *
                FROM eventos_filtrados
                WHERE provider <> 'fareharbor'
                   OR operational_row_number = 1
            )
        `,
        from: 'eventos_operational',
        values,
        orderBy: 'COALESCE(source_received_at, created_at) DESC, id_evento_integracion DESC',
    };
}

function construirRespuestaPaginadaEventosIntegracion({ data, page, limit, total }) {
    return {
        data,
        pagination: {
            page,
            limit,
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / limit),
        },
    };
}

async function contarEventosIntegracion(filtros = {}, db = pool) {
    const fuente = construirFuenteEventosIntegracion(filtros);
    const result = await db.query(
        `
            ${fuente.prefix}
            SELECT COUNT(*)::int AS total
            FROM ${fuente.from}
        `,
        fuente.values
    );

    return Number(result.rows[0]?.total) || 0;
}

async function listarEventosIntegracion(filtros = {}, paginacion = {}, db = pool) {
    const page = paginacion.page || 1;
    const limit = paginacion.limit || 25;
    const total = await contarEventosIntegracion(filtros, db);

    if (total === 0) {
        return construirRespuestaPaginadaEventosIntegracion({
            data: [],
            page,
            limit,
            total,
        });
    }

    const fuente = construirFuenteEventosIntegracion(filtros);
    const queryValues = [...fuente.values, limit, (page - 1) * limit];
    const limitParam = queryValues.length - 1;
    const offsetParam = queryValues.length;
    const result = await db.query(
        `
            ${fuente.prefix}
            SELECT
                ${columnasListadoEventoIntegracion}
            FROM ${fuente.from}
            ORDER BY ${fuente.orderBy}
            LIMIT $${limitParam}
            OFFSET $${offsetParam}
        `,
        queryValues
    );

    return construirRespuestaPaginadaEventosIntegracion({
        data: result.rows.map(prepararEventoListadoIntegracion),
        page,
        limit,
        total,
    });
}

async function obtenerEventoIntegracion(idEventoIntegracion, db = pool) {
    const result = await db.query(
        `
            SELECT
                ${columnasEventoIntegracion}
            FROM eventos_integracion
            WHERE id_evento_integracion = $1
            LIMIT 1
        `,
        [idEventoIntegracion]
    );

    return prepararEventoDetalleIntegracion(result.rows[0] || null);
}

async function obtenerEventoIntegracionCompleto(idEventoIntegracion, db = pool) {
    const result = await db.query(
        `
            SELECT
                ${columnasEventoIntegracion}
            FROM eventos_integracion
            WHERE id_evento_integracion = $1
            LIMIT 1
        `,
        [idEventoIntegracion]
    );

    return result.rows[0] || null;
}

function obtenerReviewStatusDesdeAccion(accion) {
    if (accion === ACCION_APPROVE) {
        return REVIEW_STATUS_APPROVED;
    }

    if (accion === ACCION_DISMISS) {
        return REVIEW_STATUS_DISMISSED;
    }

    throw new Error('Accion de revision no soportada');
}

async function revisarEventoIntegracion({ idEventoIntegracion, accion, idUsuario, nota }, db = pool) {
    const reviewStatus = obtenerReviewStatusDesdeAccion(accion);
    const result = await db.query(
        `
            UPDATE eventos_integracion
            SET
                review_status = $1,
                reviewed_by = $2,
                reviewed_at = CURRENT_TIMESTAMP,
                review_note = $3,
                updated_at = CURRENT_TIMESTAMP
            WHERE id_evento_integracion = $4
              AND review_status = $5
            RETURNING
                ${columnasEventoIntegracion}
        `,
        [
            reviewStatus,
            idUsuario,
            normalizarTextoOpcional(nota),
            idEventoIntegracion,
            REVIEW_STATUS_PENDING,
        ]
    );

    if (result.rows[0]) {
        return {
            tipo: 'revisado',
            event: result.rows[0],
        };
    }

    const existente = await obtenerEventoIntegracion(idEventoIntegracion, db);

    if (!existente) {
        return {
            tipo: 'no_encontrado',
            event: null,
        };
    }

    return {
        tipo: 'ya_revisado',
        event: existente,
    };
}

module.exports = {
    ACCION_APPROVE,
    ACCION_DISMISS,
    REVIEW_STATUS_APPLIED,
    REVIEW_STATUS_APPROVED,
    REVIEW_STATUS_DISMISSED,
    REVIEW_STATUS_PENDING,
    UNIQUE_EVENT_CONSTRAINT,
    construirFuenteEventosIntegracion,
    construirValoresInsertEventoIntegracion,
    crearResumenFareHarborSeguro,
    esDuplicadoEventoIntegracion,
    limpiarSecretos,
    listarEventosIntegracion,
    normalizarEventoIntegracion,
    obtenerDashboardCutoffAt,
    obtenerEventoIntegracionCompleto,
    obtenerEventoIntegracion,
    prepararEventoDetalleIntegracion,
    prepararEventoListadoIntegracion,
    registrarEventoIntegracion,
    revisarEventoIntegracion,
};

