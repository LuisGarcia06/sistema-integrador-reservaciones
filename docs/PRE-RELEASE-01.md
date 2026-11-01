# PRE-RELEASE-01 — Pendientes, transportes y avisos de integraciones

**Proyecto:** Sistema Integrador de Reservaciones — Community Tours Sian Ka’an.  
**Fecha:** 17 de octubre de 2026, America/Cancun.  
**Rama comprobada:** `GYG+FRHB-implementado`.  
**Commit examinado:** `23d9ea21c04070aba3a49fd212d6a3106276c3a2`.  
**Alcance:** diagnóstico y propuesta. No se implementaron cambios funcionales, migraciones ni nuevas reglas de integración.

## 1. Resultado y alcance de la evidencia

Los pendientes antiguos son eventos aprobados que nunca se aplicaron; su fecha de actividad impide ahora registrarlos. El sistema carece de una salida de archivo para ese estado. El número del transporte es una clave interna presentada sin suficiente contexto. Existe actualización automática del panel de integraciones mientras se visita Dashboard, pero falta un mecanismo de avisos al personal con seguimiento de lectura.

Se leyeron `AGENTS.md`, `docs/RELEASE-01.md`, fuentes, esquema, migraciones y pruebas relacionadas. Se distinguieron cuatro niveles de evidencia:

- **Comprobado en código:** comportamiento y rutas presentes en este commit.
- **Comprobado en datos:** consultas limitadas a metadatos, sin nombres de clientes, teléfonos, credenciales ni payloads completos.
- **Inferencia:** explicación compatible con el código y los datos, sin trazabilidad suficiente para certificar el canal original.
- **Pendiente:** requiere aceptación, autorización o evidencia externa que esta fase no genera.

Se consultó la base indicada por `.env`, identificada mediante `current_database()` como `sian_kaan_reservaciones`. Cada conexión se protegió desde su apertura con `default_transaction_read_only=on`, límite de tiempo y `BEGIN READ ONLY`; las transacciones terminaron con `ROLLBACK`. La primera comprobación de identidad fue a las **11:26 del 17 de octubre, America/Cancun**; `transaction_read_only` devolvió `on`. Las consultas posteriores pertenecen a la misma revisión, con conexiones independientes igualmente protegidas. No se consultó DEV. Es una fotografía de la base configurada en el repositorio, no una certificación del destino de cualquier proceso Electron ya abierto.

Git se utilizó únicamente en lectura. Al inicio ya existía `docs/RELEASE-01.md` sin seguimiento; se conservó. Se revisó solo presencia de configuración sensible, nunca sus valores. No se ejecutaron clientes reales de proveedores, OAuth, sincronizaciones, aplicación de eventos ni rutas de escritura. La única modificación entregable de esta fase es este documento.

## 2. Eventos FareHarbor antiguos

### 2.1 Identificación de los dos casos

La cifra mostrada corresponde a `normalized_data.booking.display_id`, que incluye `#`; el `booking.pk` coincide numéricamente. No es el `id_evento_integracion` ni el UUID usado como identidad externa. `frontend/pages/dashboard.js`, función `getFareHarborDisplayId()`, elige `display_id` y, si falta, `external_booking_id`.

| Dato comprobado | FareHarbor #378518937 | FareHarbor #384853682 |
|---|---|---|
| `id_evento_integracion` | 126 | 124 |
| Tipo | `new_booking` | `new_booking` |
| Revisión | `approved` | `approved` |
| Aplicación | `not_applied` | `not_applied` |
| Fecha/hora de actividad conservada | `2026-10-06T10:00:00-0500` | `2026-10-11T06:00:00-0500` |
| Fecha de recepción e inserción conservada | 11 de octubre de 2026 | 10 de octubre de 2026 |
| Revisión conservada | 17 de octubre de 2026, usuario 96 | 17 de octubre de 2026, usuario 96 |
| Rol actual del usuario 96 | Administrador | Administrador |
| Vínculo en `reservas_integracion_link` | No existe | No existe |

Ambas actividades ya habían transcurrido cuando se aprobaron. El evento 126 incluso fue persistido después de su fecha de servicio. En el inventario consultado hay un solo evento para cada uno de estos dos bookings. La ausencia de vínculo acredita que no están asociados por el mecanismo de integración a una reserva interna; no descarta por sí sola una captura manual equivalente sin vínculo.

### 2.2 Significado exacto de los estados

`review_status` registra la decisión de revisión: `pending_review`, `approved` o `dismissed`; el esquema también admite el valor heredado `applied`. El validador público de listado admite los tres primeros. Los flujos de aplicación actuales utilizan otra columna para registrar su resultado; no debe interpretarse `review_status='approved'` como alta efectuada.

`application_status` admite `not_applied` y `applied`. La interfaz los muestra como **No registrado** y **Registrado**. La aprobación actualiza `reviewed_by`, `reviewed_at`, `review_note` y `updated_at`. La aplicación actualiza `application_status`, `applied_by` y `applied_at`, y conserva la revisión. Las altas crean el vínculo proveedor/booking/reserva, la reserva y su bitácora dentro de la misma transacción. Una modificación o cancelación aplicada no significa necesariamente crear una reserva nueva; la etiqueta genérica “Registrado” debe entenderse en el contexto del tipo de evento.

Evidencia: `backend/services/eventosIntegracion.service.js`, `revisarEventoIntegracion()`; `database/migrations/010_eventos_integracion_base.sql`, `011_eventos_integracion_revision.sql`, `013_getyourguide_apply_new_booking.sql`; constantes y etiquetas al inicio de `frontend/pages/dashboard.js`.

### 2.3 Validación que bloquea el registro

La causa determinante es `evaluarTimingActividadFareHarbor()` en `backend/integrations/fareharbor/fareharborApplication.service.js:105`: normaliza el offset y compara el instante de `availability.start_at` con el reloj actual. **Si inicio <= ahora, `has_started=true`.** También bloquea un inicio no interpretable.

`construirPreviewNuevaReservaFareHarborConDb()` (línea 402) añade el motivo “La actividad ya inició y no puede registrarse como una reservación operativa.” y exige `has_started === false` para `ready_to_apply`. La UI deshabilita la aplicación mediante `isFareHarborReadyForApply()` y sus comprobaciones de preview.

La protección se repite en backend: `construirReservacionFareHarborParaAplicacion()` (línea 720) devuelve `actividad_iniciada` antes de crear la reserva. `aplicarNuevaReservaFareHarbor()` (línea 906) revierte la transacción. El controlador responde **409**: “La actividad FareHarbor ya inició y no puede aplicarse como reservación operativa.”

La aprobación no evalúa ese horario; solo acepta la transición de revisión pendiente. Por eso aprobar hoy un evento antiguo es posible y no elimina el bloqueo posterior. No es un fallo de PostgreSQL ni una necesidad de completar el pickup. Pueden existir otros datos faltantes, pero ninguno permite superar esta condición. La restricción concreta procede del servicio de FareHarbor; el validador general de reservaciones valida formato de fecha, no implementa esta misma comparación temporal. No se propone modificar ninguna de las dos validaciones ni habilitar altas históricas por otra vía.

### 2.4 Por qué siguen en el panel y qué descarte existe

`loadIntegrationPendientes()` consulta dos listados operacionales: revisión pendiente y aprobados, con `limit=50` en cada uno. `buildPendingIntegrationEvents()` incorpora los aprobados cuyo `application_status` sigue siendo `not_applied`. No elimina las altas cuya actividad ya empezó.

`construirFuenteEventosIntegracionOperacional()` en `backend/services/eventosIntegracion.service.js:407` conserva el último snapshot de FareHarbor por booking, ordenado por recepción/creación e ID; excluye altas ya vinculadas. El corte `INTEGRATION_DASHBOARD_CUTOFF_AT` **exceptúa FareHarbor** y se refiere a recepción, no al servicio. Cambiarlo no resolvería estos dos casos.

Existe `PATCH /api/eventos-integracion/:id/revision` con `accion='dismiss'`, solo para Administrador. Sin embargo, el `UPDATE` exige `review_status='pending_review'`; sobre estos aprobados devolvería **409, ya revisado**. La nota actual es opcional, hasta 500 caracteres. La UI ofrece “Rechazar” para eventos GYG pendientes; la rama de acciones FareHarbor no ofrece ese botón. No hay acción de archivo, metadatos de archivo ni filtro de archivados. La API permite consultar `review_status=dismissed`; el panel principal no ofrece un historial de archivados.

### 2.5 Origen: qué se demuestra y qué falta

Los dos eventos conservan `provider='fareharbor'`, identidad con prefijo `fh:`, snapshot normalizado y fechas de recepción/inserción. Esa estructura coincide con `normalizarPayloadWebhookFareHarbor()` y `persistirWebhookFareHarbor()`. El prefijo combina UUID y fingerprint SHA-256; un display ID numérico o un payload con apariencia real no acredita una entrega externa.

**No es posible certificar con la evidencia disponible si fueron entregas directas del proveedor, reenvíos manuales de payloads o pruebas locales.** La tabla no registra origen de ingreso, ambiente de prueba, request ID autenticado ni referencia a un log de entrega. `source_received_at` se establece al persistir y `source_subject` lo construye el propio servicio; ninguno distingue esos canales. `reviewed_by=96` identifica al revisor, no al emisor del webhook.

No se encontraron esos dos números en las fuentes, fixtures ni evidencia textual local revisada. Las pruebas existentes usan otros identificadores sintéticos; eso no demuestra que nunca se hiciera una prueba manual con estos payloads. RELEASE-01 recoge que la base contiene datos ficticios, pero no aporta una cadena de procedencia individual para estos eventos. Se necesita un log histórico redactado del receptor/proveedor, o confirmación documentada del responsable de las pruebas, para cerrar esa clasificación. No se consultó FareHarbor ni se reenviaron eventos para intentar reconstruirla.

### 2.6 Solución mínima recomendada: archivo independiente de la revisión

Agregar **Archivar evento**, solo para Administrador, con motivo obligatorio, usuario de la sesión y fecha del servidor. El texto debe explicar: “Retira este evento de los pendientes. Conserva su historial y no modifica reservaciones ni al proveedor.” Mostrar un formulario breve y el resultado en el detalle.

El archivo será una dimensión independiente: los eventos 124 y 126 conservarían `approved/not_applied`, su revisor y su fecha de aprobación. Solo después de autorización específica se archivaría cada uno con un motivo veraz, por ejemplo “Fecha de servicio transcurrida; evento sin aplicar”. No llamarlo “prueba” mientras su origen no esté acreditado.

Propuesta de contrato interno, **todavía no implementado**:

- `PATCH /api/eventos-integracion/:id/archivo`, cuerpo `{ "motivo": "..." }`. Rechazar vacío/solo espacios, tipos incorrectos y más de 500 caracteres. No aceptar usuario ni fecha enviados por el cliente.
- Inicialmente permitir solo eventos no aplicados, pendientes o aprobados; rechazar eventos aplicados. No extender a restauración o archivo masivo en esta mejora.
- Bloquear/releer el evento dentro de una transacción. Resolver doble archivo sin sobrescribir al primer responsable ni emitir avisos repetidos. En una carrera archivo/aplicación, una sola acción debe prevalecer y la otra devolver conflicto.
- Añadir `archived_at`, `archived_by` y `archive_reason` a `eventos_integracion`, con fecha según la convención temporal del proyecto, FK a `usuarios`, y restricción que permita los tres nulos o los tres completos con motivo válido. El archivo queda auditado en esos campos sin fingir una modificación de reservación en bitácora.
- Excluir archivados del listado principal, conteos y avisos. Mantener detalle y filtro explícito de archivo, independientes del filtro de revisión. La consulta histórica debe poder listar archivados aunque su revisión sea `approved` o `pending_review` y sin perder snapshots por `operational_only`.
- Comprobar archivo en **todos** los servicios de aplicación GYG/FH, incluidas modificaciones, cancelaciones y resoluciones sin cambios. No basta con ocultar el botón o cambiar el listado. Conservar los bloqueos/transacciones existentes y probar concurrencia.

**Sí requiere una migración aditiva autorizada.** Las columnas no existen en el esquema consolidado ni en la base consultada. Habrá que actualizar esquema, migración nueva y permisos del rol operativo si procede; no ejecutar ni reaplicar migraciones anteriores.

Reutilizar `dismissed` y `reviewed_*` evitaría DDL, pero obligaría a permitir una nueva transición desde aprobado y sobrescribiría la evidencia de aprobación. Guardar el archivo dentro de `normalized_data` mezclaría metadatos internos con el snapshot externo utilizado por fingerprints/diffs. Ninguna es la recomendación para preservar trazabilidad.

Hay dos detalles necesarios para evitar regresiones: seleccionar primero el último snapshot FH y después excluirlo si está archivado, para no revivir uno anterior; y mantener la unicidad `(provider, external_event_id)`, de modo que una reentrega idéntica no desarchive ni vuelva a avisar. Un snapshot nuevo con contenido distinto es otro evento y puede requerir revisión; archivar uno no silencia futuras modificaciones del booking ni cancela nada en FareHarbor.

## 3. Transporte #425

### 3.1 Origen de la etiqueta y del registro

`frontend/pages/operaciones.js`, función `getTransporteLabel()` (aproximadamente línea 743), devuelve `Transporte #<id_transporte_operacion> · Vehículo pendiente` cuando el objeto no contiene `vehiculo`. Si existe esa etiqueta de vehículo devuelve vehículo y operador. El número **425** sale de **`transportes_operacion.id_transporte_operacion`**, PK `INTEGER GENERATED ALWAYS AS IDENTITY`; no representa placa, vehículo, grupo ni cantidad de unidades. Los saltos o cifras grandes de una secuencia no prueban duplicados.

El flujo normal es manual: crear operación → abrir transportes → “Agregar transporte” → `POST /api/transportes` → `transportes.controller.crearTransporte()` → `transportes.service.crearTransporte()`. Crear operación y calcular sugerencias no insertan automáticamente transportes ni asignan clientes. También existen scripts de laboratorio que insertan transportes; su existencia no demuestra que crearan el 425.

`buildTransportePayload()` no envía vehículo al crear. `crearTransporte()` rechaza creación con vehículo porque todavía no hay al menos dos pasajeros activos. `id_vehiculo` e `id_operador` admiten NULL. Primero se prepara el registro de organización y se asignan reservaciones; luego se selecciona vehículo mediante edición/PATCH. Es un estado previsto por la operación actual.

### 3.2 Relaciones y asignación

Cada transporte pertenece a una operación mediante `id_operacion_tour`. La operación identifica fecha + tour + turno explícito + grupo 1/2, y puede tener guía. El transporte concentra vehículo, operador y observaciones. `UNIQUE(id_operacion_tour)` impone como máximo uno por grupo; está presente en la base consultada y en la migración 006. La unicidad de la operación está en `uq_operaciones_tour_fecha_tour_turno_grupo`.

La UI asigna manualmente por `PATCH /api/reservaciones/:id/transporte`. `reservaciones.service.asignarTransporteReservacion()` (línea 1009) valida existencia, fecha, tour, turno, capacidad y estado, bloquea las filas, cambia `reservaciones.id_transporte_operacion` y registra la modificación en bitácora en la misma transacción. No altera el pickup individual. La hora operativa se utiliza como primera hora de pickup del grupo; mejorar la etiqueta no requiere cambiar esa regla.

`capacidad.service.js` permite hasta 12 PAX activos por transporte/grupo y 24 por tour/fecha/turno. Las canceladas no cuentan. Con vehículo se valida también su capacidad física y el mínimo existente de dos pasajeros activos; antes de reducir una asignación por debajo de ese mínimo se debe desasignar la unidad. No se propone cambiar estas reglas.

### 3.3 Evidencia específica del 425 y duplicados

| Dato observado | Valor |
|---|---|
| Transporte / operación | 425 / 443 |
| Fecha / tour / turno / grupo | 3 de noviembre de 2026 / tour 74 / Mañana / grupo 1 |
| Hora de inicio | 06:00 |
| Estado | Listo |
| Vehículo actual | ID 111, `Unidad 2`, capacidad 12 |
| Operador actual | ID 42 |
| Reservaciones / PAX activos asignados | 1 / 2 |
| Reservación vinculada | 1796, estado Pendiente; evento FH 125, display #385117159 |

La bitácora conserva asignación al 425, salida y reasignación de la reserva 1796 el 17 de octubre, por usuario 96 (entradas 955, 956 y 957). Esto acredita uso operativo del registro. **En el momento de la consulta ya no está sin vehículo.** La etiqueta reportada pudo corresponder a un estado anterior o a datos de UI sin actualizar; no se puede distinguir entre ambas posibilidades sin la captura temporal y su respuesta API. No se reprodujo la pantalla habitual contra la base.

El esquema de transportes no guarda fecha/usuario de creación, y no se localizó evidencia específica que permita atribuir su inserción exacta al formulario o a un script. No debe afirmarse que el 425 es un residuo de pruebas por el valor de su ID. Sí se conoce cómo lo crea el flujo normal y cómo quedó utilizado.

Inventario de solo lectura: **10 transportes, cinco sin vehículo, ninguno sin reservaciones asignadas; cero operaciones con transportes duplicados y cero identidades de operación duplicadas**. Son cantidades de esta base y de este momento. Los cinco sin vehículo no son automáticamente innecesarios; no se determinó una razón para limpiar, fusionar o borrar registros. No se revisó DEV ni todas las instalaciones.

### 3.4 Etiquetas propuestas, sin cambio de claves ni de asignación

Usar la misma descripción en selector, resumen y cabecera de transporte, con grupo y contexto tomados de la operación seleccionada:

- `Grupo 1 · Transporte #425 · 2/12 PAX · Unidad 2` — ejemplo con los datos observados.
- `Grupo 1 · Transporte #425 · 2/12 PAX · Vehículo pendiente` — ejemplo ilustrativo del estado pendiente, no estado actual comprobado del 425.
- Fuera del contexto de una operación, anteponer fecha, tour y turno para distinguir salidas.

Con vehículo de capacidad inferior a 12, mostrar `PAX asignados / límite efectivo`, siendo el límite `min(12, capacidad del vehículo)`; conservar visible la capacidad de la unidad cuando aporte contexto. Sin vehículo, los 12 son el máximo operativo del grupo, no una unidad física confirmada. Si aún no cargó Daily, mostrar `PAX por consultar`; no convertir ausencia de datos en cero confirmado.

`daily.service.js`, `crearTransporteOperativo()` y `agruparDailyOperativo()`, ya entregan `total_pax_activos` y datos del vehículo. En la UI existen `findDailyTransporte()`, `getPaxGrupoText()` y el contexto de operación. `transportes.service.js` también proporciona turno y número de grupo en su respuesta enriquecida. Se puede componer la etiqueta con estos datos; no se necesita DDL, renumeración, una nueva entidad ni asignación automática.

## 4. Recepción y aplicación de GYG/FareHarbor

### 4.1 GetYourGuide mediante Gmail

Flujo implementado: worker condicional → Gmail OAuth `gmail.readonly` → history/mensajes → comprobación de remitente y clasificación de asunto → parser → mapper → `registrarEventoIntegracion()` → revisión administrativa → aplicación explícita → reserva/vínculo/bitácora/estado aplicado.

Archivos principales: `getyourguideGmail.service.js`, `getyourguideEmailClassifier.js`, `getyourguideEmailParser.js`, `getyourguide.mapper.js`, `getyourguideGmailSync.service.js`, `getyourguideReservationApplication.service.js` y `getyourguideModificationDiff.service.js`, dentro de `backend/integrations/getyourguide/`. La API de eventos usa el controlador/servicio comunes y equivalencias de tours.

`iniciarWorkerSincronizacion()` se invoca al arrancar `server.js` como programa principal. Solo programa ciclos si `GYG_GMAIL_SYNC_ENABLED=true`; intervalo por defecto 120 segundos, sin ciclos solapados. El primer ciclo sin estado guarda baseline de history y no importa automáticamente todo el histórico. Hay checkpoint, recuperación de history expirado, paginación/lotes y backoff de cuota (por defecto 900 segundos), mediante `integracion_sync_estado`.

En **`.env` local inspeccionado el flag es `false`**. No se detectaron overrides heredados para ese flag ni `APP_CONFIG_PATH` en el proceso de diagnóstico. No se abrieron ni probaron tokens; las rutas predeterminadas son `process.cwd()/secrets/credentials.json` y `gmail-token.json`. Falta acreditar aprovisionamiento seguro para la instalación y cuenta empresarial autorizada, como recoge RELEASE-01.

La base contiene **129 eventos GYG** y estado de sincronización histórico con última marca de éxito del 9 de octubre UTC y última marca de error del 13 de octubre UTC; recuperación inactiva en la consulta. Estas marcas pueden proceder de ejecuciones anteriores o datos preparados: no demuestran que el worker esté ejecutándose ahora ni que la recepción empresarial actual funcione. No se activó para comprobarlo.

El servicio de aplicación maneja altas, modificaciones y cancelaciones dentro de transacciones, con aprobación y comprobación de vínculos. No hay API directa GYG ni registro interno automático por la sola llegada del correo. En la UI, “Aprobar y registrar” para una alta GYG realiza llamadas de revisión y aplicación separadas: si la segunda falla puede permanecer `approved/not_applied`.

### 4.2 FareHarbor mediante webhook

Rutas existentes: `POST /api/integraciones/fareharbor/webhook` y alias `/api/webhooks/fareharbor`, montadas con límite JSON de 256 kb. `fareharborWebhook.controller.recibirWebhook()` valida `query.key`, procesa el payload y llama a `persistirWebhookFareHarbor()`; no exige la sesión del personal, sino la clave de webhook.

El mapper exige `booking.uuid`, conserva un snapshot normalizado y genera identidad `fh:<uuid>:<fingerprint>`. `clasificarEventoFareHarbor()` produce cancelación si el estado es `cancelled`; en otro caso modificación si existe vínculo, o alta si no existe. Persistencia transaccional y unicidad proveedor/evento evitan reinsertar el mismo snapshot. La llegada no aprueba ni aplica automáticamente el evento.

Los servicios separados `fareharborApplication`, `fareharborModificationDiff/Application` y `fareharborCancellationPreview/Application` generan preview/diff y aplican una decisión administrativa, preservando transacción, vínculo y bitácora. El API HTTP permite consultar compañías/reservas, pero **el controlador de webhook no llama a `obtenerBookingActualizado()`**: usa el payload recibido. No hay worker periódico FH ni reconciliación automática acreditada.

Estado local comprobado: secreto de webhook presente, pero **URL base, claves App/User y shortname sin configurar** en `.env`. Esto impide acreditar el cliente HTTP, pero no demuestra que nunca se persistiera un webhook: el camino de ingreso no depende de esas claves. El servidor normal escucha `127.0.0.1:3000`; no se verificó receptor público/TLS, túnel ni configuración vigente del proveedor. Tampoco hay un flag FH equivalente al de GYG que desmonte estas rutas: están implementadas y montadas cuando se inicia la API normal, y la clave controla su aceptación.

La base consultada contiene **siete eventos FH**, incluidas tres altas aplicadas y una cancelación aplicada. Demuestran persistencia y uso del mecanismo interno; no certifican autenticidad de entregas externas. El cliente tiene manejo de errores HTTP, pero no timeout explícito ni retry/backoff propio. La puesta en marcha debe cerrar receptor, contrato, autorización y aceptación, sin inventar endpoints del proveedor ni activarlo durante esta fase.

### 4.3 Dashboard y notificación actual

`dashboard.service.obtenerResumenDashboard()` consulta **reservaciones internas**, grupos y salidas; el alcance parcial evita consultar métricas globales. Un evento recién recibido permanece en `eventos_integracion` y no aumenta las reservaciones/PAX del resumen hasta que se aplique y se consulte nuevamente el resumen.

La interfaz realiza peticiones independientes: `loadDashboard()` obtiene `/api/dashboard/resumen`, y `loadIntegrationPendientes()` obtiene los eventos. El panel carga al entrar y se actualiza silenciosamente cada **60 segundos** mientras la ruta sea exactamente `#/dashboard`; el timer se detiene al salir. Las acciones locales llaman a `refreshAfterIntegrationAction()` y recargan pendientes y resumen. El timer de eventos no recarga por sí solo las métricas de reservas cuando otro usuario aplica un evento.

**Sí existe actualización automática del listado y su contador visual dentro de Dashboard. No existe una notificación dedicada al personal** con badge global, aviso de llegada, sonido, notificación del sistema, enlace persistente al evento, control de vistos o prevención de avisos por usuario. Hay regiones `aria-live`, que pueden anunciar cambios de contenido con tecnología de asistencia; eso no constituye el mecanismo de notificaciones solicitado. `notificado` en reservaciones es una marca de cliente notificado, no un acuse del personal ni evidencia de envío automático.

El contador actual usa `integrationState.events.length`: hasta 50 pendientes más 50 aprobados antes del filtrado/deduplicación en cliente. No es un total global fiable con más páginas; además incluye altas vencidas. Fuera de Dashboard no se sigue consultando esa bandeja. `frontend/js/layout.js` no contiene un centro de notificaciones.

### 4.4 WhatsApp

`backend/config/whatsapp.js` mantiene `habilitado:false` congelado y `server.js` no monta sus rutas. La plataforma puede utilizarse como procedencia de captura manual. Se conserva ese bloqueo; ninguna propuesta de avisos requiere WhatsApp ni servicios externos.

## 5. Propuesta mínima de notificaciones internas

Preparar la función con API simulada y eventos sintéticos; no necesita esperar credenciales reales para desarrollarse. Su aceptación como aviso de **llegada externa** sí necesita la puesta en marcha individual del proveedor.

1. **Separar dos conceptos:** contador de pendientes accionables y contador de nuevos sin ver. Abrir un evento lo marca visto para ese usuario, pero no lo aprueba, aplica ni retira de pendientes. Una nueva versión externa con otro ID puede volver a requerir aviso.
2. **Elegibilidad común en backend:** partir de la selección operacional, tipos soportados, revisión pendiente/aprobada y no aplicado; excluir archivados, descartados, snapshots obsoletos y altas ya vinculadas. Las altas FH iniciadas no deben aumentar el contador de altas registrables: mostrarlas, mientras no se archiven, en “Requieren archivo/revisión”. Campos completables pendientes sí requieren trabajo del personal. No excluir indiscriminadamente modificaciones/cancelaciones por fecha antigua: pueden requerir conciliación.
3. **Conteos completos y proyección pequeña:** proponer `GET /api/eventos-integracion/resumen` antes de `/:id`, con total accionable y referencias mínimas paginadas para navegación. Es un endpoint interno nuevo propuesto, no existente. Compartir criterio de elegibilidad entre lista y contador; no sumar solo la primera página ni ejecutar un preview completo con consultas por cada evento cada minuto. Validar fechas externas inválidas sin casts SQL que aborten todo el resumen.
4. **Un solo coordinador en frontend:** a nivel de aplicación/layout, después de validar sesión y alcance, reemplazar el timer local del panel para evitar dos sondeos. Empezar con 60 segundos, petición única en curso, pausa con ventana oculta, consulta al recuperar foco y backoff acotado ante fallos. La consulta es a la API interna: no dispara sincronizaciones de proveedores. Mostrar última actualización y fallo discreto; no presentar fallo como cero pendientes.
5. **Aviso discreto:** badge accesible y mensaje breve, por ejemplo “Hay 2 eventos nuevos de FareHarbor”. Un aviso agrupado por ciclo, sin datos de clientes y sin sonido por defecto; sin repetir en cada sondeo. Conservar la lista y permitir abrir el detalle actual mediante el ID interno.
6. **Enlace verificable:** actualmente el router trata todo el hash como nombre de página; `#/dashboard?evento=126` no funciona hoy. Incorporar explícitamente esa navegación o una acción equivalente que vaya a Dashboard y abra el modal al terminar de cargar. Revalidar sesión/permisos y volver a consultar el detalle; manejar 404/403/evento archivado sin mostrar contenido antiguo.
7. **Vistos y deduplicación por usuario:** primera versión en almacenamiento local, clave por ambiente y `id_usuario`, con IDs internos vistos y notificados, versión de formato y retención acotada. No guardar payloads, clientes ni tokens allí; no usar solo el mayor ID, pues se puede revisar fuera de orden. No marcar visto por listar o por emitir el aviso. En primer acceso mostrar pendientes existentes y un único resumen; evitar una ráfaga por cada evento histórico.
8. **Seguridad del estado en memoria:** invalidar solicitudes, timers, mensajes y cachés al cerrar sesión, cambiar de usuario o perder alcance. Usar `App.api.apiFetch`, versión de sesión y `AbortController` existentes. Releer permisos en backend. No compartir listas entre sesiones ni mostrar respuestas atrasadas tras una revocación. Ante archivo/aplicación por otra sesión, retirar el pendiente en el próximo sondeo sin generar un aviso de llegada.

El guardado local permite no repetir avisos al volver a abrir en el mismo perfil, pero **no sincroniza vistos entre equipos ni perfiles Windows** y debe probarse con dos ventanas del mismo perfil para no duplicar avisos (estado compartido/evento de almacenamiento o coordinador único). Si se exige lectura por usuario entre equipos, hará falta otra persistencia backend autorizada, normalmente una relación usuario/evento con fecha de lectura. Una sola columna `seen` en el evento sería incorrecta porque mezclaría a todos los usuarios. Esa ampliación no es necesaria para la primera versión local y no se propone crear esa tabla ahora.

## 6. ACCESS-SCOPE y riesgos

| Perfil | Política actual que debe conservarse |
|---|---|
| Administrador | Consulta de eventos, revisión y aplicación; archivo propuesto solo para este rol. |
| Consulta con alcance `all` | GET de eventos permitido, lectura de lista/detalle con la proyección actual; sin revisar, aplicar ni archivar. Badge/lista, si se muestran, solo informativos. |
| Consulta con alcance `selected` | Eventos de integración fuera de su lista de rutas autorizadas; no mostrar panel/badge/conteo ni hacer solicitudes de eventos. No revelar siquiera cantidades globales. |

Evidencia: `eventosIntegracion.routes.js`, `auth.middleware.js` y `alcanceReservaciones.middleware.js`. `autorizarRoles()` deriva GET/HEAD a la política de alcance; la lista permitida de Consulta selected no incluye eventos de integración. `App.auth.esConsultaRestringida()` ya suprime el panel. Un endpoint nuevo de resumen debe heredar estas mismas protecciones, `Cache-Control: no-store` y la proyección sanitizada. El motivo de archivo puede contener información sensible: limitarlo, escaparlo al mostrarlo y mantener la lectura dentro de los permisos del evento.

Riesgos principales y mitigaciones:

- **Pérdida de trazabilidad:** no convertir aprobado en descartado sobrescribiendo revisión; archivo independiente y sin eliminación.
- **Aplicación tras archivo o carreras:** validación backend en cada camino de aplicación, bloqueo, transacción y pruebas de dos sesiones. La UI no es el control final.
- **Reaparición de eventos/avisos:** no eliminar identidades deduplicadas, no filtrar archivados antes de elegir último snapshot, distinguir reentrega de evento nuevo.
- **Fuga por contador o caché:** misma política ACCESS-SCOPE para resumen, lista, enlaces y lectura; limpieza de sesión y respuestas tardías bloqueadas.
- **Carga o errores de sondeo:** sin solapamientos, sin multiplicar timers al navegar, pausa/backoff y conteo backend independiente de la paginación visible.
- **Falsa sensación de recepción real:** distinguir “evento interno nuevo” de “entrega autenticada por proveedor”; mostrar estado de sincronización cuando haya un contrato de estado operativo aprobado.
- **Transporte mal interpretado:** diferenciar límite operativo de capacidad física, no contar canceladas y no inferir basura por ID alto o vehículo NULL.

No se propone borrar reservas/eventos, modificar asignaciones existentes, cancelar en proveedores, cambiar roles, saltar validaciones temporales ni introducir dependencias o servicios externos.

## 7. Cambios de base de datos: decisión propuesta

| Mejora | ¿Migración? | Alcance y condición |
|---|---|---|
| Etiquetas de transporte y explicación de aprobado/no registrado | No | Composición y textos con campos ya disponibles. |
| Mensaje claro de actividad iniciada / pendiente de archivo | No | Consumir preview existente; no cambiar recepción ni aplicación. |
| Archivo con conservación de aprobación y motivo/usuario/fecha propios | **Sí** | Tres campos aditivos y sus restricciones en eventos; autorización específica previa a implementación de persistencia y a ejecución. |
| Badge, sondeo interno y vistos locales por usuario/ambiente | No, salvo dependencia del archivo | Estado local y resumen derivado; toca flujo de avisos/API y requiere la fase de implementación autorizada. |
| Vistos compartidos entre equipos | Sí, si se exige | Diseño separado y autorización de relación persistente usuario/evento. Posponer. |
| Trazabilidad adicional del canal de ingreso | Por definir | Logs redactados con correlación pueden prepararse en la puesta en marcha; no reconstruyen retroactivamente el origen de 124/126. Campos nuevos exigirían autorización. |

No hay DDL ni scripts de migración entregados o ejecutados en esta fase. Una futura migración debe ensayarse exclusivamente en una base desechable y revisar privilegios, estado inicial NULL, integridad, backup/reversión y compatibilidad de una versión anterior del cliente.

## 8. Pruebas ejecutadas y pruebas necesarias

### 8.1 Ejecutadas en esta fase

**14 suites, 440 pruebas aprobadas, cero fallos.** Se ejecutó Jest por rutas explícitas, un solo proceso y sin caché. Entorno sintético: `NODE_ENV=test`, `APP_CONFIG_PATH=NUL`, host `invalid.test`, base de nombre de prueba y GYG deshabilitado. `backend/__tests__/helpers/noPostgres.js` bloqueó conexiones/consultas reales de `pg.Pool`; `scripts/accessScopeNetworkGuard.cjs` bloqueó HTTP/fetch externo. Los clientes Gmail/FH y el acceso a datos utilizados por las suites fueron simulados/injectados.

Suites: `eventosIntegracion.service`, `eventosIntegracion.routes`, `fareharborApplication.service`, `fareharborWebhook.service`, `fareharborWebhook.controller`, `fareharborWebhook.routes`, `fareharbor.mapper`, `getyourguideGmailSync.service`, `getyourguideReservationApplication.service`, `getyourguideGmail.service`, `getyourguideEmailParser`, `capacidad.service`, `accessScope.routes` y `whatsappDisabled`.

Estas pruebas verifican la implementación existente, no funciones propuestas todavía inexistentes. No se ejecutó `api.test.js` ni scripts que preparan/limpian bases persistentes. Las consultas diagnósticas de metadatos descritas en sección 1 fueron de solo lectura y separadas de Jest. No hubo prueba de proveedor ni aceptación humana de notificaciones.

### 8.2 Aceptación de las mejoras futuras

| Área | Casos necesarios en API simulada / datos sintéticos |
|---|---|
| Estados y fechas | Evento aprobado sin aplicar sigue sin ser reserva; FH antes de inicio, exactamente al inicio, pasado, offsets `-0500`/`-05:00` y fecha inválida; UI deshabilitada y API 409; ningún override permite registrar una alta vencida. |
| Archivo | Motivo válido/obligatorio/límite/escape; usuario y fecha del servidor; conservar revisión y aplicación; excluir de principal/conteo/avisos; filtro histórico y detalle; doble archivo; intento sobre aplicado; todos los caminos GYG/FH rechazan aplicación archivada. |
| Snapshots | Archivo del último no revive anterior; reentrega idéntica sigue archivada; snapshot diferente puede ser nuevo; alta vinculada excluida; filtro histórico muestra todas las revisiones archivadas. |
| Permisos | Administrador, Consulta all y selected con/sin plataformas; selected 403 también en resumen/enlace/HEAD; anónimo 401; Consulta sin escritura; revocación y cambio de usuario durante petición; ningún dato de otra sesión. |
| Transporte | Sin/con vehículo, sin operador, grupos 1/2, 0/2/12 PAX, unidad menor de 12, canceladas excluidas, datos sin cargar y fecha/turno visibles; el valor de opción y la FK siguen siendo el mismo ID; no crear registros por renderizar etiquetas. |
| Avisos | Primera entrada con históricos, evento nuevo, reentrega, páginas superiores a 50, visto fuera de orden, archivo/aplicación en otra sesión, regreso al Dashboard, dos ventanas, red caída, foco/ocultación, backoff y ausencia de peticiones superpuestas. |
| Dashboard | Recibir evento no cambia reservas; aplicar y recargar sí; aplicación por otra sesión actualiza resumen mediante política explícita; métricas parciales siguen sin consultar globales. |

En PostgreSQL **desechable**, tras autorizar su creación y la migración: instalación/actualización de esquema, FK/CHECK/rollback, repetición segura según procedimiento, concurrencia real archivo/aplicación/doble archivo, unicidad de snapshots y ausencia de cambios colaterales. No usar principal ni DEV como laboratorio.

Solo con autorización separada de puesta en marcha: entrega Gmail y webhook auténticos con cuenta/receptor acordados, formatos y zonas horarias, reentregas/reinicio/cuotas/fallos, trazabilidad del ingreso y conciliación de contador/registro interno. Una prueba sintética o un POST manual no sustituye ese ensayo.

## 9. Archivos y funciones que intervendrían

| Área | Puntos de cambio propuestos, no modificados aquí |
|---|---|
| Textos y transporte | `frontend/pages/operaciones.js`: `getTransporteLabel`, selectores y cabeceras; `findDailyTransporte`, `getPaxGrupoText`; datos de `daily.service.js` y `transportes.service.js` ya disponibles. |
| Archivo/listados | `eventosIntegracion.routes.js`, `.controller.js`, `.service.js`, `.validator.js`; transacción de archivo, columnas proyectadas, filtro independiente y conteo; `frontend/pages/dashboard.js` para formulario, filtro y detalle. |
| Bloqueo de aplicación archivada | Servicios `getyourguideReservationApplication`, `fareharborApplication`, `fareharborModificationApplication` y `fareharborCancellationApplication`, incluidos caminos sin cambios/vínculo. |
| Esquema | `database/schema.sql` y una migración nueva revisada; no alterar las relaciones operativas de transportes/reservas. |
| Avisos/estado local | `frontend/js/app.js`, `layout.js`, `auth.js`, `api.js`, `router.js` y panel de `dashboard.js`; coordinador único, navegación al evento y limpieza de sesión. CSS existente solo si lo exige el badge/formulario. |
| Resumen interno | Rutas/controlador/servicio/validador de eventos; reutilizar middleware y política de alcance, sin ampliar el acceso de Consulta selected. |
| Pruebas | Suites de eventos, aplicaciones, capacidad/ACCESS-SCOPE y harness frontend con API simulada; concurrencia en base desechable autorizada. |

No hace falta cambiar Electron, instaladores, credenciales, proveedor, estrategia de sincronización ni claves primarias para resolver estas molestias de operación.

## 10. Orden propuesto e impacto en el lanzamiento

Estimaciones de esfuerzo de desarrollo y verificación, no fechas comprometidas; excluyen esperas de autorización, aprovisionamiento y aceptación empresarial.

| Orden | Trabajo | Esfuerzo orientativo | Dependencia / impacto |
|---|---|---|---|
| 1 | Etiqueta de transporte y aclaración visual de estados/actividad iniciada | 0.5–1 día | Sin migración ni proveedor. Riesgo bajo; mejora inmediata de comprensión. |
| 2 | Archivo y consulta histórica, bloqueo de aplicación y regresión | 1–2 días más ensayo aislado | Autorizar campos/flujo y después migración en destino. Resuelve los pendientes sin tocar reservas. |
| 3 | Resumen/badge, sondeo único, avisos y vistos locales | 1–2 días | Desarrollar con API ficticia; integrar exclusión de archivados del paso 2 y conservar ACCESS-SCOPE. |
| 4 | Ensayo autenticado de llegada y notificación GYG/FH | Duración pendiente de acceso/receptor/cuenta | Depende de puesta en marcha autorizada de cada integración. No prometer recepción real antes de esa evidencia. |

Las tres mejoras internas representan aproximadamente **2.5–5 jornadas más el ensayo persistente y la aceptación**, manteniendo alcance acotado. Vistos entre equipos, un centro avanzado de notificaciones y cambios de estrategia de proveedores pueden posponerse. No se justifica rehacer la planificación de transportes ni relajar las fechas para acelerar el lanzamiento.

Estos inconvenientes no sustituyen los bloqueadores de RELEASE-01: configuración/credenciales, cuenta operativa, respaldo/recuperación, instalador y aceptación siguen pendientes según aquel informe. No se declara GO por corregir etiquetas o aprobar las pruebas simuladas. Si la empresa acepta lanzamiento manual, puede mantener GYG/FH sin activar; si depende de esas integraciones desde el primer día, la recepción autenticada y los avisos operativos pasan a ser criterios de aceptación obligatorios.

## 11. Conclusión y decisiones pendientes

**Pueden implementarse inmediatamente en una fase de cambios acotada** las etiquetas de transporte y textos explicativos, sin DDL ni activación externa. El badge, sondeo y vistos locales pueden desarrollarse y probarse con API simulada antes de poner en marcha los proveedores. Esta fase no los implementó.

**El archivo recomendado requiere autorización específica del cambio de persistencia y flujo**, y autorización posterior para ejecutar su migración en un destino identificado. Los eventos 124/126 permanecerán intactos hasta entonces. No se recomienda descartarlos sobrescribiendo su aprobación ni reabrir el alta histórica.

**Dependen de la puesta en marcha real** la certificación de recepción GYG/FH, la trazabilidad del canal externo y la aceptación de avisos de llegada auténtica. El origen individual de los dos eventos antiguos y el instante/medio de creación del transporte 425 quedan expresamente sin certificar por falta de evidencia histórica, aunque se identificaron sus registros, estados, relaciones y uso actuales.

No se modificaron PostgreSQL principal/DEV, reservaciones, eventos reales, configuración, credenciales ni instaladores; no hubo migraciones, limpieza, sincronizaciones externas, activaciones, commit ni push. **Archivo creado: `docs/PRE-RELEASE-01.md`.**
