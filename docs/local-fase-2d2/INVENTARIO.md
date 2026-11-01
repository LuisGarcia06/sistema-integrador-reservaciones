# Inventario previo — 2D.2

Se extiende el host integrado de 2D.1, manteniendo su aprovisionamiento y verificaciones command-api-lab/020. La entrada principal y los perfiles anteriores no cambian.

Además del inventario de 2D.1, se incorpora `transportesUi.js`: presentación original de vehículo, grupo y PAX, controles originales Asignar/Mover/Quitar asignación y lector de destino extraídos de Operaciones. Son funciones de presentación, sin llamadas HTTP ni efectos al cargarse. Operaciones sigue sin montarse ni servirse; sus renderizadores originales usan estas mismas funciones y conservan su HTML. No se cambia frontend/index.html.

El modal original de cancelación conserva cliente/código y motivo obligatorio; antes de abrirlo se obtiene su propia foto autorizada. El transporte usa el detalle original de Reservaciones en lectura y los controles originales compartidos, sin otro formulario de demostración.

Nuevos escritores exclusivos: PATCH /api/reservaciones/:id/cancelar y PATCH /api/reservaciones/:id/transporte. Ambos requieren las cinco cabeceras del host y la guardia privada del CommandSession existente. Otras altas/modificaciones permanecen bloqueadas.

Lecturas nuevas exactas: GET /api/operaciones?fecha=YYYY-MM-DD y GET /api/transportes?id_operacion_tour=<entero positivo>. Se conservan solo operaciones autorizadas de la fecha/tour/turno de la foto y sus transportes; el backend comprueba las relaciones y capacidades al escribir. No se monta Daily, ni editores de vehículos, catálogos, usuarios u operaciones. La comparación hace GET de la reservación y no obtiene otras precondiciones antes de una decisión confirmada.

Login, refresco de permisos, catálogos de la edición, filtros, eventos, cierre y controles de Electron conservan los efectos inventariados en 2D.1. Cancelar/reasignar solo muestran confirmación definitiva con recibo durable; errores conservan el modal y propuesta. No hay reenvíos, autoasignación, persistencia ni conexión directa a PostgreSQL desde renderer.
