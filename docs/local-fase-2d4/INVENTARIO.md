# Inventario previo — Operaciones original

Se revisaron frontend/pages/operaciones.js, sus servicios/controladores/validadores, los módulos compartidos y la entrada command-api-lab/020 antes de cargar esta pantalla.

| Acción | Solicitudes y efectos originales | Tratamiento del laboratorio |
| --- | --- | --- |
| Login/layout | POST auth/login; GET sesión al solicitar datos y por foco/timer; logo y preferencia de menú; invalidación de páginas | Originales, datos sintéticos; solo enlace Operaciones; sin notificaciones |
| Abrir Operaciones | GET tours, guias; GET operaciones/sugeridas?fecha, operaciones?fecha, daily/operativo?fecha | Lecturas exactas necesarias; no se monta la pantalla Daily |
| Actualizar / foco | Mismas tres lecturas; actualización de catálogos/transportes si su panel estuviera abierto | Refresco original no ejecuta mientras hay formulario; panel transportes bloqueado |
| Fecha del listado | Cierra panel de transporte y vuelve a consultar tres lecturas | Conservado; no reemplaza el modal o su captura |
| Nueva operación | Render original, validación; UN POST operaciones; luego GET del listado | Confirmación, cuerpo completo, precondición vinculada y UUID; una transacción protegida |
| Preparar sugerencia | Mismo formulario con contexto fijo, guía/hora elegidas por personal; UN POST operaciones | Mismo contrato de alta, sin transporte o reservas automáticos |
| Editar | Antes usaba fila del listado, PATCH diferencial y GET listado | Foto autorizada antes de abrir; original/propuesta/actual; recibo y recuperación |
| Gestionar/agregar/editar transporte | GET transportes, daily, operadores, vehículos; POST/PATCH transportes | Botones y manejadores bloqueados; rutas/assets no necesarios fuera de lista |
| Organizar / asignar / mover / quitar reserva | GET Daily, PATCH reservaciones/:id/transporte | Bloqueados en este ámbito; el laboratorio de Reservaciones conserva su funcionalidad independiente |

**Atomicidad revisada:** handleSubmit solo envía POST operaciones, o PATCH operaciones/:id; no crea un transporte después ni asigna reservaciones. El servicio de creación inserta una fila y consulta su representación con el cliente de la transacción existente. El servicio de edición usa la transacción y validaciones de dependencias existentes. command-api-lab incluye ese trabajo y su recibo en el COMMIT exterior. No hay secuencia de escritores dependientes que se habilite parcialmente.

**Bitácora real:** los servicios actuales de Operaciones no insertan bitácora. No se añade auditoría nueva ni se cambian servicios. Los recibos de estas operaciones conservan ids_bitacora vacío. Se comprobarán operación/comando atómicos y bitácora sin modificaciones parciales; las regresiones de Reservaciones vuelven a comprobar su auditoría y rollback. Esto se informará expresamente, sin presentar una auditoría inexistente como integrada.

Entrada explícita nueva: carga login/layout/ui/transportesUi y los formularios originales de Operaciones, además del modelo/adaptador/comparador/recibo existentes. No carga Reservaciones, Daily, usuarios, catálogos completos, notificaciones o integraciones. Escritores únicos POST /api/operaciones y PATCH /api/operaciones/:id. Perfil de Reservaciones y perfiles anteriores conservan sus políticas.
