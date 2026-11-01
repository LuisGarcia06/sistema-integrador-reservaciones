# Centro de Avisos y Resumen operativo

Implementado y desplegado el 21/10/2026. No se ejecutaron migraciones ni escrituras sobre datos de la base principal. Los datos sintéticos se crearon exclusivamente en bases desechables, eliminadas al terminar.

## Funcionalidad

- Centro accesible desde Dashboard → Revisar avisos o Avisos → Abrir Centro de Avisos.
- **Prioritarios:** reservaciones externas que necesitan atención con fecha de servicio igual o posterior a la consultada. Orden ascendente por servicio; hoy y mañana primero, sin límite temporal global de captura.
- **Pendientes:** eventos pendientes de revisión y aprobados sin aplicar, incluidos servicios pasados y fechas desconocidas.
- **Histórico:** servicios anteriores o grupos con mensajes originales recibidos más de 24 horas antes de su incorporación al sistema. Esta última marca es una clasificación derivada de las fechas existentes; no es un nuevo estado del evento. Las secciones pueden coincidir: un histórico pendiente continúa en Pendientes. Las fechas ilegibles permanecen en Pendientes.
- Filtros por código, cliente autorizado, plataforma, tipo, revisión, rango de servicio, urgencia y archivo. Para buscar un día exacto, usar el mismo día en Desde/Hasta.
- El archivo se consulta explícitamente mediante Archivo → Todos/Archivados. Esto permite consultar también archivados sin fecha, sin restaurarlos. Los filtros de revisión se combinan con la sección y archivo elegidos.
- Agrupación por plataforma e identificador confiable. GetYourGuide utiliza referencia GYG; FareHarbor debe coincidir con el UUID del snapshot normalizado. Sin identificador confiable, cada evento queda separado. No se fusionan filas.
- Grupo: código, plataforma, fecha del último evento original, último tipo/revisión/aplicación, cantidad de eventos y pendientes. Último se determina por fecha original del mensaje/evento, con ID como desempate, evitando que una recuperación tardía reemplace visualmente un cambio posterior.
- Si el último evento no determina fecha de servicio, no se inventa una a partir del ingreso ni de otro evento. El historial individual conserva las fechas disponibles.
- Historial expandible, paginado por separado, con acceso a los diálogos existentes de revisión/aprobación/aplicación/archivo. La aplicación sigue siendo manual y conserva todas sus validaciones.
- Paginación SQL por grupos de 25/50/100; sin truncar el conjunto total. Las respuestas no incluyen payload crudo. Las fechas se validan contra el calendario PostgreSQL antes de convertir; FareHarbor se convierte a America/Cancun solamente con zona explícita.

## Cálculos del resumen

- **Reservaciones:** filas internas de la fecha seleccionada en Pendiente, Confirmada o Activa, los mismos estados vigentes usados por Operaciones. Una fila externa no incrementa este conteo; se requiere registro interno manual.
- **PAX:** SUM(pax) de esas mismas filas. No se suma ninos nuevamente.
- **Grupos preparados:** suma de grupos necesarios cuya operación ya existe, según `preparado` devuelto por Operaciones. No exige nuevas condiciones de guía/transporte ni inventa estados. Excluye operaciones sobrantes sin salida vigente.
- **Grupos pendientes:** grupos necesarios menos preparados, sin valores negativos. Conserva límites, turnos y reglas operativas de Operaciones. Daily mantiene su definición separada de transporte preparado para impresión.
- Día sin reservaciones internas vigentes: cuatro ceros.
- **Avisos pendientes:** eventos publicados, sin archivar, pendientes de revisión o aprobados sin aplicar.
- **Urgentes:** pendientes cuya reservación externa tiene servicio en la fecha consultada o siguiente, según su último evento publicado. Coincide con el filtro urgente del Centro.
- **Sin revisar:** pendientes con revisión `pending_review`. Es distinto de “sin ver” de la campana, que continúa siendo un registro local por usuario.
- Los indicadores cuentan eventos; el listado principal cuenta grupos. Se muestran también cantidades históricas pendientes y sin fecha.
- Consulta limitada conserva su proyección por plataforma; el backend no consulta ni devuelve indicadores globales ni permite abrir Centro/historial. Visualización global consulta sin acciones de escritura. Los nombres FareHarbor solo intervienen en búsqueda de Administrador.

## Refresco

El resumen y Centro se actualizan al entrar, cambiar fecha, después de escrituras exitosas, ante publicación de nuevos avisos y cada 60 segundos mientras la pantalla esté visible. Las escrituras de otra sesión se reflejan en la siguiente consulta periódica. Los controles existentes continúan provocando actualización de avisos. Las consultas concurrentes de la misma lista se consolidan y las respuestas obsoletas se descartan. Los filtros se conservan al navegar dentro de la sesión y se limpian al cerrarla. El refresco silencioso conserva los campos y diálogos abiertos.

Solo se consulta `aviso_publicado=true`: una pausa conserva los avisos anteriores, retiene los nuevos en PostgreSQL y la reactivación los libera por el mecanismo existente. No se cambió ese mecanismo ni sus botones.

## Archivos de esta tarea

Backend:

- `backend/services/centroAvisos.service.js`: consultas de grupos, fechas, historial e indicadores, solo lectura.
- `backend/controllers/centroAvisos.controller.js`: validación y proyección autorizada.
- `backend/routes/eventosIntegracion.routes.js`: GET `/centro` y `/centro/:id/historial`, usando autenticación/roles/alcance existentes.
- `backend/services/dashboard.service.js`: indicadores e integración del conteo preparado necesario.

Frontend:

- `frontend/js/centroAvisos.js` y `frontend/css/centroAvisos.css`: Centro, filtros, historial y paginación adaptable.
- `frontend/pages/dashboard.js`: fecha consultada, indicadores, navegación y actualización conservando revisión individual.
- `frontend/js/api.js`: evento local tras escritura exitosa para actualizar consultas.
- `frontend/js/notificaciones.js`: acceso al Centro desde la campana.
- `frontend/index.html`: carga de los dos archivos nuevos.

Validación y despliegue:

- `backend/__tests__/centroAvisos.test.js`.
- `backend/__tests__/accessScope.routes.test.js`: adaptación a grupos preparados necesarios y nuevo resumen.
- `backend/__tests__/helpers/centroAvisosUiHarness.cjs`.
- `scripts/centroAvisosLab.cjs` y `scripts/centroAvisosRelease.cjs`.
- Este documento y evidencia bajo `docs/centro-avisos/`.

Los demás cambios que ya existían en Git, incluidos los de integraciones, no corresponden a esta tarea.

## Resultados

- **121 pruebas Jest**, tres suites: validación, permisos y contratos frontend afectados. PostgreSQL real bloqueado en estas suites.
- **25 comprobaciones PostgreSQL aisladas:** clasificación y calendario, conversión Cancún, agrupación/orden original, historial, búsquedas parametrizadas, filtros, archivo sin fecha, identificadores desconocidos, publicación retenida/liberada, permisos HTTP, métricas internas/PAX/grupos, actualización al cambiar revisión/aplicación y paginación de 5,000 grupos sin solapamiento. Plan SQL observado: ~249 ms de ejecución en ese volumen; el tiempo completo del cliente incluye conexiones y las dos páginas.
- **15 comprobaciones Electron real con API sintética:** tabs, historial y diálogo individual, navegación/paginación/búsqueda, urgentes, preservación de filtros, actualización sin reinicio, fecha, permisos y limpieza de sesión. Capturas revisadas a 1366/1024/600 px, sin desbordamiento horizontal.
- `git diff --check` aprobado.
- Release real: manifiesto, hashes, ACL, configuración, identidad/rol/esquema PostgreSQL y política de red verificados; frontend y script Centro HTTP 200; API sin sesión HTTP 401.
- Línea base y comparación final de solo lectura: **1,150 reservaciones y 399 eventos preexistentes preservados**, sin cambios en vínculos, bitácora, roles/usuarios/alcances, operaciones, transportes ni observaciones Daily. Sin cambios en controles de publicación. No se crearon reservaciones internas.
- Consulta real del 21/10/2026: **385 pendientes, 381 sin revisar, 3 urgentes; 360 grupos pendientes**. Son una fotografía y pueden cambiar por operación legítima posterior.

## Release y apertura

Nueva release:

```text
%LOCALAPPDATA%\CommunityTours\secure-runtime\releases\r-20261021T215314Z-19cf6e15ad4e
```

Preparada mediante `PrepareSecureRuntime.ps1` existente y manifiesto aprobado de 3,316 archivos, sin copiar `.env` del repositorio. Configuración tomada exclusivamente de la release protegida anterior y comprobada idéntica. Electron anterior se cerró por `CloseMainWindow`, sin cierre forzado; el nuevo quedó abierto con backend propio.

```powershell
& "$env:LOCALAPPDATA\CommunityTours\secure-runtime\Open-Reservations.ps1"
```

Para comprobar visualmente: iniciar sesión, abrir Dashboard, elegir fecha y revisar cuatro tarjetas/tres indicadores; pulsar Revisar avisos y recorrer Prioritarios/Pendientes/Histórico; buscar código o rango, expandir grupo y consultar evento; pulsar indicador urgente para confirmar filtro. No hace falta aprobar o archivar datos reales para comprobar la presentación.

## Recuperación

Se conserva íntegra la release anterior `r-20261021T151913Z-a8628d972b44`, compatible con controles/publicación diferida. Su registro verificado se conserva en:

```text
%LOCALAPPDATA%\CommunityTours\secure-runtime\admin\update-records\centro-avisos-recovery-r-20261021T151913Z-a8628d972b44.json
```

Si se requiere volver: cerrar normalmente Electron, restaurar ese registro sobre `controls018-final-verification.json` en el mismo directorio privado y abrir con el lanzador habitual. Este procedimiento vuelve solamente el escritorio. No restaurar base de datos ni revertir migraciones para volver la interfaz. No se ejecutó un rollback ni se interrumpieron integraciones para ensayarlo.

## Integraciones preservadas

Después del despliegue ambas tareas siguen Running con definición idéntica. FareHarbor conserva `FH_CONTINUOUS_READY`, el mismo receptor PID 47792 en 127.0.0.1:3443 y el mismo único ngrok PID 53812. Gmail conserva el worker PID 47288 en sesión 0, padre PowerShell 22108, independiente del Electron nuevo; estado `GYG_SYNC_OK`, ciclo 30 a las 16:56:03 Cancún, frecuencia 120 segundos y recuperación histórica completada.

Las huellas de configuración, fuentes privadas, KEY/ngrok y OAuth verificadas permanecen iguales. No se reiniciaron ni modificaron tareas, receptores o sincronización prioritaria, no se generaron eventos externos de prueba ni se modificaron credenciales o certificados. Full Capture cloud conserva su condición previa: no confirmado.
