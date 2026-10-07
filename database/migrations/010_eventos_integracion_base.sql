-- =========================================================
-- MIGRACION 010: infraestructura base de eventos_integracion
-- Ejecutar manualmente en PostgreSQL/pgAdmin sobre la base real.
-- =========================================================

CREATE TABLE IF NOT EXISTS eventos_integracion (
    id_evento_integracion INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    provider VARCHAR(50) NOT NULL,
    external_event_id VARCHAR(255) NOT NULL,
    external_thread_id VARCHAR(255),
    external_booking_id VARCHAR(100),

    event_type VARCHAR(50) NOT NULL,
    urgent BOOLEAN NOT NULL DEFAULT FALSE,
    review_status VARCHAR(30) NOT NULL DEFAULT 'pending_review',

    normalized_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_subject TEXT,
    source_received_at TIMESTAMP,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_eventos_integracion_review_status
        CHECK (review_status IN ('pending_review', 'dismissed', 'approved', 'applied')),

    CONSTRAINT uq_eventos_integracion_provider_external_event
        UNIQUE (provider, external_event_id)
);

CREATE INDEX IF NOT EXISTS idx_eventos_integracion_provider_booking
ON eventos_integracion (provider, external_booking_id);