// Contrato exclusivo 019: no modifica el esquema base ni habilita una API.
const TABLES = Object.freeze({
    reservaciones: Object.freeze(['id_reservacion','codigo','fecha','id_tour','id_pais','id_plataforma','nombre_cliente','telefono_cliente','habitacion','pax','ninos','pickup_place','pickup_time','turno','idioma','notificado','precio_total','deposito','saldo','tipo_cambio','metodo_pago','vendedor','observaciones','motivo_cancelacion','id_transporte_operacion','estado','fecha_registro','ultima_actualizacion']),
    operaciones_tour: Object.freeze(['id_operacion_tour','fecha','id_tour','hora_inicio','turno','numero_grupo','id_guia','estado']),
    transportes_operacion: Object.freeze(['id_transporte_operacion','id_operacion_tour','id_vehiculo','id_operador','observaciones_operador','estado'])
});
const FUNCTION = 'ctsk_guard_revision_019';
const TRIGGER = 'ctsk_revision_guard_019';
const OWNER = 'ctsk_standalone_owner';
const RUNTIME = 'ctsk_standalone_runtime';
// Incluye todos los valores persistidos, salvo la propia revisión. Un timestamp
// distinto también es un cambio real; un SET campo=campo conserva la revisión.
const BODY = `
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
`;
const COLUMNS_SQL = Object.keys(TABLES).map(table => `ALTER TABLE public.${table} ADD COLUMN revision BIGINT NOT NULL DEFAULT 1;
ALTER TABLE public.${table} ADD CONSTRAINT chk_${table}_revision_019 CHECK (revision > 0);`).join('\n');
const GUARDS_SQL = `CREATE FUNCTION public.${FUNCTION}() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = pg_catalog AS $revision019$${BODY}$revision019$;
REVOKE ALL ON FUNCTION public.${FUNCTION}() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.${FUNCTION}() TO ${RUNTIME};
${Object.entries(TABLES).map(([table, columns]) => `CREATE TRIGGER ${TRIGGER} BEFORE INSERT OR UPDATE ON public.${table}
FOR EACH ROW EXECUTE FUNCTION public.${FUNCTION}();
ALTER TABLE public.${table} ENABLE ALWAYS TRIGGER ${TRIGGER};
REVOKE INSERT, UPDATE, DELETE ON public.${table} FROM ${RUNTIME};
GRANT INSERT (${columns.slice(1).join(', ')}) ON public.${table} TO ${RUNTIME};
GRANT UPDATE (${columns.slice(1).join(', ')}) ON public.${table} TO ${RUNTIME};`).join('\n')}`;
const MARKER = '-- 019_GUARDS_AFTER_COLUMNS';
const MIGRATION_SQL = `-- 019_revisiones_registros_lab: SOLO clúster nuevo, perfil revision-schema-lab.
-- El aprovisionador verifica identidad antes de ejecutar; no es un instalador productivo.
BEGIN;
${COLUMNS_SQL}
${MARKER}
${GUARDS_SQL}
COMMIT;
`;
module.exports = {TABLES, FUNCTION, TRIGGER, OWNER, RUNTIME, BODY, COLUMNS_SQL, GUARDS_SQL, MARKER, MIGRATION_SQL};
