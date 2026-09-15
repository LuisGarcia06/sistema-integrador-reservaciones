-- =========================================================
-- MIGRACION: 007_turno_reservaciones
-- Sistema Integrador de Reservaciones
-- Community Tours Sian Ka'an
-- =========================================================

BEGIN;

ALTER TABLE reservaciones
    ADD COLUMN turno VARCHAR(10);

UPDATE reservaciones r
SET turno = ot.turno
FROM transportes_operacion tr
INNER JOIN operaciones_tour ot
    ON ot.id_operacion_tour = tr.id_operacion_tour
WHERE r.id_transporte_operacion = tr.id_transporte_operacion
    AND r.turno IS NULL;

ALTER TABLE reservaciones
    ADD CONSTRAINT chk_reservaciones_turno
        CHECK (turno IS NULL OR turno IN ('Mañana', 'Tarde'));

COMMIT;
