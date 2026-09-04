-- =========================================================
-- MIGRACION: 001_catalogos_operativos
-- Sistema Integrador de Reservaciones
-- Community Tours Sian Ka'an
-- =========================================================


-- =========================================================
-- TABLA: vehiculos
-- =========================================================

CREATE TABLE vehiculos (
    id_vehiculo INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    identificador VARCHAR(50) NOT NULL UNIQUE,
    placas VARCHAR(20) UNIQUE,
    color VARCHAR(50),
    capacidad INTEGER NOT NULL,
    estado BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT chk_vehiculos_capacidad
        CHECK (capacidad > 0 AND capacidad <= 12)
);


-- =========================================================
-- TABLA: operadores
-- =========================================================

CREATE TABLE operadores (
    id_operador INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    estado BOOLEAN NOT NULL DEFAULT TRUE
);


-- =========================================================
-- TABLA: guias
-- =========================================================

CREATE TABLE guias (
    id_guia INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    estado BOOLEAN NOT NULL DEFAULT TRUE
);
