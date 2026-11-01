# FASE 2D.9B.1 — Esquema de auditoría administrativa 022

Fecha: 28 de octubre de 2026. Repositorio: `A:\sistema-integrador-reservaciones`.

La migración 022 y su contrato de persistencia quedaron implementados y validados exclusivamente en PostgreSQL sintético desechable. Se amplía la Bitácora existente con formato administrativo 3, conservando los formatos histórico y operativo 2. El recorrido final aprobó 249 comprobaciones PostgreSQL; la regresión independiente 021 aprobó 94; Jest aprobó 329 pruebas en 10 suites. Los siete laboratorios utilizados quedaron detenidos.

Esta fase no integra servicios administrativos, escritores HTTP, formularios, autenticación, JWT, cambio de contraseña ni bootstrap. No inicia HTTP ni Electron y no activa producción. Las pruebas SQL acreditan el contrato de persistencia y la atomicidad sintética; no constituyen validación de servicios administrativos reales.

## 1. Archivos creados y conservación del trabajo previo

Se leyeron las instrucciones de `AGENTS.md`, el diseño 2D.9A, el esquema base, las migraciones 018–021 y sus verificadores, las tablas comerciales y la separación de privilegios del laboratorio.

Los ocho archivos de implementación son nuevos:

| Archivo | Responsabilidad |
| --- | --- |
| `database/migrations/022_auditoria_administrativa_lab.sql` | Referencias, formatos, snapshots, vínculos diferidos y grants de 022 |
| `backend/config/adminAuditSchemaContract.js` | Identidad del perfil y digests fijos revisados |
| `backend/config/adminAuditSchema.js` | Inspección y verificación estricta de catálogo y ledger extendido |
| `backend/config/adminAuditSchemaPolicy.js` | Manifiesto propio, configuración, identidad, ACL y preflight de esquema |
| `scripts/AdminAuditSchemaLab.ps1` | Directorio privado nuevo y ejecución con entorno Windows acotado |
| `scripts/adminAuditSchemaLab.cjs` | Aprovisionamiento sintético, migraciones ordenadas, pruebas y cierre |
| `scripts/adminAuditSchemaCases.cjs` | Casos SQL reales, privilegios, manipulación de contrato y rollback |
| `backend/__tests__/adminAuditSchemaLab.test.js` | 65 pruebas unitarias del contrato y su aislamiento |

No se modificó ningún archivo preexistente. `source-before.json` y `source-verification.json` registran y comparan por SHA-256 **1,211 archivos previos**, incluidos fuentes, documentación y evidencias anteriores: cero distintos y cero ausentes. `git-preservation.json` confirma que las 871 entradas locales previas de Git siguen presentes. Las migraciones 018, 019, 020 y 021, sus verificadores y el trabajo local previo permanecen intactos. Se agregan este informe y las evidencias de `docs/local-fase-2d9b1/`; no se utilizó reset, clean ni restauración masiva.

## 2. Migración 022 y contrato fijo

La migración solo se ejecuta mediante el corredor de laboratorio sobre un clúster nuevo cuya identidad y esquema 021 ya se verificaron. Su guardia SQL exige propietario `ctsk_standalone_owner` y nombre sintético de base `ctsk_standalone_<12 hex>_test`; la comprobación de identidad efectiva del clúster corresponde al corredor, no al nombre por sí solo. La aplicación de 022 se realiza en una transacción.

No crea otra tabla de auditoría. Añade siete columnas a `public.bitacora`, sustituye controladamente el CHECK de formato y el despacho del trigger 021 dentro de esta nueva base, incorpora un índice único parcial y agrega tres funciones y dos triggers administrativos. Las estructuras comerciales y las columnas, PK y guardia inmutable del ledger 020 se conservan.

Digests SHA-256 fijados en `adminAuditSchemaContract.js`, contrastados con el catálogo PostgreSQL revisado:

| Objeto | SHA-256 |
| --- | --- |
| Migración 022 | `c5728dbe67786dfd2d15bbd460ed4bbcc3630d7ad8d8ce1b72398474a1ea8ef0` |
| Catálogo completo 022 | `f23b119d043c5dd4be8c745842e0b10afd63080bca52d260a2ca5a00dc521904` |
| Definiciones de funciones 021/022 | `a1332d73ffb8d0aae35f730b25a482fe956ea908e0488c8756b7afe21c5cb270` |

El verificador no aprende ni acepta automáticamente el hash que encuentre. `catalog-reviewed.json` conserva el catálogo revisado; `catalog-final.json` acredita el mismo contrato en otra ejecución nueva.

## 3. Estructura administrativa final

Bitácora pasa de 18 a **25 columnas**. Las siete nuevas son enteros nullable, con FK reales y sin borrado en cascada:

| Referencia nueva | Destino |
| --- | --- |
| `id_usuario_afectado` | `usuarios(id_usuario)` |
| `id_tour` | `tours(id_tour)` |
| `id_guia` | `guias(id_guia)` |
| `id_operador` | `operadores(id_operador)` |
| `id_vehiculo` | `vehiculos(id_vehiculo)` |
| `id_pais` | `paises(id_pais)` |
| `id_plataforma` | `plataformas(id_plataforma)` |

El actor sigue siendo `id_usuario`, con su FK anterior y nombre histórico en `usuario_nombre_snapshot`. El usuario afectado tiene su propia columna: no se utiliza la identidad del actor como sustituto del objetivo. El caso de contraseña acredita actor 1 y objetivo 3. Son identidades separadas; el esquema no prohíbe que una futura acción autorizada recaiga sobre la propia cuenta.

El formato 3 exige exactamente una referencia administrativa, ninguna referencia de Reservación/Operación/Transporte/Daily, origen `HUMANO`, instante, nombre histórico y descripción presentes, además de generación y clave del comando. La validez de la identidad autenticada y su autorización corresponde a la etapa posterior de servicios.

| Acción | Recursos | Antes / después | Motivo |
| --- | --- | --- | --- |
| `CREAR` | Los siete recursos | NULL SQL / snapshot válido | Opcional |
| `MODIFICAR` | Usuarios, Tours, Guías, Operadores y Vehículos | Dos snapshots válidos y distintos | Obligatorio |
| `CAMBIAR_PASSWORD` | Usuario afectado | Ambos NULL SQL | Obligatorio |

No se admiten ediciones de Países/Plataformas, acciones de borrado ni rutas administrativas nuevas.

## 4. Compatibilidad histórica y 021

`chk_bitacora_formato_022` conserva literalmente la expresión anterior dentro de las ramas `version_auditoria IS NULL` y `version_auditoria = 2`, y exige que sus nuevas referencias administrativas estén vacías. Conserva las condiciones anteriores, incluso los NULL permitidos en los históricos. Las otras versiones se rechazan.

Las cuatro funciones heredadas de 021 conservan sus definiciones en el catálogo. `ctsk_audit_command_021` sigue siendo ALWAYS y diferido; su única ampliación es excluir el formato 3 mediante `WHEN`, para que este se valide por su función propia. No se reescribe el archivo de migración 021. El formato 2 continúa insertándose y validando su ledger después de aplicar 022.

Se compararon IDs, filas y valores históricos y de formato 2 antes y después de la migración, excluyendo únicamente las siete nuevas columnas NULL de la comparación. Se probaron mezclas en ambas direcciones y la reinterpretación indebida de formato administrativo como histórico, 2 u otra versión.

El lector estricto 021 rechaza 022. El verificador 020 original comprueba el ledger, no el formato completo de Bitácora; por ello no bastaba asumir que detectaría solo las siete columnas nuevas. El trigger inverso administrativo, necesario para la integridad del recibo, es también una extensión visible de ese ledger y hace que su contrato estricto anterior rechace 022. El nuevo lector valida la proyección original 020 retirando **solo** ese trigger adicional conocido, y por separado verifica su definición y el catálogo extendido completos contra el digest fijo. Los verificadores anteriores no se modificaron ni se relajaron.

## 5. Referencias, snapshots y motivos

`ctsk_admin_snapshot_valido_022(text,jsonb)` acepta objetos con las siguientes claves exactas; rechaza campos adicionales, faltantes, cuerpos HTTP, arrays o escalares en lugar del objeto y JSON null:

| Recurso | Claves permitidas |
| --- | --- |
| Usuarios | `nombre`, `correo`, `id_rol`, `estado`, `alcance_plataformas`, `platform_ids` |
| Tours | `nombre`, `descripcion`, `activo` |
| Guías / Operadores | `nombre`, `estado` |
| Vehículos | `identificador`, `placas`, `color`, `capacidad`, `estado` |
| Países / Plataformas | `nombre` |

Roles e IDs de plataformas son números JSON enteros positivos dentro de INT32. `platform_ids` debe estar ordenado estrictamente, sin duplicados; alcance solo `all` o `selected`, con array vacío para `all`. `selected` puede conservar el conjunto vacío. Estos IDs de snapshot son valores históricos, no nuevas FK: el servicio deberá construirlos desde las asignaciones reales autorizadas.

Estados y `activo` son booleanos JSON. Capacidad es un entero de 1 a 12. Los límites de texto reflejan las columnas comerciales existentes: Usuario y correo 100; Tour y País 150; Guía/Operador 120; Plataforma 50; identificador de Vehículo 50, placas 20 y color 50. Descripción es texto y admite vacío; placas/color admiten JSON null. Los textos obligatorios rechazan blancos según el criterio Unicode heredado de 021; el correo tiene validación estructural básica, sin pretender resolver la política completa de normalización futura.

El motivo es texto humano opcional en alta y obligatorio en modificación y evento de contraseña, de 1 a 500 caracteres Unicode cuando existe. Se comprueban blancos Unicode y el límite con caracteres suplementarios. No se generan motivos automáticos ni se toman de observaciones comerciales. Dos snapshots JSONB iguales impiden `MODIFICAR`; los comandos sin cambio pueden conservar recibo sin IDs de auditoría.

Las FK de los siete recursos y del actor se comprobaron con IDs existentes e inexistentes. El snapshot tiene contrato cerrado de forma y tipos; el esquema no demuestra por sí mismo que sus valores sean la foto del negocio. Esa procedencia debe garantizarla el backend futuro.

## 6. Evento de contraseña y seguridad pendiente

`CAMBIAR_PASSWORD` solo admite objetivo Usuario, actor, nombre histórico, instante, origen, acción, motivo y vínculo de comando, junto con las columnas administrativas preexistentes. Sus snapshots deben ser **NULL SQL**; JSON null también se rechaza. La descripción queda fijada a `Cambio de contraseña`, sin texto variable sobre la credencial. No se agregan columnas de contraseña, hash, longitud, fragmento o token a la auditoría.

El caso real inserta exclusivamente metadatos sintéticos y ledger: no modifica ninguna contraseña. Un digest en memoria del estado de credenciales antes/después acredita `passwordsUnchanged: true`; el informe solo conserva ese resultado booleano. Se rechazan snapshots sensibles y descripciones de contraseña distintas de la constante. Como cualquier texto humano libre, el motivo deberá manejarse con la política y validación segura del servicio; SQL no puede reconocer toda revelación arbitraria escrita por una persona.

Siguen pendientes y no se implementaron: revocación de JWT tras restablecimiento, política de contraseña y bytes UTF-8/bcrypt, tratamiento de blancos, cambios propios, protección de cuentas y del último Administrador, autorización de rol/plataformas y revalidación después del candado. La creación inicial del primer Administrador necesita un flujo local autorizado y una constancia de origen que no invente un actor autenticado anterior a su propia creación. No se incorporan cuentas productivas predeterminadas, contraseñas fijas ni endpoints públicos de inicialización.

## 7. Restricciones diferidas y ledger

`ctsk_admin_comando_auditoria_022()` vincula cada auditoría 3 al ledger por `(generacion_datos, id_usuario, clave)`. Al confirmar exige estado `confirmado`, HTTP 200, recurso e ID exactos, método y ruta exactos y `ids_bitacora = ARRAY[id_bitacora]`. Las rutas contractuales son POST `/api/<recurso>` para alta, PATCH `/api/<recurso>/<id>` para modificación y PATCH `/api/usuarios/<id>/password` para el evento especial; no se crean endpoints.

El índice parcial `uq_bitacora_comando_022` impide más de una auditoría administrativa para la misma generación, actor e intención. El trigger inverso `ctsk_admin_ledger_audit_022` y su función `ctsk_admin_ledger_auditoria_022()` impiden que un recibo administrativo con IDs declare una auditoría inexistente, operativa o de otro comando. Ambos triggers administrativos son ALWAYS, `DEFERRABLE INITIALLY DEFERRED`.

El orden ensayado es escritura sintética → auditoría → ledger → comprobaciones diferidas → COMMIT, en el mismo cliente y transacción. Se mantienen PK, guardia de generación, inmutabilidad y columnas del ledger 020. Los recibos rechazados y no-op con IDs vacíos conservan su representación sin inventar auditoría de éxito. La recuperación HTTP no cambia ni se ejecuta en esta fase.

## 8. Permisos e inmutabilidad

Propietario y runtime conservan roles separados. Runtime mantiene lectura e INSERT histórico y solo recibe INSERT en las siete nuevas referencias, además de EXECUTE específico en las funciones nuevas. No recibe inserción directa del ID de auditoría, UPDATE, DELETE, TRUNCATE, DDL, administración de triggers/restricciones ni elevación a propietario o superusuario.

Las funciones nuevas son SECURITY INVOKER, con `search_path=pg_catalog`, propietario controlado y EXECUTE retirado de PUBLIC. Los triggers heredados de inmutabilidad siguen bloqueando UPDATE/DELETE/TRUNCATE incluso con el propietario en las pruebas ordinarias; un propietario con DDL sigue siendo una identidad de confianza, no un adversario al que SQL pueda quitar toda capacidad de alterar sus objetos.

Se probaron privilegios efectivos, ACL de funciones/tabla/esquema y ausencia de grant option. PostgreSQL puede responder a un GRANT indebido sin excepción y sin conceder privilegios: ese caso comprueba que la ACL permanece idéntica, no confunde el warning con una concesión. Se rechazan además `session_replication_role=replica`, función intrusa y SET ROLE propietario.

El verificador 022 detecta antes de cualquier aplicación futura: trigger deshabilitado o no ALWAYS, FK/CHECK/índice retirados, columna/tipo ajenos, función sustituida o SECURITY DEFINER, grants runtime/PUBLIC indebidos, CREATE de esquema y membresía de rol insegura. Cada manipulación se hace en una transacción privada, se revierte y el esquema vuelve a verificarse.

## 9. Resultados PostgreSQL y Jest

| Ejecución | Resultado | Evidencia en `docs/local-fase-2d9b1/` |
| --- | --- | --- |
| Laboratorio final 022, PostgreSQL 18.3 | **249 comprobaciones**, sin fallos; completado y detenido | `postgres-final.log`, `postgres-verification.json` |
| Casos SQL 021 previos a 022, dentro del recorrido nuevo | **91 comprobaciones** del módulo original | `postgres-verification.json`, sección `predecessor021` |
| Laboratorio 021 original independiente | **94 comprobaciones**, completado y detenido | `schema021-regression.log`, `schema021-regression.json` |
| Jest, selección de regresiones sin arranque HTTP/Electron | **329 pruebas / 10 suites**, cero fallos; 65 nuevas | `jest-final.log`, `jest-final.json` |

Los 91 casos del módulo SQL 021 y las 94 comprobaciones del corredor completo 021 son medidas diferentes. Los intentos intermedios no se suman al resultado final ni se presentan como pruebas adicionales únicas.

Estado final de la base sintética: **4 auditorías históricas, 8 operativas, 14 administrativas y 24 comandos**. Las administrativas incluyen siete altas, cinco modificaciones, un evento de contraseña de metadatos y una prueba adicional de límite/formato; no equivalen a 14 acciones de servicios reales.

Jest ejecutó las suites `adminAuditSchemaLab`, `auditSchemaLab`, `revisionSchemaLab`, `commandApi`, `commandApiPolicy`, `commandApiTransactions`, `revisionApiTransactions`, `auditApi`, `auditFrontend` y `commandFrontend`, mediante `backend/__tests__/standalone.jest.config.cjs --runInBand`. Las suites API/frontend seleccionadas usan dobles y modelos; sus nombres no implican que se levantó una API o una ventana de escritorio.

## 10. Evidencias de rollback y transacción

El informe PostgreSQL guarda **196 rechazos con comparación de estado antes/después**: 168 durante sentencia y 28 al COMMIT diferido. Incluyen FK, combinaciones de formato, snapshots, motivos, duplicación de intención, ausencia/rechazo/inconsistencia de ledger y privilegios. Los hashes SHA-256 del conjunto de filas funcionales, Bitácora y ledger coinciden después del rollback.

Se comprueban específicamente cambios de Usuario y tabla puente de plataformas, modificaciones de los catálogos editables y altas fallidas de Usuario, País y Plataforma. Un error inmediato del ledger después de negocio/auditoría también revierte el conjunto. Los huecos de secuencias PostgreSQL por `nextval` no se consideran corrupción ni se prometen revertir: la evidencia compara filas, IDs persistidos y relaciones.

Hay **13 pruebas de transacción** con PID/identidad transaccional y `xmin`: 12 demuestran negocio, auditoría y comando en la misma transacción; la del evento de contraseña demuestra auditoría y comando sin escritura de credenciales (`businessWritten: false`). Ejemplo persistido: alta de Usuario objetivo 3, auditoría 74, negocio/auditoría/comando con transacción 819. El evento especial es auditoría 86, actor 1 y objetivo 3, con snapshots NULL y credenciales intactas.

## 11. Aislamiento, identidad y cierre

El perfil es `admin-audit-schema-lab`, propósito `admin-audit-schema-tests-only`, esquema `022`, manifiesto versión 7. Utiliza **`admin-audit-manifest.json` y `admin-audit-runtime.env` propios**; no transforma los archivos `manifest.json`/`runtime.env` del aprovisionamiento 020 para hacerlos pasar por 022. Sus hashes anteriores se conservan y comprueban. La configuración tiene nueve claves cerradas de laboratorio, sin JWT ni integraciones.

Cada Verify crea un directorio privado nuevo bajo LOCALAPPDATA con ACL Windows restringida y un clúster PostgreSQL nuevo. No acepta un directorio anterior para Verify. Reutiliza el preparador solo para construir ese clúster, aplica la base y 018–020 en orden, verifica el contrato 020, aplica y verifica 021 y ejecuta sus casos antes de aplicar 022. El perfil 021 intermedio usado para esas pruebas es solo un contexto en memoria sobre la base nueva; no reetiqueta un clúster anterior ni reescribe su manifiesto.

Se verifican ruta, identidad de servidor/base/clúster, versión PostgreSQL, rol runtime, generación, fingerprints de código y catálogo. Las pruebas de manifiesto/config alterados se rechazan antes de conectar y restauran sus bytes. Perfiles anteriores no aceptan el manifiesto nuevo. Se ensayan bloqueos de red ajena, puerto PostgreSQL 5432, fetch y UDP antes de conexión.

La ejecución final usó `C:\Users\luisg\AppData\Local\ctsk-standalone-36d80ed7fb58`, base `ctsk_standalone_afb9740314a5_test`, identidad de clúster `7701738237560258720`, PostgreSQL en **127.0.0.1:60880**. Las cuatro conexiones de socket registradas por el coordinador pertenecen a ese puerto propio. La conexión de mantenimiento a `postgres` es de ese mismo clúster recién creado, previa a crear la base sintética; no es una conexión a una instalación ajena. El puerto reservado 60881 para compatibilidad del manifiesto queda sin servidor HTTP.

`labs.json` registra siete clústeres distintos, incluidos intentos de inspección y la regresión 021; **todos detenidos**. `closure.json`, comprobado el 28/10/2026 a las 10:23:02 −05:00, acredita cero listeners en sus 14 puertos y cero procesos asociados. Se conservan directorios privados detenidos para trazabilidad; no se eliminan masivamente.

No se accedió a `sian_kaan_reservaciones`, bases existentes ni credenciales reales. Los usuarios y credenciales del preparador son aleatorios y sintéticos por ejecución. No se leyó configuración productiva, no se abrieron conexiones LAN, no se modificaron firewall/router/certificados/ngrok/tareas Windows y no se activaron integraciones ni instaladores.

## 12. Regresiones y diagnóstico de intentos anteriores

Además del recorrido 022, se ejecutó el laboratorio 021 original completo en otro clúster nuevo y las nueve suites anteriores de Jest indicadas junto a la nueva. Los verificadores 019 y la proyección íntegra del ledger 020 siguen validándose dentro del perfil nuevo. El rechazo de 022 por los lectores anteriores se comprueba expresamente.

Las regresiones API/UI reales con HTTP/Electron y la suite global previa no se ejecutaron en esta fase por su alcance de esquema. Sus fuentes permanecen idénticas. Los resultados históricos de otras fases no se cuentan como validación actual.

Se conservan los logs de intentos fallidos: contexto intermedio de perfil incorrecto corregido, sustitución de texto SQL en JavaScript corregida para no interpretar secuencias de reemplazo, rechazo deliberado del digest aún no revisado y una expectativa de excepción de GRANT sustituida por la comprobación de ACL efectiva. Después se revisó el catálogo y se fijaron los digests. Hubo un recorrido aprobado de 240 comprobaciones antes de ampliar las comprobaciones de rollback hasta las 249 finales. Cada intento cerró su propio clúster; no se relajó un contrato previo para obtener aprobación.

## 13. Cobertura obligatoria y límites de la evidencia

| Punto solicitado | Comprobación real / alcance |
| --- | --- |
| 1. Migración desde 021 | Contrato y casos 021 aprobados antes de 022; aplicación atómica |
| 2. Históricos | Filas, IDs y valores conservados; INSERT histórico posterior |
| 3. Formato 2 | Conservación exacta e INSERT/ledger posterior a 022 |
| 4. Administrativo válido | Siete altas y cinco modificaciones sintéticas; metadatos de contraseña |
| 5. FK Usuario | Objetivo y actor válidos; IDs inexistentes rechazados |
| 6. FK seis catálogos | Referencias válidas e inexistentes para cada catálogo |
| 7. Referencias múltiples | Combinaciones administrativas rechazadas |
| 8. Recurso ausente | Rechazo por CHECK |
| 9. Mezclas 2/3 | Referencias cruzadas y versiones reinterpretadas rechazadas |
| 10. Acciones por recurso | Matriz CREAR/MODIFICAR/especial; País/Plataforma solo alta |
| 11. JSONB válido | Objetos cerrados, tipos y límites; plataforma normalizada |
| 12. Campos ajenos/sensibles | Claves extra/faltantes, body HTTP y secretos rechazados |
| 13. Motivo de modificación | NULL, vacío, blancos y exceso rechazados |
| 14. Motivo de creación | NULL válido; Unicode 500 válido y 501 inválido |
| 15. CAMBIAR_PASSWORD | Metadatos, snapshots NULL y credenciales sin cambios |
| 16. Responsable / afectado | Actor 1 y objetivo 3 en evento persistido |
| 17. Nombre histórico | Se conserva tras renombrar al actor sintético |
| 18. Comando confirmado | Generación/actor/clave/estado/recurso/ID coincidentes |
| 19. Ausente/rechazado | COMMIT falla y revierte el conjunto |
| 20. Método/ruta | Valores incorrectos, query y slash adicional rechazados |
| 21. Recibo | ID ajeno, ausente, adicional u operativo rechazados |
| 22. Duplicación | Índice de auditoría y PK original del ledger |
| 23. Fallo diferido | 28 rechazos al COMMIT, hashes iguales tras rollback |
| 24. Error de ledger | Error inmediato revierte negocio y auditoría previa |
| 25. Inmutabilidad | Runtime y propietario: UPDATE/DELETE/TRUNCATE bloqueados |
| 26. Runtime/PUBLIC | ACL y grants efectivos de tablas/columnas/funciones/esquema |
| 27. Esquema manipulado | Mutaciones negativas, rollback y nueva verificación |
| 28. Verificadores anteriores | Rechazo estricto 020/021 de la extensión; contratos originales intactos |
| 29. Bases existentes | Identidad nueva y sockets propios; ningún acceso a base principal |
| 30. Cierre | Siete clústeres detenidos, cero procesos asociados y listeners |

El esquema impide formas inválidas y vínculos incoherentes, pero no autentica a una persona ni prueba que un snapshot o motivo venga de una lectura de negocio autorizada. Tampoco puede distinguir por sí solo un no-op real si un escritor futuro inventa dos snapshots diferentes. No hay escritor administrativo integrado en esta fase. Revalidación de actor, origen de snapshots, comparación material y autorización deben verificarse con servicios reales en la siguiente etapa aprobada.

Las decisiones de revocación, sesiones, primer Administrador, política de contraseñas y protección de cuentas continúan pendientes. No se agregaron campos de autenticación, tablas de sesión ni cambios en JWT. La compatibilidad prevista es almacenar únicamente el evento administrativo seguro, mientras un mecanismo de credenciales separado realiza la validación/revocación autorizada en una futura etapa.

## 14. Reversión selectiva

No hay archivos previos que restaurar ni migración aplicada a bases existentes. `reversion-manifest.json` enumera los ocho archivos nuevos y sus SHA-256, con `modified: []`.

Si se decide retirar esta fase, primero comprobar el hash actual de cada archivo enumerado y que ninguna etapa posterior dependa de él; retirar solo esos archivos nuevos cuando coincidan. Si hay cambios posteriores, revisar su diferencia y no sobrescribirlos. Conservar el informe y las evidencias, incluidos los intentos fallidos. No usar reset/clean/restauración global ni tocar archivos previos sin seguimiento.

No se entrega DOWN para borrar auditorías ni se rebaja un clúster 022 a 021. El laboratorio es desechable y ya está detenido; cualquier ensayo 020/021 debe utilizar otro clúster nuevo y su corredor original. Una limpieza posterior de directorios deberá verificar las rutas exactas e identidad, sin afectar otros clústeres. El código de parada solo actúa sobre el directorio explícito e identidad propia.

## 15. Recomendación para servicios administrativos

La siguiente etapa propuesta sigue siendo 2D.9B.2, con autorización y perfil propios, sin ampliar silenciosamente las entradas 020/021. Deberá construir snapshots públicos desde filas y asignaciones reales, revalidar al Administrador después del candado, conservar precondiciones/idempotencia/recuperación y ejecutar negocio, asignaciones, auditoría y ledger en el mismo cliente/transacción.

Conviene ensayar primero altas y modificaciones no sensibles, corregir el reemplazo innecesario de asignaciones de plataformas en no-op y exigir una sola auditoría para el cambio efectivo compuesto. Países/Plataformas siguen siendo solo alta. Se necesitan pruebas reales de concurrencia, pérdida de respuesta, permisos revocados, contexto operativo y rollback de servicios antes de pasar a formularios.

El cambio integrado de contraseña y el primer Administrador requieren resolver y autorizar previamente las decisiones de seguridad de 2D.9A; la existencia del evento de metadatos no declara completados esos flujos. Esta entrega termina en esquema, verificadores, laboratorio y evidencias. No se comenzó la siguiente fase.

Las evidencias principales están en `docs/local-fase-2d9b1/`: `postgres-verification.json`, `catalog-reviewed.json`, `catalog-final.json`, `schema021-regression.json`, `jest-final.json`, `labs.json`, `closure.json`, `source-before.json`, `source-verification.json` y `reversion-manifest.json`.
