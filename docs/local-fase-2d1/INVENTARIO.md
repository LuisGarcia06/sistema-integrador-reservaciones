# Inventario previo a cargar la pantalla original (Fase 2D.1)

Inspeccionado antes de iniciar el laboratorio integrado. La entrada principal y sus perfiles no se cambian.

| Código que se carga | Solicitudes / efectos | Restricción del laboratorio |
| --- | --- | --- |
| `ui.js`, CSS originales | Escape HTML, renderizado, imágenes de impresión | Sin acceso a datos; impresión bloqueada |
| `api.js` | Fetch, autenticación, abortos, evento datosactualizados | Guardia de comandos y proxy con lista cerrada |
| `auth.js` | POST login, GET sesión al solicitar datos, cada 30 s, foco/visibilidad; invalida páginas al cambiar identidad/permisos | Usuarios sintéticos; JWT solo en memoria; limpieza conservada |
| `layout.js` | Logo, preferencia localStorage del menú, logout; notificaciones solo si existe su módulo | Solo logo estático; no se carga notificaciones; enlaces ajenos retirados |
| `login.js` | POST login, navegación dashboard | Router del laboratorio dirige a Reservaciones original |
| `pages/reservaciones.js` | GET tours/paises/plataformas, GET listado con filtros/paginación, GET detalle; caché de filtros en memoria | Solo lecturas autorizadas, consultas parametrizadas del backend existente |
| Modal original: edición | PATCH reservaciones/:id | Único escritor de datos expuesto; foto autorizada, confirmación y sobre command-api-v1 |
| Modal original: alta / cancelación | POST reservaciones, PATCH reservaciones/:id/cancelar | Bloqueados en controles, manejadores, guardia y proxy |
| Impresión original | GET detalle, creación DOM, carga logo, window.print, timers y afterprint | Bloqueada antes del manejador |
| revisionLab / commandLab / comparador / recibo | POST precondiciones al abrir o tras decisión; PATCH protegido; GET comando y detalle actual | El conflicto integrado compara mediante GET, sin obtener otra precondición. Precondiciones solo para PATCH reservaciones/:id; ninguna repetición automática |
| Nuevo adaptador y arranque | Paneles dentro del modal existente; navegación restringida; aviso beforeunload | Intención solo en memoria; modal irresuelto no se puede sustituir o cerrar mediante la aplicación |

No se cargan app.js/router.js principales, dashboard, Operaciones, Daily, Usuarios, Configuración, Historial, Bitácora, Integraciones, transportes, notificaciones ni centro de avisos. No se sirven index.html ni sus scripts no inventariados. Los sincronizadores/receptores y rutas heredadas permanecen inaccesibles desde el proxy. La API command-api-lab conserva sus verificaciones completas, identidad, permisos y esquema 020 sobre un clúster nuevo. El resto de formularios del laboratorio anterior conserva sus propias restricciones.

El host reutiliza exclusivamente el transporte y fallos controlados del laboratorio de comandos; su política integrada es estática y más estrecha. Se verificará el tráfico real y cada escritura deberá ser PATCH de una reservación y llevar las cinco cabeceras del contrato. Los controles de fallos son IPC del corredor, nunca endpoints HTTP.
