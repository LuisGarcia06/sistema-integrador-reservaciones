# FareHarbor: altas, modificaciones y cancelaciones

## Contrato y clasificación

El mismo webhook HTTPS y su KEY reciben snapshots de `booking`. FareHarbor
documenta el UUID como identidad estable de la reserva; el cuerpo no acredita por
sí solo qué disparador produjo el envío. No se inventan cabeceras, firmas,
`type`, `event_id` ni llamadas a la API externa.

- `status=cancelled`: `cancellation`, incluso si no se había recibido el alta.
- `status=booked`, con vínculo o evento anterior del mismo UUID: `modification`.
- `status=booked`, sin vínculo ni historial: `new_booking` (primer snapshot visto).
- Otros estados, incluido `rebooked`, no se interpretan como estos tres eventos.

La segunda regla también funciona mientras el alta inicial está `pending_review`:
no exige crear antes la reservación interna. La primera entrega de una reserva
antigua que nunca se haya visto y no tenga vínculo no permite diferenciar un alta
de una modificación con certeza; permanece pendiente como primer snapshot.

Referencias oficiales: [Booking notifications](https://fareharbor.com/api/external/v1/#webhooks)
y [Booking UUID y seguridad](https://developer.fareharbor.com/api/external/v1/home).

## Reutilización y revisión manual

El modo privado ampliado requiere `bookingChangesAuthorized=true`,
`creationsOnlyConfirmed=false` y `autoApplyUserId=null`. Conserva la política de
captura previamente autorizada, las dos rutas del receptor, autenticación por
comparación constante, TLS y diagnóstico sin contenido de clientes o credenciales.
El modo anterior de solo New bookings conserva su compatibilidad.

El servicio existente clasifica y registra los eventos en `eventos_integracion`.
Cada nuevo evento queda `pending_review / not_applied`. La recepción ampliada no
llama a los servicios de aprobación, aplicación, modificación o cancelación
internas, ni inserta vínculos automáticamente.

Todos los snapshots conservan `external_booking_id` y `normalized_data.booking.uuid`.
Los previews ya implementados consultan `reservas_integracion_link` por proveedor
y UUID para encontrar la reservación interna correspondiente. Si no existe ese
vínculo, el evento sigue pendiente; no se asocia por nombre, teléfono o coincidencias
aproximadas. La decisión sigue correspondiendo al administrador.

Se reutiliza la huella canónica del mapper y la restricción única existente de
proveedor + `external_event_id` (UUID + huella). El bloqueo transaccional por UUID
evita carreras. Snapshots distintos del mismo UUID se conservan; el mismo snapshot
se deduplica aunque llegue tras otro cambio, después de un reinicio o cuando el
evento original ya se haya revisado. Se responde 200 después de COMMIT; ante error
se revierte y se devuelve 503 con `Retry-After`.

La identidad disponible es de snapshot, no de ocurrencia: una reversión a un
snapshot idéntico a uno ya recibido es indistinguible de una reentrega. La huella
sigue cubriendo los campos operativos que ya normaliza el mapper; campos excluidos,
como notas, email o datos de pagos, no generan un evento distinto por sí solos.
No se guarda el payload completo ni se añaden columnas para resolver esa limitación.

## Avisos

El backend y el frontend existentes admiten `new_booking`, `modification` y
`cancellation`, con etiquetas Alta, Modificación y Cancelación. Se conserva el
criterio operacional actual: Avisos muestra el snapshot más reciente por UUID;
los anteriores permanecen en el historial. Una cancelación más reciente desplaza
una modificación anterior en Avisos sin borrar ni aplicar ninguno de esos eventos.

No se modifican fuentes del frontend, permisos de roles, esquema PostgreSQL ni la
versión protegida de Electron. La revisión y las acciones del administrador usan
los flujos existentes.

## Verificación y despliegue

Se verificaron 353 pruebas de 18 suites seleccionadas: recepción de los tres tipos,
UUID compartido, varios cambios válidos, duplicados, reinicio, errores transaccionales,
autenticación/TLS, compatibilidad anterior, controles manuales, notificaciones y
etiquetas de Modificación/Cancelación en Electron con API ficticia.
No se enviaron webhooks sintéticos al receptor real ni se escribieron datos de prueba
en PostgreSQL principal.

Antes del despliegue se registraron en solo lectura conteos y SHA-256 de 1,150
reservaciones, 140 eventos y 8 vínculos, además de las huellas de los seis archivos
privados de credenciales/TLS. El evento #140 se encontraba `new_booking /
pending_review / not_applied`.

El despliegue terminó el **20/10/2026 a las 20:54:06, hora de Cancún**, con
`FH_CONTINUOUS_READY`. Se actualizaron los cuatro archivos del runtime privado y
sus SHA-256 en `continuous.json`, habilitando el alcance ampliado. No se modificó
la definición, los permisos ni los disparadores de la tarea Windows existente.

La solicitud inicial de UAC se canceló antes de cambiar el receptor. El intento
posterior que esperaba la recuperación automática no obtuvo un nuevo estado listo
en 110 segundos y restauró la versión anterior; esta se arrancó con los permisos
existentes. No se debe interpretar `RestartCount/RestartInterval` como prueba de
que se observó un reinicio automático en un minuto. El disparador periódico de
cinco minutos sigue configurado como recuperación adicional.

El traspaso final publicó los archivos, permitió el cierre controlado del proceso
anterior y solicitó el arranque de su misma tarea con los permisos ya disponibles.
Desde la publicación final hasta estado listo transcurrieron unos 13 segundos.
La pausa anterior durante el intento con restauración fue de aproximadamente
2 minutos y 17 segundos. No se promete un despliegue sin interrupción; FareHarbor
documenta reintentos ante fallos de entrega y el receptor mantiene la deduplicación.

La comprobación posterior de las **20:54:49** confirmó conteos y SHA-256 intactos
para las 1,150 reservaciones, los 140 eventos anteriores y los 8 vínculos. El evento
#140 conserva tipo y estados originales. Los seis archivos privados, el dominio y
las huellas de todas las fuentes coincidieron. No había nuevas entregas reales de
modificación o cancelación durante esa comprobación.

Se observaron un solo listener `127.0.0.1:3443`, un solo ngrok conectado y la tarea
`Running`; la ascendencia fue `services.exe → svchost.exe → powershell.exe →
node.exe → ngrok.exe`, en sesión 0 y sin Codex. El XML de la tarea conserva su
SHA-256 previo. Los informes privados son `booking-events-baseline.json`,
`booking-events-deployment-result.json` y `booking-events-verification.json`.
La carpeta `booking-events-deployment-20261020/` conserva candidatos y respaldos.

Fuentes de producción modificadas:

- `scripts/integrations/fareharbor.cjs`.
- `scripts/integrations/fareharborContinuous.cjs`.
- `backend/integrations/fareharbor/fareharborContinuous.service.js`.
- `backend/integrations/fareharbor/fareharborWebhook.service.js`.

Cobertura actualizada en `fareharborContinuous.test.js`,
`fareharborWebhook.service.test.js`, `fareharborWebhook.routes.test.js`,
`fareharborSupervisor.test.js` (fixture del adaptador histórico) y los dobles
`helpers/integrationReceiversFake.cjs` y `helpers/notificacionesUiHarness.cjs`.

El administrador debe conservar **New bookings** y activar **Updated bookings**
y **Cancelled bookings** en el webhook actual después de confirmar el despliegue
y el estado listo del receptor. No cambiar URL, KEY ni esquema de datos enviado.
La comprobación con dobles no sustituye observar una modificación y una cancelación
auténticas una vez activados los disparadores.
