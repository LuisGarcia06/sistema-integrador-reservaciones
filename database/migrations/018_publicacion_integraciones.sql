-- Publicación independiente de la captura. Ejecutar con respaldo verificado.
-- Sin tablas nuevas ni cambios a reservaciones/vínculos/estados de revisión.
BEGIN;
SET LOCAL lock_timeout = '2s';
ALTER TABLE public.integracion_sync_estado
    ADD COLUMN avisos_activados boolean NOT NULL DEFAULT true;
ALTER TABLE public.eventos_integracion
    ADD COLUMN aviso_publicado boolean NOT NULL DEFAULT true;
-- La auditoría de integraciones no pertenece a una reservación.
ALTER TABLE public.bitacora ALTER COLUMN id_reservacion DROP NOT NULL;
INSERT INTO public.integracion_sync_estado (provider, source, last_history_id)
VALUES ('fareharbor', 'publicacion', '0'), ('getyourguide', 'publicacion', '0');

-- El receptor existente no necesita actualizar su código ni obtener permisos nuevos.
-- El bloqueo compartido se mantiene hasta COMMIT y se serializa con Activar/Pausar.
CREATE FUNCTION public.controlar_publicacion_integracion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE activo boolean;
BEGIN
    IF NEW.provider IN ('fareharbor', 'getyourguide') THEN
        SELECT avisos_activados INTO STRICT activo
        FROM public.integracion_sync_estado
        WHERE provider = NEW.provider AND source = 'publicacion' FOR SHARE;
        NEW.aviso_publicado := activo;
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.controlar_publicacion_integracion() FROM PUBLIC;
CREATE TRIGGER trg_controlar_publicacion_integracion
BEFORE INSERT ON public.eventos_integracion FOR EACH ROW
EXECUTE FUNCTION public.controlar_publicacion_integracion();
CREATE INDEX idx_eventos_integracion_no_publicados
    ON public.eventos_integracion(provider) WHERE aviso_publicado = false;
COMMIT;
