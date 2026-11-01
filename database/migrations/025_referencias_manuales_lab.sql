-- Propuesta 2E.5: exclusivamente base sintética nueva. No modifica 018-024.
BEGIN;
CREATE SCHEMA ctsk_refs025 AUTHORIZATION ctsk_standalone_owner;
REVOKE ALL ON SCHEMA ctsk_refs025 FROM PUBLIC;
GRANT USAGE ON SCHEMA ctsk_refs025 TO ctsk_standalone_runtime;
CREATE TABLE ctsk_refs025.manual_refs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 reservation_id integer NOT NULL REFERENCES public.reservaciones(id_reservacion),
 platform_id integer NOT NULL REFERENCES public.plataformas(id_plataforma),
 provider text NOT NULL CHECK(provider IN ('fareharbor','getyourguide')),
 reference varchar(100) NOT NULL CHECK(length(btrim(reference))>0),
 reference_key varchar(100) NOT NULL CHECK(length(reference_key)>0),
 kind text NOT NULL CHECK(kind IN ('code','uuid')),
 verification text NOT NULL DEFAULT 'declared' CHECK(verification='declared'),
 actor integer NOT NULL REFERENCES public.usuarios(id_usuario),
 associated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 active boolean NOT NULL DEFAULT true,
 retired_by integer REFERENCES public.usuarios(id_usuario),
 retired_at timestamptz,
 reason text NOT NULL,
 CHECK ((active AND retired_by IS NULL AND retired_at IS NULL) OR
        (NOT active AND retired_by IS NOT NULL AND retired_at IS NOT NULL))
);
CREATE UNIQUE INDEX manual_ref_identity_025 ON ctsk_refs025.manual_refs(provider,reference_key) WHERE active;
CREATE UNIQUE INDEX manual_ref_reservation_025 ON ctsk_refs025.manual_refs(reservation_id) WHERE active;
CREATE FUNCTION ctsk_refs025.protect_history() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $refs025$
BEGIN
 IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'REFERENCE_HISTORY_IMMUTABLE_025'; END IF;
 IF NOT OLD.active OR NEW.active OR NEW.retired_by IS NULL OR NEW.retired_at IS NULL
  OR (to_jsonb(NEW)-'active'-'retired_by'-'retired_at') IS DISTINCT FROM
     (to_jsonb(OLD)-'active'-'retired_by'-'retired_at')
 THEN RAISE EXCEPTION 'REFERENCE_HISTORY_IMMUTABLE_025'; END IF;
 RETURN NEW;
END $refs025$;
CREATE TRIGGER protect_reference_history_025 BEFORE UPDATE OR DELETE ON ctsk_refs025.manual_refs
 FOR EACH ROW EXECUTE FUNCTION ctsk_refs025.protect_history();
CREATE TRIGGER protect_reference_truncate_025 BEFORE TRUNCATE ON ctsk_refs025.manual_refs
 FOR EACH STATEMENT EXECUTE FUNCTION ctsk_refs025.protect_history();
ALTER TABLE ctsk_refs025.manual_refs ENABLE ALWAYS TRIGGER protect_reference_history_025;
ALTER TABLE ctsk_refs025.manual_refs ENABLE ALWAYS TRIGGER protect_reference_truncate_025;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ctsk_refs025 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ctsk_refs025.protect_history() TO ctsk_standalone_runtime;
GRANT SELECT,INSERT ON ctsk_refs025.manual_refs TO ctsk_standalone_runtime;
GRANT UPDATE(active,retired_by,retired_at) ON ctsk_refs025.manual_refs TO ctsk_standalone_runtime;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ctsk_refs025 TO ctsk_standalone_runtime;
COMMENT ON TABLE ctsk_refs025.manual_refs IS 'Declaraciones humanas, nunca vínculos de integración confirmados. Correcciones conservan fila histórica.';
COMMIT;
