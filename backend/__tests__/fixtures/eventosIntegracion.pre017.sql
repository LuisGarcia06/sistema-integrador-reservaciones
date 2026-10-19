-- Fixture de componente exclusivamente sintético anterior a 017.
-- Solo para una BD nueva, vacía y desechable; no representa el esquema completo del producto.
CREATE TABLE usuarios (id_usuario INTEGER PRIMARY KEY, nombre TEXT NOT NULL);
CREATE TABLE reservaciones (id_reservacion INTEGER PRIMARY KEY, estado TEXT NOT NULL);
CREATE TABLE eventos_integracion (
    id_evento_integracion INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider VARCHAR(50) NOT NULL, external_event_id VARCHAR(255) NOT NULL,
    external_thread_id VARCHAR(255), external_booking_id VARCHAR(100),
    event_type VARCHAR(50) NOT NULL, urgent BOOLEAN NOT NULL DEFAULT FALSE,
    review_status VARCHAR(30) NOT NULL DEFAULT 'pending_review',
    application_status VARCHAR(30) NOT NULL DEFAULT 'not_applied',
    applied_by INTEGER, applied_at TIMESTAMP, reviewed_by INTEGER, reviewed_at TIMESTAMP, review_note TEXT,
    normalized_data JSONB NOT NULL DEFAULT '{}'::jsonb, source_subject TEXT, source_received_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_eventos_integracion_provider_external_event UNIQUE (provider, external_event_id),
    CHECK (review_status IN ('pending_review', 'approved', 'dismissed', 'applied')),
    CHECK (application_status IN ('not_applied', 'applied'))
);
CREATE TABLE reservas_integracion_link (
    provider VARCHAR(50) NOT NULL, external_booking_id VARCHAR(100) NOT NULL,
    id_reservacion INTEGER NOT NULL REFERENCES reservaciones,
    UNIQUE (provider, external_booking_id)
);
