const pool = require('./database');

// Solo lectura. El backend no debe escuchar ni iniciar workers con el esquema anterior.
async function verificarEsquemaArchivoEventos(db = pool) {
    const result = await db.query(`
        SELECT
            (SELECT COUNT(*)::int FROM pg_attribute
             WHERE attrelid = to_regclass('public.eventos_integracion') AND NOT attisdropped
               AND attname IN ('archived_at', 'archived_by', 'archive_reason')) AS columnas,
            (SELECT COUNT(*)::int FROM pg_constraint
             WHERE conrelid = to_regclass('public.eventos_integracion') AND convalidated
               AND conname IN ('fk_eventos_integracion_archived_by', 'chk_eventos_integracion_archivo')) AS restricciones
    `);
    if (Number(result.rows[0]?.columnas) !== 3 || Number(result.rows[0]?.restricciones) !== 2) {
        throw new Error('Esquema incompatible: se requiere la migración 017 de archivo de eventos. No se ejecutó ninguna migración.');
    }
}

module.exports = { verificarEsquemaArchivoEventos };
