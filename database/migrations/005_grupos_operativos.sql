-- =========================================================
-- MIGRACION: 005_grupos_operativos
-- Sistema Integrador de Reservaciones
-- Community Tours Sian Ka'an
-- =========================================================

BEGIN;

ALTER TABLE operaciones_tour
    ADD COLUMN turno VARCHAR(10),
    ADD COLUMN numero_grupo INTEGER;

UPDATE operaciones_tour
SET turno = CASE
    WHEN hora_inicio <= TIME '12:00' THEN 'Mañana'
    ELSE 'Tarde'
END
WHERE turno IS NULL;

DO $$
BEGIN
    IF EXISTS (
        WITH operaciones_numeradas AS (
            SELECT
                id_operacion_tour,
                ROW_NUMBER() OVER (
                    PARTITION BY fecha, id_tour, turno
                    ORDER BY hora_inicio ASC, id_operacion_tour ASC
                ) AS numero_grupo_calculado
            FROM operaciones_tour
        )
        SELECT 1
        FROM operaciones_numeradas
        WHERE numero_grupo_calculado > 2
    ) THEN
        RAISE EXCEPTION 'No se puede completar la migración: existen más de 2 grupos históricos para una misma fecha, tour y turno';
    END IF;
END $$;

WITH operaciones_numeradas AS (
    SELECT
        id_operacion_tour,
        ROW_NUMBER() OVER (
            PARTITION BY fecha, id_tour, turno
            ORDER BY hora_inicio ASC, id_operacion_tour ASC
        ) AS numero_grupo_calculado
    FROM operaciones_tour
)
UPDATE operaciones_tour ot
SET numero_grupo = operaciones_numeradas.numero_grupo_calculado
FROM operaciones_numeradas
WHERE ot.id_operacion_tour = operaciones_numeradas.id_operacion_tour;

ALTER TABLE operaciones_tour
    ALTER COLUMN turno SET NOT NULL,
    ALTER COLUMN numero_grupo SET NOT NULL,
    ADD CONSTRAINT chk_operaciones_tour_turno
        CHECK (turno IN ('Mañana', 'Tarde')),
    ADD CONSTRAINT chk_operaciones_tour_numero_grupo
        CHECK (numero_grupo >= 1 AND numero_grupo <= 2);

ALTER TABLE operaciones_tour
    DROP CONSTRAINT uq_operaciones_tour_fecha_tour_hora;

ALTER TABLE operaciones_tour
    ADD CONSTRAINT uq_operaciones_tour_fecha_tour_turno_grupo
        UNIQUE (fecha, id_tour, turno, numero_grupo);

COMMIT;
