# GetYourGuide: captura reciente prioritaria

Implementado y desplegado el 21/10/2026. Todas las horas de este documento son de Cancún (UTC−05:00).

## Resultado real

`GYGWZAH26NG7` quedó registrada **una sola vez**, como evento **399**, a las **15:52:38**. Tipo `new_booking`, revisión `pending_review`, aplicación `not_applied`, `aviso_publicado=true`, sin archivo. Está presente en el resumen de Avisos utilizado por Electron. El correo original llegó a las 14:37:07.

No existe vínculo interno para esa referencia. Se conservaron las huellas de las **1,150 reservaciones**, todos los eventos preexistentes al respaldo, los vínculos, usuarios y roles. No hubo altas, modificaciones o cancelaciones automáticas de reservaciones internas.

## Funcionamiento

Cada ciclo hace primero una consulta por el remitente exacto de GetYourGuide y atiende mensajes aún no registrados de la página reciente. Después consulta Gmail History incrementalmente. Solo descarga metadatos de remitente para cambios de otros correos; descarga el cuerpo únicamente para GetYourGuide.

La primera página prioritaria tiene 25 resultados y History usa páginas de 100 registros. Son tamaños de página, **no límites totales de captura**. Todos los cambios restantes continúan mediante el cursor y la paginación persistentes; no hay filtro por referencia, marcador ni corte temporal de reservaciones.

Se reutiliza `integracion_sync_estado`, sin agregar tablas, columnas o migraciones:

| Fuente | Uso |
|---|---|
| `gmail_recent` | Cursor History reciente y su token de página independiente. |
| `gmail` | Recuperación histórica: conserva su página, target y fecha de inicio. |
| `publicacion` | Control Activar/Pausar existente, sin cambios. |

El cursor solo avanza después de persistir una página completa. Una interrupción permite repetirla y omitir los IDs ya guardados, conservando sus estados. La deduplicación sigue siendo por proveedor + ID Gmail, sin descartar modificaciones legítimas del mismo código.

La recuperación histórica recibe tiempo de trabajo después de las novedades. Si agota su presupuesto, conserva el checkpoint y continúa en otro ciclo. Al terminar no vuelve a iniciar un barrido completo en cada consulta. Un History 404 exige recuperar la ventana perdida mediante un barrido; un token incremental 400 reinicia únicamente esa paginación. Este tratamiento sigue la [sincronización oficial de Gmail](https://developers.google.com/workspace/gmail/api/guides/sync) y su [referencia de History](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list).

Se conserva la frecuencia de **120 segundos entre inicios de ciclos**, descontando el tiempo del procesamiento. Se observaron ciclos automáticos a las **15:52:36.145** y **15:54:36.156**: diferencia de **120.011 segundos**. En la versión final, después del ajuste de cuotas, se observaron de nuevo inicios a las **15:58:00.430** y **16:00:00.442**, separados por **120.012 segundos**. La última consulta reciente se completó a las **16:00:02**, con `GYG_SYNC_OK`, sin duplicar 399.

Los recorridos respetan backoff persistente y `Retry-After`, tanto en segundos como en fecha HTTP. Durante una limitación de Gmail se posponen llamadas hasta que venza esa espera. Las solicitudes HTTP tienen timeout de 10 segundos; el trabajo reciente y el histórico tienen presupuestos separados para evitar que una página lenta monopolice el worker.

Se refleja la fecha técnica de consulta reciente en la fila `gmail`, que Electron instalado ya conoce, conservando sus campos históricos. Así no fue necesario sustituir la aplicación protegida.

## Publicación y aprobación

El worker nunca consulta el botón para decidir si captura. El trigger PostgreSQL existente decide `aviso_publicado` según la fila `publicacion`. Una pausa sigue guardando eventos sin publicar, mantiene visibles los anteriores y la activación libera el acumulado sin aplicarlo a reservaciones.

No se cambiaron controles, permisos, bitácora de los controles, frontend, aprobación manual, FareHarbor, ngrok, webhook, KEY ni certificados.

## Validación

- **22 pruebas específicas Jest**: prioridad, los tres tipos, cursores separados, paginación, interrupción parcial, reinicio, deduplicación, mensajes ajenos, pausa, cuotas, Retry-After, History caducado, token inválido, errores históricos, presupuesto y exclusión de ejecutores simultáneos.
- **7 comprobaciones PostgreSQL aisladas**, en una base desechable ya eliminada: trigger real durante pausa, históricos visibles, cursores independientes, fila reciente sin efecto sobre el botón, reinicio sin duplicados, liberación exacta al activar y cero reservaciones internas, presencia en el resumen de Avisos.
- Comprobaciones reales posteriores mediante transacciones `READ ONLY`: evento 399 único, publicado y pendiente; filas anteriores y reservaciones conservadas; controles sin cambios; integridad de fuentes correcta.
- El fingerprint de la página histórica cambió entre ciclos y su target `1424096` y fecha de inicio se conservaron. El cursor reciente avanzó independientemente de `1425571` a `1425592`. No había errores ni backoff activo.

No se repitió la batería general ni se insertaron datos ficticios en la principal. La única alta de evento real identificada durante el primer ciclo fue la referencia solicitada.

## Transición y recuperación

Se creó respaldo completo de PostgreSQL mediante una instantánea compartida de lectura; se verificaron inventario, formato y contenido, y se calculó un SHA256 independiente:

`%LOCALAPPDATA%\CommunityTours\backups\principal-final\run-gyg-priority-20261021T204823599Z-dac4c836\principal-017.backup`

SHA256: `ff58be6c6790e85674b0a6cc9a80ebddd60fed7b5f4ada0396f7a9b3ac2f7971`.

El nombre del archivo proviene de la utilidad existente; contiene el estado real posterior a la migración 018, con inventario verificado.

El despliegue esperó una ventana libre usando el mismo advisory lock del worker. Solo detuvo y arrancó `CommunityTours-GetYourGuideContinuous`. Se conservaron las definiciones de ambas tareas y las credenciales OAuth. La tarea sigue S4U/Limited, `IgnoreNew`, sin límite de ejecución, con recuperación Windows e inicio automático.

Se respaldó el código antes de cada transición. Última copia:

`%LOCALAPPDATA%\CommunityTours\integrations\getyourguide\deployments\priority-20261021T205736476Z`

El despliegue revierte archivos y configuración si el nuevo worker no queda operativo; **no restaura la base ni elimina eventos o cursores**. Una reversión manual debe usar el mismo bloqueo y la misma tarea, restaurando `previous/` y `continuous.previous.json`. No restaurar el dump sobre la principal como una reversión de código: perdería recepciones legítimas posteriores.

Se verificó ejecución en sesión 0: Node PID 47288 → PowerShell PID 22108 → `svchost.exe` PID 2284 → `services.exe` PID 892; no depende de Codex ni Electron. El PID del receptor FareHarbor siguió siendo 47792 y su ngrok 53812, sin interrupciones por este trabajo.

## Archivos y componentes

| Archivo | Cambio |
|---|---|
| `backend/integrations/getyourguide/getyourguideRecentSync.service.js` | Nueva captura prioritaria, History y deduplicación previa a descargar. |
| `backend/integrations/getyourguide/getyourguideContinuous.service.js` | Orquesta reciente primero e histórico después, sin reiniciar barridos terminados. |
| `backend/integrations/getyourguide/getyourguideGmailSync.service.js` | Reutiliza recovery con procesador acotado y respeta Retry-After. |
| `backend/services/integracionSyncEstado.service.js` | Persiste cursor reciente y fecha técnica sin alterar el checkpoint histórico. |
| `scripts/integrations/getyourguideContinuous.cjs` | Cadencia de 120 segundos y diagnóstico separado de ambos recorridos. |
| `backend/__tests__/getyourguidePrioritySync.service.test.js` | Nuevas pruebas específicas. |
| `backend/__tests__/getyourguideContinuous.service.test.js` | Ajusta las pruebas de orquestación al comportamiento autorizado. |
| `scripts/integrations/backupGetYourGuidePriority.cjs` | Respaldo previo verificado. |
| `scripts/integrations/getyourguidePriorityLab.cjs` | Laboratorio PostgreSQL aislado. |
| `scripts/integrations/deployGetYourGuidePriority.cjs` | Transición controlada y reversión de código. |
| `scripts/integrations/verifyGetYourGuidePriority.cjs` | Auditoría posterior sin datos personales. |

En el runtime privado se actualizaron únicamente cinco archivos del worker y sus huellas en `continuous.json`. Electron protegido y el lanzador Windows existente no se sustituyeron.

Electron no necesita actualización ni reinstalación. Avisos consulta su resumen automáticamente cada 60 segundos cuando está visible y autenticado con un rol autorizado.
