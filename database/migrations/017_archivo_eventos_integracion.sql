-- PRE-RELEASE-03. PREPARADA, NO EJECUTADA.
-- Requiere autorización y destino verificado. No ejecutar sobre principal ni DEV
-- durante esta fase. Detener la aplicación antes del despliegue; no hay backfill.
BEGIN;

ALTER TABLE eventos_integracion
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS archived_by INTEGER,
    ADD COLUMN IF NOT EXISTS archive_reason TEXT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'eventos_integracion'::regclass AND conname = 'fk_eventos_integracion_archived_by') THEN
        ALTER TABLE eventos_integracion ADD CONSTRAINT fk_eventos_integracion_archived_by
            FOREIGN KEY (archived_by) REFERENCES usuarios(id_usuario);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'eventos_integracion'::regclass AND conname = 'chk_eventos_integracion_archivo') THEN
        ALTER TABLE eventos_integracion ADD CONSTRAINT chk_eventos_integracion_archivo CHECK (
            (archived_at IS NULL AND archived_by IS NULL AND archive_reason IS NULL)
            OR (archived_at IS NOT NULL AND archived_by IS NOT NULL AND archive_reason IS NOT NULL
                AND char_length(archive_reason) BETWEEN 1 AND 500
                AND archive_reason ~ '[^[:space:]]'
                AND application_status = 'not_applied'
                AND review_status IN ('pending_review', 'approved'))
        );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_eventos_integracion_archived_at
    ON eventos_integracion (archived_at DESC, id_evento_integracion DESC)
    WHERE archived_at IS NOT NULL;
COMMIT;
