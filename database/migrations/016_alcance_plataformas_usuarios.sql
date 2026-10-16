-- =========================================================
-- MIGRACION 016: alcance de reservaciones por plataforma
-- ACCESS-SCOPE-02: preparacion interna, no habilitar uso real
-- hasta proteger los endpoints en ACCESS-SCOPE-03.
-- Ejecutar solo en un entorno verificado y autorizado.
-- =========================================================

BEGIN;

-- El default inicial conserva all para TODOS los usuarios existentes.
ALTER TABLE usuarios
    ADD COLUMN alcance_plataformas VARCHAR(20) NOT NULL DEFAULT 'all',
    ADD CONSTRAINT chk_usuarios_alcance_plataformas
        CHECK (alcance_plataformas IN ('all', 'selected'));

-- Las nuevas cuentas parten de selected, sin asignaciones.
-- Administrador conserva acceso completo por su rol en el servicio.
ALTER TABLE usuarios
    ALTER COLUMN alcance_plataformas SET DEFAULT 'selected';

CREATE TABLE usuario_plataformas_visibles (
    id_usuario INTEGER NOT NULL,
    id_plataforma INTEGER NOT NULL,

    CONSTRAINT pk_usuario_plataformas_visibles
        PRIMARY KEY (id_usuario, id_plataforma),

    CONSTRAINT fk_usuario_plataformas_visibles_usuarios
        FOREIGN KEY (id_usuario)
        REFERENCES usuarios(id_usuario),

    CONSTRAINT fk_usuario_plataformas_visibles_plataformas
        FOREIGN KEY (id_plataforma)
        REFERENCES plataformas(id_plataforma)
);

COMMIT;
