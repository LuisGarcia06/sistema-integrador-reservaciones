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
    correo VARCHAR(100) NOT NULL UNIQUE,
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
    telefono_cliente VARCHAR(30),
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
    vendedor VARCHAR(120),
    observaciones TEXT,
    id_transporte_operacion INTEGER,
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
        REFERENCES plataformas(id_plataforma),

    CONSTRAINT fk_reservaciones_transportes_operacion
        FOREIGN KEY (id_transporte_operacion)
        REFERENCES transportes_operacion(id_transporte_operacion)
);


-- =========================================================
-- TABLA: daily_observaciones
-- =========================================================

CREATE TABLE daily_observaciones (
    id_daily_observacion INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fecha DATE NOT NULL UNIQUE,
    observaciones TEXT NOT NULL,
    ultima_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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
