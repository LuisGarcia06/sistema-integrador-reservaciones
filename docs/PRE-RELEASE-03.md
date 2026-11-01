# PRE-RELEASE-03 — Archivo seguro de pendientes de integración

**Proyecto:** Sistema Integrador de Reservaciones — Community Tours Sian Ka’an.  
**Fecha:** 17 de octubre de 2026, America/Cancun.  
**Rama comprobada:** `GYG+FRHB-implementado`.  
**Referencia:** `docs/PRE-RELEASE-01.md`. PRE-RELEASE-02 permanece conservado y aprobado visualmente por el usuario.  
**Estado:** código y SQL preparados; migración y comprobación persistente **no ejecutadas**. Sin publicación en GitHub.

## 1. Resultado

Se implementó **Archivar evento** para Administrador, con motivo obligatorio, fecha y responsable del servidor. Un evento archivado conserva `review_status`, `application_status`, revisión, snapshot e identidad externa; deja de figurar en los pendientes activos y permanece consultable en un historial paginado.

El archivo no crea, modifica, borra ni cancela reservaciones. No realiza solicitudes a proveedores. No se añadieron restauración, archivo masivo, notificaciones nuevas ni cambios de estrategia de sincronización.

Los eventos reales **126 / FareHarbor #378518937** y **124 / FareHarbor #384853682** no se consultaron ni modificaron en esta fase. El comportamiento se verificó con eventos sintéticos que comparten sus características: aprobados, no aplicados y con actividad transcurrida. No existen excepciones ni instrucciones automáticas para archivar esos IDs reales.

## 2. Archivos de esta fase

| Archivo | Implementación |
|---|---|
| `database/migrations/017_archivo_eventos_integracion.sql` — nuevo | Migración aditiva preparada. Se comprobó que la última existente era 016. |
| `database/schema.sql` | Campos, FK, CHECK e índice de archivo en el esquema consolidado. |
| `backend/services/eventosIntegracion.service.js` | Validación del motivo, transacción y bloqueo de archivo, filtros, proyección de metadatos, protección de revisión y nombre del responsable en detalle. |
| `backend/validators/eventosIntegracion.validator.js` | Cuerpo estricto de archivo y filtro booleano `archived`; historial independiente de revisión. |
| `backend/controllers/eventosIntegracion.controller.js` | Respuestas administrativas y de conflicto, detalle archivado sin preview de aplicación, respuesta 409 al intentar aplicar/revisar archivados. |
| `backend/routes/eventosIntegracion.routes.js` | `PATCH /:id/archivo`, autenticación y rol Administrador. |
| `backend/integrations/getyourguide/getyourguideReservationApplication.service.js` | Comprobación de archivo bajo bloqueo, antes de despachar alta, modificación o cancelación; defensa adicional en el UPDATE de aplicación. |
| `backend/integrations/fareharbor/fareharborApplication.service.js` | Protección de archivo para alta. |
| `backend/integrations/fareharbor/fareharborModificationApplication.service.js` | Protección para modificación, incluidas resoluciones sin cambios. |
| `backend/integrations/fareharbor/fareharborCancellationApplication.service.js` | Protección para cancelación, conciliación de cancelada y resolución sin vínculo. |
| `backend/config/schemaArchivoEventos.js` — nuevo | Comprobación de esquema de solo lectura, sin DDL automático. |
| `backend/server.js` | Comprueba el esquema antes de escuchar o iniciar el worker. |
| `frontend/pages/dashboard.js` | Formulario consciente de archivo, filtro activo/archivado, paginación, metadatos y renovación de lista/contador. Protección frente a respuestas de otro detalle o sesión. |
| `backend/__tests__/archivoEventos.service.test.js` — nuevo | Validación, integridad de estado, concurrencia simulada, seis caminos de aplicación, listado, snapshots, deduplicación y guardia de esquema. |
| `backend/__tests__/archivoEventos.routes.test.js` — nuevo | API real con servicios/datos aislados: autenticación, roles, alcance, historial, conflictos y ausencia de cambios a reservas. |
| `backend/__tests__/archivoEventos.frontend.test.js` — nuevo | Recorrido Electron con API exclusivamente sintética. |
| `backend/__tests__/helpers/archivoEventosFake.cjs` — nuevo | Filas y bloqueos transaccionales en memoria. |
| `backend/__tests__/helpers/archivoEventosUiHarness.cjs` — nuevo | API sintética, navegación, comprobaciones y capturas. |
| `backend/__tests__/fixtures/eventosIntegracion.pre017.sql` — nuevo | Fixture de componente anterior a 017 para futura base vacía y desechable; no es el esquema completo de la aplicación. |
| `scripts/verificarArchivoEventosDesechable.cjs` — nuevo | Comprobación persistente preparada y protegida por destino/confirmación. No ejecutada. |
| `docs/pre-release-03/` y este documento — nuevos | Siete PNG, evidencia JSON e informe de entrega. |

Los cambios pendientes de PRE-RELEASE-02 en Operaciones, catálogo, función compartida de vehículos, CSS, carga de scripts, pruebas y capturas se conservaron. Esta fase no modifica su presentación de vehículos. `PRE-RELEASE-01.md`, `PRE-RELEASE-02.md` y `RELEASE-01.md` ya existían al comenzar y permanecen intactos. Git conserva todos los cambios sin commit.

## 3. Contrato y validaciones del archivo

Ruta: **`PATCH /api/eventos-integracion/:id/archivo`**. Cuerpo permitido:

```json
{ "motivo": "Actividad transcurrida; evento sin aplicar." }
```

Solo acepta `motivo`: no acepta usuario, fecha, estado ni campos adicionales del cliente. El texto se recorta en los extremos, debe contener caracteres no blancos y tener hasta 500 caracteres Unicode. El servicio valida de nuevo el motivo antes de abrir una conexión. La interfaz exige el texto y el servidor conserva la validación definitiva.

La sesión debe estar activa y el usuario autenticado debe ser Administrador. El usuario responsable procede de `req.usuario.id_usuario`, después de la comprobación existente de usuario/rol; el instante procede de `CURRENT_TIMESTAMP` en PostgreSQL.

| Situación | Respuesta |
|---|---|
| Archivo correcto | 200, metadatos del evento archivado. |
| ID/cuerpo/motivo inválido | 400; sin escritura. |
| Sin autenticación | 401. |
| Consulta all/selected o usuario inactivo | 403. |
| Evento inexistente | 404. |
| Archivo previo | 409; conserva fecha, responsable y motivo del primer archivo. |
| Evento aplicado | 409. |
| Revisión distinta de pendiente/aprobada | 409. Se conserva la funcionalidad de rechazo por separado. |
| Conflicto transaccional | 409 para serialización/deadlock; sin sobrescribir auditoría. Otros fallos revierten y devuelven error genérico. |

`archivarEventoIntegracion()` abre una transacción y obtiene la fila con `SELECT ... FOR UPDATE`. Relee archivo, aplicación y revisión **después** de obtener el bloqueo. Actualiza únicamente `archived_at`, `archived_by`, `archive_reason` y `updated_at`; confirma o revierte y libera la conexión. No invoca servicios de reservaciones, bitácora de reservaciones ni clientes externos.

Los aplicadores existentes ya bloqueaban el evento dentro de sus transacciones. Ahora seleccionan `archived_at` y lo comprueban antes de cualquier alta, cambio, cancelación o resolución. También agregan `archived_at IS NULL` al marcado final de aplicación. En una carrera, si aplica primero, el archivo ve el estado aplicado y se rechaza; si archiva primero, el aplicador relee el archivo y se rechaza. La protección no depende de la lectura previa del controlador ni de que el botón esté oculto.

La revisión/rechazo agrega la misma condición de ausencia de archivo a su UPDATE; un archivo no puede recibir una aprobación o un rechazo posteriores por esa ruta. La aprobación y aplicación originales no se sustituyen por `dismissed`, ni por un estado nuevo.

## 4. Persistencia preparada

La migración **017**, no ejecutada, agrega campos nulos a `eventos_integracion`:

- `archived_at TIMESTAMP`: misma convención de tipo que los metadatos temporales existentes.
- `archived_by INTEGER`: FK a `usuarios(id_usuario)`, sin cascada que borre trazabilidad.
- `archive_reason TEXT`: motivo obligatorio cuando hay archivo, máximo 500 caracteres y contenido no blanco.

El CHECK exige los tres nulos o los tres completos. Un evento archivado debe mantener aplicación `not_applied` y revisión pendiente/aprobada. También impide marcar como aplicado un archivo mediante un UPDATE que omitiera las defensas del servicio. Se prepara un índice parcial por fecha/ID de archivo para el historial.

No hay backfill ni UPDATE de eventos existentes en el SQL; las nuevas columnas quedan en NULL al incorporarlas. No cambian PK, UUID, fingerprint, claves únicas externas, vínculos, reservaciones ni relaciones de transporte. El SQL está encapsulado en transacción y contempla columnas/restricciones/índice existentes para una repetición controlada; su comportamiento real debe verificarse en el laboratorio pendiente.

**No se ejecutó SQL sobre PostgreSQL, ni siquiera el fixture.** La sintaxis JavaScript y el comportamiento con drivers simulados sí se verificaron; la validación de DDL, FK/CHECK e interbloqueos reales en PostgreSQL sigue pendiente.

## 5. Listado, historial y snapshots

Las consultas de listado y conteo excluyen archivados por defecto. `GET /api/eventos-integracion?archived=true&page=1&limit=25` consulta el historial completo, ordenado por fecha de archivo e ID descendentes. Si no se indica revisión, el historial no aplica el valor predeterminado `pending_review`; así conserva tanto archivos pendientes como aprobados. Admite filtro explícito de revisión, proveedor y demás filtros existentes cuando corresponda.

Se rechaza `archived=true` con `operational_only=true` en HTTP: el historial debe poder consultar todos los snapshots archivados, sin el corte operacional ni reducción al último por booking.

Para los pendientes operacionales FareHarbor, la secuencia es:

1. Seleccionar snapshots según las reglas existentes.
2. Elegir el último por booking, usando recepción/creación e ID.
3. Excluirlo si está archivado.

No se filtran archivos antes del ranking: archivar el más reciente no resucita un snapshot anterior. Se conserva `(provider, external_event_id)` y `ON CONFLICT ... DO NOTHING`. Una reentrega idéntica devuelve el evento existente, con su archivo intacto. Un snapshot distinto recibe su identidad propia y sigue la clasificación, revisión y validaciones actuales; archivar un evento no silencia futuras entregas del booking.

No se modificaron el mapper, webhook, Gmail worker, checkpoint, equivalencias ni estrategia de sincronización.

## 6. Interfaz y ACCESS-SCOPE

El detalle activo ofrece **Archivar evento** cuando es Administrador y el estado lo permite. Antes de confirmar muestra exactamente:

> Este evento dejará de aparecer entre los pendientes activos. Su información permanecerá disponible en el historial. Esta acción no modifica reservaciones ni datos del proveedor.

El formulario solicita motivo y deshabilita la confirmación vacía. Después del éxito cierra el detalle, renueva el listado activo y su contador, e indica dónde consultar el archivo. No recarga ni altera reservaciones para simular una aplicación. Si otro usuario ya archivó/aplicó el evento, muestra el conflicto y actualiza pendientes; no sobrescribe la decisión concurrente.

El selector **Pendientes activos / Archivados** conserva el archivo en un historial paginado. El detalle archivado muestra estado original, fecha de archivo, motivo, nombre actual del responsable e ID estable del usuario. Queda en lectura, sin aplicar, revisar, rechazar, restaurar ni volver a archivar. El motivo se escapa al renderizar; no se interpreta como HTML.

El contador activo sigue correspondiendo a los eventos cargados por las consultas existentes —hasta 50 por cada estado de revisión—, ahora sin archivados. El contador del historial usa el total paginado del backend. Esta fase no convierte el contador activo en un nuevo contador global ni añade notificaciones.

| Perfil | Backend e interfaz |
|---|---|
| Administrador | Consulta activos/historial/detalle y archiva mediante ruta protegida. |
| Consulta all | Consulta los eventos permitidos y su historial; ningún control ni permiso de archivo. |
| Consulta selected | No recibe lista, detalle, contador ni historial de integraciones; GET/HEAD se rechazan en backend y el Dashboard no consulta esos endpoints. |

Se mantiene la lista de rutas ACCESS-SCOPE existente, sin ampliarla para selected. Se conservan sesión, verificación de usuario activo, autorización por rol y respuestas `no-store`. La interfaz invalida solicitudes al cambiar sesión/vista/detalle para evitar presentar respuestas anteriores. Los motivos pueden contener información operativa: son visibles únicamente para quienes ya pueden consultar el evento.

## 7. Pruebas ejecutadas

**Regresión ampliada: 16 suites, 419 pruebas aprobadas y cero fallos.** Incluyó las tres suites nuevas de archivo, eventos/listados/rutas existentes, aplicaciones GYG y FH (alta/modificación/cancelación), sincronización Gmail simulada, persistencia del webhook simulada, ACCESS-SCOPE, frontend/Electron, identidad visual, transportes de PRE-RELEASE-02 y bloqueo de WhatsApp. Después se repitieron las 61 pruebas de las tres suites de archivo al ajustar el aislamiento entre detalles y la respuesta visual a conflictos; esa repetición no se suma como pruebas distintas.

Jest se ejecutó por rutas explícitas, con un solo proceso, sin caché, `APP_CONFIG_PATH=NUL`, host inválido y GYG deshabilitado. `helpers/noPostgres.js` bloqueó conexiones reales de `pg.Pool` y la barrera de red impidió HTTP/fetch externo. Los recorridos Electron usaron servidores en loopback con APIs ficticias. No se inició la API normal contra principal/DEV, ni se ejecutaron `api.test.js` o scripts persistentes.

| Caso solicitado | Evidencia automatizada |
|---|---|
| 1. Archivo correcto | Pendiente y aprobado; motivo normalizado, responsable del servidor, commit. |
| 2. Motivo inválido | Ausente, nulo, vacío/blancos, no texto, más de 500, campos adicionales; límite 500 y Unicode. |
| 3. Inexistente | 404 y transacción revertida. |
| 4. Archivo previo | 409; primer motivo/fecha/responsable conservados, también ante doble archivo concurrente. |
| 5. Aplicado | 409, sin UPDATE de archivo. |
| 6. Archivo/aplicación concurrentes | Servicios reales con pool sintético que serializa bloqueos: ambas órdenes, un solo ganador. Carreras entre lectura HTTP y bloqueo también devuelven 409. |
| 7. Revisión original | Revisión, nota y revisor conservados; rechazo/aprobación de archivado bloqueados. |
| 8. Pendientes | Predicado SQL de exclusión, lista/counter renovados; UI pasó de 2 a 1 tras archivar. |
| 9. Historial | Revisión independiente, total backend y navegación por dos páginas con 27 archivos sintéticos. |
| 10. Deduplicación | Identidad repetida devuelve archivo intacto; una identidad nueva se inserta con las reglas existentes. |
| 11. ACCESS-SCOPE | Administrador, Consulta all/selected, inactivo, anónimo y HEAD; selected no consulta integraciones en UI. |
| 12. Reservaciones internas | Ningún servicio de alta/cambio/cancelación se invoca al archivar ni al rechazar aplicación de archivado; el único UPDATE del archivo es sobre el evento. |
| 13. Snapshots | Ranking previo a exclusión; snapshot viejo no reaparece y uno nuevo distinto puede ser pendiente. |
| 14. Compatibilidad GYG/FH | Seis caminos protegidos; aplicación sin cambios y resolución sin vínculo quedan detrás del bloqueo. Regresión de aplicaciones/sync/webhook conservada. |
| Fallos y despliegue | Rollback/liberación ante error, 40001/40P01 y guardia que rechaza esquema anterior sin ejecutar DDL. |

Las pruebas con bloqueos en memoria no certifican el planificador ni los bloqueos de PostgreSQL real. Esa comprobación está preparada, pero no se presenta como realizada.

## 8. Comprobación persistente preparada, no ejecutada

`scripts/verificarArchivoEventosDesechable.cjs` requiere conjuntamente:

- Argumento explícito `--execute-disposable`.
- `PRERELEASE03_DISPOSABLE_DATABASE_URL`, separado de la configuración de la aplicación; no usa `.env` como respaldo.
- Nombre con formato `pre_release_03_disposable_` seguido por 8–40 caracteres minúsculos o dígitos, validado también contra `current_database()`.
- `PRERELEASE03_CONFIRM=SOLO_BASE_DESECHABLE_PRE_RELEASE_03`.
- Base completamente vacía en `public`, clúster de laboratorio y rol limitado a ese destino. No crea ni elimina bases automáticamente.

El procedimiento futuro crea únicamente un fixture sintético de componente, verifica el rechazo del esquema anterior, aplica/repite 017 en ese destino, comprueba FK/CHECK, archivo/revisión, historial, deduplicación, snapshots, servicios protegidos y conservación de una reserva testigo. Para concurrencia, mantiene un bloqueo desde otra conexión, observa una espera real en `pg_stat_activity`, confirma una aplicación sintética y exige que el archivo relea y se rechace. Las otras órdenes también tienen cobertura simulada; el ensayo integral persistente y de operación completa sigue siendo una etapa posterior.

El script fija `search_path=public`, límites de tiempo y un destino por defecto imposible para los módulos importados; todas las operaciones persistentes reciben explícitamente el pool del laboratorio. No solicita proveedores, no activa workers, no limpia al terminar y conserva el fixture para inspección. Se revisó su sintaxis, **no su ejecución**. Antes de correrlo deben aprobarse por separado el laboratorio, rol, credencial y destino. No es una aceptación del esquema completo del producto ni del instalador.

## 9. Evidencia visual sintética

Se generaron y revisaron siete PNG de Electron, en 1366×900 y 1024×768, sin datos reales. El harness comprobó ausencia de desborde global. `docs/pre-release-03/validacion.json` conserva dimensiones, solicitudes ficticias, preservación de revisión/aplicación y errores finales vacíos.

`docs/pre-release-03/verificacion.json` registra comprobaciones de sintaxis/enlaces, resumen de pruebas y SHA-256 de la migración preparada, marcada como no ejecutada.

| Evidencia | Captura |
|---|---|
| Pendientes antes del archivo | [Activos, contador 2](pre-release-03/pendientes-activos-1366.png) |
| Advertencia y motivo vacío | [Confirmación deshabilitada](pre-release-03/archivo-advertencia-1366.png) |
| Motivo capturado | [Formulario en 1024 px](pre-release-03/archivo-motivo-1024.png) |
| Pendientes tras el archivo | [Activos, contador 1](pre-release-03/pendientes-despues-1024.png) |
| Consulta del historial | [Archivados, total 27](pre-release-03/historial-archivados-1024.png) |
| Auditoría en lectura | [1366 px](pre-release-03/detalle-archivado-1366.png), [1024 px](pre-release-03/detalle-archivado-1024.png) |

La aprobación de estas pantallas permanece pendiente del usuario; no se atribuye una aprobación nueva a PRE-RELEASE-03.

## 10. Riesgos y orden seguro de despliegue

**No iniciar el backend nuevo con el esquema anterior.** Las consultas ahora requieren tres columnas nuevas. Al arrancar normalmente `backend/server.js`, se comprueban esas columnas y ambas restricciones validadas antes de escuchar y de iniciar el worker. Si faltan, el proceso falla sin ejecutar DDL. No se alteraron lanzadores protegidos de laboratorio: no deben utilizarse contra bases sin preparar, ni interpretarse la importación de `app` en un test como verificación de esquema productivo.

Orden propuesto, todavía sin ejecutar:

1. Revisar y aprobar código, SQL y evidencia visual. Mantener los cambios de vehículos aprobados. Esta aprobación no ejecuta ni autoriza por sí sola migración, archivo de filas reales o publicación.
2. Autorizar un laboratorio nuevo y completamente desechable, con cuenta limitada y destino inequívoco. Ejecutar allí la comprobación preparada y completar los casos persistentes/UAT que se acuerden. No usar principal ni DEV como laboratorio.
3. Antes de cualquier intervención en otro destino, obtener autorización específica de base/rol/ventana, respaldo restaurable y plan de recuperación. Detener Electron, backend y procesos anteriores que pudieran escribir o servir código de otra versión. Conservar integraciones sin activar.
4. Con el destino verificado, ejecutar únicamente la migración 017 mediante el responsable autorizado. No aplicar todas las migraciones históricas sobre el esquema consolidado ni ejecutar fixture/seeds de pruebas. Verificar las columnas, FK, CHECK e índice, y que las filas previas continúen sin archivo.
5. Arrancar frontend/backend compatibles y comprobar el guardia de esquema, sesión, perfiles y consultas. Un instalador anterior no incorpora este código; no se construyó ni modificó uno en esta fase. La distribución exige su propia autorización/calificación.
6. Solo entonces permitir que un Administrador utilice conscientemente “Archivar evento” sobre cada caso real que corresponda, con su motivo. No hay SQL de archivo de 124/126 ni procesamiento automático de esos casos.
7. Autorizar por separado commit/push o publicación si procede. Esta fase termina esperando aprobación.

Riesgos restantes: DDL/FK y concurrencia real pendientes de ensayo; compatibilidad de versión al desplegar; privilegios del rol operativo para nuevos campos; motivos con datos sensibles; interpretación temporal conforme a la convención existente. El nombre del responsable procede de su registro actual, mientras el ID queda como referencia estable. No hay restauración de archivo en esta fase.

No se debe volver sin análisis a un backend antiguo que ignore `archived_at`: podría mostrar archivos como pendientes o intentar revisar/aplicar esos eventos. No se propone borrar columnas ni auditoría para revertir. La recuperación debe mantener un código compatible con el estado de archivo, o seguir un procedimiento explícitamente autorizado y ensayado con respaldo.

## 11. Confirmación de restricciones

No hubo conexiones a PostgreSQL principal ni DEV, migraciones ejecutadas, archivo de 124/126, eliminación de reservas, cambios comerciales, credenciales, activaciones, sincronizaciones externas, instalador, commit, push ni cambios de rama. No se sustituyeron rechazo, roles, claves externas o presentación de vehículos.

**Entregable:** `docs/PRE-RELEASE-03.md`, código y migración preparados, siete capturas sintéticas y comprobación persistente pendiente. Se espera aprobación antes de aplicar cambios a PostgreSQL o publicar en GitHub.
