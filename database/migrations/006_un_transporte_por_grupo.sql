-- =========================================================
-- MIGRACION: 006_un_transporte_por_grupo
-- Sistema Integrador de Reservaciones
-- Community Tours Sian Ka'an
-- =========================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM transportes_operacion
        GROUP BY id_operacion_tour
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'No se puede completar la migración: existen operaciones con más de un transporte';
    END IF;
END $$;

ALTER TABLE transportes_operacion
    ADD CONSTRAINT uq_transportes_operacion_operacion
        UNIQUE (id_operacion_tour);

COMMIT;
