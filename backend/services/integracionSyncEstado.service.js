const pool = require('../config/database');

const DEFAULT_PROVIDER = 'getyourguide';
const DEFAULT_SOURCE = 'gmail';

const columnasEstadoSync = `
    id_integracion_sync_estado,
    provider,
    source,
    last_history_id,
    last_successful_sync_at,
    last_error_at,
    last_error_code,
    recovery_active,
    recovery_page_token,
    recovery_target_history_id,
    recovery_started_at,
    backoff_until,
    created_at,
    updated_at
`;

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

    return String(valor).trim().slice(0, 100) || null;
}

async function obtenerEstadoSync({ provider = DEFAULT_PROVIDER, source = DEFAULT_SOURCE } = {}, db = pool) {
    const result = await db.query(
        `
            SELECT
                ${columnasEstadoSync}
            FROM integracion_sync_estado
            WHERE provider = $1
              AND source = $2
            LIMIT 1
        `,
        [provider, source]
    );

    return result.rows[0] || null;
}

async function guardarBaselineSync({
    provider = DEFAULT_PROVIDER,
    source = DEFAULT_SOURCE,
    lastHistoryId,
} = {}, db = pool) {
    const result = await db.query(
        `
            INSERT INTO integracion_sync_estado (
                provider,
                source,
                last_history_id,
                last_successful_sync_at,
                recovery_active,
                recovery_page_token,
                recovery_target_history_id,
                recovery_started_at,
                backoff_until,
                created_at,
                updated_at
            )
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP, FALSE, NULL, NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (provider, source)
            DO UPDATE SET
                last_history_id = EXCLUDED.last_history_id,
                last_successful_sync_at = CURRENT_TIMESTAMP,
                last_error_at = NULL,
                last_error_code = NULL,
                recovery_active = FALSE,
                recovery_page_token = NULL,
                recovery_target_history_id = NULL,
                recovery_started_at = NULL,
                backoff_until = NULL,
                updated_at = CURRENT_TIMESTAMP
            RETURNING
                ${columnasEstadoSync}
        `,
        [
            normalizarTextoObligatorio(provider, 'provider'),
            normalizarTextoObligatorio(source, 'source'),
            normalizarTextoObligatorio(lastHistoryId, 'lastHistoryId'),
        ]
    );

    return result.rows[0];
}

async function actualizarSyncExitoso({
    provider = DEFAULT_PROVIDER,
    source = DEFAULT_SOURCE,
    lastHistoryId,
} = {}, db = pool) {
    return guardarBaselineSync({ provider, source, lastHistoryId }, db);
}

async function registrarErrorSync({
    provider = DEFAULT_PROVIDER,
    source = DEFAULT_SOURCE,
    errorCode,
} = {}, db = pool) {
    const result = await db.query(
        `
            UPDATE integracion_sync_estado
            SET
                last_error_at = CURRENT_TIMESTAMP,
                last_error_code = $3,
                updated_at = CURRENT_TIMESTAMP
            WHERE provider = $1
              AND source = $2
            RETURNING
                ${columnasEstadoSync}
        `,
        [
            normalizarTextoObligatorio(provider, 'provider'),
            normalizarTextoObligatorio(source, 'source'),
            normalizarTextoOpcional(errorCode),
        ]
    );

    return result.rows[0] || null;
}

async function iniciarRecoverySync({
    provider = DEFAULT_PROVIDER,
    source = DEFAULT_SOURCE,
    recoveryTargetHistoryId,
} = {}, db = pool) {
    const result = await db.query(
        `
            UPDATE integracion_sync_estado
            SET
                recovery_active = TRUE,
                recovery_page_token = NULL,
                recovery_target_history_id = $3,
                recovery_started_at = CURRENT_TIMESTAMP,
                backoff_until = NULL,
                last_error_at = NULL,
                last_error_code = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE provider = $1
              AND source = $2
            RETURNING
                ${columnasEstadoSync}
        `,
        [
            normalizarTextoObligatorio(provider, 'provider'),
            normalizarTextoObligatorio(source, 'source'),
            normalizarTextoObligatorio(recoveryTargetHistoryId, 'recoveryTargetHistoryId'),
        ]
    );

    return result.rows[0] || null;
}

async function guardarCheckpointRecoverySync({
    provider = DEFAULT_PROVIDER,
    source = DEFAULT_SOURCE,
    recoveryPageToken,
} = {}, db = pool) {
    const result = await db.query(
        `
            UPDATE integracion_sync_estado
            SET
                recovery_active = TRUE,
                recovery_page_token = $3,
                updated_at = CURRENT_TIMESTAMP
            WHERE provider = $1
              AND source = $2
              AND recovery_active = TRUE
            RETURNING
                ${columnasEstadoSync}
        `,
        [
            normalizarTextoObligatorio(provider, 'provider'),
            normalizarTextoObligatorio(source, 'source'),
            normalizarTextoObligatorio(recoveryPageToken, 'recoveryPageToken'),
        ]
    );

    return result.rows[0] || null;
}

async function finalizarRecoverySync({
    provider = DEFAULT_PROVIDER,
    source = DEFAULT_SOURCE,
    lastHistoryId,
} = {}, db = pool) {
    return guardarBaselineSync({ provider, source, lastHistoryId }, db);
}

async function registrarBackoffRecoverySync({
    provider = DEFAULT_PROVIDER,
    source = DEFAULT_SOURCE,
    errorCode,
    backoffUntil,
} = {}, db = pool) {
    const result = await db.query(
        `
            UPDATE integracion_sync_estado
            SET
                last_error_at = CURRENT_TIMESTAMP,
                last_error_code = $3,
                backoff_until = $4,
                updated_at = CURRENT_TIMESTAMP
            WHERE provider = $1
              AND source = $2
              AND recovery_active = TRUE
            RETURNING
                ${columnasEstadoSync}
        `,
        [
            normalizarTextoObligatorio(provider, 'provider'),
            normalizarTextoObligatorio(source, 'source'),
            normalizarTextoOpcional(errorCode),
            backoffUntil,
        ]
    );

    return result.rows[0] || null;
}

// Cursor incremental independiente; conserva el recovery historico de source=gmail.
async function guardarCheckpointIncrementalSync({ lastHistoryId, pageToken = null, completed = false } = {}, db = pool) {
    const result = await db.query(`INSERT INTO integracion_sync_estado
        (provider,source,last_history_id,recovery_page_token,last_successful_sync_at)
        VALUES ($1,$2,$3,$4,CASE WHEN $5 THEN CURRENT_TIMESTAMP END)
        ON CONFLICT (provider,source) DO UPDATE SET
            last_history_id=EXCLUDED.last_history_id, recovery_page_token=EXCLUDED.recovery_page_token,
            last_successful_sync_at=CASE WHEN $5 THEN CURRENT_TIMESTAMP ELSE integracion_sync_estado.last_successful_sync_at END,
            last_error_at=NULL,last_error_code=NULL,backoff_until=NULL,updated_at=CURRENT_TIMESTAMP
        RETURNING ${columnasEstadoSync}`,
    ['getyourguide', 'gmail_recent', normalizarTextoObligatorio(lastHistoryId, 'lastHistoryId'), pageToken, completed]);
    return result.rows[0];
}

async function registrarBackoffIncrementalSync({ errorCode, backoffUntil } = {}, db = pool) {
    await db.query(`UPDATE integracion_sync_estado SET last_error_at=CURRENT_TIMESTAMP,
        last_error_code=$3,backoff_until=$4,updated_at=CURRENT_TIMESTAMP WHERE provider=$1 AND source=$2`,
    ['getyourguide', 'gmail_recent', normalizarTextoOpcional(errorCode), backoffUntil]);
}

async function reflejarSyncRecienteExitoso(db = pool) {
    // Compatibilidad con Electron instalado; conserva los cursores historicos.
    await db.query(`UPDATE integracion_sync_estado SET last_successful_sync_at=CURRENT_TIMESTAMP,
        last_error_at=NULL,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP WHERE provider=$1 AND source=$2`,
    ['getyourguide', 'gmail']);
}

module.exports = {
    DEFAULT_PROVIDER,
    DEFAULT_SOURCE,
    actualizarSyncExitoso,
    finalizarRecoverySync,
    guardarBaselineSync,
    guardarCheckpointRecoverySync,
    iniciarRecoverySync,
    obtenerEstadoSync,
    registrarBackoffRecoverySync,
    registrarErrorSync,
    guardarCheckpointIncrementalSync,
    registrarBackoffIncrementalSync,
    reflejarSyncRecienteExitoso,
};
