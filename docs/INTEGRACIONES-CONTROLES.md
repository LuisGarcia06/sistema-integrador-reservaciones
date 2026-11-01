# Controles de Integraciones — 21/10/2026

Implementación desplegada en una nueva release protegida. Electron abierto y backend propio escuchando en `127.0.0.1:3000`.

**Actualización tras UAC aceptada:** ambas tareas Windows están `Running` en sesión 0, con S4U y privilegios limitados, independientes de Codex y Electron. FareHarbor recuperó la escucha HTTPS 3443 y un único ngrok; reportó `FH_CONTINUOUS_READY` el 21/10/2026 a las **10:29:28, Cancún**. Gmail completó ciclos automáticos a las **10:29:35 y 10:31:44**, con `GYG_SYNC_OK`; continúa recuperando el historial pendiente. Se retiró exclusivamente el ngrok huérfano verificado. Se conservaron configuración y definición de tarea FareHarbor, credenciales, webhook y reservaciones internas.

## Funcionamiento implementado

- Controles independientes Activar/Pausar en **Integraciones**. Los roles existentes siguen siendo `Administrador` (Reservas) y `Consulta` (Visualización); no se crearon roles nuevos.
- `GET /api/integraciones` requiere sesión. `PATCH /api/integraciones/:provider` requiere Administrador y recibe un booleano `activado`. Consulta no puede escribir. Consulta con alcance limitado ve estados, sin cantidades ni fechas de recepción ajenas.
- El estado se guarda en las filas `source='publicacion'` de `integracion_sync_estado`. Sobrevive al cierre de Electron y al reinicio de Windows porque reside en PostgreSQL.
- Un trigger PostgreSQL asigna `aviso_publicado` al insertar. El receptor FareHarbor existente lo ejecuta sin sustituir sus fuentes o credenciales. Mientras se pausa, los nuevos eventos siguen persistiendo con publicación pendiente.
- Los avisos históricos ya publicados conservan su visibilidad. Al activar, todos los acumulados se publican dentro de la misma transacción del control y su bitácora. No se copian eventos ni se cambian sus estados de revisión/aplicación.
- Bloqueos compartidos del receptor y exclusivos del control serializan captura, pausa y reactivación. La unicidad existente proveedor/identidad externa sigue deduplicando recepciones.
- Listados públicos, resumen y detalle no muestran eventos sin publicar. Se retiraron el cutoff temporal y el ranking que ocultaba snapshots previos de FareHarbor. La paginación no limita la cantidad total almacenada o publicada.
- Altas, modificaciones y cancelaciones internas continúan requiriendo revisión y aplicación manual. El nuevo ejecutor no invoca servicios de aplicación de reservaciones.
- Estado técnico separado del botón: receptor HTTPS local FareHarbor, sincronización/recuperación/error Gmail, acumulados y fechas. Electron mantiene su política de red: solo conexiones PostgreSQL; el diagnóstico local FareHarbor consulta listeners Windows en lectura.
- Full Capture cloud permanece **NO CONFIRMADO**.

## GetYourGuide

Se reutilizaron OAuth, `gmail.readonly`, parser, clasificador, mapper y recuperación paginada existentes. No se solicitó otro alcance ni consentimiento.

La primera ejecución incremental encontró `403 rateLimitExceeded`: el cursor anterior recorría mensajes de toda la cuenta. El ejecutor continuo ahora utiliza el barrido recuperable existente por el remitente exacto de GetYourGuide. Procesa páginas de 25 mensajes cada dos minutos, sin límite global de mensajes, fecha, referencia o duración. Guarda checkpoint y target; al terminar un barrido, empieza otro para recuperar también mensajes que no aparecieron en un listado anterior. La unicidad externa permite repetir páginas después de interrupciones. Un token de página inválido reinicia el barrido sin borrar eventos. Las cuotas aplican espera de reintento, no un plazo máximo de recepción.

Un bloqueo de sesión PostgreSQL impide ciclos simultáneos. La conexión que conserva el bloqueo también escribe eventos y cursor: perderla impide que un proceso antiguo continúe avanzando estado desde otra conexión.

El ciclo real del ejecutor corregido terminó con `GYG_SYNC_OK` el 21/10/2026 a las 10:07:45, Cancún. La comprobación anterior a instalar las tareas encontró **170 eventos**, frente a los 140 previos. Después del arranque Windows se verificaron **175 eventos**, con los 140 originales intactos. Los adicionales provienen de correos reales; no se insertaron datos ficticios en principal ni se aplicaron reservaciones automáticamente. La recuperación histórica sigue en curso mediante la tarea Windows, con checkpoint persistente y sin errores registrados.

El runtime Gmail opera en `%LOCALAPPDATA%\CommunityTours\integrations\getyourguide\runtime`, con configuración privada, ACL y SHA-256. Reutiliza las dependencias y configuración protegidas existentes. `CommunityTours-GetYourGuideContinuous` quedó instalada con S4U, privilegios limitados, inicio Windows/sesión, recuperación periódica e `IgnoreNew`, sin límite de ejecución. La configuración de captura no depende de que el botón de publicación esté activado.

## Migración y preservación

Se aplicó únicamente **018**, con respaldo completo previo verificado, transacción y `lock_timeout=2s`, sin reiniciar PostgreSQL ni sustituir receptores.

- Dos columnas booleanas: `integracion_sync_estado.avisos_activados` y `eventos_integracion.aviso_publicado`.
- Dos filas de control, trigger de publicación e índice de pendientes. No se agregaron tablas.
- `bitacora.id_reservacion` admite NULL para auditar acciones de integración que no pertenecen a una reserva; conserva su FK. La consulta usa LEFT JOIN para mostrar esas entradas.
- Permisos puntuales del runtime para escribir el estado de sincronización y usar su secuencia. Sin superusuario, roles nuevos, cambios de propietarios o permisos generales nuevos.
- Se conservaron las **1,150 reservaciones**, comprobadas por cantidad y SHA-256, y todos los campos originales de los **140 eventos previos**, comprobados por huellas individuales. No se tocaron sus revisiones, aplicaciones, vínculos ni archivo.

Respaldo previo: `%LOCALAPPDATA%\CommunityTours\backups\principal-final\run-controls018-20261021T095322-e86a1f1c\principal-017.backup`.

SHA-256: `c4ce349fca876f6b2ea1dd5f79ccf172ebfc325a1b0433b07d01e8084d1c1ef7`. Inventario, decodificación con pg_restore, hash independiente y resultados de migración permanecen en esa carpeta privada. No se restauró sobre principal.

## Verificación

- **299 pruebas aprobadas en 14 suites**, con PostgreSQL real bloqueado en Jest: controles, permisos, deduplicación, recuperación y aprobación manual.
- **PostgreSQL real desechable:** histórico visible, captura de 73 avisos durante pausa, independencia de plataformas, detalle protegido, persistencia al reconectar, reactivación completa, concurrencia de recepción/pausa/reactivación, rollback por fallo de bitácora y 12 inserciones simultáneas deduplicadas. Cero reservaciones internas creadas; base desechable eliminada al terminar.
- **Electron real con API ficticia local:** ambos botones, cantidades acumuladas, liberación, independencia, solo lectura, alcance limitado y limpieza al cerrar sesión. Capturas a 1366 y 1024; sin desbordamiento.
- **Release real:** ACL/configuración, identidad PostgreSQL, política de red, fingerprint y preservación de datos verificados. Frontend HTTP 200 con script Integraciones y API sin sesión HTTP 401. No se inició sesión suplantando un usuario ni se cambiaron controles reales para generar auditorías de prueba.
- `git diff --check` sin errores. Los cambios previos del repositorio se conservaron.

Evidencia: `integraciones-controles/jest-result.json`, `postgres-lab-result.json`, `electron-ui-result.json`, `deployment-verification.json`, `windows-tasks-verification.json`, `receiver-preservation.json` y capturas PNG.

El receptor FareHarbor estaba detenido al iniciar y quedó restablecido después de UAC. Hasta la verificación no se observaron nuevas entregas auténticas FareHarbor. Las pruebas del receptor usan dobles; conservan la comprobación HTTP 200 después de COMMIT y HTTP 503 ante fallo. La identidad FareHarbor sigue siendo la huella de snapshot existente: no permite distinguir un reenvío de una reversión exactamente idéntica a un snapshot anterior. No se inventaron identificadores del proveedor.

## Abrir y probar Electron

La versión actual es:

```text
%LOCALAPPDATA%\CommunityTours\secure-runtime\releases\r-20261021T151913Z-a8628d972b44
```

Se creó mediante el preparador protegido existente, manifiesto revisado y verificación de 3,311 archivos. Se conserva la release anterior. La configuración procede exclusivamente del archivo protegido anterior, sin copiar `.env` de A:.

Electron ya está abierto. Iniciar sesión y elegir **Integraciones**. Reservas tiene los dos botones; Visualización muestra estados sin acciones. Ambos controles quedaron activados, sin acumulados retenidos.

Para abrirlo nuevamente desde PowerShell:

```powershell
& "$env:LOCALAPPDATA\CommunityTours\secure-runtime\Open-Reservations.ps1"
```

El lanzador verifica manifiesto, archivos, configuración, ACL y fingerprint; crea un entorno limpio y abre el Electron protegido con su backend propio. Los controles no requieren reinstalar dependencias ni ejecutar migraciones de nuevo. Cerrar Electron no detiene las dos tareas independientes instaladas.

## Recuperación y operación Windows verificadas

Se conserva intacta la release original `r-20261018T163712Z-4f4502fb6252`. Además, la candidata `r-20261021T145712Z-f2eb8b7d4c0d` conserva configuración y backend compatibles con publicación diferida para recuperación del escritorio. No arrancar dos Electron ni matar servicios ajenos. Volver a la versión original anterior a los controles mientras una integración está pausada omitiría su filtro visual: para ese rollback se necesita activar y liberar previamente ambos controles con la versión nueva o una intervención administrativa auditada. No revertir 018 ni restaurar el respaldo automáticamente: se perderían los eventos legítimos recibidos después del respaldo.

La intervención Windows revisada está copiada en `%LOCALAPPDATA%\CommunityTours\integrations\Restore-IntegrationTasks-018.ps1`. Se ejecutó después de que el usuario aceptara UAC, sin omitirla. Comprobó PID, fecha de creación, configuración, dominio y ausencia de padre antes de retirar exclusivamente el ngrok huérfano observado. Inició la misma tarea FareHarbor e instaló la tarea Gmail. El resultado `TASKS_REQUESTED` confirma configuración y definición de tarea FareHarbor intactas. No se interrumpió un receptor activo.

La verificación del 21/10/2026 a las 10:32:22, Cancún confirmó ambas tareas `Running`, un único listener `127.0.0.1:3443`, un solo ngrok y estados sanos recientes. La ascendencia es `services.exe → svchost.exe → powershell.exe → node.exe`, en sesión 0; ngrok es hijo del supervisor FareHarbor. No dependen del proceso de Codex. Ambas conservan disparadores de arranque Windows, inicio de sesión y recuperación periódica, `IgnoreNew` y límite de ejecución `PT0S`. Gmail completó al menos dos ciclos automáticos distintos. Los SHA-256 de las fuentes de ambos receptores coinciden; las seis huellas privadas anteriores de FareHarbor (ngrok, KEY, TLS y PostgreSQL) permanecen intactas. La comprobación posterior volvió a preservar las 1,150 reservaciones y los 140 eventos originales.

**Recepción FareHarbor restaurada y sincronización continua Gmail operativa.** La recuperación histórica de Gmail continúa en segundo plano. No se reinició Windows para esta comprobación.

## Archivos de esta implementación

Backend:

- `backend/services/integracionesControl.service.js` (nuevo): controles transaccionales y estados técnicos.
- `backend/controllers/integracionesControl.controller.js` (nuevo).
- `backend/routes/integracionesControl.routes.js` (nuevo).
- `backend/server.js`: montaje de API.
- `backend/middleware/alcanceReservaciones.middleware.js`: lectura de estados sin cantidades para Consulta limitada.
- `backend/services/eventosIntegracion.service.js`: publicación persistente en listado/detalle; retiro de cutoff y ranking.
- `backend/services/notificacionesIntegracion.service.js`: resumen sobre la fuente publicada.
- `backend/services/bitacora.service.js`: mostrar auditoría sin reserva.
- `backend/integrations/getyourguide/getyourguideContinuous.service.js` (nuevo): ejecutor recuperable con exclusión PostgreSQL.

Frontend:

- `frontend/pages/integraciones.js` (nuevo).
- `frontend/index.html`, `frontend/js/layout.js`, `frontend/js/auth.js`, `frontend/css/pages.css`.

Persistencia:

- `database/migrations/018_publicacion_integraciones.sql` (nuevo).
- `database/schema.sql`: equivalente canónico de 018.

Operación:

- `scripts/integrations/getyourguide.cjs`: exportar la validación existente para reutilizarla; conservar métodos anteriores.
- `scripts/integrations/getyourguideContinuous.cjs` (nuevo).
- `scripts/Start-GetYourGuideContinuous.ps1` (nuevo).
- `scripts/Restore-IntegrationTasks.ps1` (nuevo; ejecutado con UAC aceptada).
- `scripts/integrations/backupMain017.cjs`: exportar inventario/identidad existentes para reutilizarlos.
- `scripts/integrations/deployIntegrationControls.cjs`, `prepareIntegrationControls.cjs`, `verifyIntegrationControls.cjs`, `integrationControlsLab.cjs`, `openReservations.cjs` (nuevos).
- `scripts/Open-Reservations.ps1` (nuevo).

Pruebas:

- `backend/__tests__/integracionesControl.routes.test.js`, `integracionesControl.service.test.js`, `getyourguideContinuous.service.test.js` (nuevos).
- `backend/__tests__/helpers/integracionesUiHarness.cjs` (nuevo).
- `backend/__tests__/eventosIntegracion.service.test.js`, `notificacionesIntegracion.service.test.js`: sustituir expectativas del cutoff/ranking retirado por el nuevo contrato.
- Este documento y evidencia bajo `docs/integraciones-controles/`.

No se modificaron en esta tarea las fuentes activas de FareHarbor, KEY, TLS, dominio ngrok ni puerto 3443. Los cambios FareHarbor y otros documentos que ya estaban presentes al comenzar no se atribuyen a esta implementación.
