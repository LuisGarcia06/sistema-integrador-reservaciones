-- =========================================================
-- MIGRACION: 009_campos_reservacion_validacion_usuarios
-- Sistema Integrador de Reservaciones
-- Community Tours Sian Ka'an
-- =========================================================

BEGIN;

ALTER TABLE reservaciones
    ADD COLUMN idioma VARCHAR(50),
    ADD COLUMN notificado BOOLEAN,
    ADD COLUMN motivo_cancelacion TEXT;

ALTER TABLE reservaciones
    ADD CONSTRAINT chk_reservaciones_idioma_no_vacio
        CHECK (idioma IS NULL OR BTRIM(idioma) <> ''),
    ADD CONSTRAINT chk_reservaciones_motivo_cancelacion_no_vacio
        CHECK (motivo_cancelacion IS NULL OR BTRIM(motivo_cancelacion) <> '');

ALTER TABLE reservaciones
    ALTER COLUMN notificado SET DEFAULT FALSE;

COMMIT;
