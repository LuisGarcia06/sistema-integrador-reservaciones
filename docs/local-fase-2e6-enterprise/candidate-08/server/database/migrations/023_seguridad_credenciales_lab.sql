-- Exclusivamente cluster sintetico nuevo, previamente verificado en 022.
DO $guard023$
BEGIN
    IF current_user <> 'ctsk_standalone_owner' OR current_database() !~ '^ctsk_standalone_[a-f0-9]{12}_test$' THEN
        RAISE EXCEPTION 'SECURITY_LAB_ONLY' USING ERRCODE='42501';
    END IF;
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_database WHERE datname=current_database()
        AND datcollate='C' AND datctype='C' AND pg_encoding_to_char(encoding)='UTF8') THEN
        RAISE EXCEPTION 'EMAIL_COLLATION_REQUIRED' USING ERRCODE='23514';
    END IF;
    IF EXISTS (SELECT 1 FROM public.usuarios GROUP BY lower(btrim(correo,
        U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') COLLATE "C") HAVING count(*)>1) THEN
        RAISE EXCEPTION 'EMAIL_IDENTITY_AMBIGUOUS' USING ERRCODE='23514';
    END IF;
END;
$guard023$;

ALTER TABLE public.usuarios ADD COLUMN version_credenciales bigint NOT NULL DEFAULT 1,
    ADD CONSTRAINT chk_usuarios_credenciales_023 CHECK (version_credenciales >= 1);

CREATE FUNCTION public.ctsk_correo_clave_023(valor text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $email023$
    SELECT lower(btrim(valor,
        U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') COLLATE "C");
$email023$;
CREATE UNIQUE INDEX uq_usuarios_correo_023 ON public.usuarios(public.ctsk_correo_clave_023(correo));

CREATE FUNCTION public.ctsk_guard_credenciales_023() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $version023$
BEGIN
    IF TG_OP='INSERT' THEN
        IF NEW.version_credenciales IS DISTINCT FROM 1::bigint THEN
            RAISE EXCEPTION 'CREDENTIAL_INITIAL_VERSION' USING ERRCODE='23514';
        END IF;
    ELSE
        IF NEW.version_credenciales IS DISTINCT FROM OLD.version_credenciales THEN
            RAISE EXCEPTION 'CREDENTIAL_MANUAL_VERSION' USING ERRCODE='23514';
        END IF;
        IF NEW.password IS DISTINCT FROM OLD.password OR NEW.estado IS DISTINCT FROM OLD.estado THEN
            IF OLD.version_credenciales=9223372036854775807::bigint THEN
                RAISE EXCEPTION 'CREDENTIAL_VERSION_EXHAUSTED' USING ERRCODE='22003';
            END IF;
            NEW.version_credenciales := OLD.version_credenciales+1;
        END IF;
    END IF;
    RETURN NEW;
END;
$version023$;
CREATE TRIGGER ctsk_credential_version_023 BEFORE INSERT OR UPDATE ON public.usuarios
    FOR EACH ROW EXECUTE FUNCTION public.ctsk_guard_credenciales_023();
ALTER TABLE public.usuarios ENABLE ALWAYS TRIGGER ctsk_credential_version_023;

CREATE TABLE public.inicializacion_sistema (
    singleton smallint PRIMARY KEY CHECK (singleton=1),
    id_inicializacion uuid NOT NULL UNIQUE,
    id_usuario_inicial integer NOT NULL UNIQUE REFERENCES public.usuarios(id_usuario),
    instante timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    generacion_datos uuid NOT NULL,
    cluster_id text NOT NULL CHECK (cluster_id ~ '^[0-9]{19,20}$'),
    version_esquema_inicial smallint NOT NULL CHECK (version_esquema_inicial=23),
    huella_herramienta text NOT NULL CHECK (huella_herramienta ~ '^[a-f0-9]{64}$'),
    principal_sql name NOT NULL DEFAULT SESSION_USER
);
CREATE FUNCTION public.ctsk_guard_inicializacion_023() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $initial023$
BEGIN
    RAISE EXCEPTION 'INITIALIZATION_RECORD_IMMUTABLE' USING ERRCODE='42501';
END;
$initial023$;
CREATE TRIGGER ctsk_initialization_rows_023 BEFORE UPDATE OR DELETE ON public.inicializacion_sistema
    FOR EACH ROW EXECUTE FUNCTION public.ctsk_guard_inicializacion_023();
CREATE TRIGGER ctsk_initialization_truncate_023 BEFORE TRUNCATE ON public.inicializacion_sistema
    FOR EACH STATEMENT EXECUTE FUNCTION public.ctsk_guard_inicializacion_023();
ALTER TABLE public.inicializacion_sistema ENABLE ALWAYS TRIGGER ctsk_initialization_rows_023;
ALTER TABLE public.inicializacion_sistema ENABLE ALWAYS TRIGGER ctsk_initialization_truncate_023;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.usuarios FROM ctsk_standalone_runtime, PUBLIC;
GRANT INSERT (id_rol,nombre,correo,password,estado,alcance_plataformas) ON public.usuarios TO ctsk_standalone_runtime;
GRANT UPDATE (id_rol,nombre,correo,password,estado,alcance_plataformas) ON public.usuarios TO ctsk_standalone_runtime;
REVOKE ALL ON public.inicializacion_sistema FROM ctsk_standalone_runtime,PUBLIC;
REVOKE ALL ON FUNCTION public.ctsk_correo_clave_023(text),public.ctsk_guard_credenciales_023(),public.ctsk_guard_inicializacion_023() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ctsk_correo_clave_023(text),public.ctsk_guard_credenciales_023() TO ctsk_standalone_runtime;
