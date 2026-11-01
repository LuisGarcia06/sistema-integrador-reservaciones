# Inventario previo a habilitar Transportes — Fase 2D.5

Inspección: AGENTS.md, página original Operaciones, transportesUi, adaptadores de comandos, contrato ctsk-command-api-v1, rutas/controladores/validadores/servicio Transportes, capacidad.service y políticas de laboratorio.

| Momento del flujo original | Solicitudes |
|---|---|
| Login y comprobación de permisos | POST /api/auth/login, GET /api/auth/sesion |
| Abrir Operaciones / cambiar fecha / actualizar | GET /api/tours, /api/guias; GET /api/operaciones/sugeridas?fecha=..., /api/operaciones?fecha=..., /api/daily/operativo?fecha=... |
| Gestionar el grupo seleccionado | GET /api/operadores, /api/vehiculos, /api/transportes?id_operacion_tour=..., /api/daily/operativo?fecha=... |
| Abrir formulario original de alta | Antes no consultaba precondiciones. Lee la operación seleccionada en el panel. No escribe. |
| Guardar alta | Un POST /api/transportes con id_operacion_tour, id_operador, observaciones_operador y estado. No captura vehículo: el backend exige al menos 2 PAX antes de asignarlo. |
| Abrir formulario original de edición | Antes usaba la representación de la lista. El adaptador obtiene POST /api/precondiciones para PATCH /api/transportes/:id antes de renderizar. |
| Guardar edición | Un PATCH /api/transportes/:id diferencial entre operador, vehículo, observaciones y estado. La operación es contexto fijo del panel, no un selector editable. |
| Refrescar después de guardar | GET /api/transportes?id_operacion_tour=... y /api/daily/operativo?fecha=...; el recibo permanece visible. |
| Ver reservaciones del grupo | GET /api/daily/operativo?fecha=...; asignar/mover/quitar sería PATCH /api/reservaciones/:id/transporte y queda BLOQUEADO en este ámbito. La implementación anterior de Reservaciones no cambia. |
| Recuperar / consultar recurso | GET /api/comandos/:clave; después de recibo confirmado, GET /api/transportes/:id. |

La creación requiere una operación existente, elegida humanamente al abrir Gestionar/Agregar transporte. La FK conserva su existencia y la unicidad conserva un transporte por operación. Ni alta ni edición originales emiten varias escrituras dependientes. No se crea operación, vehículo, operador o reservación automáticamente. El único INSERT y la representación de retorno usan operationalTransactions.creation; PATCH usa la transacción existente del servicio. La API de comandos integra la escritura y el ledger en la misma transacción externa. Se verificará con XID/PID y fallo inyectado después del INSERT del comando.

Transportes no escribe bitácora propia: no importa bitacora.service ni tiene INSERT de auditoría. No se agrega esa conducta en esta fase. También permanece pendiente la auditoría propia de Operaciones. Los ids_bitacora vacíos de sus recibos son coherentes con ese límite; el ledger durable no sustituye historial humano de cambios.

Cambios previstos: tres archivos existentes (operaciones.js, commandLab.js y host de ensayo); entrada y adaptador optativos, política cerrada y laboratorio Transportes reutilizando infraestructura 2D.4. Principal, servicios, migraciones y asignaciones anteriores permanecen sin cambios.

Respaldo puntual anterior a los cambios en before/; inventario SHA-256 anterior en ../local-fase-2d5-before.json. No se usa reset, clean ni restauración masiva.
