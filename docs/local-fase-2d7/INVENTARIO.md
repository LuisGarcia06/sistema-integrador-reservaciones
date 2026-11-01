# Inventario previo a cargar las pantallas — 2D.7

Revisados AGENTS.md, Historial, Bitácora, Dashboard, Notificaciones, Centro de Avisos, auth/api/router/app/layout y sus rutas/servicios reales. Esta entrada todavía no se había cargado al preparar el inventario.

| Componente | HTTP y efectos existentes |
|---|---|
| Autenticación | POST /api/auth/login, GET /api/auth/sesion. Token/usuario en memoria; renovación existente cada 30 segundos y foco/visibilidad. Logout local invalida solicitudes y páginas. |
| Historial | GET /api/tours, /api/plataformas; GET /api/reservaciones con page,limit,include_resumen_tours=1,fecha_hasta y filtros opcionales fecha_desde,id_tour,turno,estado,id_plataforma,codigo,nombre. Ayer es el máximo; excluye hoy/futuro. Paginación 25/50/100 y resumen por tour. Detalle se construye con la fila autorizada, sin un GET adicional ni escritor. Filtros/página solo en memoria por usuario. |
| Bitácora | GET /api/bitacora con fecha_desde/fecha_hasta opcionales. Fecha, actor/correo, acción, reservación/código y descripción. Sin paginación ni filtros por actor/acción. Anterior/nuevo aparecen como texto de descripción, no columnas estructuradas. Cancelación incluye motivo; modificación genérica no tiene un motivo obligatorio. |
| Centro de Avisos | Componente original del Dashboard. GET /api/dashboard/resumen?fecha=...; GET /api/eventos-integracion/centro con tab,q,provider,event_type,review_status,from,to,date,page,limit,archived,urgent,sort; GET /api/eventos-integracion/centro/:id/historial?page=...&limit=25. Pestañas, agrupación, filtros/orden y paginación originales. Filtros/expansión en memoria. |
| Consultar evento | Modal original: GET /api/eventos-integracion/:id y, según tipo, /:id/diff; GET /api/tours si necesita catálogo. Tras mostrar detalle vigente marca visto localmente. |
| Notificaciones | GET /api/eventos-integracion/resumen. Sondeo existente de 60 s/backoff, pausa oculta, coordinación Web Locks/BroadcastChannel y actualización manual/foco. Visto conserva IDs/tiempos en localStorage por environment_id y usuario. No es acuse en PostgreSQL. No hay servicio externo ni nueva API de leído/preferencias. |
| Layout | Preferencia del menú en localStorage, sin escritura de negocio. |
| Escritores existentes bloqueados | Aprobar/rechazar: PATCH /api/eventos-integracion/:id/revision. Aplicar: POST /:id/aplicar. Archivar: PATCH /:id/archivo. No se habilitan ni se inventan acciones nuevas. |

No se necesita IPC de producto: no se carga preload ni se exponen impresión/archivos. IPC privado padre/hijo solo coordina ensayos, fuera del renderer.

Permisos vigentes: Administrador accede a Historial/Bitácora/Dashboard/avisos; Consulta all a Historial/Dashboard/avisos, nunca Bitácora; Consulta selected, también sin plataformas, solo Dashboard filtrado dentro de estas páginas. Sin Historial, Bitácora ni avisos/centro/detalles externos. No reinterpretar por suposición el requisito general de Historial.

Auditoría existente: Reservaciones registra CREAR, MODIFICAR y CANCELAR. Modificación describe `campo: anterior -> nuevo`; cancelación contiene motivo. Asignar/mover/quitar transporte de reservación registra MODIFICAR. Operaciones, Transportes y observaciones generales Daily no generan bitácora propia; sus comandos no se mostrarán como auditoría.

La búsqueda completa de llamadas a bitacora.service también encontró en integracionesControl.service las acciones INTEGRACION_ACTIVADA e INTEGRACION_PAUSADA, con id_reservacion=null. Son auditorías existentes de controles externos, verificadas por inspección y no ejecutadas en este ensayo. Revisar/rechazar/archivar un evento no agrega por sí mismo una entrada propia mediante este servicio; la aplicación que utiliza servicios de Reservaciones puede producir las auditorías de la reservación afectada. No se habilitan esos controles ni se fabrican entradas para representarlos.

El coordinador generará modificaciones/cancelación sintéticas por la API protegida existente, verificando recibos y filas reales. No expone esas acciones en el ámbito de consultas ni inserta filas ficticias en bitacora. Checksums y ledger demostrarán que consultas/estados locales no modifican PostgreSQL.

Se reutilizan páginas, router, app y componentes originales. Hooks optativos dejan solo Cerrar y campos deshabilitados en el modal Dashboard. Guard del cliente: GET/HEAD y login. Proxy con rutas/parametría/assets cerrados. Los servicios, esquema, roles y módulos originales de consulta se conservan. Huellas previas: ../local-fase-2d7-before.json; copias puntuales: before/.
