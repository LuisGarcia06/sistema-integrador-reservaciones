-- SOLO command-api-lab, clúster vacío nuevo. Sin cambios a tablas de negocio.
CREATE TABLE public.comandos_idempotentes (
    generacion_datos uuid NOT NULL,
    id_usuario integer NOT NULL REFERENCES public.usuarios(id_usuario),
    clave uuid NOT NULL,
    version smallint NOT NULL,
    metodo character varying(5) NOT NULL,
    ruta text NOT NULL,
    recurso text NOT NULL,
    id_recurso text,
    huella character(64) NOT NULL,
    estado character varying(10) NOT NULL,
    http_status smallint NOT NULL,
    resultado jsonb NOT NULL,
    alcance jsonb NOT NULL,
    ids_bitacora integer[] NOT NULL,
    fecha_registro timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_comandos_020 PRIMARY KEY (generacion_datos,id_usuario,clave),
    CONSTRAINT chk_comandos_version_020 CHECK (version=1),
    CONSTRAINT chk_comandos_metodo_020 CHECK (metodo IN ('POST','PATCH','PUT')),
    CONSTRAINT chk_comandos_ruta_020 CHECK (ruta LIKE '/api/%' AND length(ruta)<=512),
    CONSTRAINT chk_comandos_huella_020 CHECK (huella ~ '^[a-f0-9]{64}$'),
    CONSTRAINT chk_comandos_estado_020 CHECK ((estado='confirmado' AND http_status=200) OR (estado='rechazado' AND http_status BETWEEN 400 AND 499)),
    CONSTRAINT chk_comandos_resultado_020 CHECK (jsonb_typeof(resultado)='object' AND octet_length(resultado::text)<=16384),
    CONSTRAINT chk_comandos_alcance_020 CHECK (jsonb_typeof(alcance)='object' AND octet_length(alcance::text)<=8192)
);
CREATE INDEX idx_comandos_usuario_fecha_020 ON public.comandos_idempotentes(id_usuario,fecha_registro);
CREATE FUNCTION public.ctsk_guard_comando_020() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $command020$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'COMMAND_IMMUTABLE' USING ERRCODE='42501';
    END IF;
    IF NEW.generacion_datos::text IS DISTINCT FROM obj_description(TG_RELID,'pg_class') THEN
        RAISE EXCEPTION 'COMMAND_GENERATION' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
END;
$command020$;
REVOKE ALL ON FUNCTION public.ctsk_guard_comando_020() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ctsk_guard_comando_020() TO ctsk_standalone_runtime;
CREATE TRIGGER ctsk_command_guard_020 BEFORE INSERT OR UPDATE OR DELETE ON public.comandos_idempotentes
FOR EACH ROW EXECUTE FUNCTION public.ctsk_guard_comando_020();
ALTER TABLE public.comandos_idempotentes ENABLE ALWAYS TRIGGER ctsk_command_guard_020;
REVOKE ALL ON TABLE public.comandos_idempotentes FROM PUBLIC,ctsk_standalone_runtime;
GRANT SELECT ON TABLE public.comandos_idempotentes TO ctsk_standalone_runtime;
GRANT INSERT (generacion_datos,id_usuario,clave,version,metodo,ruta,recurso,id_recurso,huella,estado,http_status,resultado,alcance,ids_bitacora)
ON public.comandos_idempotentes TO ctsk_standalone_runtime;
