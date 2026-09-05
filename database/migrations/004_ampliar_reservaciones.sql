-- =========================================================
-- MIGRACION: 004_ampliar_reservaciones
-- Sistema Integrador de Reservaciones
-- Community Tours Sian Ka'an
-- =========================================================


-- =========================================================
-- TABLA: reservaciones
-- =========================================================

ALTER TABLE reservaciones
    ADD COLUMN telefono_cliente VARCHAR(30),
    ADD COLUMN observaciones TEXT,
    ADD COLUMN vendedor VARCHAR(120),
    ADD COLUMN id_transporte_operacion INTEGER;

ALTER TABLE reservaciones
    ADD CONSTRAINT fk_reservaciones_transportes_operacion
        FOREIGN KEY (id_transporte_operacion)
        REFERENCES transportes_operacion(id_transporte_operacion);
