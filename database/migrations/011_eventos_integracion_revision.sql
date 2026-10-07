-- =========================================================
-- MIGRACION 011: metadatos de revision para eventos_integracion
-- Ejecutar manualmente en PostgreSQL/pgAdmin sobre la base real.
-- =========================================================

ALTER TABLE eventos_integracion
    ADD COLUMN IF NOT EXISTS reviewed_by INTEGER;

ALTER TABLE eventos_integracion
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;

ALTER TABLE eventos_integracion
    ADD COLUMN IF NOT EXISTS review_note TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_eventos_integracion_reviewed_by'
    ) THEN
        ALTER TABLE eventos_integracion
            ADD CONSTRAINT fk_eventos_integracion_reviewed_by
            FOREIGN KEY (reviewed_by)
            REFERENCES usuarios(id_usuario);
    END IF;
END $$;
