-- SOLO admin-audit-schema-lab, cluster NUEVO verificado en 021 por el corredor.
-- Sin HTTP, servicios administrativos, credenciales ni cambios de autenticacion.
DO $guard022$
BEGIN
    IF current_user <> 'ctsk_standalone_owner'
       OR current_database() !~ '^ctsk_standalone_[a-f0-9]{12}_test$' THEN
        RAISE EXCEPTION 'ADMIN_AUDIT_LAB_ONLY' USING ERRCODE='42501';
    END IF;
END;
$guard022$;

ALTER TABLE public.bitacora
    ADD COLUMN id_usuario_afectado integer,
    ADD COLUMN id_tour integer,
    ADD COLUMN id_guia integer,
    ADD COLUMN id_operador integer,
    ADD COLUMN id_vehiculo integer,
    ADD COLUMN id_pais integer,
    ADD COLUMN id_plataforma integer,
    ADD CONSTRAINT fk_bitacora_usuario_afectado_022 FOREIGN KEY (id_usuario_afectado) REFERENCES public.usuarios(id_usuario),
    ADD CONSTRAINT fk_bitacora_tour_022 FOREIGN KEY (id_tour) REFERENCES public.tours(id_tour),
    ADD CONSTRAINT fk_bitacora_guia_022 FOREIGN KEY (id_guia) REFERENCES public.guias(id_guia),
    ADD CONSTRAINT fk_bitacora_operador_022 FOREIGN KEY (id_operador) REFERENCES public.operadores(id_operador),
    ADD CONSTRAINT fk_bitacora_vehiculo_022 FOREIGN KEY (id_vehiculo) REFERENCES public.vehiculos(id_vehiculo),
    ADD CONSTRAINT fk_bitacora_pais_022 FOREIGN KEY (id_pais) REFERENCES public.paises(id_pais),
    ADD CONSTRAINT fk_bitacora_plataforma_022 FOREIGN KEY (id_plataforma) REFERENCES public.plataformas(id_plataforma);

CREATE FUNCTION public.ctsk_admin_snapshot_valido_022(recurso text, foto jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $snapshot022$
DECLARE permitidas text[]; campo text; valor jsonb; texto text; maximo integer; previo bigint := 0; identificador bigint;
BEGIN
    IF foto IS NULL OR jsonb_typeof(foto) <> 'object' THEN RETURN false; END IF;
    CASE recurso
      WHEN 'usuarios' THEN permitidas := ARRAY['nombre','correo','id_rol','estado','alcance_plataformas','platform_ids'];
      WHEN 'tours' THEN permitidas := ARRAY['nombre','descripcion','activo'];
      WHEN 'guias' THEN permitidas := ARRAY['nombre','estado'];
      WHEN 'operadores' THEN permitidas := ARRAY['nombre','estado'];
      WHEN 'vehiculos' THEN permitidas := ARRAY['identificador','placas','color','capacidad','estado'];
      WHEN 'paises' THEN permitidas := ARRAY['nombre'];
      WHEN 'plataformas' THEN permitidas := ARRAY['nombre'];
      ELSE RETURN false;
    END CASE;
    IF NOT foto ?& permitidas OR (foto - permitidas) <> '{}'::jsonb THEN RETURN false; END IF;
    FOREACH campo IN ARRAY permitidas LOOP
        valor := foto -> campo; texto := foto ->> campo;
        IF campo = 'platform_ids' THEN
            IF jsonb_typeof(valor) <> 'array' THEN RETURN false; END IF;
            FOR valor IN SELECT v FROM jsonb_array_elements(valor) AS elementos(v) LOOP
                texto := valor #>> '{}';
                IF jsonb_typeof(valor) <> 'number' OR texto !~ '^[1-9][0-9]{0,9}$' THEN RETURN false; END IF;
                identificador := texto::bigint;
                IF identificador > 2147483647 OR identificador <= previo THEN RETURN false; END IF;
                previo := identificador;
            END LOOP;
        ELSIF campo = 'id_rol' THEN
            IF jsonb_typeof(valor) <> 'number' OR texto !~ '^[1-9][0-9]{0,9}$' THEN RETURN false; END IF;
            IF texto::bigint > 2147483647 THEN RETURN false; END IF;
        ELSIF campo = 'capacidad' THEN
            IF jsonb_typeof(valor) <> 'number' OR texto NOT IN ('1','2','3','4','5','6','7','8','9','10','11','12') THEN RETURN false; END IF;
        ELSIF campo IN ('estado','activo') THEN
            IF jsonb_typeof(valor) <> 'boolean' THEN RETURN false; END IF;
        ELSE
            IF campo IN ('placas','color') AND valor = 'null'::jsonb THEN CONTINUE; END IF;
            IF jsonb_typeof(valor) <> 'string' THEN RETURN false; END IF;
            IF campo <> 'descripcion' AND NOT public.ctsk_texto_presente_021(texto) THEN RETURN false; END IF;
            maximo := CASE campo
                WHEN 'nombre' THEN CASE recurso WHEN 'usuarios' THEN 100 WHEN 'tours' THEN 150 WHEN 'guias' THEN 120 WHEN 'operadores' THEN 120 WHEN 'paises' THEN 150 ELSE 50 END
                WHEN 'correo' THEN 100 WHEN 'identificador' THEN 50 WHEN 'placas' THEN 20 WHEN 'color' THEN 50 WHEN 'alcance_plataformas' THEN 20 ELSE NULL END;
            IF maximo IS NOT NULL AND char_length(texto) > maximo THEN RETURN false; END IF;
            IF campo = 'correo' AND texto !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN RETURN false; END IF;
            IF campo = 'alcance_plataformas' AND texto NOT IN ('all','selected') THEN RETURN false; END IF;
        END IF;
    END LOOP;
    IF recurso = 'usuarios' AND foto ->> 'alcance_plataformas' = 'all' AND foto -> 'platform_ids' <> '[]'::jsonb THEN RETURN false; END IF;
    RETURN true;
END;
$snapshot022$;

-- La expresion 021 se conserva literalmente en la rama heredada.
ALTER TABLE public.bitacora DROP CONSTRAINT chk_bitacora_formato_021;
ALTER TABLE public.bitacora ADD CONSTRAINT chk_bitacora_formato_022 CHECK ((CASE
    WHEN version_auditoria IS NULL OR version_auditoria = 2 THEN
        num_nonnulls(id_usuario_afectado,id_tour,id_guia,id_operador,id_vehiculo,id_pais,id_plataforma) = 0
        AND ((CASE
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
        ELSE false END) IS TRUE)
    WHEN version_auditoria = 3 THEN
        origen = 'HUMANO' AND instante IS NOT NULL
        AND public.ctsk_texto_presente_021(usuario_nombre_snapshot)
        AND char_length(usuario_nombre_snapshot) <= 100
        AND public.ctsk_texto_presente_021(descripcion)
        AND num_nonnulls(id_reservacion,id_operacion_tour,id_transporte_operacion,id_daily_observacion) = 0
        AND num_nonnulls(id_usuario_afectado,id_tour,id_guia,id_operador,id_vehiculo,id_pais,id_plataforma) = 1
        AND comando_generacion IS NOT NULL AND comando_clave IS NOT NULL
        AND (motivo IS NULL OR (char_length(motivo) BETWEEN 1 AND 500 AND public.ctsk_texto_presente_021(motivo)))
        AND (CASE
          WHEN accion = 'CAMBIAR_PASSWORD' THEN
            id_usuario_afectado IS NOT NULL AND motivo IS NOT NULL
            AND valores_anteriores IS NULL AND valores_nuevos IS NULL
            AND descripcion = 'Cambio de contraseña'
          WHEN accion = 'CREAR' OR (accion = 'MODIFICAR' AND id_pais IS NULL AND id_plataforma IS NULL) THEN
            public.ctsk_admin_snapshot_valido_022(CASE
                WHEN id_usuario_afectado IS NOT NULL THEN 'usuarios' WHEN id_tour IS NOT NULL THEN 'tours'
                WHEN id_guia IS NOT NULL THEN 'guias' WHEN id_operador IS NOT NULL THEN 'operadores'
                WHEN id_vehiculo IS NOT NULL THEN 'vehiculos' WHEN id_pais IS NOT NULL THEN 'paises' ELSE 'plataformas' END, valores_nuevos)
            AND ((accion = 'CREAR' AND valores_anteriores IS NULL)
                OR (accion = 'MODIFICAR' AND motivo IS NOT NULL AND valores_anteriores IS DISTINCT FROM valores_nuevos
                    AND public.ctsk_admin_snapshot_valido_022(CASE
                        WHEN id_usuario_afectado IS NOT NULL THEN 'usuarios' WHEN id_tour IS NOT NULL THEN 'tours'
                        WHEN id_guia IS NOT NULL THEN 'guias' WHEN id_operador IS NOT NULL THEN 'operadores'
                        WHEN id_vehiculo IS NOT NULL THEN 'vehiculos' WHEN id_pais IS NOT NULL THEN 'paises' ELSE 'plataformas' END, valores_anteriores)))
          ELSE false END)
    ELSE false END) IS TRUE);

CREATE UNIQUE INDEX uq_bitacora_comando_022 ON public.bitacora(comando_generacion,id_usuario,comando_clave) WHERE version_auditoria = 3;

-- Misma funcion 021 y validacion diferida; solo se excluye la rama nueva.
DROP TRIGGER ctsk_audit_command_021 ON public.bitacora;
CREATE CONSTRAINT TRIGGER ctsk_audit_command_021 AFTER INSERT ON public.bitacora
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.version_auditoria IS DISTINCT FROM 3)
    EXECUTE FUNCTION public.ctsk_comando_auditoria_021();
ALTER TABLE public.bitacora ENABLE ALWAYS TRIGGER ctsk_audit_command_021;

CREATE FUNCTION public.ctsk_admin_comando_auditoria_022() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $link022$
DECLARE comando record; recurso text; identificador text; metodo text; ruta text;
BEGIN
    IF NEW.version_auditoria IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'ADMIN_AUDIT_VERSION' USING ERRCODE='23514'; END IF;
    IF NEW.id_usuario_afectado IS NOT NULL THEN recurso := 'usuarios'; identificador := NEW.id_usuario_afectado::text;
    ELSIF NEW.id_tour IS NOT NULL THEN recurso := 'tours'; identificador := NEW.id_tour::text;
    ELSIF NEW.id_guia IS NOT NULL THEN recurso := 'guias'; identificador := NEW.id_guia::text;
    ELSIF NEW.id_operador IS NOT NULL THEN recurso := 'operadores'; identificador := NEW.id_operador::text;
    ELSIF NEW.id_vehiculo IS NOT NULL THEN recurso := 'vehiculos'; identificador := NEW.id_vehiculo::text;
    ELSIF NEW.id_pais IS NOT NULL THEN recurso := 'paises'; identificador := NEW.id_pais::text;
    ELSE recurso := 'plataformas'; identificador := NEW.id_plataforma::text;
    END IF;
    metodo := CASE WHEN NEW.accion = 'CREAR' THEN 'POST' ELSE 'PATCH' END;
    ruta := '/api/' || recurso || CASE WHEN metodo = 'POST' THEN '' ELSE '/' || identificador END
        || CASE WHEN NEW.accion = 'CAMBIAR_PASSWORD' THEN '/password' ELSE '' END;
    SELECT * INTO comando FROM public.comandos_idempotentes
        WHERE generacion_datos=NEW.comando_generacion AND id_usuario=NEW.id_usuario AND clave=NEW.comando_clave;
    IF NOT FOUND THEN RAISE EXCEPTION 'ADMIN_AUDIT_COMMAND_MISSING' USING ERRCODE='23503'; END IF;
    IF comando.estado <> 'confirmado' OR comando.http_status <> 200
        OR comando.recurso IS DISTINCT FROM recurso OR comando.id_recurso IS DISTINCT FROM identificador
        OR comando.metodo IS DISTINCT FROM metodo OR comando.ruta IS DISTINCT FROM ruta
        OR comando.ids_bitacora IS DISTINCT FROM ARRAY[NEW.id_bitacora] THEN
        RAISE EXCEPTION 'ADMIN_AUDIT_COMMAND_MISMATCH' USING ERRCODE='23514';
    END IF;
    RETURN NULL;
END;
$link022$;
CREATE CONSTRAINT TRIGGER ctsk_admin_audit_command_022 AFTER INSERT ON public.bitacora
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.version_auditoria = 3)
    EXECUTE FUNCTION public.ctsk_admin_comando_auditoria_022();
ALTER TABLE public.bitacora ENABLE ALWAYS TRIGGER ctsk_admin_audit_command_022;

-- Reciprocidad: un recibo administrativo no puede declarar IDs ajenos o ficticios.
-- No-op y rechazos con IDs vacios, asi como los recursos operativos, conservan 020.
CREATE FUNCTION public.ctsk_admin_ledger_auditoria_022() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $ledger022$
DECLARE auditoria record;
BEGIN
    IF NEW.estado <> 'confirmado' OR NEW.http_status <> 200 OR cardinality(NEW.ids_bitacora) <> 1 THEN
        RAISE EXCEPTION 'ADMIN_RECEIPT_AUDIT_INVALID' USING ERRCODE='23514';
    END IF;
    SELECT * INTO auditoria FROM public.bitacora WHERE id_bitacora=NEW.ids_bitacora[1]
        AND version_auditoria=3 AND id_usuario=NEW.id_usuario
        AND comando_generacion=NEW.generacion_datos AND comando_clave=NEW.clave;
    IF NOT FOUND THEN RAISE EXCEPTION 'ADMIN_RECEIPT_AUDIT_MISSING' USING ERRCODE='23503'; END IF;
    -- El trigger de Bitacora valida ademas metodo/ruta/recurso/ID del comando.
    RETURN NULL;
END;
$ledger022$;
CREATE CONSTRAINT TRIGGER ctsk_admin_ledger_audit_022 AFTER INSERT ON public.comandos_idempotentes
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    WHEN (NEW.recurso IN ('usuarios','tours','guias','operadores','vehiculos','paises','plataformas') AND cardinality(NEW.ids_bitacora)>0)
    EXECUTE FUNCTION public.ctsk_admin_ledger_auditoria_022();
ALTER TABLE public.comandos_idempotentes ENABLE ALWAYS TRIGGER ctsk_admin_ledger_audit_022;

REVOKE ALL ON FUNCTION public.ctsk_admin_snapshot_valido_022(text,jsonb),public.ctsk_admin_comando_auditoria_022(),public.ctsk_admin_ledger_auditoria_022() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ctsk_admin_snapshot_valido_022(text,jsonb),public.ctsk_admin_comando_auditoria_022(),public.ctsk_admin_ledger_auditoria_022() TO ctsk_standalone_runtime;
GRANT INSERT (id_usuario_afectado,id_tour,id_guia,id_operador,id_vehiculo,id_pais,id_plataforma) ON public.bitacora TO ctsk_standalone_runtime;
