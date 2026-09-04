-- =========================================================
-- MIGRACION: 003_transportes_operacion
-- Sistema Integrador de Reservaciones
-- Community Tours Sian Ka'an
-- =========================================================


-- =========================================================
-- TABLA: transportes_operacion
-- =========================================================

CREATE TABLE transportes_operacion (
    id_transporte_operacion INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_operacion_tour INTEGER NOT NULL,
    id_vehiculo INTEGER,
    id_operador INTEGER,
    observaciones_operador TEXT,
    estado VARCHAR(30) NOT NULL,

    CONSTRAINT fk_transportes_operacion_operaciones_tour
        FOREIGN KEY (id_operacion_tour)
        REFERENCES operaciones_tour(id_operacion_tour),

    CONSTRAINT fk_transportes_operacion_vehiculos
        FOREIGN KEY (id_vehiculo)
        REFERENCES vehiculos(id_vehiculo),

    CONSTRAINT fk_transportes_operacion_operadores
        FOREIGN KEY (id_operador)
        REFERENCES operadores(id_operador),

    CONSTRAINT uq_transportes_operacion_operacion_vehiculo
        UNIQUE (id_operacion_tour, id_vehiculo)
);
