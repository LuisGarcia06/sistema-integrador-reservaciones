# Recepción continua de FareHarbor

Actualización del 20/10/2026: el alcance ampliado para New bookings, Updated bookings
y Cancelled bookings, sus verificaciones y límites se describen en
[FareHarbor: tres eventos](FAREHARBOR-TRES-EVENTOS.md). El modo ampliado conserva
todos los eventos pendientes y rechaza las altas internas automáticas. Las
referencias a «solo New bookings» de la preparación histórica siguiente describen
el modo anterior.

## Alcance preparado

El receptor independiente conserva HTTPS en `127.0.0.1:3443`, el dominio
`fleshed-patchy-cassette.ngrok-free.dev` y ambas rutas existentes. No publica
Electron/3000 ni PostgreSQL/5432. No utiliza API directa de FareHarbor.

Fuentes preparadas en esta tarea:

- `scripts/integrations/fareharbor.cjs` (extensión del receptor existente).
- `backend/integrations/fareharbor/fareharborContinuous.service.js` (persistencia y aplicación segura).
- `scripts/integrations/fareharborContinuous.cjs` (supervisor continuo).
- `scripts/Start-FareHarborContinuous.ps1` (lanzador y arranque automático).
- `backend/__tests__/fareharborContinuous.test.js` (26 pruebas aisladas).
- Este procedimiento. No se modificó la configuración ni la copia protegida de Electron.

El modo continuo no tiene duración máxima, UUID seleccionado, marcador ni límite
global de un evento. La inscripción debe seguir siendo exclusiva y **New bookings**.
FareHarbor no acredita el disparador con una firma o campo de evento obligatorio:
la autenticación usa la KEY privada y el disparador se restringe en FareHarbor.
Un estado diferente de `booked` se ignora sin escrituras.

Se bloquea transaccionalmente cada UUID y se consulta su identidad persistida antes
de insertar. Reintentos y snapshots diferentes de un mismo UUID no generan otra
alta ni modifican eventos/reservaciones anteriores. El HTTP 200 de recepción solo
se emite después del COMMIT; fallos transitorios reciben 503 y Retry-After.

Los datos reales normalizados se conservan en `eventos_integracion`. Los pendientes
se consultan mediante el servicio de notificaciones actual y Electron → Avisos →
Actualizar. Esto no demuestra una entrega real: aún se necesita observar un webhook
auténtico aceptado; las pruebas con dobles no son recepciones de FareHarbor.

## Creación interna

Se reutilizan los servicios de preview, aprobación, aplicación, capacidad, vínculo
y bitácora existentes, sin completar datos inventados. La configuración privada
`autoApplyUserId` es `null` mientras no se autorice una identidad de auditoría.
No se elige un administrador por defecto ni se crea una cuenta.

Con una identidad explícita de Administrador activo y todos los datos válidos,
la aplicación de una **nueva** alta ocurre dentro de la transacción de recepción.
Datos incompletos, equivalencias ausentes, moneda incompatible, capacidad insuficiente
o fallos en la aplicación revierten la aprobación y la creación interna mediante
savepoint, conservando el evento `pending_review` / `not_applied`. Los UUID ya
registrados nunca se reaplican. No se crean usuarios, permisos o columnas.

## Arranque, recuperación y detención

Fuente del lanzador: `scripts/Start-FareHarborContinuous.ps1`. Configuración privada:
`%LOCALAPPDATA%\CommunityTours\integrations\fareharbor\continuous.json`.
Reutiliza los archivos KEY, authtoken y TLS privados existentes; no los copia al
repositorio ni los transmite por argumentos.

El arranque utiliza una copia privada de las 30 fuentes necesarias en
`%LOCALAPPDATA%\CommunityTours\integrations\fareharbor\runtime`, con ACL de usuario
y SYSTEM. Las dependencias se leen de `node_modules` de la versión protegida
existente, sin modificarla. El proceso no ejecuta el código modificable por otros
usuarios en A:. Las fuentes se fijan por SHA-256; para desplegar futuros cambios
se requiere actualizar explícitamente la copia privada y sus huellas.

```powershell
$launcher=Join-Path $env:LOCALAPPDATA 'CommunityTours\integrations\fareharbor\runtime\scripts\Start-FareHarborContinuous.ps1'
# Solo en la preparacion inicial, antes de recibir eventos; no repetir tras la activacion.
& $launcher -InitialValidate

# Previsualizar la tarea sin instalar ni abrir otro receptor:
& $launcher -Install -DeferStart -PreviewTask

# En PowerShell elevado, con autorizacion Windows previa:
# registrar deshabilitada para permitir el traspaso controlado del receptor existente.
# KeepAwakeOnAC solo debe usarse si se autorizo evitar la suspension con corriente.
& $launcher -Install -DeferStart -KeepAwakeOnAC

# Detención controlada y deshabilitación de la tarea, sin matar procesos ajenos:
& $launcher -Stop
```

`-Install` requiere elevación de administrador y crea la tarea
`CommunityTours-FareHarborContinuous`, con la misma cuenta y privilegios limitados.
Usa inicio de sesión por lotes S4U, sin almacenar una contraseña Windows ni correr
como SYSTEM. Arranca con Windows y al iniciar sesión; además, un disparador
indefinido cada cinco minutos recupera arranques omitidos o procesos terminados.
La condición de red y `StartWhenAvailable` evitan depender del momento en que
Windows obtenga conexión. No se usan recursos compartidos ni autenticación Windows
remota: PostgreSQL es local y ngrok utiliza su configuración privada existente.

La tarea no tiene límite de ejecución y usa `IgnoreNew`: los disparadores no
duplican un receptor que ya esté funcionando. Los fallos del lanzador tienen hasta
999 reintentos con intervalo de un minuto; el disparador periódico permanece
disponible después. El supervisor conserva su propia recuperación del túnel.
`-DeferStart` registra la tarea deshabilitada; solo se habilita e inicia cuando el
receptor anterior terminó y el puerto está libre. Sin esa opción, la instalación
inicia la tarea inmediatamente y debe hacerse sin otro receptor en ejecución.

`-KeepAwakeOnAC` desactiva la suspensión por inactividad únicamente en corriente
alterna, con autorización explícita; conserva la configuración de batería. La
computadora debe permanecer encendida, sin suspender, y conectada a Internet para
recibir. No se necesita Codex abierto ni una sesión interactiva del usuario.

El supervisor mantiene la escucha HTTPS mientras ngrok se reconecta y reinicia
únicamente su hijo con espera creciente si termina. Cambios en configuraciones,
credenciales, certificado o código fijado por SHA-256 detienen la recepción.
Windows Job Object termina los hijos propios si muere el supervisor. La detención
deja de aceptar conexiones y permite cerrar las solicitudes activas.

El certificado local existente vence el **27 de octubre de 2026 a las 03:35:32 UTC**;
debe renovarse coordinadamente con la CA que ngrok verifica, antes de vencer.
No se ignora su validación ni se promete renovación automática inexistente.

Los diagnósticos privados contienen solo estado, contador y último código HTTP,
sin URL, KEY, payload, UUID, nombres, teléfonos o tokens. No se habilitan el
inspector local ni logs de ngrok. Los sondeos públicos sanos se espacian a 15 minutos
(~2,880 solicitudes/mes), sin limitar la duración del receptor. El plan Free tiene
cuotas de solicitudes y transferencia; no garantiza disponibilidad sin interrupciones.

El respaldo se valida por SHA-256, identidad, inventario y verificación de pg_restore.
La preparación inicial compara su inventario con PostgreSQL en solo lectura. En
reinicios posteriores se verifican identidad/esquema/permisos e integridad del
respaldo, sin exigir que los nuevos eventos coincidan con una copia anterior.
No se restauran bases ni se ejecutan pruebas contra PostgreSQL principal.

## Bloqueo cloud y solución directa

### Autorización supervisada posterior, 20/10/2026

El usuario autorizó expresamente recibir cualquier New bookings real, conservar
Full Capture como **NO CONFIRMADO**, supervisar sin plazo de 15 minutos y registrar
solo eventos `pending_review` / `not_applied`. Esta autorización permite el arranque
manual supervisado cuando los demás controles pasan. No acredita que la captura
cloud esté desactivada ni autoriza altas internas automáticas. Una captura detectada
activa sigue bloqueando el arranque; no se habilita inspección local ni logging.

La política compartida está en `scripts/integrations/fareharborCapturePolicy.cjs`.
Se requiere constancia privada explícita de recepción real autorizada y del estado
desconocido; `autoApplyUserId` debe ser `null`. La autorización posterior del usuario
para completar la recepción independiente permite usar esa misma política al
instalar la tarea. No se cambia la evidencia cloud a «desactivada» ni se permite
una captura detectada activa. El instalador y el lanzador de la tarea rechazan
las altas internas automáticas.

### Instalación independiente verificada, 20/10/2026

El usuario autorizó instalar la tarea, recuperar fallos y arrancar con Windows,
además de evitar la suspensión automática mientras el equipo tenga corriente.
Se registró primero la tarea deshabilitada, con UAC. Se actualizaron únicamente
el lanzador del runtime privado y su SHA-256 en `continuous.json`; se conservaron
KEY, authtoken, TLS, dominio, rutas y lógica de deduplicación.

El traspaso cerró el receptor anterior mediante su control de integridad y esperó
a que terminaran el receptor y su túnel antes de habilitar la tarea. El intervalo
desde el inicio del traspaso hasta `FH_CONTINUOUS_READY` fue de aproximadamente
14 segundos, sin instancias simultáneas. El nuevo estado listo quedó registrado
el **20 de octubre a las 20:05:41, hora de Cancún**.

Se verificó la cadena `services.exe → svchost.exe → powershell.exe → node.exe →
ngrok.exe`, en sesión 0 y sin Codex entre los procesos antecesores. La tarea estaba
`Running`, había un solo listener en `127.0.0.1:3443` y un solo ngrok con conexión
HTTPS establecida. La comprobación pública propia del supervisor fue satisfactoria.
Esto comprueba la ejecución bajo el Programador de tareas; no se reinició Windows
ni se provocaron fallos para volver a ensayar recuperación.

Las consultas de integridad se hicieron en transacciones de solo lectura:
**1,150 reservaciones y 139 eventos anteriores conservaron conteos y SHA-256**.
Los cinco archivos privados de autenticación/TLS y todas las fuentes fijadas
coincidieron con sus huellas. `autoApplyUserId` continúa en `null`; no se enviaron
webhooks sintéticos ni se repitieron las pruebas anteriores. No había eventos nuevos
al finalizar esta comprobación; la disponibilidad no acredita una entrega nueva
de FareHarbor.

Los informes y el respaldo del traspaso permanecen en la carpeta privada:
`windows-task-transition-baseline.json`, `windows-task-transition-result.json`,
`windows-task-verification.json` y `windows-task-transition-rollback/`.
No contienen payloads ni valores de credenciales. La suspensión por inactividad
quedó en 0 segundos con corriente (desactivada) y 600 segundos con batería.

El certificado local sigue venciendo el **26 de octubre de 2026 a las 22:35:32,
hora de Cancún**. La independencia de Codex no renueva el certificado: debe
coordinarse su renovación antes de esa fecha para mantener la recepción.

Referencia de la identidad S4U y su restricción de recursos de red autenticados:
[Microsoft, Security Contexts for Tasks](https://learn.microsoft.com/en-us/windows/win32/taskschd/security-contexts-for-running-tasks).
La conexión real de ngrok bajo esta identidad se verificó en este equipo.

### Estado de la comprobación cloud

**Full Capture cloud: NO CONFIRMADO.** Desactivar `--inspect` y el inspector local
no verifica ni modifica la captura en la nube. La API oficial requiere una API key
de administración diferente del authtoken. No se encontró un endpoint público
documentado que permita consultar ese ajuste con las credenciales existentes; no
se inventa uno ni se prueba el authtoken como API key.

La documentación oficial de ngrok indica que la captura completa es opt-in, pero
eso no prueba el estado de esta cuenta. Para cerrar este punto sin buscar otra vez
en el panel, solicitar confirmación escrita de soporte de ngrok de que Full Capture
está desactivado para la cuenta asociada al dominio, y que no se almacenan cuerpos,
cabeceras ni la KEY de la URL. Registrar la respuesta como evidencia privada
(`cloudCaptureEvidence.status/source/verifiedAt`), sin credenciales, antes de habilitar.
No se ha enviado una consulta a soporte en nombre del usuario.

La especificación OpenAPI oficial también se revisó sin encontrar una operación
de Full Capture; no se obtuvo el estado de la cuenta por API. Un authtoken válido
no prueba que la captura cloud esté desactivada.

Texto listo para `support@ngrok.com`, desde el correo titular de la cuenta:

> Nuestro dominio es fleshed-patchy-cassette.ngrok-free.dev, plan Free.
> Recibiremos webhooks de FareHarbor con datos personales y una KEY en la URL.
> No aparece Full Capture en nuestro panel. Confirmen y, si corresponde, desactiven
> la captura completa para esta cuenta. Necesitamos saber si se guardan cuerpos,
> cabeceras o parámetros de consulta, cómo excluirlos y si existe un endpoint oficial
> de solo lectura para verificar el ajuste automáticamente. No adjuntamos secretos
> ni payloads de clientes.

La alternativa que impide técnicamente a ngrok descifrar el contenido es terminar
TLS en nuestro extremo mediante un túnel TLS/TCP, con certificado público válido.
El plan Free no ofrece endpoints TLS sin terminación en ngrok; TCP tiene otros
requisitos y no conserva directamente esta URL HTTPS. No se cambia el plan, dominio,
proveedor o inscripción unilateralmente. La solución más corta conservando la
configuración actual es la confirmación de soporte, no otro laboratorio.

Referencias oficiales consultadas el 20/10/2026:

- https://fareharbor.com/api/external/v1/#webhooks
- https://ngrok.com/security
- https://ngrok.com/docs/api
- https://ngrok.com/docs/pricing-limits/free-plan-limits
- https://ngrok.com/support
- https://github.com/ngrok/ngrok-openapi/blob/main/ngrok.yaml
