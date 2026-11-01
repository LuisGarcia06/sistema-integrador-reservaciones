# Fase 2C.2B.3 — interfaz de conflictos y precondiciones de laboratorio

Fecha local: 2026-10-27, America/Cancun. **No desplegado ni habilitado en producción.**

Se implementó un frontend real de laboratorio con formularios, cliente HTTP y comparación de conflictos. Utiliza la API `revision-api-lab` existente mediante un host de pruebas separado. Las pantallas principales conservan su contrato anterior: no se cargan los módulos nuevos desde `frontend/index.html`, no se sirve frontend desde `revisionApiApp` y no se agregó una modalidad al Electron del producto.

1. **Archivos modificados y nuevos.**

Solo se editó un archivo preexistente en esta fase: `frontend/js/api.js`. Conserva `apiFetch`, JWT, renovación/verificación de sesión, abortos, errores y notificación de actualizaciones previos. Se agregan `code`/`kind` a los errores, una guardia activada únicamente cuando está instalado el módulo explícito de laboratorio, y la exclusión de `/api/precondiciones` del evento de escritura. La versión de sesión sigue siendo independiente de la revisión del registro.

| Archivo nuevo | Responsabilidad |
|---|---|
| `frontend/js/revisionLab.js` | Sesión de edición, estados separados, precondiciones, guardia de escritores, clasificación y mensajes. |
| `frontend/js/revisionConflict.js` | Comparador reutilizable y decisiones explícitas. |
| `frontend/lab/revision.html` | Entrada exclusiva del harness; login y selección de formularios. |
| `frontend/lab/revision.css` | Estilos del laboratorio usando los estilos y variables visuales existentes. |
| `frontend/lab/revisionEditor.js` | Formularios de edición parcial, cancelación, transporte, Daily y decisiones externas sintéticas. |
| `scripts/revisionFrontendHost.cjs` | Host UI loopback y proxy HTTP de pruebas con lista cerrada de assets. |
| `scripts/revisionFrontendLab.cjs` | Aprovisionamiento, identidad, API separada, corredor, evidencia y cierre. |
| `scripts/revisionFrontendDriver.cjs` | Pruebas DOM con Electron real y tres sesiones independientes. |
| `scripts/RevisionFrontendLab.ps1` | Directorio nuevo con ACL privada, entorno limpio y ejecución Verify/Stop. |
| `backend/__tests__/revisionFrontend.test.js` | 17 pruebas aisladas del cliente, decisiones, permisos y matriz de rutas. |
| `docs/LOCAL-FASE-2C2B3.md` | Este informe. |
| `docs/local-fase-2c2b3-verification.json` | Evidencia consolidada, matriz y hashes. |
| `docs/local-fase-2c2b3-closure.json` | Comprobación de siete directorios, 19 puertos y ausencia de procesos propios. |
| `docs/local-fase-2c2b3/*.png` | Cuatro capturas sintéticas del ensayo final. |

Se conservaron los cambios locales anteriores, incluidos los archivos ya modificados y sin seguimiento. No se ejecutaron reset, clean, checkout de archivos ni migraciones inversas. No cambiaron backend, esquema, migraciones, servicios de integración, tareas, Electron principal, dependencias ni package.json.

2. **Componentes y pantallas adaptados.**

La adaptación se presenta en los formularios de `frontend/lab/revision.html`. Son componentes ejecutables HTML/CSS/JavaScript que usan el `apiFetch` y el módulo de autenticación reales. No se afirma que los modales de las pantallas principales ya estén migrados. Esos documentos y scripts no se sirven desde el harness: una pantalla heredada no obtiene un camino de escritura sin protección en el perfil nuevo.

Reservaciones permite editar nombre, teléfono, habitación, PAX/niños, pickup, turno y observaciones; también dispone de formularios separados para cancelar y cambiar transporte. Operaciones permite hora inicial, guía y estado; transportes, vehículo, operador, observaciones y estado. Daily conserva observaciones por fecha. Catálogos permiten las ediciones parciales indicadas en el registro `actions`; usuarios permite nombre/estado. La cobertura de una ruta no implica que todos sus campos tengan ya controles en este laboratorio. Los demás campos quedan pendientes de trasladar con sus validadores y selectores actuales.

3. **Integración del contrato.**

Al abrir una edición se consulta `POST /api/precondiciones`, autenticado, con `X-CTSK-Protocol: ctsk-revision-api-v1` y `{metodo,ruta,datos:{}}`. Solo se exponen acciones de registros existentes o Daily por fecha; las altas, que necesitan ligar la foto al cuerpo completo, están bloqueadas. Se valida método/ruta de la respuesta, etiquetas presentes y revisión string/null. La foto se copia y congela en memoria.

La escritura conserva los valores originales completos de `etag` y `contexto` en `If-Match` e `If-Operational-Match`. La revisión nunca pasa por Number. La guardia permite un solo envío por autorización local y bloquea consumidores heredados sin sesión de edición. La autorización efectiva continúa en el backend.

412 se identifica como revisión obsoleta; 409 con código de contexto muestra dependencias cambiadas, y un 409 de negocio se describe por separado. 428 y 400 de precondición/protocolo bloquean otro guardado sin revisión explícita. Los errores de validación 400 conservan el formulario y su mensaje de negocio. Se conservan 401, 403 y alcances por plataforma. La consulta de estado actual utiliza el mismo endpoint autenticado; una lectura denegada no obtiene representación para la comparación.

4. **Funcionamiento de conflictos y conservación.**

`EditSession` mantiene separados `original`, `proposal` y `current`. Un rechazo 412/409 no repuebla los controles. El comparador presenta cinco columnas: campo, original, propuesta, actual autorizado y cambios; ordena primero los afectados y escapa valores usando textContent. No publica el contexto global del backend ni interpreta su etiqueta opaca como una lista de dependencias.

“Revisar mis cambios” consulta otra foto y conserva la propuesta. “Utilizar la información actual” exige confirmar el descarte antes de consultar y preparar otra edición. “Cancelar o descartar”, cambiar de formulario o iniciar otra sesión también requieren confirmación si hay una edición abierta. Ninguna decisión envía una escritura. El usuario debe revisar la nueva foto visible y confirmar un guardado posterior. No existe guardar ignorando precondiciones ni fusión automática.

Ante red interrumpida o 5xx, se marca resultado incierto y se bloquea reenviar desde esa sesión hasta una decisión explícita. El mensaje advierte que pudo haber COMMIT y pide consultar estado y bitácora. No se afirma rollback por una desconexión. Los cambios duran únicamente mientras vive el formulario autorizado. La invalidación de identidad/permisos utiliza la limpieza de seguridad existente y destruye esa edición; no hay recuperación persistente tras logout, cierre, pérdida de confianza o destrucción de ventana.

5. **Inventario de controles y contraste con 25 rutas.**

Todas las rutas siguientes tienen prefijo `/api`. La matriz individual está en el JSON y se contrasta automáticamente con `revisionApiContract.routes`.

| Controles originales revisados | Ruta protegida | Estado UI de laboratorio |
|---|---|---|
| Reservaciones: nueva / modificar / cancelar | POST reservaciones; PATCH reservaciones/:id; PATCH :id/cancelar | Alta bloqueada; las dos ediciones adaptadas. |
| Organización de reservaciones en Operaciones | PATCH reservaciones/:id/transporte | Adaptada. |
| Operaciones: crear / editar | POST operaciones; PATCH operaciones/:id | Alta bloqueada; edición adaptada. |
| Transportes: crear / editar | POST transportes; PATCH transportes/:id | Alta bloqueada; edición adaptada. |
| Configuración: guardar y activar/desactivar vehículo, guía, operador, tour | POST y PATCH :id en vehiculos/guias/operadores/tours | Cuatro altas bloqueadas; cuatro ediciones adaptadas. |
| Usuarios: alta / editar / activar-desactivar / password | POST usuarios; PATCH usuarios/:id; PATCH usuarios/:id/password | Alta y password bloqueados; nombre/estado adaptados. |
| Configuración: agregar país y plataforma | POST paises; POST plataformas | Ambas altas bloqueadas. |
| Daily: pantalla original de consulta/impresión/PDF; no tenía guardado HTTP de notas | PUT daily/observaciones?fecha=... | Formulario de observaciones agregado solo al laboratorio. |
| Dashboard: aprobar/rechazar, archivar, aplicar GYG/FH | PATCH eventos-integracion/:id/revision y :id/archivo; POST :id/aplicar | Tres rutas adaptadas, con aplicación limitada a cancelaciones sintéticas. |

Resultado: **14 rutas con controles protegidos y 11 bloqueadas**. Las diez altas requieren formularios con foto ligada al cuerpo final; password requiere un flujo de secretos que no replique contraseñas en el comparador. Se eligió mantenerlas bloqueadas en vez de obtener fotos nuevas implícitas al guardar. Aplicación de new_booking/modification permanece bloqueada antes de exponer el formulario; queda pendiente incorporar sus previews, completado y huellas específicos. Para cancelación FareHarbor se obtiene la huella por `/diff` y se consulta de nuevo tras la decisión de revisión.

Los controles de activar/desactivar sincronizadores en Integraciones son escritores fuera de las 25 rutas: están bloqueados por el cliente del laboratorio y la API independiente. Login y precondiciones son las únicas excepciones POST sin ticket de escritura. Historial, bitácora, Dashboard de consulta, notificaciones y Centro de Avisos leen HTTP. Vistos de notificaciones y preferencia del sidebar son estado local del frontend anterior; no se añadieron al protocolo de escritura. PDF e impresión no modifican PostgreSQL.

6. **Pruebas y resultados.**

| Grupo ejecutado | Resultado |
|---|---|
| 21 suites aisladas previas + nueva suite, con guardias PostgreSQL/red | 22 suites, 655 pruebas aprobadas, 0 fallidas. |
| API previa sobre clúster PostgreSQL nuevo | 28 comprobaciones aprobadas; las 25 rutas rechazan ausencia de precondiciones. |
| Frontend real + HTTP real + PostgreSQL sintético | 16 comprobaciones aprobadas, 0 errores de renderer. |
| Regresión independent-dev con Electron y PostgreSQL reales | 6 comprobaciones aprobadas. |

El ensayo UI abre dos administradores en particiones independientes y otro usuario Consulta, en una sola computadora. Verifica mismo registro/412, conservación de entradas y etiquetas, comparación de valores, contexto/409, descarte confirmado, nuevas precondiciones y nueva confirmación, operaciones, transportes, Daily, cancelación y asignación vigentes/obsoletas, decisiones GYG/FH sintéticas, catálogos, 428, 400, no-op, rollback de auditoría, BIGINT exacto, permisos revocados y alcance selected. Las respuestas de window.confirm son controladas solo por el corredor y se comprueba que rechazar la confirmación no guarda.

Captura final del comparador:

![Comparación de original, propuesta y estado autorizado](local-fase-2c2b3/conflicto-412.png)

El proxy descarta una respuesta completa del backend después de recibir su 200 posterior a COMMIT. El formulario queda incierto y conserva el texto; GET confirma el cambio. Los contadores reales del proxy y PostgreSQL muestran una escritura y una entrada de bitácora, sin reenvío al pulsar guardar de nuevo. El fallo de bitácora se inyecta únicamente con el probe de pruebas ya existente.

No se presenta este ensayo como conexión entre dos computadoras físicas. No se ejecutó npm test global ni pruebas sobre bases existentes. No se repitió el ensayo físico LAN ni se habilitó LAN. No se volvió a ejecutar el harness HTTPS completo en esta fase; sus suites aisladas están incluidas en las 655 pruebas.

Para repetir en la raíz del repositorio:

```powershell
powershell.exe -NoProfile -NonInteractive -File .\scripts\RevisionFrontendLab.ps1 -Mode Verify
```

Verify no acepta un directorio existente: crea uno privado nuevo y detiene API, corredor, host UI y PostgreSQL al finalizar. No es un servidor de uso diario ni una instalación operativa. El JSON consolidado registra los directorios y evidencias de las ejecuciones.

7. **Confirmación de aislamiento.**

El aprovisionador y las políticas existentes verifican manifiesto `revision-api-lab`, generación, clave privada, ACL, identidad de clúster desechable y esquema 019 antes de iniciar la API. El host UI solo escucha 127.0.0.1, valida Host/Origin y sirve una lista explícita de assets, con CSP y sin cookies. El proxy solo reenvía al puerto API de ese ensayo; el proceso de pruebas bloquea sockets hacia otros destinos tras el aprovisionamiento. No entrega manifiesto, clave de precondiciones ni credenciales PostgreSQL al renderer. Electron del corredor mantiene sandbox, contextIsolation, webSecurity y nodeIntegration desactivado, sin preload privilegiado, navegación externa ni nuevas ventanas.

No se abrió conexión a `sian_kaan_reservaciones`, no se aplicó 019 fuera de clústeres nuevos, ni se modificaron integraciones reales, ngrok, tareas, firewall, router, certificados o servicios Windows. No se instalaron dependencias ni generaron instaladores. La evidencia de cierre verifica ausencia de PID y listeners de los siete directorios creados durante esta fase. No se consultó producción para comparar sus datos.

8. **Problemas encontrados y límites.**

Una primera iteración del corredor devolvía una función a executeJavaScript y Electron rechazó clonarla; se corrigió el ensayo. La prueba de corte de respuesta detectó replay de Chromium sobre un socket HTTP reutilizado: el servidor ya rechazaba la repetición con 412, pero eso no satisfacía el requisito de un único envío. El host del laboratorio ahora cierra cada conexión con Connection: close y la prueba final verifica un solo envío real. Esta mitigación pertenece al transporte HTTP del harness; antes de promover el cliente a otro transporte hay que repetir esa validación y diseñar idempotencia durable.

Otro cierre de ensayo marcó fallo por exigir 15 grupos cuando solo había 14; se agregaron comprobaciones explícitas de cancelación/asignación vigentes y aislamiento, y el conjunto final tiene 16. Las primeras capturas de ventanas ocultas no repintaban tras scroll: se desactivó su throttling y se esperan frames antes de capturar. Todos los clústeres de esas iteraciones quedaron apagados.

El contexto global conservador del backend puede producir 409 por cambios no relacionados. No hay diffs privados de dependencias, borradores persistentes, idempotencia durable, recuperación de comandos ni soporte offline. Las pantallas principales y los campos/variantes bloqueados siguen pendientes de migración explícita; no están habilitados de manera parcial sin protección.

9. **Procedimiento de reversión.**

Los ensayos terminaron apagados. Si un Verify fuese interrumpido, cerrar solo su corredor/proceso API/host Node identificado por el directorio y después detener su clúster propio:

```powershell
.\scripts\RevisionFrontendLab.ps1 -Mode Stop -Directory 'C:\Users\luisg\AppData\Local\ctsk-standalone-<identificador>'
```

Stop verifica el manifiesto y el código; no detiene procesos Node ajenos ni relaja hashes. Para revertir código, retirar solo los bloques de esta fase de api.js: code/kind, guardia App.revisionLab y la exclusión de precondiciones del evento. Conservar la emisión de datosactualizados que ya existía antes y todos los cambios locales previos. Retirar únicamente los archivos nuevos enumerados si se decide descartarlos, preservando evidencias. No usar git reset/clean ni restaurar archivos completos. No revertir migraciones ni tocar bases existentes. El cambio no requiere operación en la base principal.

10. **Recomendaciones para la siguiente fase.**

Definir con autorización un identificador durable por comando, el alcance por actor/generación, huella del cuerpo y resultado transaccional, y una consulta de reconciliación autorizada. Diseñar la escritura del comando y de su resultado junto con la modificación y la bitácora en la misma transacción. Distinguir pendiente/confirmado/rechazado/desconocido sin inferir rollback por timeout, y no reusar identificadores con otra intención. Cualquier tabla o campo nuevo requiere aprobación previa conforme a AGENTS.md.

Después, decidir almacenamiento cifrado y ciclo de vida de borradores, limpieza ante revocación de permisos, reautenticación y recuperación tras destrucción de ventana. Completar altas, password y las variantes externas pendientes, trasladar los componentes a cada modal original y repetir pruebas de transporte, restauración/generación y dos equipos físicos antes de considerar LAN o producción. Nada de ello fue habilitado en esta etapa.
