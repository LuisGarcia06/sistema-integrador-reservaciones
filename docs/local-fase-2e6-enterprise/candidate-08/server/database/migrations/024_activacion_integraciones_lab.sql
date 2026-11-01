-- PROPUESTA EXPERIMENTAL 2E.3. Sólo clúster sintético nuevo; no migración empresarial.
-- Reutiliza estado, eventos, vínculos y equivalencias. No redefine Gmail/publicación.
BEGIN;
SET LOCAL lock_timeout='2s';
ALTER TABLE public.integracion_sync_estado
 ADD COLUMN first_activation_at timestamptz,
 ADD COLUMN activation_user integer REFERENCES public.usuarios(id_usuario),
 ADD COLUMN activation_reason text,
 ADD COLUMN automation_enabled boolean NOT NULL DEFAULT false,
 ADD COLUMN authorized_user integer REFERENCES public.usuarios(id_usuario),
 ADD COLUMN authorized_cv bigint,
 ADD COLUMN authorized_epoch uuid,
 ADD COLUMN confirmed_through timestamptz,
 ADD COLUMN attempt_at timestamptz,
 ADD COLUMN attempt_result text,
 ADD COLUMN pending_error text,
 ADD COLUMN retry_after timestamptz,
 ADD COLUMN run_id uuid,
 ADD COLUMN run_instance uuid,
 ADD COLUMN run_until timestamptz,
 ADD COLUMN pending_window jsonb;
CREATE SCHEMA ctsk_sync024 AUTHORIZATION ctsk_standalone_owner;
REVOKE ALL ON SCHEMA ctsk_sync024 FROM PUBLIC;
GRANT USAGE ON SCHEMA ctsk_sync024 TO ctsk_standalone_runtime;
CREATE TABLE ctsk_sync024.admin_receipts (
 actor integer NOT NULL REFERENCES public.usuarios(id_usuario),
 command_id uuid NOT NULL,
 fingerprint character(64) NOT NULL,
 result jsonb NOT NULL,
 audit_id integer REFERENCES public.bitacora(id_bitacora),
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(actor,command_id)
);
CREATE TABLE ctsk_sync024.booking_state (
 provider varchar(50) NOT NULL,
 external_booking_id varchar(100) NOT NULL,
 link_id integer NOT NULL UNIQUE REFERENCES public.reservas_integracion_link(id_reserva_integracion_link),
 original_created_at timestamptz NOT NULL,
 external_digest character(64) NOT NULL,
 revision bigint NOT NULL DEFAULT 1,
 internal_snapshot jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(provider,external_booking_id)
);
CREATE FUNCTION ctsk_sync024.protect_cutoff() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $cut024$
BEGIN
 IF OLD.source='automation024' THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'ACTIVATION_IMMUTABLE_024'; END IF;
  IF NEW.source IS DISTINCT FROM OLD.source OR NEW.provider IS DISTINCT FROM OLD.provider
   OR OLD.first_activation_at IS NOT NULL AND
    (NEW.first_activation_at IS DISTINCT FROM OLD.first_activation_at
     OR NEW.activation_user IS DISTINCT FROM OLD.activation_user
     OR NEW.activation_reason IS DISTINCT FROM OLD.activation_reason)
   THEN RAISE EXCEPTION 'ACTIVATION_IMMUTABLE_024'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $cut024$;
CREATE TRIGGER protect_first_activation_024 BEFORE UPDATE OR DELETE ON public.integracion_sync_estado
 FOR EACH ROW EXECUTE FUNCTION ctsk_sync024.protect_cutoff();
ALTER TABLE public.integracion_sync_estado ENABLE ALWAYS TRIGGER protect_first_activation_024;
CREATE FUNCTION ctsk_sync024.immutable_receipt() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $receipt024$
BEGIN RAISE EXCEPTION 'RECEIPT_IMMUTABLE_024'; END $receipt024$;
CREATE TRIGGER immutable_receipt_024 BEFORE UPDATE OR DELETE ON ctsk_sync024.admin_receipts
 FOR EACH ROW EXECUTE FUNCTION ctsk_sync024.immutable_receipt();
CREATE TRIGGER immutable_receipt_truncate_024 BEFORE TRUNCATE ON ctsk_sync024.admin_receipts
 FOR EACH STATEMENT EXECUTE FUNCTION ctsk_sync024.immutable_receipt();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ctsk_sync024 FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ctsk_sync024 TO ctsk_standalone_runtime;
GRANT SELECT,INSERT ON ctsk_sync024.admin_receipts TO ctsk_standalone_runtime;
GRANT SELECT,INSERT,UPDATE ON ctsk_sync024.booking_state TO ctsk_standalone_runtime;
INSERT INTO public.integracion_sync_estado(provider,source,last_history_id)
 VALUES ('fareharbor','automation024','not-applicable-024'),('getyourguide','automation024','not-applicable-024');
COMMENT ON COLUMN public.integracion_sync_estado.first_activation_at IS 'Corte original UTC de automatización. Inmutable tras confirmación. No es cursor.';
COMMENT ON COLUMN public.integracion_sync_estado.confirmed_through IS 'Avance confirmado UTC independiente del corte. Sólo tras completar trabajo.';
COMMENT ON TABLE ctsk_sync024.admin_receipts IS 'Recibos durables de controles; separados del ledger comercial020.';
COMMIT;
