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

CREATE UNIQUE INDEX uq_paises_nombre_normalizado
ON paises (LOWER(TRIM(nombre)));


-- =========================================================
-- TABLA: plataformas
-- =========================================================

CREATE TABLE plataformas (
    id_plataforma INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL
);

CREATE UNIQUE INDEX uq_plataformas_nombre_normalizado
ON plataformas (LOWER(TRIM(nombre)));


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
    turno VARCHAR(10) NOT NULL,
    numero_grupo INTEGER NOT NULL,
    id_guia INTEGER,
    estado VARCHAR(30) NOT NULL,

    CONSTRAINT fk_operaciones_tour_tours
        FOREIGN KEY (id_tour)
        REFERENCES tours(id_tour),

    CONSTRAINT fk_operaciones_tour_guias
        FOREIGN KEY (id_guia)
        REFERENCES guias(id_guia),

    CONSTRAINT chk_operaciones_tour_turno
        CHECK (turno IN ('Mañana', 'Tarde')),

    CONSTRAINT chk_operaciones_tour_numero_grupo
        CHECK (numero_grupo >= 1 AND numero_grupo <= 2),

    CONSTRAINT uq_operaciones_tour_fecha_tour_turno_grupo
        UNIQUE (fecha, id_tour, turno, numero_grupo)
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

    CONSTRAINT uq_transportes_operacion_operacion
        UNIQUE (id_operacion_tour),

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
    turno VARCHAR(10),
    idioma VARCHAR(50),
    notificado BOOLEAN DEFAULT FALSE,

    precio_total NUMERIC(10,2) NOT NULL,
    deposito NUMERIC(10,2),
    saldo NUMERIC(10,2),
    tipo_cambio NUMERIC(10,2),

    metodo_pago VARCHAR(50),
    vendedor VARCHAR(120),
    observaciones TEXT,
    motivo_cancelacion TEXT,
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
        REFERENCES transportes_operacion(id_transporte_operacion),

    CONSTRAINT chk_reservaciones_turno
        CHECK (turno IS NULL OR turno IN ('Mañana', 'Tarde')),

    CONSTRAINT chk_reservaciones_idioma_no_vacio
        CHECK (idioma IS NULL OR BTRIM(idioma) <> ''),

    CONSTRAINT chk_reservaciones_motivo_cancelacion_no_vacio
        CHECK (motivo_cancelacion IS NULL OR BTRIM(motivo_cancelacion) <> '')
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
-- TABLA: eventos_integracion
-- =========================================================

CREATE TABLE eventos_integracion (
    id_evento_integracion INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    provider VARCHAR(50) NOT NULL,
    external_event_id VARCHAR(255) NOT NULL,
    external_thread_id VARCHAR(255),
    external_booking_id VARCHAR(100),

    event_type VARCHAR(50) NOT NULL,
    urgent BOOLEAN NOT NULL DEFAULT FALSE,
    review_status VARCHAR(30) NOT NULL DEFAULT 'pending_review',
    application_status VARCHAR(30) NOT NULL DEFAULT 'not_applied',
    applied_by INTEGER,
    applied_at TIMESTAMP,
    reviewed_by INTEGER,
    reviewed_at TIMESTAMP,
    review_note TEXT,

    normalized_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_subject TEXT,
    source_received_at TIMESTAMP,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_eventos_integracion_review_status
        CHECK (review_status IN ('pending_review', 'dismissed', 'approved', 'applied')),

    CONSTRAINT fk_eventos_integracion_reviewed_by
        FOREIGN KEY (reviewed_by)
        REFERENCES usuarios(id_usuario),

    CONSTRAINT fk_eventos_integracion_applied_by
        FOREIGN KEY (applied_by)
        REFERENCES usuarios(id_usuario),

    CONSTRAINT chk_eventos_integracion_application_status
        CHECK (application_status IN ('not_applied', 'applied')),

    CONSTRAINT uq_eventos_integracion_provider_external_event
        UNIQUE (provider, external_event_id)
);

CREATE INDEX idx_eventos_integracion_provider_booking
ON eventos_integracion (provider, external_booking_id);





-- =========================================================
-- TABLA: reservas_integracion_link
-- =========================================================

CREATE TABLE reservas_integracion_link (
    id_reserva_integracion_link INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    provider VARCHAR(50) NOT NULL,
    external_booking_id VARCHAR(100) NOT NULL,
    id_reservacion INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_reservas_integracion_link_reservaciones
        FOREIGN KEY (id_reservacion)
        REFERENCES reservaciones(id_reservacion),

    CONSTRAINT uq_reservas_integracion_link_provider_booking
        UNIQUE (provider, external_booking_id),

    CONSTRAINT uq_reservas_integracion_link_reservacion
        UNIQUE (id_reservacion)
);


-- =========================================================
-- TABLA: equivalencias_tours_externos
-- =========================================================

CREATE TABLE equivalencias_tours_externos (
    id_equivalencia_tour_externo INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    provider VARCHAR(50) NOT NULL,
    activity_title TEXT NOT NULL,
    option_title TEXT NOT NULL,
    activity_title_normalizado TEXT NOT NULL,
    option_title_normalizado TEXT NOT NULL,

    id_tour INTEGER NOT NULL,
    turno VARCHAR(10) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    notas TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_equivalencias_tours_externos_tours
        FOREIGN KEY (id_tour)
        REFERENCES tours(id_tour),

    CONSTRAINT chk_equivalencias_tours_externos_turno
        CHECK (turno IN ('Mañana', 'Tarde')),

    CONSTRAINT chk_equivalencias_tours_externos_provider_no_vacio
        CHECK (BTRIM(provider) <> ''),

    CONSTRAINT chk_equivalencias_tours_externos_activity_title_no_vacio
        CHECK (BTRIM(activity_title) <> ''),

    CONSTRAINT chk_equivalencias_tours_externos_option_title_no_vacio
        CHECK (BTRIM(option_title) <> ''),

    CONSTRAINT chk_equivalencias_tours_externos_activity_title_normalizado_no_vacio
        CHECK (BTRIM(activity_title_normalizado) <> ''),

    CONSTRAINT chk_equivalencias_tours_externos_option_title_normalizado_no_vacio
        CHECK (BTRIM(option_title_normalizado) <> '')
);

CREATE UNIQUE INDEX uq_equivalencias_tours_externos_activa
ON equivalencias_tours_externos (
    LOWER(BTRIM(provider)),
    activity_title_normalizado,
    option_title_normalizado
)
WHERE activo = TRUE;
-- =========================================================
-- TABLA: integracion_sync_estado
-- =========================================================

CREATE TABLE integracion_sync_estado (
    id_integracion_sync_estado INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    provider VARCHAR(50) NOT NULL,
    source VARCHAR(50) NOT NULL,
    last_history_id VARCHAR(100) NOT NULL,
    last_successful_sync_at TIMESTAMP,
    last_error_at TIMESTAMP,
    last_error_code VARCHAR(100),

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_integracion_sync_estado_provider_source
        UNIQUE (provider, source)
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
