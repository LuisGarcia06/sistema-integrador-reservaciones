-- =========================================================
-- MIGRACION 012: estado de sincronizacion Gmail GetYourGuide
-- Ejecutar manualmente en PostgreSQL/pgAdmin sobre la base real.
-- =========================================================

CREATE TABLE IF NOT EXISTS integracion_sync_estado (
    id_integracion_sync_estado INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    provider VARCHAR(50) NOT NULL,
    source VARCHAR(50) NOT NULL,
    last_history_id VARCHAR(100) NOT NULL,
    last_successful_sync_at TIMESTAMP,
    last_error_at TIMESTAMP,
    last_error_code VARCHAR(100),

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_integracion_sync_estado_provider_source
        UNIQUE (provider, source)
);
