-- =========================================================
-- MIGRACION 015: checkpoint de recovery GetYourGuide Gmail
-- =========================================================

ALTER TABLE integracion_sync_estado
    ADD COLUMN IF NOT EXISTS recovery_active BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE integracion_sync_estado
    ADD COLUMN IF NOT EXISTS recovery_page_token TEXT;

ALTER TABLE integracion_sync_estado
    ADD COLUMN IF NOT EXISTS recovery_target_history_id VARCHAR(100);

ALTER TABLE integracion_sync_estado
    ADD COLUMN IF NOT EXISTS recovery_started_at TIMESTAMP;

ALTER TABLE integracion_sync_estado
    ADD COLUMN IF NOT EXISTS backoff_until TIMESTAMP;
