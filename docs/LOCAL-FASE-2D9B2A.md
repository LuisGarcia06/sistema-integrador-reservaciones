# FASE 2D.9B.2A — Auditoría transaccional de Catálogos en backend 022

Fecha: 28 de octubre de 2026. Repositorio: `A:\sistema-integrador-reservaciones`.

Los diez escritores backend de los seis Catálogos quedaron integrados en el perfil experimental `admin-audit-api-lab`, con auditoría administrativa formato 3 y ledger durable dentro de una transacción PostgreSQL común. El recorrido nuevo aprobó **73 comprobaciones**, realizó **309 solicitudes HTTP**, produjo **26 auditorías auténticas** y acreditó **20 escenarios de rollback técnico**. Jest aprobó **598 pruebas en 17 suites**, incluidas 90 nuevas. Los diez clústeres utilizados quedaron detenidos.

**Desviación de ejecución:** se lanzó el corredor general original `CommandApiLab.ps1` para la regresión 020 sin excluir su caso heredado de Usuarios/password. Ese caso creó una cuenta sintética y cambió su contraseña dentro de su clúster nuevo; excede la restricción de no cambiar contraseñas de esta fase. Se informó al usuario, se conserva la evidencia en `scope-deviation.json` y el laboratorio está detenido. No afectó cuentas existentes ni producción. No se repitió ese corredor. El ensayo del perfil nuevo 022 comprobó por separado que sus contraseñas sintéticas permanecieron intactas y que las rutas de Usuarios/password están bloqueadas. Por esta desviación no se declara cumplimiento absoluto de todas las restricciones de ejecución.

## 1. Archivos creados, modificados y preservación

Se revisaron `AGENTS.md`, los informes 2D.9A/2D.9B.1, los contratos 019–022, los servicios/controladores/validadores comerciales, el escritor de Bitácora, el motor de comandos, las transacciones y las entradas experimentales anteriores.

Siete archivos de implementación nuevos:

| Archivo | Función |
| --- | --- |
| `backend/adminAuditApi.js` | Entrada HTTP privada y optativa 022 |
| `backend/config/adminAuditApiPolicy.js` | Perfil, manifiesto, configuración, protocolo y rutas cerradas |
| `scripts/AdminAuditApiLab.ps1` | Directorio nuevo privado y proceso con entorno acotado |
| `scripts/adminAuditApiLab.cjs` | Preparación, verificación, pruebas reales y cierre |
| `scripts/adminAuditApiCases.cjs` | Casos HTTP/PostgreSQL de los diez escritores |
| `scripts/adminAuditApiServerProbe.cjs` | Instrumentación privada de SQL, fallos y respuesta perdida |
| `backend/__tests__/adminAuditApi.test.js` | 90 pruebas nuevas de contratos, contexto y escritor |

Se modificaron 17 fuentes existentes:

- `backend/services/{tours,guias,operadores,vehiculos,paises,plataformas}.service.js`: conexión optativa de auditoría y cliente transaccional compartido.
- `backend/controllers/{tours,guias,operadores,vehiculos,paises,plataformas}.controller.js`: validación separada del motivo y tratamiento de errores de auditoría/modificación.
- `backend/services/bitacora.service.js`: rama explícita de formato 3 para Catálogos.
- `backend/validators/auditoria.validator.js`: activación expresa del nuevo perfil.
- `backend/config/revisionApiTransactions.js`: contexto administrativo autenticado y esquema 022 explícito.
- `backend/config/operationalTransactions.js`: uso del candado común exclusivamente con el perfil 022 identificado.
- `backend/revisionApiApp.js`: montaje cerrado de Catálogos para la nueva entrada.

Los 1,234 archivos previos inventariados se comparan en `source-verification.json`: **1,217 idénticos, 17 modificados y ninguno ausente**. Cada fuente modificada tiene copia del estado inicial cuyo SHA-256 coincide con `source-before.json`. `reversion-manifest.json` relaciona originales y resultados. Las 895 entradas de Git presentes al registrar el estado inicial siguen presentes; no hubo reset, clean, restauración masiva ni descarte de archivos sin seguimiento.

No se modificaron migraciones 018–022, verificadores estrictos anteriores, servicios de Usuarios/auth, JWT, formularios, pantalla de Bitácora, Electron, entrada principal, `package.json` ni configuración productiva. Se agregan este informe y evidencias en `docs/local-fase-2d9b2a/`.

## 2. Perfil administrativo nuevo

| Contrato | Valor |
| --- | --- |
| Entorno | `admin-audit-api-lab` |
| Propósito | `transactional-catalog-audit-writers-lab` |
| Esquema | `022` |
| Manifiesto | Versión 8, `admin-api-manifest.json` |
| Configuración | `admin-api-runtime.env` |
| Protocolo | `ctsk-admin-audit-api-v1` |
| Claves privadas propias | `admin-preconditions.key`, `admin-commands.key` |
| HTTP y PostgreSQL | Únicamente `127.0.0.1`, puertos privados del clúster nuevo |

El preparador se reutiliza para construir un clúster nuevo, con generación UUID propia y usuarios/datos sintéticos. Se verifican 020 y 021 antes de aplicar 022, con digests fijos de las migraciones. Los archivos de aprovisionamiento 020, incluidos manifiesto, configuración y claves, se conservan y comparan por hash; no se convierten en el perfil HTTP nuevo. Los manifiestos/configuración administrativos se crean con nombres propios y escritura exclusiva.

Antes de escuchar HTTP, la entrada verifica ACL Windows, fingerprints de código, claves distintas, configuración cerrada, identidad de base/servidor/clúster, rol limitado, esquema base, revisiones 019, ledger 020 extendido y catálogo exacto 022. No convierte `admin-audit-schema-lab` en servidor. Los lectores y entradas anteriores rechazan el manifiesto nuevo; sus contratos siguen exigiendo sus versiones originales.

Para repetir **solo el ensayo nuevo**, desde el repositorio:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/AdminAuditApiLab.ps1 -Mode Verify
```

Verify siempre crea otro directorio/clúster y lo detiene al terminar; no acepta reutilizar un directorio anterior. La instrumentación de fallos solo existe en el probe privado del corredor; `backend/adminAuditApi.js` no ofrece controles de fallo ni endpoints de auditoría.

## 3. Diez escritores implementados

| Recurso | Escrituras habilitadas |
| --- | --- |
| Tours | POST `/api/tours`; PATCH `/api/tours/:id` |
| Guías | POST `/api/guias`; PATCH `/api/guias/:id` |
| Operadores | POST `/api/operadores`; PATCH `/api/operadores/:id` |
| Vehículos | POST `/api/vehiculos`; PATCH `/api/vehiculos/:id` |
| Países | POST `/api/paises` |
| Plataformas | POST `/api/plataformas` |

Las lecturas quedan limitadas a sesión, listas de los seis Catálogos, registro individual de los cuatro editables y recuperación de comandos. Se conserva login y POST de precondiciones. No se inventan GET individuales de Países/Plataformas ni PATCH de esos recursos.

El perfil rechaza escrituras de Usuarios/password, Reservaciones, Operaciones, Transportes, Daily e Integraciones, así como escritura/lectura de Bitácora y assets/frontend. Rechaza rutas con query, slash adicional, parámetros codificados o métodos no declarados. No amplía roles ni permisos de las rutas comerciales originales.

## 4. Auditorías auténticas formato 3

Cada servicio obtiene las filas comerciales anteriores/nuevas mediante sus consultas backend dentro de la transacción. Para altas se inserta el recurso, se lee su resultado real y se registra un CREAR; para PATCH efectivo se lee/bloquea la fila, se compara, se actualiza y se registra un MODIFICAR. Una modificación de varios campos produce un evento.

El contexto transaccional aporta actor autenticado, nombre leído de PostgreSQL bajo el candado, generación y clave. La fecha/hora se genera en servidor con `CURRENT_TIMESTAMP`. El escritor utiliza referencia tipada real del catálogo, origen `HUMANO`, formato 3 y listas cerradas de columnas comerciales. Mantiene `INSERT INTO bitacora ... RETURNING id_bitacora` y entrega ese ID real al registro durable del comando.

No toma actor, fecha, referencia ni snapshots del cliente. Los intentos de enviar esos campos, password o token son rechazados por los validadores originales. Las fotos omiten columnas ajenas aunque la fila interna tenga más propiedades. No se guardan cuerpos HTTP, credenciales ni tokens en Bitácora/recibos.

En las 26 auditorías HTTP confirmadas se contrastaron FK, recurso, actor, nombre histórico, snapshots completos, motivo, instante, generación, clave y el ID exacto del recibo contra PostgreSQL. Renombrar al actor sintético no cambió su nombre histórico; un evento posterior guardó el nombre actualizado leído en backend.

## 5. Motivos, snapshots y no-op

La validación existente de auditoría se activa expresamente para el nuevo perfil y separa `motivo` antes de llamar al validador comercial. El motivo sigue formando parte del cuerpo confirmado y de su HMAC de idempotencia. La comparación comercial utiliza únicamente los campos comerciales normalizados.

CREAR admite motivo omitido o texto humano válido; MODIFICAR efectivo exige motivo. Se rechazan NULL proporcionado, tipos ajenos, vacío, blancos y más de 500 caracteres Unicode después de la normalización heredada. Se probó un motivo válido de 500 emojis y rechazó 501; el HTML se conserva como texto de datos, sin ejecutarse ni mezclarse con descripción comercial. No hay motivos automáticos.

Las fotos son exactamente: Tour `nombre/descripcion/activo`; Guía/Operador `nombre/estado`; Vehículo `identificador/placas/color/capacidad/estado`; País/Plataforma `nombre`. Se contrastan con filas persistidas, sin confiar en propuestas del cliente.

Los cuatro servicios PATCH conservan su comparación previa al UPDATE. Se verificaron cuerpos idénticos con y sin motivo: ningún UPDATE, cambio de `xmin`, revisión/timestamp ni auditoría; el comando queda confirmado con `ids_bitacora: []`. Su replay tampoco altera datos. Se mantiene la validación comercial original de PATCH vacío; no se amplía esa forma de solicitud.

## 6. Atomicidad con ledger

Se reutiliza el motor existente: BEGIN exterior → candado transaccional común → revalidación de identidad/permisos → ETag/contexto → savepoint de intento → servicio comercial → auditoría → ledger → restricciones diferidas 022 → COMMIT único → respuesta.

Los BEGIN/COMMIT de servicios se traducen a savepoints dentro de la transacción exterior. El escritor exige el mismo cliente del contexto autenticado y no puede usar un pool o cliente ajeno. El motor captura únicamente IDs enteros retornados por INSERT de Bitácora y los registra en el ledger. Los fallos de savepoint descartan también los IDs capturados.

El probe registra `pg_backend_pid()` y `pg_current_xact_id()` reales por fase y cliente. Las **26 auditorías confirmadas** acreditan negocio, auditoría y ledger en el mismo cliente/PID/transacción principal, con savepoints balanceados. No se usa igualdad de `xmin` entre filas creadas en subtransacciones como sustituto de esa prueba.

Ejemplo: alta de Tour, auditoría 71, cliente 1, PID 48052, transacción principal 843, fases `business/audit/ledger`, con savepoint del servicio y del comando. La evidencia completa está en `committedTransactionProofs` de `http-verification.json`.

No se cambiaron funciones, triggers, CHECK, FK, índice único ni privilegios del esquema 022. Se conservan generación, actor, clave, estado confirmado, recurso/ID, método/ruta e ID de auditoría del recibo exigidos al COMMIT.

## 7. Comandos confirmados y rechazados

La base final del ensayo nuevo contiene 26 auditorías administrativas, 7 operativas heredadas y 3 históricas. Su ledger contiene **41 comandos confirmados y 28 rechazados**, incluidos los comandos 021 usados al preparar/verificar la compatibilidad; no todos son comandos administrativos nuevos.

Los cambios efectivos llevan un ID real de auditoría; no-op y rechazo durable llevan array vacío. Validación comercial y conflictos 409/412 se conservan como rechazo durable propio, con rollback del intento. Errores técnicos de auditoría/ledger/COMMIT revierten todo y quedan desconocidos al consultar la clave, sin afirmar un rechazo durable falso.

En controladores que traducen errores PostgreSQL se trata primero `auditoriaFallida` como fallo técnico 500, para impedir que un error SQL de Bitácora se convierta en un rechazo comercial confirmado. Los errores de motivo efectivo conservan 400.

## 8. Idempotencia, concurrencia y recuperación

Se probaron replay de los diez escritores, dos peticiones simultáneas de la misma intención, UUID usado para otra propuesta y cambio de motivo con la misma clave. Solo hubo una auditoría por efecto; los usos incompatibles de clave produjeron 409. El HMAC conserva motivo y precondiciones del cuerpo confirmado sin persistirlo íntegramente.

Dos Administradores con fotos anteriores compitieron por el mismo Tour: uno confirmó y el otro recibió 412, con una sola auditoría adicional. Cambiar otro catálogo dejó obsoleto el contexto y produjo 409 sin tocar el recurso propuesto.

Se destruyó la respuesta después del COMMIT y se recuperó el recibo mediante GET, sin reenviar automáticamente el comando. Se reinició realmente el backend y persistieron generación, claves, recibo y replay. Una clave desconocida devolvió 404 no concluyente y no provocó escrituras ni reintentos. El motor y la representación del ledger son los existentes; no hay otra arquitectura de comandos ni borradores persistentes.

## 9. Permisos y revocación

Solo Administrador ejecuta los diez escritores. El motor relee estado/rol después de adquirir el candado, antes de autorizar la escritura y establecer el contexto de auditoría. Se esperó un candado real y, durante esa espera, se desactivó o degradó al segundo Administrador sintético: ambas solicitudes terminaron en 403 sin negocio, auditoría o ledger.

Consulta all conserva las lecturas de catálogos ya autorizadas. Consulta selected conserva listas auxiliares de Tours/Países/Plataformas y no recibe Guías/Operadores/Vehículos ni registros individuales ajenos a sus pantallas. Plataformas se filtra por sus IDs; selected vacío recibe `[]`. Ninguno obtiene precondiciones de escritura, modifica datos ni recupera recibos administrativos.

Otro Administrador recibe 404 al consultar la intención ajena. Los permisos y el alcance se revalidan para recuperación. El nuevo perfil bloquea los dos protocolos anteriores y mantiene la separación propietario/runtime y los grants efectivos 022 verificados antes del arranque.

## 10. Pruebas HTTP/PostgreSQL nuevas

El ensayo final `http-final.log`/`http-verification.json` terminó completo y detenido, sin fallos: **73 comprobaciones, 309 solicitudes HTTP, diez escritores cubiertos, 26 pruebas completas de transacción confirmada y 20 rollbacks técnicos**. También ejecutó 91 casos SQL originales 021 antes de aplicar 022.

| Punto obligatorio | Evidencia y alcance |
| --- | --- |
| 1. Alta Tour | POST real, CREAR, FK/snapshot/ID/ledger contrastados |
| 2. Edición Tour | PATCH multicolumna con motivo y una auditoría |
| 3. Guía | Alta/edición reales y no-op sin escritura |
| 4. Operador | Alta/edición reales y no-op sin escritura |
| 5. Vehículo | Alta/edición reales, tipos/capacidad y no-op |
| 6. País | Alta real; duplicado normalizado 409 |
| 7. Plataforma | Alta real; duplicado 409; asignaciones intactas |
| 8. Un evento por efecto | Recibos, índices y filas reales; PATCH compuesto |
| 9. No-op | Fila y xmin idénticos, IDs vacíos y replay |
| 10. Motivos inválidos | Omitido en modificación, NULL, blanco, tipos y exceso |
| 11. Unicode/HTML | 500 emojis válidos; 501 inválidos; texto HTML persistido |
| 12. Snapshots reales | Comparación exacta antes/después con PostgreSQL |
| 13. FK/recurso | Referencias tipadas correctas y metadatos operativos vacíos |
| 14. Actor/nombre histórico | Lectura autenticada bajo transacción y renombre posterior |
| 15. Comando real | Generación/actor/clave/estado contrastados |
| 16. ID de recibo | Coincidencia exacta con RETURNING y ledger |
| 17. Duplicados | Replay de diez escritores y misma intención concurrente |
| 18. Motivo con igual clave | 409 de intención incompatible, sin efecto adicional |
| 19. Conflictos | 412 de fila; 409 contextual, durables |
| 20. Revocación | Inactividad/degradación mientras espera candado real |
| 21. Consulta | all, selected y selected vacío; lecturas originales/filtrado |
| 22. Reducir capacidad | Vehículo con 7 PAX rechaza capacidad 6 |
| 23. Canceladas | Reserva cancelada de 12 PAX no impide capacidad válida 7 |
| 24. Varias fechas | Dos transportes del mismo vehículo en fechas distintas |
| 25. PAX/niños | Total 7 incluye 3 niños; no se suma dos veces; regresión Daily/operativa |
| 26. Desactivar | Tour/Guía/Operador/Vehículo conservan FK y pasajeros |
| 27. Contexto operativo | Cambia digest del contexto compartido sin cambiar filas operativas; 409 HTTP real |
| 28. INSERT auditoría | Fallo SQL privado real, uno por cada catálogo |
| 29. Ledger posterior | Fallo SQL privado después del negocio/auditoría |
| 30. Restricción diferida | Recibo alterado por probe, COMMIT rechazado por 022 |
| 31. Rollback íntegro | SHA-256 de filas funcionales, Bitácora y ledger idénticos |
| 32. Respuesta perdida | Socket destruido tras COMMIT; GET confirma recibo |
| 33. Reinicio | Backend reiniciado; recuperación/replay sin otro efecto |
| 34. Escrituras ajenas | Usuarios/password, operativas, integraciones y auditoría bloqueadas |
| 35. Formatos | Históricos/2 conservados al migrar; formato 3 real; regresión SQL 022 |
| 36. Esquema estricto | Corredor original 022: 249 comprobaciones nuevas en otro clúster |
| 37. Perfiles 020/021 | Corredores originales: 22/44; con desviación de password sintético en 020 documentada |
| 38. Aislamiento | Clústeres/puertos privados nuevos; ningún acceso a base principal |
| 39. Cierre | Diez clústeres detenidos y 22 puertos propios sin listeners |

La prueba de contexto del perfil nuevo utiliza un catálogo como destino HTTP porque este perfil prohíbe escribir Operaciones. El digest compartido acredita su repercusión operativa; los recorridos operativos reales se comprueban mediante los corredores anteriores separados. No se presenta una escritura operativa 022 que no esté autorizada.

## 11. Jest y regresiones ejecutadas

Todas las ejecuciones siguientes pertenecen a esta fase; los resultados históricos no se reutilizan como si se hubieran vuelto a ejecutar:

| Corredor / pruebas | Resultado | Naturaleza |
| --- | --- | --- |
| Nuevo `AdminAuditApiLab.ps1` | 73 comprobaciones | HTTP + PostgreSQL reales 022 |
| Original `AdminAuditSchemaLab.ps1` | 249 | SQL real 022, otro clúster |
| Original `CommandApiLab.ps1` | 22 | HTTP + PostgreSQL 020; desviación declarada |
| Original `AuditApiLab.ps1` | 44 | HTTP + PostgreSQL 021 |
| Original `OperationalLab.ps1` | 13; invariantes finales sin excesos ni incumplimientos mínimos | Servicios/SQL reales, capacidad y concurrencia |
| Original `AuditFrontendLab.ps1` | 16 | Electron + HTTP + PostgreSQL 021 |
| Original `DailyFrontendLab.ps1` | 16 | Electron + HTTP + PostgreSQL, exportación PDF real |
| Jest final | 598 pruebas / 17 suites, cero fallos | Pruebas unitarias, modelos y dobles; 90 nuevas |

Los corredores anteriores y sus configuraciones no se modificaron. Cada uno aprovisionó otra base sintética. La regresión Daily comprobó grupos de 12 y total 24, niños incluidos, canceladas excluidas del total, PDF real para dos fechas por preload/IPC/manejador originales y revocación durante el diálogo. La impresión física se interceptó: cero trabajos enviados a una impresora.

Jest ejecutó `adminAuditApi`, `adminAuditSchemaLab`, `auditSchemaLab`, `revisionSchemaLab`, `commandApi`, `commandApiPolicy`, `commandApiTransactions`, `revisionApiTransactions`, `auditApi`, `auditFrontend`, `commandFrontend`, `capacidad.service`, `accessScope.routes`, `usuariosAlcance`, `operationalTransactions`, `dailyFrontend` y `printBranding`, mediante la configuración standalone con guardias de red/PostgreSQL. Los detalles están en `jest-final.json` y `jest-final.log`.

No se ejecutó la suite global completa ni recorridos nuevos de interfaces administrativas. No se afirma aceptación productiva, prueba LAN entre equipos ni distribución. Las regresiones frontend/PDF son recorridos operativos anteriores; no son una interfaz administrativa 022.

## 12. Evidencia de rollback

Se inyectaron fallos de auditoría, ledger y restricción diferida para cada uno de los seis Catálogos: 18 casos. Se añadieron errores inmediatamente después de INSERT de auditoría y después de INSERT de ledger en Tour: **20 casos técnicos**. País/Plataforma ensayan alta; los otros cuatro, modificación. Los errores técnicos devuelven 500, dejan la clave desconocida y no conservan negocio, auditoría ni comando.

Cada caso guarda `before/after` SHA-256 del conjunto de filas de las tablas funcionales, Bitácora y ledger. Los hashes coinciden, y las consultas por clave acreditan cero auditorías y cero comandos persistidos. Se comprueban filas/IDs/relaciones; no se promete revertir los huecos normales de secuencias PostgreSQL.

Ejemplo: fallo de INSERT de auditoría en PATCH `/api/tours/2`, hash antes/después `05234478d313cc9e18fa229233ba3a1804ea9e4030a246a8ab5d66c1483e0180`, respuesta 500. Los restantes casos y sus claves están en `rollbackProofs` de `http-verification.json`.

Los intentos iniciales también se conservan. El primero corrigió la instalación temprana de la barrera explícita fetch/UDP; los dos siguientes localizaron el manejo de cierre del observador y una expectativa de casefold Unicode ajena al locale existente. El recorrido aprobado se ejecutó de nuevo desde otro clúster. No se alteraron las restricciones SQL para hacer pasar los servicios ni se sumaron intentos como comprobaciones nuevas únicas.

## 13. Compatibilidad de esquemas y reglas comerciales

Las migraciones y digests de 018–022 permanecen idénticos. El nuevo verificador reutiliza la proyección 020 autorizada por el lector 022 y contrasta el catálogo completo con sus hashes fijos; no modifica lectores anteriores. Los arranques con entradas 020/021, trigger deshabilitado, manifiesto/configuración/claves alterados se rechazan antes de escuchar, y se verifica que el puerto queda libre.

Tours conserva `nombre/descripcion/activo`; Guías y Operadores, nombre/estado y relaciones; Vehículos, límites 1–12 y todas las comprobaciones de reducción con transportes referenciados. No se cambiaron los cálculos de capacidad de Reservaciones/Operaciones/Transportes ni las reglas de mínimo, 12 por transporte y 24 por tour/turno. Las regresiones operativas y Daily las volvieron a comprobar.

País/Plataforma mantienen el índice original `lower(btrim(nombre))`. El clúster del laboratorio utiliza su locale existente: no se amplió esa definición a casefold Unicode completo ni se cambió la política de unicidad. La prueba varía espacios y mayúsculas ASCII manteniendo los caracteres acentuados. Crear una Plataforma conserva exactamente la tabla puente de asignaciones selected.

Desactivar catálogos no elimina relaciones ni impone restricciones de inactividad nuevas. Las pruebas sintéticas incluso mantienen referencias a filas inactivas conforme al comportamiento comercial anterior; no se introdujo un endurecimiento no autorizado.

## 14. Aislamiento y cierre completo

El ensayo final 022 usó `C:\Users\luisg\AppData\Local\ctsk-standalone-ffe31cdb30c0`, base `ctsk_standalone_5f4ef0e06393_test`, identidad `7701764845979195072`, generación `1767fbff-9f45-4c8e-86a6-d6cca572e5c0`, PostgreSQL **127.0.0.1:61965** y HTTP **127.0.0.1:61966**. Las cinco conexiones de backend registradas fueron al puerto PostgreSQL propio. Las 313 conexiones registradas por el coordinador pertenecen exclusivamente a sus dos puertos; incluyen las 309 solicitudes HTTP.

La conexión de mantenimiento a `postgres` pertenece al clúster recién creado para aprovisionar su base sintética. No se accedió a `sian_kaan_reservaciones`, bases existentes, configuración `.env` productiva ni credenciales reales. Los manifiestos prueban diez directorios y diez identidades de clúster distintos. Los ensayos no abrieron LAN ni activaron proveedores externos; la regresión operativa usa únicamente eventos/proveedores ficticios locales.

`labs.json` y `closure.json` acreditan **diez clústeres detenidos, cero procesos asociados identificados y cero listeners en los 22 puertos propios**, incluidos los dos puertos auxiliares de frontend. Los directorios detenidos se conservan para trazabilidad; no se realizó borrado masivo.

No se modificaron ngrok, certificados, firewall, router, tareas Windows, instaladores ni entrada principal. Los cambios de roles/estado de usuarios de prueba pertenecen a los fixtures/casos de revocación; no se modificaron los servicios de Usuarios o auth. La única escritura de contraseña fuera del alcance es el caso heredado 020 descrito al principio y en `scope-deviation.json`.

## 15. Limitaciones y decisiones pendientes

Esta entrega valida seis servicios comerciales reales y diez escritores mediante una entrada experimental; no activa la administración principal ni integra formularios. No integra Usuarios en 022 ni utiliza el evento CAMBIAR_PASSWORD como flujo real.

La autorización concurrente se verifica para inactividad/degradación durante la espera del candado. No se declara resuelta la revocación de JWT tras cambiar credenciales, la protección del último Administrador, las reglas de cambios propios, la política de contraseña, el primer Administrador o una estrategia de sesiones nueva. Esas decisiones de 2D.9A siguen pendientes de autorización separada.

Los textos de motivo son humanos y libres dentro de su contrato; el sistema no puede determinar toda revelación arbitraria escrita por una persona. El writer proyecta exclusivamente campos comerciales y los endpoints rechazan secretos/metadatos ajenos. No hay política nueva de Unicode para unicidad, reglas nuevas de inactividad ni cambios en el esquema de datos.

La ejecución tuvo la desviación declarada del corredor 020. Su resultado técnico aprobado se informa como tal, pero no se presenta como cumplimiento de la prohibición de cambiar contraseñas durante la fase. El perfil administrativo nuevo sí verificó credenciales intactas y rutas de Usuarios/password bloqueadas.

## 16. Reversión selectiva

`reversion-manifest.json` contiene los 17 archivos modificados con SHA-256 inicial/final y ruta de su copia inicial, además de los siete archivos nuevos con su hash. Todas las copias coinciden con el inventario inicial, incluido el trabajo local previo que ya existía en Bitácora y otros archivos sin seguimiento.

Para retirar esta fase: detener únicamente procesos propios si se hubiera iniciado otro ensayo; comprobar hash actual contra el hash final registrado; restaurar cada uno de los 17 archivos desde su copia inicial solo si no tiene cambios posteriores; retirar únicamente los siete archivos nuevos cuyo hash siga coincidiendo. Si un hash cambió, revisar su diferencia y no sobrescribir. Conservar informes, logs y evidencias. No usar reset/clean/restauración global ni restaurar desde HEAD, porque descartaría trabajo previo del usuario.

No se revierte ninguna base existente ni se borra auditoría. Los clústeres desechables ya están detenidos. Para ensayar un perfil anterior se debe crear otro clúster mediante su corredor correspondiente, tras revisar que sus casos estén autorizados. No repetir el corredor general 020 en esta fase sin resolver su caso de password sintético fuera del alcance.

## 17. Recomendación para Usuarios y formularios

Mantener la siguiente integración separada. Usuarios deberá construir una foto pública compuesta de cuenta/rol/alcance/plataformas, evitar reemplazar asignaciones si no cambia el conjunto y producir una sola auditoría por intención efectiva, usando el mismo motor transaccional. Requiere pruebas propias de autorización, último Administrador, cambio de permisos, concurrencia, recuperación y rollback de la tabla puente.

El cambio de contraseña, la revocación de sesiones y el primer Administrador deben aprobarse y diseñarse como una etapa de seguridad antes de habilitar esos flujos. No atribuir un bootstrap a un actor humano inexistente ni reutilizar pruebas sintéticas como cuentas de instalación.

Los formularios deberán integrarse posteriormente sobre Usuarios/Configuración originales, con confirmación humana, motivo, fotos y comparación de conflicto, UUID por intención, recuperación sin reenvío incierto y presentación segura de snapshots. Esta fase no inicia esas interfaces ni la administración de credenciales.

Las evidencias principales están en `docs/local-fase-2d9b2a/`: `http-verification.json`, `http-final.log`, `http-server.log`, `schema022-regression.json`, `api020-regression.json`, `api021-regression.json`, `operational-regression.json`, `frontend021-regression.json`, `daily-pdf-regression.json`, `jest-final.json`, `source-verification.json`, `reversion-manifest.json`, `git-preservation.json`, `labs.json`, `closure.json` y `scope-deviation.json`.
