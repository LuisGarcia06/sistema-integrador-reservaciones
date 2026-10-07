-- =========================================================
-- MIGRACION 014: equivalencias de tours externos
-- =========================================================

CREATE TABLE IF NOT EXISTS equivalencias_tours_externos (
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

CREATE UNIQUE INDEX IF NOT EXISTS uq_equivalencias_tours_externos_activa
ON equivalencias_tours_externos (
    LOWER(BTRIM(provider)),
    activity_title_normalizado,
    option_title_normalizado
)
WHERE activo = TRUE;
