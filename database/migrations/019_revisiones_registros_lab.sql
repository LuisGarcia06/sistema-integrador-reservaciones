-- 019_revisiones_registros_lab: SOLO clúster nuevo, perfil revision-schema-lab.
-- El aprovisionador verifica identidad antes de ejecutar; no es un instalador productivo.
BEGIN;
ALTER TABLE public.reservaciones ADD COLUMN revision BIGINT NOT NULL DEFAULT 1;
ALTER TABLE public.reservaciones ADD CONSTRAINT chk_reservaciones_revision_019 CHECK (revision > 0);
ALTER TABLE public.operaciones_tour ADD COLUMN revision BIGINT NOT NULL DEFAULT 1;
ALTER TABLE public.operaciones_tour ADD CONSTRAINT chk_operaciones_tour_revision_019 CHECK (revision > 0);
ALTER TABLE public.transportes_operacion ADD COLUMN revision BIGINT NOT NULL DEFAULT 1;
ALTER TABLE public.transportes_operacion ADD CONSTRAINT chk_transportes_operacion_revision_019 CHECK (revision > 0);
-- 019_GUARDS_AFTER_COLUMNS
CREATE FUNCTION public.ctsk_guard_revision_019() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = pg_catalog AS $revision019$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.revision IS DISTINCT FROM 1::bigint THEN
            RAISE EXCEPTION 'REVISION_MANAGED_BY_DATABASE' USING ERRCODE = '22023';
        END IF;
    ELSE
        IF NEW.revision IS DISTINCT FROM OLD.revision THEN
            RAISE EXCEPTION 'REVISION_MANAGED_BY_DATABASE' USING ERRCODE = '22023';
        END IF;
        IF (pg_catalog.to_jsonb(NEW) - 'revision') IS DISTINCT FROM (pg_catalog.to_jsonb(OLD) - 'revision') THEN
            NEW.revision := OLD.revision + 1::bigint;
        END IF;
    END IF;
    RETURN NEW;
END;
$revision019$;
REVOKE ALL ON FUNCTION public.ctsk_guard_revision_019() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ctsk_guard_revision_019() TO ctsk_standalone_runtime;
CREATE TRIGGER ctsk_revision_guard_019 BEFORE INSERT OR UPDATE ON public.reservaciones
FOR EACH ROW EXECUTE FUNCTION public.ctsk_guard_revision_019();
ALTER TABLE public.reservaciones ENABLE ALWAYS TRIGGER ctsk_revision_guard_019;
REVOKE INSERT, UPDATE, DELETE ON public.reservaciones FROM ctsk_standalone_runtime;
GRANT INSERT (codigo, fecha, id_tour, id_pais, id_plataforma, nombre_cliente, telefono_cliente, habitacion, pax, ninos, pickup_place, pickup_time, turno, idioma, notificado, precio_total, deposito, saldo, tipo_cambio, metodo_pago, vendedor, observaciones, motivo_cancelacion, id_transporte_operacion, estado, fecha_registro, ultima_actualizacion) ON public.reservaciones TO ctsk_standalone_runtime;
GRANT UPDATE (codigo, fecha, id_tour, id_pais, id_plataforma, nombre_cliente, telefono_cliente, habitacion, pax, ninos, pickup_place, pickup_time, turno, idioma, notificado, precio_total, deposito, saldo, tipo_cambio, metodo_pago, vendedor, observaciones, motivo_cancelacion, id_transporte_operacion, estado, fecha_registro, ultima_actualizacion) ON public.reservaciones TO ctsk_standalone_runtime;
CREATE TRIGGER ctsk_revision_guard_019 BEFORE INSERT OR UPDATE ON public.operaciones_tour
FOR EACH ROW EXECUTE FUNCTION public.ctsk_guard_revision_019();
ALTER TABLE public.operaciones_tour ENABLE ALWAYS TRIGGER ctsk_revision_guard_019;
REVOKE INSERT, UPDATE, DELETE ON public.operaciones_tour FROM ctsk_standalone_runtime;
GRANT INSERT (fecha, id_tour, hora_inicio, turno, numero_grupo, id_guia, estado) ON public.operaciones_tour TO ctsk_standalone_runtime;
GRANT UPDATE (fecha, id_tour, hora_inicio, turno, numero_grupo, id_guia, estado) ON public.operaciones_tour TO ctsk_standalone_runtime;
CREATE TRIGGER ctsk_revision_guard_019 BEFORE INSERT OR UPDATE ON public.transportes_operacion
FOR EACH ROW EXECUTE FUNCTION public.ctsk_guard_revision_019();
ALTER TABLE public.transportes_operacion ENABLE ALWAYS TRIGGER ctsk_revision_guard_019;
REVOKE INSERT, UPDATE, DELETE ON public.transportes_operacion FROM ctsk_standalone_runtime;
GRANT INSERT (id_operacion_tour, id_vehiculo, id_operador, observaciones_operador, estado) ON public.transportes_operacion TO ctsk_standalone_runtime;
GRANT UPDATE (id_operacion_tour, id_vehiculo, id_operador, observaciones_operador, estado) ON public.transportes_operacion TO ctsk_standalone_runtime;
COMMIT;
