# Preparación de primera recepción FareHarbor

Estado: **preparado, desactivado y sin URL publicada**. No se registró ningún webhook ni evento en principal durante esta preparación. No se usa la API directa.

Actualización del 20 de octubre de 2026: el usuario confirmó que el dominio `fleshed-patchy-cassette.ngrok-free.dev` está asignado a su cuenta Free. FareHarbor ya tiene una inscripción con la ruta `/api/integraciones/fareharbor/webhook` y los tres disparadores New, Updated y Cancelled bookings. Esta preparación no modificó esa inscripción. La asignación del dominio no significa que el túnel esté conectado.

Estado posterior: el administrador eliminó la inscripción anterior y confirmó que solo permanece la nueva, con la KEY actual y **New bookings**. La ventana anterior terminó sin recepción y conservó 1,150 reservaciones y 139 eventos. El UUID `9814289b-b601-4236-8feb-c9e29102e76d` queda retirado de la prueba actual.

## Selección actual: nueva reserva con marcador sintético

El administrador confirmó que puede utilizar un nombre de contacto sintético y que el webhook incluye `booking.contact.name`. No puede utilizar el campo de notas. Se generó un marcador aleatorio de 128 bits con formato `CTSK-FH-TEST-<32 caracteres hexadecimales>` y se guardó en el `trial.json` privado; su valor no se incorpora al repositorio. El administrador debe introducirlo **exactamente como nombre del contacto de la nueva reserva de prueba**, antes de su primer guardado, sin nombres de personas.

La configuración usa `selectionMode: contact_name_marker`, `markerField: booking.contact.name` y `bookingUuid: null`. No se acepta la primera reserva cualquiera: un contacto ausente, un marcador distinto, un prefijo/sufijo añadido o diferencias de mayúsculas/espacios se descartan antes de consultar PostgreSQL. El UUID retirado se descarta incluso si se le copia el marcador. El receptor exige `booking.uuid` válido, `booking.status: booked` y `booking.created_at` con zona horaria dentro de la ventana autorizada. Si el esquema del webhook omite alguno de esos campos, se rechaza sin insertar; no se completa por API ni se inventan datos.

La documentación oficial describe el objeto Booking y el bloque Contact en el webhook. La presencia del campo elegido en esta inscripción fue confirmada por el usuario/administrador; el payload real de esta nueva reserva todavía no se ha recibido. Fuente: [contrato oficial de FareHarbor](https://fareharbor.com/api/external/v1/).

Una transacción toma primero un bloqueo por marcador y después otro por UUID. Antes de insertar consulta eventos tanto por el marcador conservado en `normalized_data.contact.name` como por el UUID recibido. Esto permite deduplicar reintentos y mantener el máximo de **un evento en total**, incluso ante otro UUID con el mismo marcador o un reinicio. Rechaza vínculos/reservaciones internas y estados previos incompatibles. Solo confirma tras COMMIT de un evento `new_booking`, `pending_review` y `not_applied`; no crea, modifica ni cancela reservaciones internas. No añade tablas, columnas ni datos auxiliares persistentes al esquema.

Preparación validada con 28 comprobaciones nuevas en memoria del marcador y su integración con el supervisor. No se ejecutaron las suites anteriores, no se abrieron sockets de prueba y no se conectaron dobles a PostgreSQL. El modo de validación del lanzador comprobó después las ACL, la cuenta limitada, 017 y el respaldo real mediante lecturas, con `FH_VALIDATED_NO_SERVICES`.

Secuencia para la siguiente ventana, aún no autorizada:

1. El administrador prepara la nueva reserva con el marcador en Nombre del contacto y **todavía no la guarda**.
2. Obtener autorización de una ventana nueva de máximo 15 minutos. Preparar una sesión y fechas nuevas; no reutilizar la ventana expirada. Se mantienen TLS, dominio, KEY y token privados existentes.
3. Arrancar el supervisor y habilitar el selector por marcador solo con los controles privados autorizados. Después de confirmar la disponibilidad del receptor, el administrador guarda una única reserva nueva.
4. Comprobar el UUID real y el ID del único evento recibido, su estado pendiente/sin aplicar y el aviso existente. Cerrar receptor y ngrok al terminar o al vencer la ventana.

En esta preparación todos los controles de activación y recepción siguen deshabilitados. Full Capture permanece **no confirmado**; no se modificó la configuración cloud, PostgreSQL, el respaldo, las credenciales ni TLS.

## Compatibilidad y contrato que debe confirmar FareHarbor

La documentación oficial describe POST HTTPS con un JSON `booking`, selección de **creations only**, secreto en ruta/consulta y respuesta 200; las entregas fallidas pueden repetirse y terminar desactivadas. No admite cabeceras personalizadas de autenticación. El registro de URLs se tramita con soporte. Las compañías en modo demo no generan webhooks.

Fuente: [Webhooks oficiales](https://demo.fareharbor.com/api/external/v1/webhooks).

El receptor espera el esquema de booking completo con `booking.uuid` y `booking.status`, no un aviso que contenga únicamente un PK o una URL. Para esta prueba se solicitará **Booking sin pagos/reembolsos**, sujeto a confirmación de soporte, manteniendo UUID, estado, creación, actividad, disponibilidad y participantes. No se llamará a la API para completar datos ausentes.

El payload no proporciona por sí solo una prueba del disparador «alta». El estado `booked` también puede aparecer en actualizaciones: se necesita confirmación de la suscripción de solo altas y de la reservación de prueba seleccionada. Un secreto compartido tampoco constituye una firma criptográfica del proveedor; se contrastará la entrega con soporte o el registro de entregas de FareHarbor.

## Cambios de desarrollo

`scripts/integrations/fareharbor.cjs` conserva el receptor general y añade:

- `createFareHarborTrialReceiver`: exige un UUID seleccionado; habilitarlo requiere confirmación explícita de solo altas. Mantiene `enabled: false` por defecto.
- Descarta otros UUID sin consultar PostgreSQL. Rechaza estados distintos de `booked` para el seleccionado.
- Serializa la recepción seleccionada mediante bloqueo transaccional; consulta eventos y vínculos previos; permite como máximo un evento pendiente y sin aplicar. El límite persiste al reconstruir el receptor.
- Una entrega idéntica recibe 200 sin otra inserción. Un snapshot diferente posterior del mismo booking se reconoce como fuera del alcance y no genera otro evento. No actualiza datos existentes.
- Solo confirma una inserción después de COMMIT; los errores transaccionales devuelven 503 y un Retry-After orientativo. FareHarbor controla sus propios reintentos.
- `loadFareHarborTrialSettings`: verifica ACL de configuración, secretos, TLS y referencia de configuración PostgreSQL; comprueba certificado, clave y SAN local. Una configuración habilitada exige UUID y confirmaciones de solo altas, plan gratuito y captura cloud desactivada.
- `buildFareHarborNgrokArgs`: prepara argumentos para HTTPS local en 3443, verificación TLS y captura local desactivada. No ejecuta procesos.
- Las rutas `/fareharbor/webhook` y `/api/integraciones/fareharbor/webhook` comparten exactamente el mismo controlador y sus verificaciones.

No hay entrada automática, worker, temporizador, importación desde Electron ni llamada implícita a `listen`. El modo de prueba no crea reservaciones internas, vínculos, cursores o estados de sincronización.

## Preparación privada

Ubicación: `C:\Users\luisg\AppData\Local\CommunityTours\integrations\fareharbor\`.

- `trial.json`: `enabled: false`, UUID sin seleccionar, dominio confirmado y `freeNgrokPlanConfirmed: true`; las confirmaciones de solo altas y captura cloud permanecen en false.
- `webhook-secret.txt`: KEY de 256 bits regenerada el 20/10/2026 por autorización del usuario; lectura de comprobación y ACL verificadas, sin imprimirla ni crear copias de su valor. Sigue pendiente de coordinación y actualización remota. La configuración legada anterior se conservó.
- `ngrok.yml`: el usuario guardó el nuevo authtoken independiente mediante la herramienta privada y confirmó la rotación del predeterminado. Se verificaron formato, ACL y diferencia frente al token expuesto en la configuración legada y el historial. La evidencia local no permite identificar remotamente cuál credencial se revocó; esta confirmación sigue pendiente antes de publicar. La configuración original no se cambió.
- `ngrok-launch.json`: argumentos preparados con el dominio confirmado, upstream HTTPS local y verificación del certificado. No es un ejecutable ni se consume automáticamente: la futura composición deberá utilizar sus argumentos completos, incluido `--url`. Registra los bloqueos pendientes y permanece deshabilitado.
- `preparation.json`: conserva la procedencia de la confirmación humana del dominio/plan y el bloqueo por token expuesto y captura cloud desconocida.
- `Set-NgrokAuthtoken.ps1`: herramienta privada revisada sintácticamente y ejecutada posteriormente por el usuario. Solicita el nuevo authtoken mediante entrada oculta y lo guarda únicamente en el `ngrok.yml` privado; exige permisos privados y receptor/agente detenidos. No revoca credenciales remotas, no publica túneles ni confirma por sí misma Full Capture o la revocación anterior.
- `supervisor.json`: controles del lanzador Windows, referencia al respaldo verificado y ventana de 15 minutos. `enabled` y `executionAuthorized` permanecen en false. La exclusividad de la inscripción fue confirmada expresamente por el usuario; la KEY registrada, solo altas y Full Capture requieren confirmaciones separadas.
- `tls/localhost-key.pem` y `tls/localhost-cert.pem`: clave/certificado locales coincidentes, SAN `127.0.0.1`, validez de siete días desde su generación. No se instaló confianza en Windows.
- Todos los archivos heredan permisos privados del usuario ejecutor y SYSTEM y pasaron el comprobador existente. No se cambiaron ACL de carpetas o archivos anteriores.

No imprimir estos archivos ni el objeto devuelto por el lector: contiene secretos en memoria. La configuración solo referencia el archivo protegido PostgreSQL; no copia su contraseña ni lo modifica. Antes del arranque autorizado, la composición debe leerlo y verificar nuevamente el rol limitado, clúster y 017. No se debe pasar el rol de mantenimiento al receptor.

## Vía HTTPS propuesta, todavía sin iniciar

```text
FareHarbor
  -> HTTPS público de ngrok
  -> túnel saliente del agente
  -> HTTPS verificado 127.0.0.1:3443
  -> receptor independiente
  -> PostgreSQL local mediante cuenta limitada
```

Ngrok 3.39.9 está instalado. Su ayuda local admite `--upstream-tls-verify`, `--upstream-tls-verify-cas` y `--inspect=false`. El puerto 3443 estaba libre al inspeccionarlo; habrá que comprobarlo otra vez al iniciar.

Una vez autorizada la activación, el servidor debe enlazarse **solo** a `{ host: '127.0.0.1', port: 3443, exclusive: true }`. El certificado local se usa como ancla explícita para ngrok. No apuntar el túnel a 3000 o 5432 y no confiar en `X-Forwarded-Proto` para sustituir TLS real.

Argumentos preparados para el futuro agente, **no ejecutados**:

```text
ngrok http https://127.0.0.1:3443
  --config <archivo privado ngrok.yml>
  --upstream-tls-verify
  --upstream-tls-verify-cas <certificado local privado>
  --inspect=false
  --log=false
  --url https://fleshed-patchy-cassette.ngrok-free.dev
```

En el archivo privado se deshabilitaron web UI (`web_addr: false`), base de inspección local (`inspect_db_size: -1`), consola (`console_ui: false`), logs del agente, actualización automática y administración remota. La configuración actual pasó `ngrok config check` sin conexión ni publicación. Se verificaron otra vez las ACL mediante el comprobador existente y la correspondencia/vigencia del certificado local, que vence el 27/10/2026 a las 03:35:32 UTC. No se repitieron las pruebas funcionales ya aprobadas.

**Captura cloud pendiente:** estas opciones locales no desactivan Full Capture en la cuenta. La documentación distingue metadatos por defecto y Full Capture opcional, que conserva parámetros, cabeceras y cuerpos. Free tiene 24 horas de retención. El ajuste corresponde al administrador de la cuenta, en Settings → Observability; su estado efectivo no pudo confirmarse. No publicar hasta obtener confirmación de que está desactivado. No se habilitó captura ni Replay. Incluso sin Full Capture no se promete ausencia de metadatos; el TLS público termina en ngrok y luego se cifra de nuevo hacia el receptor.

Fuente: [Traffic Inspector y captura cloud](https://ngrok.com/docs/obs/traffic-inspection).

Usar únicamente el dominio de desarrollo incluido en un plan gratuito confirmado. No se autorizó contratar ni activar consumo de pago. HTTPS público gratuito no requiere un endpoint raw TLS de pago. La advertencia HTML del plan gratuito no afecta solicitudes API programáticas, según sus documentos.

Fuentes: [CLI](https://ngrok.com/docs/gateway/agent/cli), [configuración](https://ngrok.com/docs/gateway/agent/config/v3), [límites gratuitos](https://ngrok.com/docs/pricing-limits/free-plan-limits), [tratamiento del tráfico](https://ngrok.com/security).

## Solicitud preparada para soporte, no enviada

Continuar el intercambio del 5 de octubre con el responsable autorizado de Community Tours:

> Queremos probar la recepción por webhook, sin API directa. Solicitamos confirmar la compañía y configurar únicamente altas de reservaciones, con Booking sin pagos/reembolsos, incluyendo UUID y estado. Compartiremos por canal privado la URL HTTPS y su secreto cuando se autorice publicarla. Necesitamos seleccionar una sola reservación autorizada y acordar cómo enviar o reenviar su alta, sin modificarla, cancelarla ni procesar otros bookings. Indiquen qué aprobación empresarial requieren y cómo verificar la entrega.

Se conservarán el dominio y la ruta histórica ya inscritos. No crear otra inscripción. Sigue pendiente contrastar privadamente el valor de `key` registrado con el secreto que utilizará el receptor. La URL facilitada con `?key=` omitido no demuestra que el secreto remoto esté vacío. El secreto privado nuevo difiere del legado local y todavía no está acreditado como registrado en FareHarbor. No enviar secretos por Git, informes, chat o argumentos de consola. No se ha contactado a soporte en esta tarea.

Para coordinar el cambio, el administrador autorizado debe obtener localmente la nueva KEY desde el archivo privado, sin imprimirla en consola ni registrarla en informes. En la inscripción existente cambiará únicamente el valor del parámetro `key`, conservando el dominio `fleshed-patchy-cassette.ngrok-free.dev` y `/api/integraciones/fareharbor/webhook`. No guardar todavía el cambio remoto. El usuario confirmó que la inscripción es exclusiva de este sistema. Acordar la ventana con el responsable del receptor y no modificar otras inscripciones.

## Lanzador supervisado para Windows

Fuentes nuevas: `scripts/Start-FareHarborTrial.ps1` y `scripts/integrations/fareharborSupervisor.cjs`. Son herramientas de desarrollo excluidas del instalador; no se llaman desde `npm run desktop`. No importan el servidor Express de Electron ni inician el puerto 3000. Reutilizan exclusivamente la conexión central configurada con la cuenta limitada y las fábricas del receptor independiente.

Sin parámetros, el lanzador comprueba ACL, formato privado de ngrok, TLS, UUID, dominio y hash del respaldo; consulta PostgreSQL en transacciones READ ONLY para verificar identidad, rol, esquema 017, permisos de inserción y USAGE, ausencia del UUID y huellas actuales de todas las tablas. El respaldo debe mantener su SHA-256 y su verificación previa de contenido/instantánea. No usa credenciales de mantenimiento ni solicita nuevos permisos. No ejecuta ngrok, no abre listeners y no escribe registros de negocio.

Desde PowerShell, validación segura:

```powershell
& 'A:\sistema-integrador-reservaciones\scripts\Start-FareHarborTrial.ps1'
```

La validación ya se ejecutó con resultado `FH_VALIDATED_NO_SERVICES`; PostgreSQL y respaldo coincidieron. Las 34 pruebas nuevas de `backend/__tests__/fareharborSupervisor.test.js` usan dobles que prohíben procesos, red y listeners reales. No se repitieron las suites de recepción anteriores ni se generaron laboratorios.

Para una activación posterior autorizada deben conservarse la selección actual por marcador y `bookingUuid: null`. El supervisor comprueba `markerPayloadCompatibleConfirmed` y construye la fábrica de recepción por marcador; ya no utiliza el UUID retirado. En la activación por etapas se mantiene `trial.enabled: false` y se habilitan únicamente `supervisor.enabled` y `supervisor.executionAuthorized` dentro de una sesión nueva. `trial-control.json` debe tener esa misma sesión, `selectionMode: contact_name_marker`, el marcador exacto y los controles explícitos de recepción/solo altas/KEY. Sin ellos, el receptor devuelve 503 y no consulta ni escribe datos de la reserva.

Las ventanas anteriores fueron autorizadas expresamente por el usuario con Full Capture desconocido y el token independiente nuevo. La excepción temporal se registra con `cloudCaptureUnknownAuthorized` y nunca cambia `cloudFullCaptureConfirmedDisabled` a true sin confirmación. Captura detectada activa bloquea o cierra la conexión. La sesión y sus fechas se generan únicamente al autorizar otra ventana; los indicadores locales no acreditan por sí solos ajustes remotos de ngrok o FareHarbor.

Comando de inicio preparado, **no ejecutado**:

```powershell
& 'A:\sistema-integrador-reservaciones\scripts\Start-FareHarborTrial.ps1' -Start
```

El supervisor crea un Job Object Windows con KILL_ON_JOB_CLOSE, asigna su hijo antes de enviar la orden ARM y elimina del entorno heredado opciones Node, proxies y credenciales. El hijo no puede iniciar sin esa orden. Primero se verifica PostgreSQL/respaldo y se abre únicamente HTTPS en `127.0.0.1:3443`; después se ejecuta ngrok con argumentos construidos por el código, destino TLS verificado y dominio fijo. No se ejecutan comandos arbitrarios del manifiesto de argumentos. La captura/interfaz/consola/logs locales permanecen desactivados y los streams del agente no se imprimen. Solo se anuncia `FH_READY` después de verificar por HTTPS público una respuesta identificada de esta instancia, sin enviar la KEY ni datos de bookings en esa comprobación.

Durante la ventana, el monitor comprueba cambios de configuración y el estado del único evento seleccionado. Solo imprime códigos y, si llega el alta, `FH_EVENT_PENDING` con su ID. No modifica su revisión/aplicación y no crea reservaciones. La deduplicación y el máximo de un evento permanecen en el receptor existente. Puede recibir acuses duplicados durante la ventana sin insertar de nuevo.

Apagado y recuperación:

1. Pulsar **Ctrl+C** en la consola supervisora. Se envía STOP al hijo; este cierra su túnel, deja de aceptar solicitudes y permite terminar las que ya estaban en curso antes de cerrar el pool. El apagado normal no busca ni termina procesos por nombre o puerto.
2. Si hay fallo de ngrok, TLS, configuración, base de datos o estado del evento, se cierran los componentes propios. Al vencer los 15 minutos también se cierran; no existe reinicio automático ni sincronización permanente. No pueden configurarse más de 30 minutos.
3. Si el hijo no termina, la consola espera hasta 12 segundos y el Job Object cierra exclusivamente ese árbol de procesos. Cerrar abruptamente la consola también libera ese Job Object. No se deshabilitan protecciones ni se mata el backend de Electron.
4. Tras un apagado forzado o un error durante COMMIT, **no reenviar ni reiniciar a ciegas**. Consultar por el UUID autorizado: una transacción pudo haberse confirmado aunque FareHarbor no recibiera el HTTP 200. Si ya existe el evento, comprobar su estado/notificación; el preflight bloquea otro arranque. No borrar ni revertir el evento para repetir la prueba.
5. Antes de cualquier nuevo intento, revalidar configuración y respaldo. Si cambiaron datos desde el respaldo, crear/verificar uno actualizado; no restaurar ni ajustar las huellas para saltar el control. Volver a dejar los indicadores de activación en false al cerrar la ventana coordinada.

El administrador debe coordinar la nueva KEY y solo altas antes de publicar. Para este UUID ya seleccionado, acordar con FareHarbor la entrega o reentrega de su alta; no convertir una modificación en alta ni usar Replay de ngrok como evidencia de recepción del proveedor. Tras `FH_EVENT_PENDING`, revisar Electron protegido → Avisos → Actualizar sin aprobar ni aplicar el evento durante la prueba.

La documentación pública consultada remite a soporte; no acredita un permiso específico de Director para este registro. Debe participar el responsable de la cuenta y confirmarse con soporte qué autorización exige. No se modificó ningún rol ni permiso.

## Sustitución segura del authtoken, todavía no realizada

1. Mantener detenido el agente. El responsable de la misma cuenta debe revocar o resetear el authtoken expuesto y obtener uno nuevo dedicado a esta integración. Crear otro sin revocar el expuesto no resuelve la exposición. No sustituirlo por una API key.
2. Ejecutar localmente `C:\Users\luisg\AppData\Local\CommunityTours\integrations\fareharbor\Set-NgrokAuthtoken.ps1` en una consola sin transcripción, después de obtener el nuevo token. Introducirlo solo en su solicitud oculta (`Read-Host -AsSecureString`). La herramienta lo convierte solo en memoria y escribe el campo `agent.authtoken` del `ngrok.yml` privado, conservando sus otras opciones. No pegarlo en `ngrok config add-authtoken <valor>`, en argumentos, variables literales del historial ni en este documento. Si una política de ejecución impide ejecutarla, detenerse sin deshabilitar esa política.
3. Verificar ACL y sintaxis offline sin imprimir el archivo ni el token. No iniciar el agente como parte de la sustitución. Limpiar el portapapeles si se utilizó para introducirlo.
4. Mantener fuera de uso las configuraciones antiguas que todavía contienen el token revocado. No se borraron ni reescribieron en esta preparación; retirar sus copias y el historial requerirá una acción autorizada separada. Las copias no vuelven seguro un token mientras siga vigente.

Fuente: [authtokens del agente y diferencia frente a API keys](https://ngrok.com/docs/gateway/agent/config/v3#authtoken).

## Condiciones para autorizar una recepción

1. Sustituir y revocar el authtoken expuesto y confirmar captura cloud desactivada; el dominio y plan Free ya fueron confirmados por el usuario. Revalidar ACL y vigencia del certificado.
2. Identificar el UUID real de una reservación creada/autorizada para pruebas mediante detalles/exportación autorizada del panel de FareHarbor o soporte, sin API directa. Un código o PK no se convierte por suposición en UUID. Si ya fue creada, acordar reentrega del alta; no provocar una actualización artificial para sustituirla. Seleccionar el UUID antes de habilitar el receptor.
3. Contrastar el secreto registrado y el contrato con FareHarbor. Con autorización posterior, conservar la inscripción y limitarla temporalmente a **New bookings**; deseleccionar Updated y Cancelled durante esta prueba. Si no es posible, detenerse: `booked` por sí solo no distingue el disparador. Las confirmaciones booleanas privadas son constancias locales, no prueba de configuración remota.
4. Verificar identidad principal, 017, cuenta limitada y ausencia de eventos/vínculos del UUID. Generar/verificar un respaldo actualizado antes de permitir escrituras; no se generó otro en esta preparación.
5. Obtener autorización de arranque/publicación y de los cambios necesarios en la inscripción existente. Usar el lanzador supervisado explícito descrito arriba y mantener ambos procesos bajo supervisión durante la ventana acordada. Otros UUID reciben un acuse de descarte sin acceso PostgreSQL; el seleccionado tiene deduplicación y límite persistente de un evento. El filtro limita el procesamiento, pero FareHarbor todavía podría enviar otros bookings si no acota su entrega.
6. Confirmar entrega desde FareHarbor, máximo un evento `pending_review` / `not_applied`, deduplicación y resumen de notificaciones. Revisar en Electron protegido: Avisos → Actualizar. No aprobar ni aplicar automáticamente.

## Verificación adicional de 124 y 126

Consulta exclusivamente de lectura sobre la identidad principal verificada. Ambos conservan `approved` y `not_applied`, con motivo y usuario de archivo registrados:

| Evento | archived_at almacenado, sin zona horaria | archived_by |
|---|---|---|
| 124 | 2026-10-18 16:15:35.340595 | 96 |
| 126 | 2026-10-18 16:15:20.944136 | 96 |

No se encontraron entradas asociables en `bitacora`; el servicio actual guarda la auditoría de archivo en el propio evento y no inserta una entrada en la bitácora general. Las huellas completas coinciden con los dos respaldos privados recientes, por lo que no cambiaron respecto de esas instantáneas. Esto no acredita una causa adicional ni quién operó físicamente la cuenta. No se divulgaron nombres de usuarios ni texto privado de los motivos.

El informe PRE-RELEASE-03 corresponde al 17 de octubre, antes de esas marcas. Si se citó después como estado actual, esa afirmación estaba desactualizada. Esta preparación no cambió ninguno de los dos eventos. Recuento leído: 1,150 reservaciones, 139 eventos y 66 filas de bitácora.
