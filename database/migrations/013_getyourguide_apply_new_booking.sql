-- =========================================================
-- MIGRACION 013: aplicar eventos GetYourGuide new_booking
-- Ejecutar manualmente en PostgreSQL/pgAdmin sobre la base real.
-- =========================================================

ALTER TABLE eventos_integracion
    ADD COLUMN IF NOT EXISTS application_status VARCHAR(30) NOT NULL DEFAULT 'not_applied';

ALTER TABLE eventos_integracion
    ADD COLUMN IF NOT EXISTS applied_by INTEGER;

ALTER TABLE eventos_integracion
    ADD COLUMN IF NOT EXISTS applied_at TIMESTAMP;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_eventos_integracion_applied_by'
    ) THEN
        ALTER TABLE eventos_integracion
            ADD CONSTRAINT fk_eventos_integracion_applied_by
            FOREIGN KEY (applied_by)
            REFERENCES usuarios(id_usuario);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_eventos_integracion_application_status'
    ) THEN
        ALTER TABLE eventos_integracion
            ADD CONSTRAINT chk_eventos_integracion_application_status
            CHECK (application_status IN ('not_applied', 'applied'));
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS reservas_integracion_link (
    id_reserva_integracion_link INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    provider VARCHAR(50) NOT NULL,
    external_booking_id VARCHAR(100) NOT NULL,
    id_reservacion INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_reservas_integracion_link_reservaciones
        FOREIGN KEY (id_reservacion)
        REFERENCES reservaciones(id_reservacion),

    CONSTRAINT uq_reservas_integracion_link_provider_booking
        UNIQUE (provider, external_booking_id),

    CONSTRAINT uq_reservas_integracion_link_reservacion
        UNIQUE (id_reservacion)
);
