-- =========================================================
-- SISTEMA INTEGRADOR DE RESERVACIONES
-- Community Tours Sian Ka'an
-- Datos iniciales
-- =========================================================


-- =========================================================
-- ROLES
-- =========================================================

INSERT INTO roles (nombre, descripcion)
VALUES
    ('Administrador', 'Usuario con permisos completos'),
    ('Consulta', 'Usuario con permisos de solo lectura');


-- =========================================================
-- PLATAFORMAS
-- =========================================================

INSERT INTO plataformas (nombre)
VALUES
    ('FareHarbor'),
    ('GetYourGuide'),
    ('WhatsApp Business'),
    ('Externa');

    