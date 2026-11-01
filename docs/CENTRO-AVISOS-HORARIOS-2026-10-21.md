# Ordenamiento, recepción y horarios del Centro de Avisos

Implementación del 21 de octubre de 2026, hora Cancún. Los identificadores de releases utilizan UTC; por eso esta release tiene fecha 22 en su nombre.

## Cambios funcionales

- Selector **Más recientes primero / Más antiguas primero / Fecha y hora del tour más próxima**.
- Pendientes inicia con recientes; Prioritarios con servicio próximo; Histórico con recientes. Cada sección recuerda su orden dentro de la sesión. Cambiar orden conserva los filtros y vuelve a página 1.
- Orden SQL aplicado antes de LIMIT/OFFSET y repetido explícitamente en la agregación JSON. Recientes/antiguas utiliza la última incorporación PostgreSQL del grupo, no la fecha original del mensaje. Servicio ordena fecha y luego inicio; los horarios desconocidos quedan después de los conocidos de ese mismo día. ID de evento desambigua empates de manera estable.
- Cada grupo muestra código, plataforma, fecha del tour con día de la semana, inicio/salida, pickup, última recepción local y estado del último evento según cronología externa. En grupos múltiples muestra además primera recepción.
- El historial distingue **Recepción en PostgreSQL** de la fecha original del correo GetYourGuide y de la **Recepción del webhook** FareHarbor, con fecha, segundos y formato de 12 horas en Cancún.
- HOY, MAÑANA y PRÓXIMAMENTE se calculan con el calendario actual de America/Cancun y la fecha del servicio. La urgencia continúa utilizando la fecha consultada y siguiente. Una recepción reciente no convierte un servicio pasado en urgente.
- Datos no disponibles: **Hora por confirmar**, **Pickup por confirmar** o fecha sin determinar. Si una hora explícita es confiable pero falta fecha, la hora se muestra sin inventar día.
- Las actualizaciones automáticas conservan filtros y orden. Se mantiene el historial expandible y la revisión/aplicación individual manual.

## Fuentes y criterio de confianza

No se modificaron parsers, mappers de recepción ni workers.

- **FareHarbor:** fecha y salida de `normalized_data.availability.start_at`, solamente con zona explícita y timestamp válido; conversión a America/Cancun. Pickup exclusivamente de `normalized_data.pickup.pickup.time`, validado como hora, reutilizando el criterio del servicio de aplicación existente.
- **GetYourGuide:** fecha de `normalized_data.date`, con calendario validado; inicio de `start_time` o de la hora explícita incluida en la fecha de actividad española/inglesa reconocida. Pickup exclusivamente de `pickup_time`. Nunca se deriva inicio del pickup, de un título genérico ni de la recepción.
- **Recepción:** `created_at` de cada evento; MIN/MAX para primera/última incorporación del grupo. Se comprobó en lectura que estas columnas TIMESTAMP existentes se almacenan en hora Cancún. La API las convierte explícitamente con `AT TIME ZONE 'America/Cancun'`, devolviendo zona inequívoca para evitar depender de la zona del equipo que visualiza.
- **Original GetYourGuide:** `source_received_at`, separado de la incorporación local. En **FareHarbor** se comprobó que ese mismo campo se genera con `new Date()` al recibir el webhook: por tanto se muestra como recepción del webhook y se declara **Fecha original del evento externo: No disponible**. `booking.created_at` tampoco se utiliza como fecha original de una modificación. No se presenta `created_at` como fecha de creación de la reservación externa.
- La fecha/horario del tour proceden del último evento con fecha de servicio válida, ordenado por cronología original; cuando el más reciente omite fecha se identifica expresamente el uso del último dato válido. No se arrastra una hora de un evento anterior a una fecha nueva que no la incluya.
- Cambios sucesivos con cronología clara representan modificaciones legítimas. Valores distintos sin secuencia externa demostrable, o dos fuentes de hora incompatibles dentro del mismo evento, se señalan **Información por verificar**. FareHarbor conserva la secuencia de recepción disponible; si sus snapshots aportan horarios/fechas incompatibles, no se supone una cronología externa que no está almacenada. No se elige arbitrariamente fecha, salida ni pickup contradictorios. Los eventos originales siguen completos en el historial.
- Los eventos sin fecha original se identifican como cronología por verificar; la recepción no se utiliza para resolver contradicciones externas.
- Solo participan eventos `aviso_publicado=true`. Un evento retenido por pausa no puede cambiar los horarios, recepción, estado visible ni orden de un grupo ya publicado.

## Archivos de esta tarea

- `backend/services/centroAvisos.service.js`: whitelist de orden, proyección horaria, recepción explícita, estado cronológico, contradicciones y orden SQL paginado; indicadores urgentes consistentes con la fecha validada del grupo.
- `frontend/js/centroAvisos.js`: selector, conservación de orden por sección, tarjetas y etiquetas, formato Cancún e historial.
- `frontend/css/centroAvisos.css`: jerarquía de fecha/horas/recepción y adaptación de selector/tarjetas.
- `backend/__tests__/centroAvisosTiming.test.js`: validación del orden y composición segura de consultas.
- `scripts/centroAvisosTimingLab.cjs`: casos PostgreSQL nuevos en base desechable.
- `backend/__tests__/helpers/centroAvisosTimingUi.cjs`: casos Electron con API sintética y capturas.
- `scripts/centroAvisosRelease.cjs`: perfil independiente de despliegue `centro-avisos-horarios`, reutilizando el preparador protegido existente, snapshots de lectura y registro recuperable.
- Este documento y evidencia en `docs/centro-avisos-horarios/`.

Los cambios anteriores del repositorio se conservaron y no se atribuyen a esta tarea.

## Pruebas

- **22 pruebas Jest:** ocho de orden/defaults/whitelist y catorce de validación de filtros afectados. PostgreSQL real bloqueado.
- **33 comprobaciones PostgreSQL aisladas:** tres órdenes, desempates entre páginas con 1,000 grupos, grupo actualizado con correo histórico recibido después, primera/última recepción y cronología externa, salida distinta del pickup, fecha sin hora, hora sin fecha, horarios AM/PM, contradicciones de fecha/salida/pickup, datos ilegibles, cronología ausente o no proporcionada por FareHarbor, proximidad Cancún, filtros combinados, permisos e indicadores con datos retenidos por pausa —también dentro de un grupo previamente publicado—.
- **11 comprobaciones Electron real con API sintética:** valores iniciales, cambio efectivo de orden, filtros/navegación/refresco, fecha larga, salida/pickup, recepción local/original/webhook, contradicciones, histórico no urgente y ventanas de 1366/1024/600 px sin desbordamiento.
- No se repitieron pruebas generales de recepción de plataformas. No se enviaron correos o webhooks ficticios. Todas las escrituras sintéticas se limitaron a bases desechables identificadas y eliminadas al terminar.
- Las consultas materializan las proyecciones compartidas para impedir su reevaluación repetida al ordenar grupos. No requieren cambios de esquema ni índices nuevos.

## Release y comprobación visual

Release final:

```text
%LOCALAPPDATA%\CommunityTours\secure-runtime\releases\r-20261022T013346Z-75ea98c45059
```

Abrir con el lanzador habitual:

```powershell
& "$env:LOCALAPPDATA\CommunityTours\secure-runtime\Open-Reservations.ps1"
```

En Dashboard → Revisar avisos:

1. Entrar a Pendientes: Más recientes primero debe estar seleccionado.
2. Cambiar a Más antiguas primero y luego a Fecha y hora del tour más próxima; comprobar que se conserva la búsqueda/filtros.
3. Revisar cada tarjeta sin abrirla: fecha larga, inicio, pickup y recepción. Los campos desconocidos deben pedir confirmación.
4. Expandir un grupo para comparar recepción PostgreSQL y mensaje original. No es necesario aprobar ni archivar información real.
5. Navegar a Reservaciones y volver; el orden se conserva durante la sesión.

## Recuperación y preservación

La release previa `r-20261021T215314Z-19cf6e15ad4e` permanece intacta. Registro de recuperación:

```text
%LOCALAPPDATA%\CommunityTours\secure-runtime\admin\update-records\centro-avisos-horarios-recovery-r-20261021T215314Z-19cf6e15ad4e.json
```

Para volver, cerrar normalmente Electron, restaurar ese registro sobre `controls018-final-verification.json` del mismo directorio privado y abrir con el lanzador. No restaurar la base ni revertir migraciones para recuperar la interfaz.

La preparación y activación verifican manifiesto, ACL, hashes, configuración privada idéntica, identidad/rol/esquema PostgreSQL y comparan la línea base de datos existentes. El resultado definitivo se registra en `docs/centro-avisos-horarios/deployment.json`; continuidad de tareas/procesos en `services-before.json` y `services-after.json`. No se escriben datos de principal ni se cambian controles, credenciales, certificados o fuentes privadas de integración. Full Capture cloud conserva su condición previa: no confirmado.

Resultado final: **1,151 reservaciones y 403 eventos preexistentes conservados**, con vínculos, bitácora, usuarios/roles/alcances, operaciones, transportes y controles de publicación iguales a la línea base de esta tarea. Sin migraciones ni escrituras en principal. La release nueva quedó abierta, con frontend/script HTTP 200 y API sin sesión HTTP 401.

A las 20:36 Cancún, ambas tareas seguían Running con la misma definición y los mismos procesos: FareHarbor `FH_CONTINUOUS_READY`, receptor PID 47792 y único ngrok PID 53812; GetYourGuide `GYG_SYNC_OK`, ciclo 140, worker PID 47288 en sesión 0. No se reiniciaron ni se repitieron pruebas generales de recepción.
