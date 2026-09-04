-- =========================================================
-- MIGRACION: 002_operaciones_tour
-- Sistema Integrador de Reservaciones
-- Community Tours Sian Ka'an
-- =========================================================


-- =========================================================
-- TABLA: operaciones_tour
-- =========================================================

CREATE TABLE operaciones_tour (
    id_operacion_tour INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fecha DATE NOT NULL,
    id_tour INTEGER NOT NULL,
    hora_inicio TIME NOT NULL,
    id_guia INTEGER,
    estado VARCHAR(30) NOT NULL,

    CONSTRAINT fk_operaciones_tour_tours
        FOREIGN KEY (id_tour)
        REFERENCES tours(id_tour),

    CONSTRAINT fk_operaciones_tour_guias
        FOREIGN KEY (id_guia)
        REFERENCES guias(id_guia),

    CONSTRAINT uq_operaciones_tour_fecha_tour_hora
        UNIQUE (fecha, id_tour, hora_inicio)
);
