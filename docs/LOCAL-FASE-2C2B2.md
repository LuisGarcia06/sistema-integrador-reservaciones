# Fase 2C.2B.2 — concurrencia optimista en la API de laboratorio

Fecha local: 2026-10-26. Repositorio: `A:\sistema-integrador-reservaciones`.

Se implementó **`revision-api-lab`**, una API HTTP exclusiva de loopback con esquema 019 y precondiciones obligatorias. Rechaza escrituras obsoletas y cambios de contexto antes de ejecutar los servicios. **No se habilitó este contrato en las modalidades anteriores ni en producción.** El frontend no cambió. `revision-schema-lab` conserva íntegra su protección `schema-tests-only`; no se retiraron sus bloqueos de Express o del servidor independiente.

1. **Archivos y conservación del trabajo anterior.** La comparación SHA-256 partió de 696 archivos, incluidos los cambios locales y archivos sin seguimiento. Se modificaron cuatro archivos existentes; 692 conservaron exactamente sus bytes y no se eliminó ninguno. Se agregaron quince archivos de implementación/pruebas y los dos informes de esta fase.

| Archivo existente modificado | Cambio acotado |
|---|---|
| `backend/config/database.js` | Instala el adaptador transaccional únicamente en `revision-api-lab`. La conexión continúa centralizada en `pg`. |
| `backend/config/operationalTransactions.js` | Reconoce el perfil nuevo solo con esquema 019 y conserva los requisitos de clúster desechable. |
| `scripts/standaloneDev.cjs` | Aprovisiona explícitamente el perfil API en un clúster vacío nuevo y crea su clave privada de precondiciones. |
| `scripts/revisionFixtures.cjs` | Verifica el contrato de destino correspondiente antes de aplicar la migración existente 019. |

| Archivo nuevo | Responsabilidad |
|---|---|
| `backend/config/revisionApiPolicy.js` | Manifiesto, configuración, clave, ACL, integridad e identidad efectiva. |
| `backend/config/revisionApiTransactions.js` | Una conexión y transacción para precondiciones, servicios y bitácora; savepoints internos. |
| `backend/security/revisionTokens.js` | Canonicalización y validadores fuertes autenticados y opacos. |
| `backend/security/revisionApiContract.js` | Lista explícita de los 25 escritores y rechazo de rutas no revisadas. |
| `backend/security/revisionApiState.js` | Estado de filas y contexto operativo bajo candado. |
| `backend/revisionApiApp.js` | Contrato HTTP separado, consulta de precondiciones y despacho a rutas existentes. |
| `backend/revisionApi.js` | Entrada Node independiente; verifica antes de escuchar. |
| `scripts/RevisionApiLab.ps1` | Directorio nuevo privado y ejecución del laboratorio con entorno limpio. |
| `scripts/revisionApiLab.cjs` | Orquestación, aislamiento, reinicio y cierre. |
| `scripts/revisionApiFixtures.cjs` | Usuarios, catálogos, reservaciones y eventos exclusivamente sintéticos. |
| `scripts/revisionApiCases.cjs` | Ensayos HTTP reales y matriz de escritores. |
| `scripts/revisionApiServerProbe.cjs` | Proceso de pruebas que provoca un fallo sintético de bitácora; la entrada normal no instala ese fallo. |
| `backend/__tests__/revisionApi.test.js` | Contratos de ETag, contexto y escritores. |
| `backend/__tests__/revisionApiTransactions.test.js` | Límites transaccionales, savepoints, callbacks y bloqueo de escrituras prematuras. |
| `backend/__tests__/revisionApiPolicy.test.js` | Separación de perfiles y rechazo temprano de destinos inseguros. |
| `docs/LOCAL-FASE-2C2B2.md` y `docs/local-fase-2c2b2-verification.json` | Informe y evidencia reproducible. |

No cambiaron `database/schema.sql`, la migración 019, los triggers, los verificadores previos de esquema e identidad, `backend/server.js`, `backend/standalone.js`, servicios de negocio, controladores, rutas heredadas, frontend, Electron, integraciones ni dependencias. Los hashes de los cuatro archivos modificados y el alcance comparado se conservan en el JSON adjunto.

2. **Perfil API y controles de arranque.** Su manifiesto tiene versión 3, entorno `revision-api-lab`, propósito `http-preconditions-lab`, protocolo `ctsk-revision-api-v1`, UUID de generación y digest de `preconditions.key`. La configuración privada exige esquema real 019, credenciales aleatorias nuevas, base sintética `ctsk_standalone_<12hex>_test`, clúster distinto del principal, PostgreSQL 18.3 y sincronización deshabilitada. No hay fallback a 017 ni aceptación de una configuración productiva.

Cada Verify crea otro directorio privado y clúster vacío, mediante el aprovisionador existente. Conserva las verificaciones de directorio, PID, puerto, identidad PostgreSQL, propietario y rol limitado; ejecuta los verificadores base, 018 y 019 con sus comprobaciones de triggers y permisos. Valida ACL, código, configuración y clave antes de iniciar el listener. Escucha exclusivamente en `127.0.0.1` y comprueba el Host esperado. El proceso servidor bloquea salidas de red salvo su PostgreSQL loopback; no inicia workers ni receptores. No monta frontend, webhooks ni controles de integraciones.

La clave de precondiciones es nueva y permanece en el servidor, bajo las ACL del laboratorio y un digest en el manifiesto. No se entrega al cliente ni se reutiliza `service.key`, claves de identidad, secretos de PostgreSQL o credenciales de integraciones. Los perfiles anteriores no aceptan este manifiesto. Las entradas antiguas continúan rechazando 019; la única entrada operativa nueva es la API con precondiciones.

3. **ETag, consulta original y contrato HTTP.** Las etiquetas usan HMAC-SHA-256 con separación de dominios, hashes opacos y firma autenticada. Incluyen generación, tipo/identificador, usuario/rol, estado primario y representación autorizada. Las revisiones permanecen como cadenas decimales; el estado JSON de PostgreSQL se conserva como texto para no redondear BIGINT o timestamps. La respuesta se serializa con un orden canónico estable. Las etiquetas incluyen comillas y nunca son débiles.

Los GET de detalle numérico emiten `ETag` y metadato `revision`; las colecciones no emiten etiquetas utilizables para escribir. Para obtener de forma atómica representación, ETag y contexto de una acción, el administrador utiliza la consulta **sin escrituras**:

```http
POST /api/precondiciones
Authorization: Bearer <JWT del laboratorio>
X-CTSK-Protocol: ctsk-revision-api-v1
Content-Type: application/json

{"metodo":"PATCH","ruta":"/api/reservaciones/1","datos":{}}
```

Devuelve `datos` con la vista autorizada original, `revision` como string, `etag`, `contexto`, `metodo` y `ruta`. Para registros existentes puede consultarse antes de conocer los valores finales del formulario: la foto original se conserva mientras se editan. El contexto está ligado al usuario, recurso, método y ruta; incluye todas las dependencias posibles del laboratorio, incluso destinos aún no seleccionados. No es necesario refrescarlo automáticamente al guardar.

El cliente envía después el cuerpo editado y las cadenas originales completas:

```http
PATCH /api/reservaciones/1
Authorization: Bearer <JWT del laboratorio>
X-CTSK-Protocol: ctsk-revision-api-v1
If-Match: "r1-<etiqueta original completa>"
If-Operational-Match: "c1-<contexto original completo>"
Content-Type: application/json

{"habitacion":"Valor sintético editado"}
```

Las cadenas abreviadas del ejemplo son ilustrativas; deben utilizarse exactamente las devueltas por el servidor. Para altas, la consulta utiliza el POST de destino y el cuerpo completo: su etiqueta es específica de ese intento de creación, no una etiqueta de colección. Daily utiliza su fecha en la ruta con query, por ejemplo `/api/daily/observaciones?fecha=2098-02-02`. No se aceptan comodines, ETag débiles, listas, firmas falsas ni etiquetas de otro recurso/usuario.

| HTTP | Código o significado |
|---|---|
| 200 | Escritura válida y confirmada: se envía únicamente después de COMMIT. Incluye altas y aplicaciones manuales en este perfil. |
| 412 | `PRECONDICION_OBSOLETA`: cambió el estado primario/revisión. |
| 428 | `PRECONDICION_REQUERIDA`: falta If-Match o el contexto obligatorio. |
| 400 | `PRECONDICION_INVALIDA`: formato, firma o ámbito no admitido. |
| 409 | `CONTEXTO_OPERATIVO_CAMBIO`: cambió una dependencia o representación derivada. |
| 400 | `CLIENTE_INCOMPATIBLE`: protocolo no admitido. |
| Otros errores | Se conservan validaciones de negocio, autenticación, autorización y conflictos acotados de bloqueo. |

Los errores de precondición se expresan en `codigo`. Si cambian registro y contexto, se comprueba primero el registro. Las respuestas históricas, incluidos sus 201, conservan su comportamiento fuera del perfil nuevo. No hay reintento automático, refresco de token con reenvío ni bypass para el frontend anterior.

4. **Escritores protegidos y transacción.** La cobertura del arranque compara las rutas mutadoras montadas con una lista explícita. Un escritor adicional sin contrato impide construir la aplicación; una petición desconocida no se reenvía a una API permisiva. Login y consulta de precondiciones son excepciones de lectura, no escrituras operativas.

| Recurso | Rutas mutadoras protegidas |
|---|---|
| Reservaciones | POST raíz; PATCH id, id/cancelar e id/transporte. |
| Operaciones y transportes | POST raíz y PATCH id en cada recurso. |
| Vehículos, guías, operadores y tours | POST raíz y PATCH id en cada recurso. |
| Usuarios | POST raíz; PATCH id e id/password. |
| Países y plataformas | POST raíz en cada recurso. |
| Daily | PUT observaciones por fecha. |
| Eventos externos | PATCH id/revision, PATCH id/archivo y POST id/aplicar. |

Son 25 rutas. Cada comando adquiere primero el candado asesor transaccional de Fase 2C.1. Después consulta el estado autorizado y dependencias, compara ambas precondiciones, habilita escrituras y ejecuta el controlador/servicio existente. El mismo cliente PostgreSQL contiene cambios y bitácora. Los BEGIN/COMMIT internos se convierten en savepoints; ningún COMMIT interno confirma prematuramente la operación HTTP. Un error del servicio o respuesta de negocio negativa revierte la transacción exterior.

El pool dirige las llamadas de servicios y helpers a ese cliente mediante AsyncLocalStorage. Fuera del contexto, entrega transacciones PostgreSQL READ ONLY. Antes de validar las precondiciones, el adaptador no habilita DML; un cliente retenido no puede seguir escribiendo una vez terminada la transacción. Rechaza lotes SQL, formas alternativas de COMMIT/BEGIN y comandos no revisados; los servicios utilizan sentencias parametrizadas simples. No se deja una transacción abierta mientras un usuario edita. Las lecturas y fotos de contexto también son cortas y coordinadas con el candado.

5. **Contexto operativo y decisiones humanas.** El contexto es deliberadamente conservador: incluye todas las tablas de negocio del esquema verificado excepto bitácora, con orden estable y sin enviar su contenido al cliente. Detecta pasajeros, capacidad, vehículos, operaciones y transportes de origen/destino, grupos vacíos, membresías, fechas/tours/turnos, cancelaciones, vínculos, equivalencias y estados de eventos. También detecta cambios de permisos y catálogos. Se reevalúa bajo el candado antes de escribir.

Las tres tablas versionadas usan sus revisiones 019. En las tablas sin revisión se añade internamente `xmin` como parte del estado opaco, junto con el contenido, para detectar A → B → A dentro del clúster desechable. No se publica ese identificador ni se agrega una columna o tabla. Este apoyo MVCC está limitado al laboratorio: antes de una promoción deben revisarse restauración, mantenimiento, congelamiento y ciclo de transacciones, y decidir si esas entidades requieren versiones durables autorizadas. Una reconstrucción/restore nunca debe reutilizar una generación de datos anterior. En esta fase no se habilitan restauraciones del perfil API.

La estrategia global puede generar 409 ante cambios no relacionados y su coste crece con los datos. Se eligió para cubrir dependencias y apariciones/desapariciones sin omitir grupos vacíos; no constituye una optimización productiva. Las invariantes comerciales siguen en los servicios: 12 PAX o menor capacidad real, 24 por fecha/tour/turno en el alcance ya implementado y mínimo de pasajeros al asignar vehículo. No se ampliaron esas reglas.

Las aplicaciones manuales de FareHarbor/GetYourGuide utilizan sus servicios existentes a través del mismo pool. Estado del evento, reservación vinculada y dependencias quedan ligados a la consulta original. Se conservan aprobación, estado y huellas de FareHarbor. GYG recibe sus datos en `completar`, según el contrato previo. La protección rodea el despacho completo, incluidas altas/modificaciones/cancelaciones y helpers; no modifica capturadores, sincronizadores ni tareas. Las pruebas reales de esta fase ejercitan cancelaciones sintéticas de ambos proveedores; las otras variantes conservan sus regresiones aisladas y el mismo límite transaccional.

6. **Pruebas y ejecución.** Los conteos siguientes corresponden a grupos finales, sin sumar reejecuciones ni aserciones individuales.

| Grupo | Resultado |
|---|---|
| 21 suites Jest aisladas | 638 aprobadas, 0 fallidas. |
| API 019 con PostgreSQL y HTTP reales | 28 comprobaciones aprobadas, 0 fallidas; incluye matriz de las 25 rutas. |
| Regresión schema-tests-only 019 | 44 comprobaciones y 13 escenarios operativos aprobados. |
| Regresión operativa anterior 017/018 | 13 escenarios aprobados. |
| independent-dev con Electron/PostgreSQL reales | 6 comprobaciones aprobadas. |
| https-lab con Electron/PostgreSQL reales | 13 comprobaciones aprobadas, incluido Daily PDF, roles, Web Locks y Centro de Avisos. |
| Componentes LAN | Aprobados sin listener LAN ni PostgreSQL. Conexión física: no ejecutada. |

La evidencia API final está en `%LOCALAPPDATA%\ctsk-standalone-4fe6f1fe8c2f\revision-api-verification.json`. El JSON adjunto consolida resultados, rutas, suites, historial y cierre sin secretos. Los casos verifican dos administradores, mismo/diferente campo, no-op vigente/obsoleto, ABA, cancelaciones, asignaciones simultáneas, BIGINT mayor de 2^53, permisos por plataforma, contexto cambiado y decisiones externas obsoletas. Cada rechazo compara todas las tablas, incluida bitácora, para comprobar que no deja cambios.

Una barrera real mantiene el candado desde otra conexión, cambia una dependencia y confirma que el comando HTTP espera antes de verificarla: termina en 409. Otro ensayo descarta la respuesta después del COMMIT y reconcilia por GET y una sola entrada de auditoría, sin reenviar. Se provoca además un fallo de bitácora en el proceso de prueba para demostrar rollback de datos y revisión. La entrada CLI normal, sin ese fallo inyectado, se reinicia y conserva generación, clave, JWT, ETag y precondiciones de un no-op.

Desde PowerShell, en la raíz del repositorio:

```powershell
powershell.exe -NoProfile -NonInteractive -File .\scripts\RevisionApiLab.ps1 -Mode Verify
```

Verify siempre crea una base y clúster nuevos, prueba el servidor y los detiene al finalizar. No admite reutilizar un directorio existente. La entrada Node que utiliza el orquestador es `backend/revisionApi.js --manifest <manifiesto-API-privado>`; exige que el clúster de laboratorio correspondiente esté activo y verificado. No inicia PostgreSQL ni crea migraciones automáticamente. No se agregó un modo Electron.

Si se interrumpe forzosamente el ensayo, cerrar primero su proceso Node propio y detener únicamente su PostgreSQL identificado:

```powershell
.\scripts\RevisionApiLab.ps1 -Mode Stop -Directory 'C:\Users\luisg\AppData\Local\ctsk-standalone-<identificador-del-ensayo>'
```

Stop actúa solo sobre PostgreSQL de ese directorio, no sobre procesos Node ajenos. Exige configuración/código coincidentes. No cambiar hashes para saltarse verificaciones. Las suites aisladas finales pueden repetirse usando la lista de `automated.suites` del JSON y `standalone.jest.config.cjs`; no se ejecutó `npm test` global ni suites que puedan alcanzar una base real.

7. **Aislamiento y cierre.** Se crearon quince clústeres PostgreSQL nuevos durante desarrollo y regresiones, más un directorio de componentes sin base. Los dieciséis directorios quedaron sin PID activo; sus 30 puertos registrados quedaron sin listeners y no quedaron procesos Node/Electron/PostgreSQL identificables con esos directorios o sus clientes de componentes. Las evidencias se conservaron apagadas.

No se abrió conexión a `sian_kaan_reservaciones`, no se utilizaron datos o credenciales reales y no se aplicaron cambios a un esquema existente. No se modificaron frontend, instalación, integraciones reales, certificados existentes, confianza global, ngrok, firewall, red operativa, router, servicios ni tareas Windows. Los certificados generados por la regresión HTTPS son nuevos y exclusivos de su laboratorio. No se instalaron dependencias ni generaron instaladores. Esta confirmación se basa en destinos y acciones verificados; no se consultó producción para comparar sus datos.

8. **Problemas y límites.** Cuatro iteraciones detectaron problemas en el cliente sintético: Content-Length en DELETE, PATCH en una ruta POST, motivo GYG fuera de `completar` y un estado inicial de alta distinto de Pendiente. Se corrigieron únicamente los ensayos; no se relajaron validadores o reglas comerciales. La normalización de éxito a 200 pertenece exclusivamente al contrato nuevo y se verificó en la ejecución final. No hay fallos pendientes en los grupos ejecutados.

No se probaron dos equipos físicos, rendimiento con datos grandes, mantenimiento/restore de largo plazo ni aplicación empresarial. El laboratorio supone que los escritores autorizados usan el pool y protocolo comunes; un administrador PostgreSQL fuera de la aplicación sigue siendo una autoridad distinta. El contexto global y su apoyo MVCC requieren revisión antes de promoverse. Las modalidades anteriores siguen disponibles con sus contratos anteriores: **no adquirieron estas precondiciones por esta tarea**. La fase no implementa interfaz de conflictos, recuperación de borradores ni idempotencia persistente.

9. **Reversión.** Todos los clústeres del ensayo ya están apagados. Si se decide descartar la fase, conservar sus evidencias y retirar únicamente sus directorios de laboratorio después de comprobar cada ruta. No ejecutar una migración inversa, DROP COLUMN, TRUNCATE o cambios de permisos contra otra base.

Para revertir código, retirar solo los bloques nuevos de los cuatro archivos modificados: instalación del adaptador en `database.js`, reconocimiento de `revision-api-lab` en la guardia, ramas del perfil/clave en el aprovisionador y selección de política en los fixtures. Retirar después los diecisiete archivos nuevos de esta etapa si corresponde. Conservar los bloques de Fase 2C.1 y schema-tests-only. El JSON registra hashes iniciales/finales y alcance. No usar reset, clean o restauración completa de archivos: contienen cambios locales previos.

10. **Recomendaciones para Fase 2C.2B.3.** Revisar este contrato antes de modificar la interfaz. La futura pantalla deberá conservar representación original, ETag y contexto al abrir la edición; mantener el borrador en memoria ante 412/409; mostrar original, propuesta y estado actual; y exigir una decisión explícita antes de obtener una nueva foto y guardar. Un 428/400 indica contrato incompatible, no permiso para omitirlo. Ante respuesta incierta, consultar estado y bitácora sin repetir automáticamente el comando.

Antes de LAN/empresa deben revisarse el alcance y coste del contexto, el versionado durable de entidades auxiliares, la renovación de generación al restaurar, el cliente HTTPS autorizado y todas las variantes de decisiones externas. El esquema 019 y el contrato nuevo deben seguir separados del frontend y perfiles anteriores hasta aprobar su integración. Borradores e idempotencia permanecen como etapas posteriores. No se avanzó a esa interfaz ni a despliegue.
