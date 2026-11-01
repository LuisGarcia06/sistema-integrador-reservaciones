-- SOLO audit-schema-lab: extension de 020 en un cluster sintetico NUEVO.
-- El aprovisionador valida identidad, contrato 020 y digest ANTES de ejecutar.
ALTER TABLE public.bitacora
    ADD COLUMN version_auditoria smallint,
    ADD COLUMN origen varchar(20),
    ADD COLUMN instante timestamptz,
    ADD COLUMN usuario_nombre_snapshot text,
    ADD COLUMN id_operacion_tour integer,
    ADD COLUMN id_transporte_operacion integer,
    ADD COLUMN id_daily_observacion integer,
    ADD COLUMN valores_anteriores jsonb,
    ADD COLUMN valores_nuevos jsonb,
    ADD COLUMN motivo text,
    ADD COLUMN comando_generacion uuid,
    ADD COLUMN comando_clave uuid;

-- Conjunto de espacios de ECMAScript trim, independiente del locale C de initdb.
CREATE FUNCTION public.ctsk_texto_presente_021(valor text)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $text021$
    SELECT valor IS NOT NULL AND translate(valor,
        U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF', '') <> '';
$text021$;

CREATE FUNCTION public.ctsk_snapshot_valido_021(recurso text, foto jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER
SET search_path=pg_catalog AS $snapshot021$
DECLARE permitidas text[]; campo text; valor jsonb; texto text;
BEGIN
    IF foto IS NULL OR jsonb_typeof(foto) <> 'object' THEN RETURN false; END IF;
    CASE recurso
      WHEN 'operaciones' THEN permitidas := ARRAY['fecha','id_tour','turno','numero_grupo','hora_inicio','id_guia','estado'];
      WHEN 'transportes' THEN permitidas := ARRAY['id_operacion_tour','id_vehiculo','id_operador','observaciones_operador','estado'];
      WHEN 'daily' THEN permitidas := ARRAY['fecha','observaciones'];
      ELSE RETURN false;
    END CASE;
    IF NOT foto ?& permitidas OR (foto - permitidas) <> '{}'::jsonb THEN RETURN false; END IF;
    FOREACH campo IN ARRAY permitidas LOOP
        valor := foto -> campo; texto := foto ->> campo;
        IF campo IN ('id_guia','id_vehiculo','id_operador') AND valor = 'null'::jsonb THEN CONTINUE; END IF;
        IF campo LIKE 'id_%' THEN
            IF jsonb_typeof(valor) <> 'number' OR texto !~ '^[1-9][0-9]{0,9}$' THEN RETURN false; END IF;
            IF texto::bigint > 2147483647 THEN RETURN false; END IF;
        ELSIF campo = 'numero_grupo' THEN
            IF jsonb_typeof(valor) <> 'number' OR texto NOT IN ('1','2') THEN RETURN false; END IF;
        ELSIF campo = 'observaciones_operador' THEN
            IF jsonb_typeof(valor) NOT IN ('string','null') THEN RETURN false; END IF;
        ELSE
            IF jsonb_typeof(valor) <> 'string' THEN RETURN false; END IF;
            IF campo = 'fecha' THEN
                IF texto !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (texto::date)::text <> texto THEN RETURN false; END IF;
            ELSIF campo = 'hora_inicio' THEN
                IF texto !~ '^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$' THEN RETURN false; END IF;
            ELSIF campo = 'turno' THEN
                IF texto NOT IN ('Mañana','Tarde') THEN RETURN false; END IF;
            ELSIF campo = 'estado' THEN
                IF char_length(texto) NOT BETWEEN 1 AND 30 OR NOT public.ctsk_texto_presente_021(texto) THEN RETURN false; END IF;
            END IF;
        END IF;
    END LOOP;
    RETURN true;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN false;
END;
$snapshot021$;

ALTER TABLE public.bitacora
    ADD CONSTRAINT fk_bitacora_operacion_021 FOREIGN KEY (id_operacion_tour)
        REFERENCES public.operaciones_tour(id_operacion_tour),
    ADD CONSTRAINT fk_bitacora_transporte_021 FOREIGN KEY (id_transporte_operacion)
        REFERENCES public.transportes_operacion(id_transporte_operacion),
    ADD CONSTRAINT fk_bitacora_daily_021 FOREIGN KEY (id_daily_observacion)
        REFERENCES public.daily_observaciones(id_daily_observacion),
    ADD CONSTRAINT fk_bitacora_comando_021 FOREIGN KEY (comando_generacion,id_usuario,comando_clave)
        REFERENCES public.comandos_idempotentes(generacion_datos,id_usuario,clave)
        DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT chk_bitacora_formato_021 CHECK ((CASE
        WHEN version_auditoria IS NULL THEN
            origen IS NULL AND instante IS NULL AND usuario_nombre_snapshot IS NULL
            AND id_operacion_tour IS NULL AND id_transporte_operacion IS NULL AND id_daily_observacion IS NULL
            AND valores_anteriores IS NULL AND valores_nuevos IS NULL AND motivo IS NULL
            AND comando_generacion IS NULL AND comando_clave IS NULL
        WHEN version_auditoria = 2 THEN
            origen = 'HUMANO' AND instante IS NOT NULL
            AND public.ctsk_texto_presente_021(usuario_nombre_snapshot)
            AND public.ctsk_texto_presente_021(descripcion)
            AND id_reservacion IS NULL
            AND num_nonnulls(id_operacion_tour,id_transporte_operacion,id_daily_observacion) = 1
            AND comando_generacion IS NOT NULL AND comando_clave IS NOT NULL
            AND public.ctsk_snapshot_valido_021(CASE WHEN id_operacion_tour IS NOT NULL THEN 'operaciones'
                WHEN id_transporte_operacion IS NOT NULL THEN 'transportes' ELSE 'daily' END, valores_nuevos)
            AND (motivo IS NULL OR (char_length(motivo) BETWEEN 1 AND 500 AND public.ctsk_texto_presente_021(motivo)))
            AND ((accion = 'CREAR' AND valores_anteriores IS NULL)
                OR (accion = 'MODIFICAR' AND motivo IS NOT NULL
                    AND public.ctsk_snapshot_valido_021(CASE WHEN id_operacion_tour IS NOT NULL THEN 'operaciones'
                        WHEN id_transporte_operacion IS NOT NULL THEN 'transportes' ELSE 'daily' END, valores_anteriores)
                    AND valores_anteriores IS DISTINCT FROM valores_nuevos))
        ELSE false END) IS TRUE);

CREATE UNIQUE INDEX uq_bitacora_comando_021 ON public.bitacora(comando_generacion,id_usuario,comando_clave)
    WHERE version_auditoria = 2;
CREATE INDEX idx_bitacora_fecha_021 ON public.bitacora(fecha DESC,id_bitacora DESC);
CREATE INDEX idx_bitacora_operacion_021 ON public.bitacora(id_operacion_tour,fecha DESC,id_bitacora DESC)
    WHERE id_operacion_tour IS NOT NULL;
CREATE INDEX idx_bitacora_transporte_021 ON public.bitacora(id_transporte_operacion,fecha DESC,id_bitacora DESC)
    WHERE id_transporte_operacion IS NOT NULL;
CREATE INDEX idx_bitacora_daily_021 ON public.bitacora(id_daily_observacion,fecha DESC,id_bitacora DESC)
    WHERE id_daily_observacion IS NOT NULL;

CREATE FUNCTION public.ctsk_comando_auditoria_021() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $link021$
DECLARE comando record; recurso text; identificador text; ruta text; metodo text;
BEGIN
    IF NEW.version_auditoria IS NULL THEN RETURN NULL; END IF;
    IF NEW.id_operacion_tour IS NOT NULL THEN
        recurso := 'operaciones'; identificador := NEW.id_operacion_tour::text;
    ELSIF NEW.id_transporte_operacion IS NOT NULL THEN
        recurso := 'transportes'; identificador := NEW.id_transporte_operacion::text;
    ELSE
        recurso := 'daily';
        SELECT fecha::text INTO identificador FROM public.daily_observaciones
            WHERE id_daily_observacion = NEW.id_daily_observacion;
        IF (NEW.valores_nuevos ->> 'fecha') IS DISTINCT FROM identificador
            OR (NEW.accion = 'MODIFICAR' AND (NEW.valores_anteriores ->> 'fecha') IS DISTINCT FROM identificador) THEN
            RAISE EXCEPTION 'AUDIT_DAILY_DATE' USING ERRCODE='23514';
        END IF;
    END IF;
    IF recurso = 'daily' THEN metodo := 'PUT'; ruta := '/api/daily/observaciones?fecha=' || identificador;
    ELSIF NEW.accion = 'CREAR' THEN metodo := 'POST'; ruta := '/api/' || recurso;
    ELSE metodo := 'PATCH'; ruta := '/api/' || recurso || '/' || identificador;
    END IF;
    SELECT * INTO comando FROM public.comandos_idempotentes
        WHERE generacion_datos=NEW.comando_generacion AND id_usuario=NEW.id_usuario AND clave=NEW.comando_clave;
    IF NOT FOUND THEN RAISE EXCEPTION 'AUDIT_COMMAND_MISSING' USING ERRCODE='23503'; END IF;
    IF comando.estado <> 'confirmado' OR comando.http_status <> 200
        OR comando.recurso IS DISTINCT FROM recurso OR comando.id_recurso IS DISTINCT FROM identificador
        OR comando.metodo IS DISTINCT FROM metodo OR comando.ruta IS DISTINCT FROM ruta
        OR comando.ids_bitacora IS DISTINCT FROM ARRAY[NEW.id_bitacora] THEN
        RAISE EXCEPTION 'AUDIT_COMMAND_MISMATCH' USING ERRCODE='23514';
    END IF;
    RETURN NULL;
END;
$link021$;
CREATE CONSTRAINT TRIGGER ctsk_audit_command_021 AFTER INSERT ON public.bitacora
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.ctsk_comando_auditoria_021();
ALTER TABLE public.bitacora ENABLE ALWAYS TRIGGER ctsk_audit_command_021;

CREATE FUNCTION public.ctsk_auditoria_inmutable_021() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $immutable021$
BEGIN
    RAISE EXCEPTION 'AUDIT_IMMUTABLE' USING ERRCODE='42501';
END;
$immutable021$;
CREATE TRIGGER ctsk_audit_immutable_021 BEFORE UPDATE OR DELETE ON public.bitacora
    FOR EACH ROW EXECUTE FUNCTION public.ctsk_auditoria_inmutable_021();
CREATE TRIGGER ctsk_audit_truncate_021 BEFORE TRUNCATE ON public.bitacora
    FOR EACH STATEMENT EXECUTE FUNCTION public.ctsk_auditoria_inmutable_021();
ALTER TABLE public.bitacora ENABLE ALWAYS TRIGGER ctsk_audit_immutable_021;
ALTER TABLE public.bitacora ENABLE ALWAYS TRIGGER ctsk_audit_truncate_021;

REVOKE ALL ON FUNCTION public.ctsk_snapshot_valido_021(text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ctsk_texto_presente_021(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ctsk_comando_auditoria_021() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ctsk_auditoria_inmutable_021() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ctsk_snapshot_valido_021(text,jsonb),
    public.ctsk_texto_presente_021(text), public.ctsk_comando_auditoria_021(), public.ctsk_auditoria_inmutable_021() TO ctsk_standalone_runtime;
REVOKE ALL ON TABLE public.bitacora FROM PUBLIC,ctsk_standalone_runtime;
GRANT SELECT ON TABLE public.bitacora TO ctsk_standalone_runtime;
GRANT INSERT (id_usuario,id_reservacion,accion,descripcion,fecha,version_auditoria,origen,instante,
    usuario_nombre_snapshot,id_operacion_tour,id_transporte_operacion,id_daily_observacion,
    valores_anteriores,valores_nuevos,motivo,comando_generacion,comando_clave)
    ON public.bitacora TO ctsk_standalone_runtime;
