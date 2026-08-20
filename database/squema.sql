-- =========================================================
-- SISTEMA INTEGRADOR DE RESERVACIONES
-- Community Tours Sian Ka'an
-- PostgreSQL
-- =========================================================


-- =========================================================
-- TABLA: roles
-- =========================================================

CREATE TABLE roles (
    id_rol INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    descripcion VARCHAR(100)
);


-- =========================================================
-- TABLA: usuarios
-- =========================================================

CREATE TABLE usuarios (
    id_usuario INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_rol INTEGER NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    correo VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    estado BOOLEAN NOT NULL,

    CONSTRAINT fk_usuarios_roles
        FOREIGN KEY (id_rol)
        REFERENCES roles(id_rol)
);


-- =========================================================
-- TABLA: tours
-- =========================================================

CREATE TABLE tours (
    id_tour INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT NOT NULL,
    activo BOOLEAN NOT NULL
);


-- =========================================================
-- TABLA: paises
-- =========================================================

CREATE TABLE paises (
    id_pais INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL
);


-- =========================================================
-- TABLA: plataformas
-- =========================================================

CREATE TABLE plataformas (
    id_plataforma INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL
);


-- =========================================================
-- TABLA: reservaciones
-- =========================================================

CREATE TABLE reservaciones (
    id_reservacion INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    codigo VARCHAR(30) NOT NULL UNIQUE,
    fecha DATE NOT NULL,

    id_tour INTEGER NOT NULL,
    id_pais INTEGER NOT NULL,
    id_plataforma INTEGER NOT NULL,

    nombre_cliente VARCHAR(120) NOT NULL,
    habitacion VARCHAR(50),

    pax INTEGER NOT NULL,
    ninos INTEGER,

    pickup_place VARCHAR(120) NOT NULL,
    pickup_time TIME NOT NULL,

    precio_total NUMERIC(10,2) NOT NULL,
    deposito NUMERIC(10,2),
    saldo NUMERIC(10,2),
    tipo_cambio NUMERIC(10,2),

    metodo_pago VARCHAR(50),
    estado VARCHAR(30) NOT NULL,

    fecha_registro TIMESTAMP NOT NULL,
    ultima_actualizacion TIMESTAMP NOT NULL,

    CONSTRAINT fk_reservaciones_tours
        FOREIGN KEY (id_tour)
        REFERENCES tours(id_tour),

    CONSTRAINT fk_reservaciones_paises
        FOREIGN KEY (id_pais)
        REFERENCES paises(id_pais),

    CONSTRAINT fk_reservaciones_plataformas
        FOREIGN KEY (id_plataforma)
        REFERENCES plataformas(id_plataforma)
);


-- =========================================================
-- TABLA: bitacora
-- =========================================================

CREATE TABLE bitacora (
    id_bitacora INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    id_usuario INTEGER NOT NULL,
    id_reservacion INTEGER NOT NULL,

    accion VARCHAR(255) NOT NULL,
    descripcion TEXT,
    fecha TIMESTAMP NOT NULL,

    CONSTRAINT fk_bitacora_usuarios
        FOREIGN KEY (id_usuario)
        REFERENCES usuarios(id_usuario),

    CONSTRAINT fk_bitacora_reservaciones
        FOREIGN KEY (id_reservacion)
        REFERENCES reservaciones(id_reservacion)
);