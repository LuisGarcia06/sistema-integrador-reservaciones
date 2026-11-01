# FASE 2D.9B.2B — Auditoría transaccional de Usuarios, roles y plataformas

Fecha: 28 de octubre de 2026. Repositorio: `A:\sistema-integrador-reservaciones`.

Se integró la modificación auditada de Usuarios en un perfil experimental nuevo con PostgreSQL 022. Su única escritura autorizada es **PATCH `/api/usuarios/:id`**. El recorrido final aprobó **58 comprobaciones HTTP/PostgreSQL**, registró **254 solicitudes HTTP**, contrastó **25 auditorías de Usuario** y acreditó **nueve rollbacks técnicos completos**. Jest aprobó **683 pruebas en 18 suites**, incluidas 85 nuevas.

**No hubo cambios de contraseña ni altas de Usuarios mediante la aplicación.** Las cuentas iniciales se aprovisionaron exclusivamente en fixtures privados. El corredor general `CommandApiLab.ps1` no se ejecutó. Las regresiones revisadas de Catálogos 022 y API 021 aprobaron 73 y 44 comprobaciones respectivamente. Los siete clústeres utilizados quedaron detenidos. No se activaron formularios, entrada principal, bootstrap, nuevos mecanismos JWT ni producción.

## 1. Archivos y conservación del estado inicial

Se revisaron `AGENTS.md`, los informes 2D.9A, 2D.9B.1 y 2D.9B.2A, servicios/controladores/validadores de Usuarios, autenticación/permisos, alcance efectivo, transacciones, Bitácora, ledger y contrato 022. Se inventariaron 1,282 archivos previos por SHA-256 y se guardaron copias del estado local de los archivos que se editarían.

Ocho fuentes nuevas:

| Archivo | Responsabilidad |
| --- | --- |
| `backend/userAuditApi.js` | Entrada HTTP privada de modificación de Usuarios |
| `backend/config/userAuditApiPolicy.js` | Perfil, manifiesto, configuración, protocolo y rutas cerradas |
| `scripts/UserAuditApiLab.ps1` | Directorio privado nuevo y ejecución con entorno acotado |
| `scripts/userAuditApiLab.cjs` | Preparación, migraciones verificadas, casos y cierre |
| `scripts/userAuditApiCases.cjs` | Pruebas HTTP/PostgreSQL y comprobación de secretos/credenciales |
| `scripts/userAuditApiServerProbe.cjs` | Instrumentación privada, fallos y guardia contra INSERT de Usuario/UPDATE password |
| `scripts/userAuditFixtures.cjs` | Aprovisionamiento inicial privado de identidades y estados sintéticos |
| `backend/__tests__/userAuditApi.test.js` | 85 pruebas unitarias nuevas |

Nueve fuentes modificadas:

| Archivo | Cambio acotado |
| --- | --- |
| `backend/services/usuarios.service.js` | Diferencia real de asignaciones, motivo, compatibilidad de fotos y auditoría en el mismo cliente; clasificación técnica de fallos inesperados solo en el perfil nuevo |
| `backend/controllers/usuarios.controller.js` | Motivo separado del validador comercial y errores técnicos 500 sin convertirlos en rechazo comercial |
| `backend/services/bitacora.service.js` | Foto pública de Usuario y FK propia `id_usuario_afectado`, solo MODIFICAR |
| `backend/services/comandos.service.js` | Alcance efectivo Admin all y metadatos de plataformas de Usuario exclusivamente en el contrato nuevo |
| `backend/config/revisionApiTransactions.js` | Contexto 022 autenticado limitado a PATCH Usuarios |
| `backend/config/operationalTransactions.js` | Perfil explícito con esquema 022 y candado común |
| `backend/revisionApiApp.js` | Montaje y política del perfil separado |
| `backend/security/revisionApiState.js` | Foto pública compuesta de Usuario/asignaciones para ETag/contexto nuevo |
| `backend/validators/auditoria.validator.js` | Activación explícita del perfil nuevo |

`source-verification.json` acredita **1,273 archivos previos idénticos, nueve modificados y ninguno ausente**. Los originales de los nueve coinciden con sus hashes iniciales y permiten revertir sin perder cambios locales anteriores. Los ocho archivos nuevos también tienen hash registrado. Las entradas iniciales de Git permanecen presentes en `git-preservation.json`.

No se modificaron migraciones 018–022, verificadores estrictos anteriores, validadores comerciales de Usuarios, rutas originales, servicios de autenticación/alcance, funciones de creación/password, frontend, Electron, entrada principal, integraciones ni `package.json`. Se agregan este informe y evidencias en `docs/local-fase-2d9b2b/`. No hubo reset, clean ni restauración masiva.

## 2. Perfil experimental y rutas autorizadas

| Elemento | Contrato nuevo |
| --- | --- |
| Entorno | `user-audit-api-lab` |
| Propósito | `transactional-user-modifications-lab` |
| Esquema / manifiesto | `022` / versión 9 |
| Protocolo | `ctsk-user-audit-api-v1` |
| Archivos privados | `user-api-manifest.json`, `user-api-runtime.env`, `user-preconditions.key`, `user-commands.key` |
| Escritura | PATCH `/api/usuarios/:id` |
| Lecturas | GET/HEAD de `/api/usuarios`, `/api/usuarios/:id`, `/api/usuarios/roles`, `/api/plataformas`, `/api/auth/sesion`, `/api/comandos/:clave` |
| Auxiliares | POST login y POST precondiciones |

Las lecturas conservan la autorización de las rutas originales; declararlas en el perfil no las concede a Consulta. Se bloquean POST Usuarios, PATCH password, DELETE, edición de roles como catálogo, escrituras de Catálogos/Reservaciones/Operaciones/Transportes/Daily/Integraciones, Bitácora HTTP y assets. También se rechazan queries, slash adicional, IDs codificados o métodos fuera del contrato.

El arranque verifica directorio/ACL, manifiesto y configuración propios, generación UUID, claves distintas, fingerprints, identidad de servidor/base/clúster, runtime limitado, esquema base, revisiones 019, ledger 020 extendido y catálogo completo 022 antes de escuchar en `127.0.0.1`. El manifiesto/configuración/claves de aprovisionamiento se conservan por hash. No se reetiqueta un clúster anterior ni se convierte el perfil solo-esquema en servidor.

Los perfiles anteriores no aceptan el manifiesto nuevo y mantienen sus listas de rutas. La entrada nueva no importa `backend/server.js`, no inicia Electron y no usa configuración productiva.

Para repetir únicamente este recorrido:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/UserAuditApiLab.ps1 -Mode Verify
```

Verify siempre prepara otro clúster privado y lo detiene al finalizar; no permite reutilizar un directorio existente.

## 3. Auditoría auténtica de modificaciones de Usuarios

Se utiliza `actualizarUsuarioParcial` original. Nombre, correo, rol, estado y alcance pasan por su validador comercial; password sigue prohibido en el PATCH general. El motivo se separa de los campos comerciales y permanece en el cuerpo confirmado/HMAC.

El servicio lee la fila pública y las asignaciones reales ordenadas, bloquea como corresponde, compara, escribe solo lo necesario, vuelve a leer y llama al escritor existente de Bitácora con el mismo cliente transaccional. La rama nueva exige una foto anterior y recurso Usuarios: no admite CREAR ni CAMBIAR_PASSWORD.

Cada modificación efectiva genera formato 3, acción MODIFICAR, actor autenticado y nombre histórico leídos bajo el límite transaccional, objetivo en `id_usuario_afectado`, origen HUMANO, instante generado por servidor, motivo y generación/clave del comando. Se captura el ID mediante `INSERT ... RETURNING id_bitacora`. Las referencias operativas y de catálogos permanecen NULL.

Las fotos contienen exactamente `nombre`, `correo`, `id_rol`, `estado`, `alcance_plataformas` y `platform_ids`. No se copia `SELECT *`, el body, nombre de rol adicional, password/hash ni tokens. El actor y el afectado se verifican por separado. Se probaron metadatos falsos del cliente y se rechazaron antes de escribir.

## 4. Rol, estado y plataformas

Se verificaron cambios individuales de nombre/correo, promociones/degradaciones, activación/desactivación, Consulta all, selected con plataformas y selected vacío. Una edición combinada de rol/estado/nombre/plataformas produjo una sola auditoría con antes/después obtenidos de PostgreSQL.

Los IDs propuestos conservan la validación original: enteros positivos existentes, sin duplicados y ordenados. Para selected sin IDs nuevos, el perfil conserva las asignaciones ya almacenadas si el modo también era selected. Cambiar explícitamente a all conserva la regla de no admitir IDs seleccionados y elimina las asignaciones como parte de ese cambio solicitado.

Al pasar Administrador a Consulta se sigue exigiendo modo final explícito. Promover Consulta selected a Administrador conserva el modo y las filas almacenados; no se fuerza all ni se inventan asignaciones. No se asignan plataformas nuevas automáticamente.

## 5. Alcance almacenado y efectivo del Administrador

Se reprodujo el problema de 2D.9A: las lecturas existentes de alcance conceden all al Administrador, mientras el ejecutor anterior podía filtrar un recibo por su modo almacenado selected. Una prueba unitaria conserva y demuestra ese rechazo en el camino anterior.

Solo en `user-audit-api-lab`, el ejecutor aplica el alcance efectivo all **después** de releer y exigir rol Administrador activo. Incluye en los metadatos internos del comando los IDs públicos de plataformas anteriores/propuestos/nuevos, sin alterar las asignaciones del actor. Consulta continúa siendo rechazada antes de esa rama. No se cambió el cálculo global de alcance ni se amplió el comportamiento de los perfiles previos.

La prueba real promovió al actor sintético 8, con modo almacenado selected e IDs `[1]`; este consultó todas las plataformas y modificó un Usuario con plataforma 2, cuyo recibo recuperó y repitió. El ledger confirmó alcance de comando `[2]`; el actor conservó selected y sus filas originales. Esa prueba recorre precisamente la diferencia entre acceso efectivo y persistido.

La corrección queda limitada al nuevo contrato. No declara corregidos globalmente todos los ejecutores anteriores para cualquier futura combinación de roles/plataformas.

## 6. Último Administrador y cuenta propia

Se mantienen las comprobaciones originales de autodesactivación, autodegradación y último Administrador, incluido el bloqueo ordenado de las cuentas Administrador activas. No hay ruta de eliminación.

En HTTP real, desactivar o degradar la propia cuenta devuelve 409 sin cambios. Se preparó después un escenario sintético con dos Administradores activos intentando degradarse mutuamente: uno confirmó y el otro recibió 403 tras la revalidación, dejando **uno activo**. Los intentos de desactivar/degradar al superviviente desde su propia sesión volvieron a rechazarse; el número activo permaneció en uno.

La rama comercial específica del mensaje «último Administrador» se comprobó además con un test unitario del servicio. Ese aislamiento no se presenta como una identidad HTTP válida: en HTTP, cuando solo queda un Administrador autorizado, la protección propia y la revalidación de identidad impiden llegar a cero antes de necesitar esa rama aislada.

## 7. No-op sin reemplazo de asignaciones

En el perfil nuevo se compara el conjunto normalizado de plataformas por separado de los campos de Usuario. Si ambos son idénticos, no hay UPDATE, DELETE/INSERT de la tabla puente ni auditoría. El comando se confirma con `ids_bitacora: []`.

Se guardan cuatro pruebas físicas de no-op con `xmin` del Usuario y de cada asignación, junto con contexto idéntico y replay sin efectos. Incluyen un array enviado en otro orden y selected sin IDs nuevos. Una modificación de nombre con el mismo conjunto de plataformas produjo UPDATE y auditoría, sin reemplazar la tabla puente.

Un cambio exclusivo de asignaciones tampoco actualiza la fila Usuario: conserva su xmin, cambia solamente la tabla puente y genera una auditoría. El ETag compuesto del perfil incluye la foto pública y sus IDs de plataformas; un cambio exclusivo de asignaciones invalida la foto con 412. ETag/contexto nuevos no leen la contraseña de Usuario ni envían estados internos al comparador.

Los perfiles anteriores conservan su comportamiento previo; no se modificó silenciosamente el tratamiento global de asignaciones.

## 8. Concurrencia, precondiciones e idempotencia

Se reutilizan UUIDv4 por intención, HMAC del cuerpo/precondiciones, ETag, contexto conservador, candado común y savepoints. El motivo no determina la diferencia comercial, pero sí la identidad confirmada.

Dos Administradores sobre el mismo Usuario produjeron un 200 y un 412, con una auditoría adicional. Cambiar otro Usuario invalidó el contexto y produjo 409. Se probó además 412 por cambio exclusivo de plataformas. Reutilizar una clave con otro motivo/propuesta produjo 409; replay y dos envíos simultáneos de la misma intención conservaron un único resultado/auditoría.

El motor vuelve a consultar estado/rol después de esperar el candado. En dos escenarios se desactivó o degradó al segundo actor mientras esperaba: ambos terminaron en 403, sin Usuario, asignaciones, auditoría ni ledger nuevos. Consulta all/selected/vacío no puede modificar Usuarios ni su propio alcance, obtener precondiciones de escritura o acceder a recibos administrativos.

## 9. Recuperación de comandos

Se destruyó una respuesta después del COMMIT. GET por clave recuperó el resultado confirmado con su ID de auditoría real sin repetir la modificación. Se reinició realmente el backend y persistieron generación, claves, auditoría y recibo; el replay siguió sin ejecutar el escritor.

Una intención desconocida devolvió 404 no concluyente sin reenvío automático. Otro Administrador no obtuvo el recibo ajeno y una cuenta degradada/inactiva dejó de recuperar sus resultados anteriores. Se mantiene el motor y la representación existentes del ledger, sin otra arquitectura, colas o borradores persistentes.

## 10. Atomicidad y fallos SQL

El orden real es BEGIN exterior → candado común → revalidación → precondiciones → lectura/comparación de Usuario y plataformas → escrituras necesarias → auditoría → ledger → restricciones diferidas 022 → COMMIT único → respuesta.

Los BEGIN/COMMIT internos siguen traduciéndose a savepoints. Las **25 auditorías confirmadas** tienen prueba de mismo cliente, PID y transacción principal con negocio/asignaciones/ledger. Se registran operaciones SQL y controles de savepoint, no se confunde xmin de subtransacciones con identidad de la transacción exterior. Ejemplo: auditoría 71, cliente 1, PID 46236, transacción principal 853, UPDATE Usuario → INSERT Bitácora → INSERT ledger.

Se verificaron nueve fallos técnicos: escritura de Usuario, INSERT de asignaciones tras DELETE, SQLSTATE 22012 en ese mismo punto, error después de borrar asignaciones, INSERT de auditoría, error posterior a ese INSERT, ledger, error posterior a ledger y restricción diferida al COMMIT. En todos, las filas/IDs/relaciones y sus SHA-256 antes/después coincidieron; la clave quedó desconocida y no hubo auditoría o comando persistidos.

El caso 22012 detectó una clasificación demasiado amplia de la clase 22 en el manejador heredado. El nuevo servicio marca SQLSTATE inesperados como fallo técnico únicamente en este perfil y el controlador responde 500, de modo que el ledger también se revierte. FK y unicidad conservan sus respuestas comerciales; los rechazos por validación y conflictos mantienen el recibo durable conforme al contrato. No se modificó `dbErrors.js` ni se relajaron restricciones 022.

Ejemplo del caso 22012: SHA-256 antes/después `0c8d7b86b1e1b98f31ae1577d2376bf5189ffc4be58633e958a2f3b7cbb9bb48`, HTTP 500 y Usuario/asignaciones restaurados. Los huecos normales de secuencias PostgreSQL no se prometen revertir.

## 11. Resultados HTTP/PostgreSQL y Jest

| Ejecución final | Resultado | Evidencia en `docs/local-fase-2d9b2b/` |
| --- | --- | --- |
| Nuevo UserAuditApiLab | 58 comprobaciones, 254 solicitudes, 25 auditorías verificadas, nueve rollbacks | `http-verification.json`, `http-final.log`, `http-server.log` |
| Casos SQL 021 originales previos a 022 en el clúster nuevo | 91 | `predecessor021Checks` y log del ensayo |
| Regresión original Catálogos 022 | 73 comprobaciones | `catalog022-regression.json`, `catalog022-final-regression.log` |
| Regresión original API 021 | 44 comprobaciones | `api021-regression.json`, `api021-final-regression.log` |
| Jest final | 683 pruebas, 18 suites, cero fallos; 85 nuevas | `jest-final.json`, `jest-final.log` |

La base final del ensayo de Usuarios conserva tres auditorías históricas, siete operativas y 25 de Usuario. Su ledger tiene 36 confirmados y 34 rechazados; esos totales incluyen la preparación de compatibilidad 021 y no se presentan como 70 modificaciones nuevas.

Jest seleccionó `userAuditApi`, `adminAuditApi`, `adminAuditSchemaLab`, `auditSchemaLab`, `revisionSchemaLab`, `commandApi`, `commandApiPolicy`, `commandApiTransactions`, `revisionApiTransactions`, `auditApi`, `auditFrontend`, `commandFrontend`, `capacidad.service`, `accessScope.routes`, `usuariosAlcance`, `operationalTransactions`, `dailyFrontend` y `printBranding`, con configuración standalone y PostgreSQL bloqueado. Sus modelos/dobles no se confunden con el recorrido HTTP/PostgreSQL real.

### Matriz de las 39 comprobaciones solicitadas

| Punto | Prueba y alcance |
| --- | --- |
| 1. Nombre | UPDATE real, snapshot y recibo |
| 2. Correo | Normalización original, antes/después persistidos |
| 3. Rol | Promoción y degradación auditadas |
| 4. Activación/desactivación | Cambios efectivos, sin eliminación |
| 5. Consulta all | Modo final y asignaciones vacías |
| 6. Consulta selected | Modo final explícito |
| 7. Selected asignado | IDs reales ordenados |
| 8. Selected vacío | Tabla puente vacía, Usuario sin UPDATE innecesario |
| 9. Conjunto idéntico | xmin/fila/contexto intactos, IDs de auditoría vacíos |
| 10. Cambio combinado | Rol/estado/nombre/plataformas, una auditoría |
| 11. Auditoría única | Conteos reales, replay y concurrencia |
| 12. Fotos PostgreSQL | Comparación exacta de seis campos permitidos |
| 13. Responsable/afectado | FK distintas y correctas |
| 14. Motivo | Omisión, NULL, blancos y tipos inválidos rechazados |
| 15. Unicode/HTML | 500 emojis válidos, 501 inválidos, HTML como texto |
| 16. Metadatos falsos | Actor, ID afectado, fotos, instante y secretos rechazados |
| 17. Último Administrador | Carrera real deja uno; guardia específica aislada en Jest |
| 18. Protección propia | Autodesactivación/autodegradación 409 |
| 19. Promoción selected | Conserva modo y asignaciones almacenados |
| 20. Alcance efectivo | Actor selected `[1]` actúa/recupera sobre plataforma 2 como Admin all |
| 21. Dos Administradores | Una modificación y 412 de la foto antigua |
| 22. 409/412 | Contexto ajeno, fila y asignaciones propias |
| 23. Reutilización de clave | Otro motivo/propuesta, 409 |
| 24. Replay | Mismo recibo, sin otra auditoría |
| 25. Respuesta perdida | Socket destruido después de COMMIT, recuperación real |
| 26. Reinicio | Backend reiniciado, recibo y claves conservados |
| 27. Revocación en espera | Inactividad/degradación bajo candado real |
| 28. Consulta | Sin escrituras/precondiciones/recibos; plataformas filtradas |
| 29. Fallo de asignaciones | Después de DELETE, antes de INSERT; rollback de todo |
| 30. INSERT auditoría | Fallo SQL privado, sin efecto parcial |
| 31. Ledger posterior | Fallo antes/después del INSERT, sin auditoría persistida |
| 32. Restricción diferida | Recibo manipulado por probe, COMMIT rechazado por 022 |
| 33. Rollback completo | Nueve hashes iguales y cero filas por clave fallida |
| 34. POST Usuarios | 405 y guardia SQL, cero altas de aplicación |
| 35. PATCH password | 405, guardia SQL y credenciales idénticas |
| 36. Secretos | Escaneo con password/hash/JWT reales del ensayo en memoria; solo booleanos persistidos |
| 37. Compatibilidad | Históricos/2 conservados al ampliar; 022 exacto y auditorías 3; regresiones 021 y Catálogos |
| 38. Bases existentes | Identidades nuevas y sockets propios, sin base principal |
| 39. Cierre | Siete clústeres detenidos, procesos y puertos comprobados |

## 12. Regresiones realmente ejecutadas y omitidas

Antes de ejecutar se inspeccionaron rutas de escritura, fixtures, acceso a datos y preparación de clústeres. `regression-scope-review.json` registra esa revisión. Los corredores originales no se modificaron para ocultar casos.

Se ejecutaron los corredores originales de Catálogos 022 y API 021, que no tienen escrituras HTTP de Usuarios/password, con cuentas iniciales privadas y clústeres nuevos. Los cambios sintéticos de rol/estado/nombre de sus fixtures de autorización se conservaron. Tras la corrección técnica final se repitieron ambos, con sus fuentes finales, aprobando otra vez 73 y 44.

**No se ejecutó `CommandApiLab.ps1` completo:** conserva el caso prohibido de cambio de contraseña. Tampoco se ejecutó el recorrido completo `AdminAuditSchemaLab.ps1`, que incluye altas sintéticas/evento especial fuera de la modificación de Usuarios; el esquema 022 se verificó directamente y mediante contratos y regresiones seleccionadas. No se ejecutaron corredores frontend/Electron/PDF ni la suite global en esta fase. Sus resultados anteriores son antecedentes, no resultados nuevos. Los nombres frontend de suites Jest corresponden a modelos/dobles.

Los intentos preliminares se conservan, sin sumarlos como pruebas únicas: primero se descubrió el tratamiento comercial de 22012; hubo un recorrido aprobado de 57; se añadió la clasificación técnica específica y se volvió a ejecutar desde otro clúster, obteniendo las 58 comprobaciones finales. Todas las bases utilizadas están detenidas.

## 13. Verificación expresa de credenciales y altas

Las cuentas necesarias para autenticar se insertaron únicamente antes de iniciar el servidor mediante fixtures privados, copiando el hash aleatorio sintético del preparador. No se introdujeron cuentas productivas, contraseñas fijas ni bootstrap.

El probe nuevo rechaza cualquier INSERT de Usuario o UPDATE password en un cliente de aplicación antes de delegarlo a PostgreSQL. El recorrido terminó con **cero intentos SQL prohibidos**, recuento de Usuarios idéntico y estado de todas las credenciales iniciales idéntico al comparar en memoria IDs/passwords agregados. No se guarda esa foto ni el hash de credencial en el informe: solo la comprobación booleana.

Se escanearon auditorías, ledger/recibos, respuestas públicas y logs del servidor contra las contraseñas, hashes bcrypt y JWT efectivos del ensayo, mantenidos solo en memoria. Las comprobaciones `passwordsUnchanged`, `secretScanPassed` y `serverLogsSecretScanPassed` son verdaderas. Las llamadas registradas a POST Usuarios/PATCH password fueron 405. `credential-safety.json` resume la evidencia y no registra desviaciones de alcance en esta fase.

## 14. Incidencias y limitaciones

Se reprodujo en una fila histórica **sintética** un estado permitido por las tablas pero incompatible con la foto 022: modo all con asignaciones seleccionadas. La modificación se detiene antes de UPDATE/DELETE, sin normalizar el historial. El no-op permanece sin efectos y otros Usuarios compatibles siguen editables. La evidencia identifica el objetivo, modo e IDs, sin credenciales. No se consultaron datos históricos productivos.

El servicio marca la incompatibilidad con 409; la representación durable conserva el contrato de rechazo comercial existente, sin agregar ahora una interfaz de diagnóstico. Corregir esa fila requiere una decisión posterior explícita, sin relajar el CHECK ni fabricar una foto anterior válida.

La incidencia SQLSTATE 22012 quedó corregida en el contrato experimental y cubierta con HTTP/PostgreSQL y Jest. FK/duplicados siguen siendo rechazos comerciales; SQLSTATE inesperados de escritura son técnicos y revierten también el comando.

No se declaran resueltos la revocación JWT tras password o reactivación, política de contraseña, nuevas sesiones, primer Administrador ni cambios propios de credenciales. No se amplió la corrección de alcance a todos los perfiles anteriores, ni se habilitaron creación o interfaces administrativas.

## 15. Aislamiento y cierre

El ensayo final usó `C:\Users\luisg\AppData\Local\ctsk-standalone-ca871e239ac6`, base `ctsk_standalone_cb59c1644e6b_test`, clúster `7701779871109188176`, generación `5688f836-0ae7-4c45-9dbb-ab0f5775c4ad`, PostgreSQL **127.0.0.1:50204** y HTTP **127.0.0.1:50205**. Las siete conexiones registradas por el backend pertenecen al PostgreSQL propio; las 258 conexiones del coordinador pertenecen exclusivamente a sus dos puertos, incluidas 254 solicitudes HTTP.

Los siete directorios/clústeres y generaciones registrados en `labs.json` son distintos. `closure.json` verifica sus **14 puertos sin listeners y cero procesos asociados**, con todos los postmaster detenidos. Los directorios detenidos se conservan; no se hizo limpieza masiva.

No se accedió a `sian_kaan_reservaciones`, bases existentes, `.env` productivo ni credenciales reales. La conexión de mantenimiento a `postgres` pertenece al clúster recién creado. No se abrieron conexiones LAN, activaron integraciones ni modificaron firewall/ngrok/certificados/router/tareas o servicios Windows, instaladores o entrada principal.

## 16. Reversión selectiva

`reversion-manifest.json` relaciona los nueve archivos modificados con su hash inicial/final y copia inicial, y los ocho nuevos con su hash. Las copias incluyen todo el trabajo local previo; no deben sustituirse por versiones de HEAD.

Si se decide retirar la fase, detener primero únicamente procesos propios; verificar que cada hash actual coincide con el final registrado; restaurar los nueve archivos desde sus copias iniciales y retirar solo los ocho nuevos cuando no existan cambios posteriores. Ante un hash distinto, revisar la diferencia y no sobrescribir. Conservar informe/evidencias, incluidos intentos preliminares. No usar reset/clean ni restauraciones globales.

No se revierte ninguna base existente, se borran auditorías ni se rebaja 022. Los clústeres ya están detenidos. Cualquier nueva prueba debe aprovisionar otro clúster y revisar antes el alcance de su corredor.

## 17. Recomendación para credenciales y formularios

La siguiente etapa debe decidir primero la seguridad de credenciales: política de validación/bytes, revocación durable de JWT, reactivación, cambios propios, protección de cuentas y primer Administrador con origen explícito, sin actor ficticio previo a su creación. Requiere autorización y pruebas específicas antes de habilitar POST Usuarios o PATCH password.

Después podrán adaptarse los formularios originales de Usuarios/Configuración con confirmación humana, motivo, snapshots públicos compuestos, 409/412, UUID por intención y recuperación sin reenvío incierto. Se deberán conservar modo almacenado y alcance efectivo diferenciados, no-op sin reemplazos y bloqueo de historias incompatibles. No utilizar un comparador genérico para valores de contraseña.

Esta entrega termina en modificación backend auditada, contrato experimental, pruebas y evidencias. No inició formularios, creación de Usuarios, cambio de contraseña, bootstrap ni producción.

Evidencias principales: `http-verification.json`, `http-final.log`, `http-server.log`, `catalog022-regression.json`, `api021-regression.json`, `jest-final.json`, `regression-scope-review.json`, `credential-safety.json`, `source-before.json`, `source-verification.json`, `reversion-manifest.json`, `git-preservation.json`, `labs.json` y `closure.json`, dentro de `docs/local-fase-2d9b2b/`.
