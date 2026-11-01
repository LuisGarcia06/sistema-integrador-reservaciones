# PRE-RELEASE-04 — Notificaciones internas de reservaciones externas

**Proyecto:** Sistema Integrador de Reservaciones — Community Tours Sian Ka’an.  
**Fecha:** 17 de octubre de 2026, America/Cancun.  
**Rama:** `GYG+FRHB-implementado`. Sin commit ni push.  
**Estado:** implementado y probado con APIs sintéticas; pendiente de aprobación visual y de despliegue autorizado.

## 1. Resultado

Se agregó **Avisos** al encabezado compartido. Funciona al navegar por los módulos autorizados, muestra nuevos sin ver, pendientes totales, proveedor, alta/modificación/cancelación, estado y acceso al detalle actual. Conserva la identidad corporativa y la presentación de vehículos aprobada en PRE-RELEASE-02.

La campana muestra los **sin ver**, mientras el panel muestra por separado el total **pendiente**. Por ejemplo, abrir un evento deja **66 pendientes y 65 sin ver**: no cambia su revisión ni su aplicación. El listado reciente se ordena por ID descendente y permite consultar el resto mediante paginación.

Abrir un evento marca solamente el visto local del usuario. No aprueba, aplica, archiva ni modifica reservaciones. El Administrador conserva las acciones explícitas existentes del detalle; Consulta all conserva lectura. Consulta selected no tiene indicador, cantidades, contenido ni solicitudes de eventos.

El resumen consume eventos ya almacenados. No consulta Gmail/GetYourGuide/FareHarbor ni modifica recepción, deduplicación, aprobación, aplicación o cancelaciones. WhatsApp permanece deshabilitado.

**No hubo conexiones a PostgreSQL durante esta fase, ni al laboratorio anterior. Ninguna base principal, DEV o real fue consultada/modificada. No se aplicó 017 ni otra migración.**

## 2. Archivos modificados

| Archivo | Cambio de esta fase |
|---|---|
| `backend/services/notificacionesIntegracion.service.js` — nuevo | Resumen de lectura con fuente operacional compartida, clasificación temporal existente, conteos completos y proyección mínima. |
| `backend/controllers/eventosIntegracion.controller.js` | Controlador del resumen y error genérico; conserva controladores de archivo/revisión/aplicación. |
| `backend/routes/eventosIntegracion.routes.js` | `GET /resumen` antes de rutas dinámicas, con autenticación y política de lectura existentes. |
| `frontend/js/notificaciones.js` — nuevo | Coordinador global, elección de ventana líder, sondeo, avisos, vistos, panel paginado y navegación. |
| `frontend/css/notificaciones.css` — nuevo | Indicador/panel/aviso con colores corporativos, foco visible, límites de ventana y exclusión de impresión. |
| `frontend/index.html` | Carga JS/CSS y región accesible para avisos discretos. |
| `frontend/js/layout.js` | Espacio compartido en encabezado; vuelve a pintar el indicador al cambiar módulo. |
| `frontend/js/auth.js` | Inicia el coordinador después de establecer sesión y lo limpia al invalidarla. Mantiene reglas y revalidación actuales. |
| `frontend/js/api.js` | Permite cancelar la consulta mediante una señal externa, conservando aborto por sesión y validaciones existentes. |
| `frontend/js/router.js` | Avisa que terminó el render para abrir un evento solicitado. No cambia hashes ni rutas existentes. |
| `frontend/pages/dashboard.js` | Sustituye timer por actualización del coordinador; agrupa consultas idénticas en curso, muestra conteo global disponible, abre detalle fresco y registra visto. Renueva avisos tras acciones explícitas existentes. Muestra errores de consulta sin contenido previo ni acciones. |
| `backend/__tests__/notificacionesIntegracion.service.test.js` — nuevo | Conteos, privacidad, clasificación temporal y fuente SQL, con pool simulado. |
| `backend/__tests__/notificacionesIntegracion.routes.test.js` — nuevo | Ruta estática, autenticación, GET/HEAD, ACCESS-SCOPE, revocación y fallos. |
| `backend/__tests__/notificaciones.frontend.test.js` — nuevo | Reloj/API/Web Locks/BroadcastChannel simulados para ciclo, vistos, concurrencia y sesiones. |
| `backend/__tests__/notificaciones.electron.test.js` — nuevo | Recorrido del frontend real contra API ficticia. |
| `backend/__tests__/helpers/notificacionesUiHarness.cjs` — nuevo | Dos ventanas Electron, perfil temporal, datos ficticios, capturas y comprobaciones. |
| `backend/__tests__/helpers/resumenNotificacionesSintetico.cjs` — nuevo | Respuesta mínima del resumen para simuladores existentes; sin backend, pg ni proveedores. |
| Helpers existentes `transportesUiApi.cjs`, `archivoEventosUiHarness.cjs`, `frontendScopeHarness.cjs`, `brandingScreensHarness.cjs` | Incorporan la respuesta sintética del endpoint nuevo; conservan escenarios y afirmaciones anteriores. |
| `docs/PRE-RELEASE-04.md`, `docs/pre-release-04/` — nuevos | Este informe, nueve PNG y evidencia JSON. |

No se modificaron archivos SQL, instalador, credenciales, dependencias, servicios de integración, reglas de capacidad/vehículos ni permisos. Los cambios pendientes de fases anteriores se conservaron sin commit. Las capturas y documentos previos no se sobrescribieron.

## 3. Contrato del resumen y elegibilidad

Ruta interna: **`GET /api/eventos-integracion/resumen`**, con `Cache-Control: no-store`. HEAD recibe la misma autorización. Solo admite lectura; no dispara sincronizaciones ni cambios de esquema.

Devuelve `datos` con:

- `environment_id`: identificador opaco de 24 caracteres, derivado de base/dirección/puerto PostgreSQL mediante SHA-256. No expone esos valores ni credenciales.
- `generated_at`: instante de clasificación del resumen.
- `counts.pending`, `counts.actionable`, `counts.requires_archive`, `counts.requires_schedule_review`.
- `events`: IDs internos, proveedor, tipo, revisión y categoría de atención. Sin nombres/clientes, teléfonos, importes, identidades externas, payloads o notas de archivo.

Se reutiliza `construirFuenteEventosIntegracion({operational_only:true})`. Conserva el cutoff existente de GYG, la excepción de FH, ranking del último snapshot FH y exclusión de altas FH ya vinculadas. El ranking ocurre **antes** de excluir archivos; archivar el último no revive uno anterior.

Se seleccionan únicamente proveedores GYG/FH, tipos alta/modificación/cancelación, revisión pendiente/aprobada y aplicación `not_applied`. Los archivados quedan excluidos por la fuente compartida; aplicados, descartados y tipos/proveedores no soportados no entran al resumen.

| Categoría | Criterio y presentación |
|---|---|
| Pendientes | Todos los eventos elegibles; requieren acción/revisión administrativa aunque ya se hayan abierto. |
| Detectables como nuevos | IDs mínimos de `events`, comparados con los anunciados/vistos del usuario y ambiente. La novedad individual se calcula localmente; el backend no supone que un evento es nuevo para todos ni guarda vistos. |
| Accionables | Eventos elegibles salvo altas FH con inicio transcurrido o indeterminado. Incluye datos manuales por completar: no equivale a “listo para aplicar”. |
| Requieren archivo | Solo altas FH cuyo inicio ya ocurrió, usando el mismo evaluador temporal de aplicación (`inicio <= ahora`). El panel indica “Actividad iniciada · Requiere archivo”. No archiva automáticamente. |
| Horarios por revisar | Solo altas FH con inicio ausente/no interpretable. No se anuncian como altas registrables. |

Modificaciones/cancelaciones siguen siendo accionables aunque la fecha del servicio sea antigua: pueden necesitar conciliación. No se alteran reglas de aplicación ni se habilitan altas vencidas.

Una consulta SQL obtiene la proyección mínima de **todos** los elegibles; la clasificación usa el evaluador existente en memoria, sin previews ni consultas por fila. No hay LIMIT vinculado al Dashboard ni cast SQL de fechas externas que pueda abortar todo el resumen. El panel de Avisos pagina diez elementos en el navegador; el total siempre procede del conjunto completo. Dashboard puede seguir cargando hasta 50 por estado y distingue ese listado del total global disponible.

El SQL nuevo se verificó por contrato con pool simulado; **no se ejecutó ni se midió su plan sobre PostgreSQL** en esta fase. No se introduce índice/migración adicional. Un volumen extraordinario de pendientes requerirá medir la consulta y tamaño de respuesta en laboratorio autorizado antes de optimizar.

## 4. Arquitectura del sondeo

`App.notificaciones` vive fuera de las páginas. El encabezado se reconstruye al navegar, pero no reinicia el coordinador ni crea otro timer.

1. Tras verificar sesión y alcance, usa **Web Locks** de Chromium para que exista una sola ventana líder por usuario y origen/perfil. Las demás esperan el mismo bloqueo y reciben un resumen mínimo por **BroadcastChannel**. Son APIs incluidas en Electron, sin dependencias o servicios nuevos.
2. La líder consulta la API interna y programa una sola siguiente consulta **60 segundos después de terminar**. Reutiliza la promesa en curso ante solicitudes repetidas. Un límite de 15 segundos cancela una consulta pendiente.
3. Ante errores, conserva el último resumen, informa fallo y última consulta correcta y espera progresivamente **120, 240 y hasta 300 segundos**. Recuperarse restablece 60 segundos. Un error nunca se presenta como cero pendientes.
4. Al ocultarse la ventana, cancela solicitud/timer, libera liderazgo y no hace consultas de avisos. Otra ventana visible puede asumirlo. Al recuperar foco/visibilidad, verifica sesión y solicita actualización o el último resumen de la líder. Si todas están ocultas no hay sondeo de eventos.
5. Cerrar sesión, cambiar usuario o invalidar permisos aborta solicitudes, libera bloqueos, cierra el canal y elimina resumen, panel, aviso y destino de navegación en memoria. Revisiones/generaciones descartan respuestas tardías.
6. Un único aviso agrupado, sin sonido ni datos de clientes, informa eventos nuevos detectados. La región `aria-live` persiste y no repite texto por repintar una página. El aviso dura ocho segundos. Primer acceso: muestra pendientes/sin ver, guarda baseline de anunciados y **no emite ráfaga histórica**.

La revalidación de sesión cada 30 segundos que ya tenía la aplicación permanece intacta; no es otro sondeo de integraciones. Las ventanas seguidoras revalidan sus permisos antes de aceptar un resumen difundido. Usuarios distintos tienen coordinadores y almacenamiento separados.

Dashboard conserva carga inicial, reintentos, filtros/historial y renovación después de una acción. Su antiguo `setInterval` se eliminó: escucha `integracionesactualizadas` únicamente mientras está activo. Consultas de la misma vista/página en curso se agrupan. No se refrescan automáticamente los datos de un formulario de detalle que el usuario esté editando.

## 5. Vistos y prevención de duplicados

Almacenamiento local por origen/perfil, ambiente y usuario:

```text
ctsk.notifications.v1.<environment_id>.<id_usuario>
```

Solo contiene versión, baseline inicial, IDs vistos/anunciados con fechas y un umbral de compactación de avisos. No contiene tokens, contraseñas, nombres de clientes, teléfonos, economía, payloads ni resumen completo. El resumen difundido entre ventanas permanece en memoria.

- **Visto** y **anunciado** son distintos: listar o emitir un aviso no marca visto. Abrir un detalle fresco y pendiente sí; puede continuar pendiente después.
- Los vistos usan IDs individuales y admiten apertura fuera de orden. No se interpreta el mayor ID abierto como “todos leídos”.
- Web Locks serializa la lectura/escritura del estado. El evento `storage` actualiza vistos en las otras ventanas del mismo perfil. Solo la líder emite el aviso: no se duplica en cada ventana ni en cada sondeo.
- Si se abre desde Dashboard antes del primer resumen, se retiene solo el ID en memoria y se incorpora al conocer el ambiente. También se conserva el visto de un evento recién llegado que aún no figuraba en el último resumen. Sesión nueva elimina esa cola.
- Límite: **3000 IDs vistos y 3000 anunciados por usuario/ambiente**, con retención de **180 días** al leer. Los más antiguos pueden perder la marca de visto por compactación/retención; el umbral de anunciados evita reavisar entradas antiguas compactadas. Ese umbral no se usa para declarar vistos. Almacenamiento no disponible: aviso explícito y funcionamiento en memoria para esa sesión.

**Limitación:** no sincroniza vistos entre computadoras o perfiles Windows. Borrar el almacenamiento/perfil elimina este historial; el siguiente acceso vuelve a presentar el resumen inicial sin ráfaga. El identificador de ambiente distingue los destinos actuales; una restauración con reutilización de IDs en el mismo destino deberá contemplar la renovación del historial local en su procedimiento autorizado.

## 6. Navegación y detalle vigente

Seleccionar una fila verifica nuevamente sesión/permisos, conserva únicamente ID y versión de sesión como destino transitorio y navega a Dashboard. El router mantiene sus hashes actuales; al terminar el render solicita abrir ese ID mediante la función existente.

Se ejecuta un **GET nuevo del evento**, y el diff existente si corresponde. No se guarda ni se reutiliza el detalle del aviso. Si ya está archivado/aplicado/descartado, no se muestra información anterior, no se marca visto y aparece el motivo de indisponibilidad. Se renueva el resumen para retirarlo. Un 403/404/fallo de consulta tampoco muestra datos previos ni acciones sobre un evento ausente. Cambios de sesión invalidan respuestas en curso.

El visto se incorpora después de renderizar un detalle pendiente válido. Se lleva el foco al cierre del detalle abierto desde Avisos. Las acciones de aprobación, aplicación y archivo siguen siendo manuales y conservan sus rutas/cuerpos/validaciones; su éxito solo solicita renovar el resumen.

## 7. ACCESS-SCOPE

| Perfil | Backend y frontend |
|---|---|
| Administrador | GET de resumen/eventos autorizado; Avisos y acciones existentes según estado. |
| Consulta all | Resumen, panel y detalle autorizado en lectura; sin aprobar, aplicar ni archivar. |
| Consulta selected | GET/HEAD de resumen rechazados por la política actual antes del servicio. Sin indicador, cantidades, historial o consultas de eventos en frontend. |
| Sin sesión/inactivo | Autenticación y controles existentes; sin resumen accesible. |

No se amplió la lista `LECTURAS_CONSULTA_SELECTED` ni se modificaron roles/permisos de usuarios. El servicio de resumen no reemplaza los controles de autorización. Revalidación de sesión, solicitudes `no-store`, limpieza e invalidación de respuestas anteriores se conservan en todos los caminos.

## 8. Pruebas ejecutadas

**Revalidación completa de la solicitud actual: 21 suites, 455 pruebas aprobadas, cero fallos.** Incluyó los cuatro archivos nuevos de pruebas, eventos/listados/rutas, archivo, seis caminos de aplicación GYG/FH, Gmail/webhook simulados, ACCESS-SCOPE, frontend, diseño corporativo, transportes, capacidad y bloqueo de WhatsApp. Resultado actual en `jest-revalidacion.json`.

Como evidencia histórica de esta misma fase se conservan la primera regresión de 21 suites/454 pruebas y la comprobación posterior de 3 suites/12 pruebas, ambas sin fallos finales. La revalidación completa actual ya incorpora el caso adicional de visto anterior al primer resumen; no se suman repeticiones como casos diferentes.

El segundo adjunto de PRE-RELEASE-04 se contrastó con la implementación existente. No requirió duplicar el coordinador ni cambiar reglas: se agregó al harness la comprobación/captura explícita de una notificación **Visto**, con **66 pendientes y 65 sin ver**, conservando `pending_review/not_applied`. Se actualizaron informe y evidencia. Los once archivos funcionales comprobados por SHA-256 siguen idénticos a la entrega anterior; las evidencias y fuentes del laboratorio previo también se conservan intactas.

Jest utilizó rutas explícitas, `--runInBand --no-cache`, `NODE_ENV=test`, `APP_CONFIG_PATH=NUL`, host imposible, GYG deshabilitado, `helpers/noPostgres.js` y barrera HTTP/fetch externa. Electron usó perfiles temporales y APIs ficticias en loopback. No se ejecutaron `api.test.js`, backend normal, scripts persistentes, SQL, ni preparación/limpieza de bases.

| Caso requerido | Evidencia |
|---|---|
| 1–2. Nueva GYG / FH | API sintética cambiante: aviso por proveedor desde Reservaciones, badge y entrada actualizados. |
| 3. Modificación/cancelación | Ambos proveedores y fechas antiguas siguen accionables; consulta del resumen y paginación de pendientes. |
| 4. Ya visto | Visto separado de pendiente, apertura fuera de orden, persistencia y ventanas compartidas. |
| 5–6. Aplicado / archivado | Excluidos del resumen; cambio entre aviso/clic rechaza detalle y no marca visto. Regresión de archivo conservada. |
| 7. Actividad antigua | Alta FH transcurrida requiere archivo; no se trata como registrable. Inicio exacto y offsets; horario inválido no rompe consulta. |
| 8. Más de 50 | 73 en servicio, 64 iniciales en Electron; sin LIMIT global, panel paginado hasta página 7. |
| 9. Primer inicio | Baseline de 64 históricos, sin aviso emergente ni marcado visto automático. |
| 10. Cambio de módulo | Reservaciones → Dashboard → Reservaciones; coordinador global y detalle vigente. |
| 11–12. Salida/cambio de usuario | Sin indicador/datos anteriores, respuesta tardía descartada y vistos separados. |
| 13. Revocación | Relectura en backend; cambio a selected limpia UI y no solicita eventos. |
| 14–15. Consulta all / selected | All lee sin acciones; selected no ve indicador ni cantidades; GET/HEAD 403 antes del servicio. |
| 16–17. Fallo/recuperación | Rechazos simulados y HTTP 500: conserva último total; backoff 120 s comprobado y recuperación a 60 s. |
| 18. Sin solicitudes simultáneas | Promesa compartida y métrica real del simulador: máximo una solicitud de resumen en curso. |
| 19. Dos ventanas | Perfil/origen compartido, líder único, difusión, vistos y toma de liderazgo al ocultar líder. |
| 20. Abrir detalle | GET fresco, navegación permitida, foco y visto después del render; no cambia aprobación/aplicación. |
| 21. Refrescar/reabrir | No reavisa el mismo ID, baseline/vistos conservados; límites con 3200 históricos comprobados. |
| 22. Dashboard/regresiones | Archivo consciente, historial, contador, mensajes, permisos, transportes y branding aprobados en las suites indicadas. |

Durante la verificación se corrigieron el reposicionamiento del panel al reducir la ventana y la presentación del error sin evento en el diálogo existente. Los simuladores anteriores se ampliaron para responder al contrato nuevo; no se ocultó el endpoint en el producto para que pasaran pruebas. Las incidencias de preparación del harness quedaron resueltas antes del resultado final.

## 9. Capturas sintéticas

Se generaron y revisaron **nueve PNG** del frontend real. Se comprobaron ancho global, límites del panel, roles, foco visible y ausencia de desborde global en **1366×900** y **1024×768**. Las tablas anchas mantienen desplazamiento horizontal existente. Los paneles largos tienen desplazamiento propio y paginación accesible mediante botones.

| Evidencia | Captura |
|---|---|
| Múltiples pendientes fuera de Dashboard | [64 pendientes, 1366×900](pre-release-04/multiples-pendientes-1366.png) |
| Actividad FH iniciada y modificaciones | [Página histórica](pre-release-04/actividad-iniciada-y-conciliacion-1366.png) |
| Notificación GetYourGuide | [Evento nuevo GYG](pre-release-04/nueva-getyourguide-1366.png) |
| Notificación FareHarbor y tamaño menor | [Evento nuevo FH, 1024×768](pre-release-04/nueva-fareharbor-1024.png) |
| Detalle recién consultado | [Apertura desde aviso](pre-release-04/detalle-desde-aviso-1024.png) |
| Notificación vista sin resolver | [66 pendientes y 65 sin ver](pre-release-04/notificacion-vista-1024.png) |
| Consulta all | [Indicador y listado en lectura](pre-release-04/consulta-all-1366.png) |
| Consulta selected | [Sin indicador, 1024×768](pre-release-04/consulta-selected-sin-avisos-1024.png) |
| Sin novedades | [Cero confirmado](pre-release-04/sin-novedades-1366.png) |

`validacion.json` registra escenarios, dimensiones, solicitudes GET ficticias, errores vacíos y concurrencia máxima 1. `jest-revalidacion.json` contiene la regresión completa actual; `jest-results.json` y `jest-final-cambios.json` conservan resultados anteriores separados. `verificacion.json` incluye sintaxis, integridad de 017, conservación del código funcional y huellas de evidencia. Los rótulos existentes del Dashboard forman parte del frontend; **todos los datos de estas capturas son sintéticos**.

## 10. Limitaciones y futuro despliegue

- Los avisos detectan persistencia interna; no demuestran recepción autenticada de Gmail/FareHarbor. No son notificaciones del sistema operativo, correo, sonido ni un servicio en segundo plano con Electron cerrado.
- Dependen de APIs Web Locks/BroadcastChannel presentes en el Electron probado. Si no están disponibles, se informa imposibilidad de coordinación y no se inicia un sondeo paralelo sin control. Con varias ventanas, el aviso discreto se emite en la líder visible; las otras actualizan indicador/listado.
- El estado representa la última consulta correcta, no una suscripción en tiempo real. Los cambios de otras sesiones se incorporan en el siguiente sondeo, foco o actualización. La apertura siempre reconsulta el detalle.
- La política existente de sesión cierra acceso si no puede verificar permisos; una caída que afecte también `/api/auth/sesion` puede exigir iniciar sesión de nuevo. No se debilitó esa protección para conservar un badge.
- El resumen completo es apropiado para el alcance actual; queda pendiente medición de volumen/plan SQL en laboratorio autorizado. No se certificó aquí ejecución de ese SQL ni recepción real.
- Se mantienen los límites/localidad de vistos de sección 5. No se agregó persistencia de vistos al servidor ni sincronización entre computadoras.

Antes de desplegar: aprobación visual de esta entrega y de los archivos que correspondan; autorización separada para destino/rol/respaldo/ventana; migración **017** y versión compatible según PRE-RELEASE-03/LAB; comprobar permisos de lectura del rol de ejecución sobre campos de archivo y vínculos existentes. No iniciar este backend contra principal/DEV con esquema anterior. La guardia de esquema existente sigue activa y no ejecuta DDL automáticamente. No se necesita otra migración para Avisos.

Para acreditar avisos con proveedores reales será necesaria una fase autorizada por proveedor: cuenta/receptor/configuración auténticos, entrega externa trazable, persistencia y correlación con el aviso, reentregas, modificación/cancelación, reinicios y fallos. Un evento sintético o POST manual no sustituye esa evidencia. Esta fase no activa integraciones ni decide su estrategia.

**Sin cambios en bases reales, migraciones, eventos 124/126, credenciales, instalador, reglas de vehículos, permisos, commit o push. Pendiente de aprobación visual; no se publica ni se continúa automáticamente con otra fase.**
