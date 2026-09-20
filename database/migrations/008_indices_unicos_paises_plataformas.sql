-- =========================================================
-- MIGRACION: 008_indices_unicos_paises_plataformas
-- Sistema Integrador de Reservaciones
-- Community Tours Sian Ka'an
-- =========================================================

CREATE UNIQUE INDEX uq_paises_nombre_normalizado
ON paises (LOWER(TRIM(nombre)));

CREATE UNIQUE INDEX uq_plataformas_nombre_normalizado
ON plataformas (LOWER(TRIM(nombre)));
