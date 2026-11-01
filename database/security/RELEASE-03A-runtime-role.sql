-- PROPUESTA PARA REVISION. NO EJECUTADA. NO ES UNA MIGRACION.
-- El cierre inicial evita ejecutar cambios por una invocación accidental de psql.
\echo 'RELEASE-03A: solo propuesta; requiere autorizacion, inventario y ventana de mantenimiento.'
\quit

-- Antes de habilitar manualmente este bloque: identificar servidor/cluster/base,
-- respaldo reciente, 017 aplicada y permisos PUBLIC/membresías/propietarios actuales.
-- Ejecutar exclusivamente como administrador de mantenimiento en una intervención
-- posterior. No utilizar este archivo desde Electron ni quitar el cierre automáticamente.
BEGIN;

CREATE ROLE ctsk_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION
    NOBYPASSRLS NOINHERIT CONNECTION LIMIT 10;
-- No se establece contraseña en SQL. Después del COMMIT, usar \password ctsk_runtime
-- en una sesión administrativa privada, sin argumento/URL/log/historial con el secreto.
-- Solo después de verificar autenticación SCRAM, permisos y configuración protegida,
-- autorizar por separado ALTER ROLE ctsk_runtime LOGIN. Permanece NOLOGIN mientras tanto.
-- La cuenta NO recibe membresía del propietario ni de roles predefinidos pg_*.

GRANT CONNECT ON DATABASE sian_kaan_reservaciones TO ctsk_runtime;
-- PostgreSQL concede TEMP a PUBLIC por defecto: un REVOKE solo al rol no lo elimina.
-- Estos dos REVOKE requieren inventariar otros consumidores y reotorgar sus necesidades
-- a roles específicos en la MISMA ventana. No aprobarlos como ajuste aislado automático.
REVOKE TEMPORARY ON DATABASE sian_kaan_reservaciones FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO ctsk_runtime;

GRANT SELECT ON TABLE public.roles, public.usuarios, public.tours, public.paises,
    public.plataformas, public.vehiculos, public.operadores, public.guias,
    public.operaciones_tour, public.transportes_operacion, public.reservaciones,
    public.daily_observaciones, public.bitacora, public.usuario_plataformas_visibles,
    public.eventos_integracion, public.reservas_integracion_link,
    public.equivalencias_tours_externos, public.integracion_sync_estado TO ctsk_runtime;

GRANT INSERT, UPDATE ON TABLE public.usuarios, public.tours, public.vehiculos,
    public.operadores, public.guias, public.operaciones_tour, public.transportes_operacion,
    public.reservaciones, public.daily_observaciones, public.eventos_integracion TO ctsk_runtime;
GRANT INSERT ON TABLE public.paises, public.plataformas, public.bitacora,
    public.reservas_integracion_link TO ctsk_runtime;
GRANT INSERT, DELETE ON TABLE public.usuario_plataformas_visibles TO ctsk_runtime;
-- RELEASE-03B: el SELECT ... FOR KEY SHARE de prepararAlcanceUsuario exige UPDATE
-- sobre alguna columna. Conceder solo la PK permite el bloqueo; no UPDATE de tabla.
-- El backend no expone edición de esta PK. No se ejecutó este grant en principal.
GRANT UPDATE (id_plataforma) ON TABLE public.plataformas TO ctsk_runtime;
-- No DELETE de reservas, eventos, vínculos, bitácora o catálogos; no TRUNCATE,
-- REFERENCES, TRIGGER, propiedad, CREATE, SET ROLE ni WITH GRANT OPTION.

-- Resolver únicamente las secuencias de columnas que realmente reciben INSERT.
-- USAGE permite nextval/currval, no setval. Sin ALL SEQUENCES ni defaults futuros.
DO $$
DECLARE item record; seq_name text;
BEGIN
    FOR item IN SELECT * FROM (VALUES
        ('usuarios','id_usuario'),('tours','id_tour'),('paises','id_pais'),
        ('plataformas','id_plataforma'),('vehiculos','id_vehiculo'),('operadores','id_operador'),
        ('guias','id_guia'),('operaciones_tour','id_operacion_tour'),
        ('transportes_operacion','id_transporte_operacion'),('reservaciones','id_reservacion'),
        ('daily_observaciones','id_daily_observacion'),('bitacora','id_bitacora'),
        ('eventos_integracion','id_evento_integracion'),('reservas_integracion_link','id_reserva_integracion_link')
    ) AS allowed(table_name,column_name)
    LOOP
        seq_name := pg_get_serial_sequence(format('public.%I',item.table_name),item.column_name);
        IF seq_name IS NULL THEN RAISE EXCEPTION 'Secuencia requerida no identificada'; END IF;
        EXECUTE format('GRANT USAGE ON SEQUENCE %s TO ctsk_runtime', seq_name::regclass);
    END LOOP;
END $$;

-- Permiso directo y específico para verificar el clúster; no pg_monitor/superusuario.
-- Si no se autoriza este acceso, el arranque se detiene; no omitir su comprobación.
GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO ctsk_runtime;
COMMIT;

-- Integración Gmail: actualmente detenida. Su futura activación requiere una revisión
-- separada que podría añadir INSERT/UPDATE sobre integracion_sync_estado y USAGE de
-- su secuencia, tras comprobar el consumidor autorizado. No se conceden aquí.
-- Equivalencias se consultan; su mantenimiento queda fuera de la cuenta runtime.

-- La cuenta de mantenimiento permanece separada y fuera de config.env/.env de la app.
-- No se transfieren propietarios aquí. Crear/restringir su login, autenticación y
-- acceso a DDL requiere inventario y autorización específica de la administración.
