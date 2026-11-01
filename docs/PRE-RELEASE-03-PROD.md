# PRE-RELEASE-03-PROD — Respaldo y preparación de la migración 017

**Proyecto:** Sistema Integrador de Reservaciones — Community Tours Sian Ka’an.  
**Fecha:** 17 de octubre de 2026, America/Cancun.  
**Rama:** `GYG+FRHB-implementado`. **HEAD:** `23d9ea21c04070aba3a49fd212d6a3106276c3a2`, conservando todos los cambios PRE-RELEASE pendientes.  
**Conclusión:** **RESPALDO GENERADO Y PLAN LISTO PARA REVISIÓN.**

Se realizaron únicamente diagnóstico de lectura, respaldo y validación del archivo. **No se aplicó 017, no se restauró ninguna base y no se abrió Electron contra principal.** El respaldo no constituye todavía una recuperación ensayada ni habilita `npm run desktop`.

## 1. Identidad verificada

Se contrastaron RELEASE-01 y PROD-ACCESS-02B con la conexión efectiva, antes del inventario y nuevamente después del dump:

| Dato | Resultado |
|---|---|
| Configuración histórica | `localhost:5432`, exclusivamente `sian_kaan_reservaciones` |
| Dirección efectiva fijada para esta tarea | `::1`, puerto **5432**; loopback IPv6, sin resolución DNS |
| Base efectiva | **sian_kaan_reservaciones** |
| PostgreSQL | **18.3** |
| Identificador del clúster | **7632825987452064788**, igual a PROD-ACCESS-02B |
| Usuario conectado | `postgres`, sin elevar/cambiar el rol |
| Esquema | `public` |
| Transacción | `REPEATABLE READ READ ONLY`; `transaction_read_only=on` comprobado |
| Otros clientes de esta base en el inventario | **0** |

El identificador se obtuvo mediante `pg_control_system()`, disponible para la cuenta existente. No se concedieron permisos ni se utilizó `SET ROLE`. Se rechazaban base, puerto, dirección, clúster, versión o rol distintos. **No se conectó a DEV ni a ningún laboratorio persistente anterior.**

Las credenciales existentes de PostgreSQL se leyeron de `.env` solo para autenticar, sin publicarlas ni duplicarlas en archivos. Se usó `dotenv.parse`, sin cargar el entorno de la aplicación. El proceso de respaldo y las herramientas reciben entornos acotados: no heredan DB/PG, APP_CONFIG_PATH, NODE_OPTIONS ni secretos de proveedores. El password de libpq se suministra únicamente al entorno del hijo `pg_dump`, nunca en argumentos, informes o logs.

## 2. Inventario anterior al respaldo

**18 tablas**, 17 secuencias de identidad, **18 PK, 18 FK, 12 UNIQUE y 15 CHECK**; restricciones validadas e índices válidos/preparados. Hay **34 índices**: 30 asociados a PK/UNIQUE y cuatro independientes. PostgreSQL 18 también expone restricciones NOT NULL de tipo `n`; se inventariaron por separado de esos conteos.

| Tabla | Filas |
|---|---:|
| reservaciones | **1.150** |
| operaciones_tour | **10** |
| transportes_operacion | **10** |
| usuarios | **4** |
| roles | 2 |
| tours | 14 |
| vehiculos | 2 |
| operadores | 1 |
| guias | 1 |
| paises | 3 |
| plataformas | 5 |
| usuario_plataformas_visibles | 2 |
| eventos_integracion | **136** |
| reservas_integracion_link | **8** |
| equivalencias_tours_externos | 1 |
| integracion_sync_estado | 1 |
| bitacora | 65 |
| daily_observaciones | 0 |

El conteo histórico de PROD-ACCESS-02B era 1.144 reservaciones; este respaldo conserva el estado **actual de 1.150**. No se investigó ni atribuyó el origen de la diferencia, y esta fase no creó esas filas. No se mostraron nombres, correos, teléfonos, importes, payloads ni hashes de contraseñas de usuarios.

Se confirmó la estructura esperada hasta 016: grupos/turnos explícitos, unicidad de transporte por grupo, campos de reservación y revisión/aplicación de eventos, tablas de vínculos/equivalencias/sincronización, checkpoint de recuperación y ACCESS-SCOPE. En particular:

- `usuarios.alcance_plataformas`: VARCHAR(20), NOT NULL, default `selected`, CHECK `all/selected`.
- `usuario_plataformas_visibles`: PK compuesta y ambas FK validadas.
- `eventos_integracion.application_status`: VARCHAR(30), NOT NULL, default `not_applied`, CHECK existente; revisión y metadatos presentes.
- **Ausentes** los tres campos, las dos restricciones y el índice de archivo de 017.

No existe un ledger de migraciones que acredite por sí solo el orden histórico de ejecución. La confirmación actual es estructural, complementada por el registro histórico de 016; no se repitieron migraciones anteriores.

Los ocho vínculos externos tienen reservación destino existente. No se ejecutó una nueva certificación de concurrencia o de todas las reglas operativas: el inventario y el respaldo no sustituyen esas pruebas.

## 3. Respaldo generado y custodia

Herramientas existentes **pg_dump 18.3 / pg_restore 18.3**, compatibles con el servidor. Respaldo completo de esta base en **formato custom**, con esquema y datos, sin filtros de tablas/esquemas ni opciones que omitan propietarios/ACL. Se incluyó la definición de base mediante `--create`.

Directorio nuevo privado, ignorado por Git:

```text
A:\sistema-integrador-reservaciones\.access-scope-lab\pre-release-03-main-backup\run-20261017T212123838Z-9d91b157\
```

Archivo:

```text
sian_kaan_reservaciones_2026-10-17T21-21-24-484Z_d403e067.backup
```

| Registro | Valor |
|---|---|
| Inicio UTC | `2026-10-17T21:21:24.211Z` |
| Fin UTC | `2026-10-17T21:21:24.960Z` |
| Hora de Cancún | Aproximadamente **16:21:24**, 17/10/2026 |
| Tamaño | **124.403 bytes** |
| SHA-256 | `99ea69f746333879c77ce0f434181f372d12f582acf0d51641b7544d0aae660e` |

Antes de generar el archivo se verificaron espacio libre —más de 350 GB, por encima del margen requerido frente a los 10.188.479 bytes de la base—, escritura/lectura del directorio, ausencia del destino, exclusión Git y ACL. Solo la cuenta Windows actual y SYSTEM tienen FullControl en las carpetas nuevas; la herencia está bloqueada allí. El archivo hereda exclusivamente esos permisos privados. Se revisaron también las ACL de todos los archivos generados al finalizar. Las cuentas administrativas de Windows conservan sus capacidades administrativas del sistema; no se afirma protección frente a quien ya controla el equipo.

El temporal se reservó con creación exclusiva y el archivo definitivo se creó con `COPYFILE_EXCL`; no se sobrescribieron respaldos anteriores. Se conservan privados `directory-security.json`, `inventory.json`, `toc.list` y `backup-manifest.json`. **El respaldo contiene datos de la aplicación y material sensible, incluidos hashes de autenticación: no publicarlo ni adjuntarlo al repositorio.**

No se copió fuera del equipo. Es una copia local en A:; no protege frente a pérdida/fallo de esa unidad, robo del equipo o compromiso de la cuenta autorizada. Cuando base y copia comparten unidad física, tampoco protege frente al fallo de esa unidad. Una copia externa/cifrada, su ubicación y custodia necesitan autorización adicional.

## 4. Validaciones realizadas y sus límites

1. `pg_dump`: **salida 0**, sin stderr ni advertencias; archivo no vacío y cabecera **PGDMP**.
2. SHA-256 recalculado después de crear el definitivo; coincide con el temporal validado.
3. `pg_restore --list`: **salida 0**, sin advertencias; **122 entradas**.
4. TOC: **18 TABLE, 18 TABLE DATA, 17 SEQUENCE y 17 SEQUENCE SET**. Contiene las 30 restricciones PK/UNIQUE, las 18 FK y cuatro índices independientes. Los índices de PK/UNIQUE se recuperan mediante sus restricciones.
5. Los CHECK se incluyen en CREATE TABLE. Se decodificó el archivo completo mediante `pg_restore --exit-on-error --file=-`, **sin `--dbname` ni conexión a PostgreSQL**. El SQL se procesó como texto: nunca se ejecutó. Lectura completa con salida 0 y sin advertencias.
6. Durante esa decodificación se contaron las filas COPY, descartando su contenido sin mostrarlo. **Los conteos de las 18 tablas coinciden exactamente** con el inventario de la misma instantánea exportada mediante `pg_export_snapshot()` y utilizada por `pg_dump --snapshot`.
7. Se verificaron los **15 CHECK** en el esquema decodificado y los estados de las **17 secuencias**; no hubo diferencias con sus valores inventariados. Las secuencias no son MVCC: esa coincidencia corresponde a las lecturas de esta ejecución, no a una garantía sobre actividad posterior.
8. Se volvió a comprobar identidad y metadatos en la transacción de lectura, que terminó con ROLLBACK. No se ejecutó DDL, DML ni cambio de secuencias.

**No se afirma que el respaldo sea restaurable.** La lectura de índice, descompresión y coincidencia de conteos acreditan integridad del archivo dentro de estas comprobaciones; falta ejecutar y validar una restauración real en un clúster nuevo autorizado.

`pg_dump` **no respalda automáticamente todos los objetos globales**: definiciones/contraseñas de roles PostgreSQL, membresías, configuración de servicio, `postgresql.conf`, `pg_hba.conf`, ACL Windows, JWT/OAuth ni archivos de la aplicación. Los propietarios/ACL almacenados por el dump presuponen roles existentes o un mapeo explícito al restaurar. No se ejecutó `pg_dumpall`, no se exportaron contraseñas globales y no se cambiaron permisos.

## 5. Compatibilidad de 017

Archivo: `database/migrations/017_archivo_eventos_integracion.sql`.

```text
5dd8c57790aa368a3ce2d6be96e2f186db1fbc491e881e21fccbfa07e1bfb817
```

**Idéntico byte por byte al validado en PRE-RELEASE-03-LAB. No se modificó ni ejecutó.**

| Componente | Análisis frente al esquema principal leído |
|---|---|
| `archived_at TIMESTAMP` | Nueva columna nullable, coherente con los TIMESTAMP sin zona existentes. |
| `archived_by INTEGER` | Nueva columna nullable; coincide con `usuarios.id_usuario INTEGER`, PK existente. |
| `archive_reason TEXT` | Nueva columna nullable; el CHECK exige contenido al archivar. |
| FK `fk_eventos_integracion_archived_by` | Referencia al usuario; sin cascada de borrado. No colisiona con una restricción actual. |
| CHECK `chk_eventos_integracion_archivo` | Tres NULL o auditoría completa; motivo de 1–500 caracteres, no blanco, aplicación `not_applied`, revisión pendiente/aprobada. Compatible con los tipos/estados actuales. |
| Índice `idx_eventos_integracion_archived_at` | Parcial, por fecha/ID cuando hay archivo; no existe actualmente. |
| Transacción | El archivo contiene su propio **BEGIN/COMMIT**, incluidos ALTER, DO e índice no concurrente. No necesita otra envoltura `--single-transaction`. |

No contiene DELETE, TRUNCATE, DROP TABLE ni UPDATE/backfill. No cambia reservaciones, importes, estados existentes, PK, secuencias, IDs externos o vínculos. Las tres columnas nuevas quedan NULL en las 136 filas actuales; la primera rama del CHECK las admite. No requiere limpiar ni reinicializar usuarios, tours, operaciones o eventos 124/126.

Su DDL requiere bloqueos sobre tablas, por lo que debe hacerse en una ventana sin clientes/sincronización y con timeout de bloqueo. `IF NOT EXISTS` evita algunas duplicaciones, **no valida tipos o definiciones de objetos ya presentes**: un estado parcial o inesperado debe detener el procedimiento. La compatibilidad analizada no equivale a ejecutar el DDL sobre principal.

La guardia `verificarEsquemaArchivoEventos()` consulta columnas y nombres de dos restricciones validadas antes de escuchar/iniciar workers. Con el esquema actual debe rechazar el arranque nuevo. No aplica migraciones automáticamente. Su conteo no certifica las definiciones completas ni el índice; esas verificaciones deben añadirse al procedimiento de despliegue/RELEASE-03A.

## 6. Estado de permisos y seguridad pendiente

La cuenta existente `postgres` es superusuario, tiene capacidades de crear bases/roles y es propietaria de `eventos_integracion` y `usuarios`. Se comprobaron USAGE/CREATE en `public`, SELECT de eventos y REFERENCES de usuarios. **Tiene permisos técnicos suficientes para 017**, pero esta fase solo la utilizó en lectura y no la autoriza como cuenta productiva de ejecución.

El futuro migrador deberá ser propietario autorizado de la tabla —o miembro efectivo de ese rol—, con los privilegios de esquema/referencia/lenguaje que correspondan. Si se decide otro migrador, sus permisos deberán comprobarse entonces; **no se creó ningún rol ni se ejecutó GRANT/REVOKE**. Separar migrador de una cuenta runtime limitada requiere trabajo y autorización de RELEASE-03A.

La inspección actual de `.env` confirma el riesgo de RELEASE-01: `Authenticated Users` conserva Modify y el grupo Usuarios conserva lectura mediante herencia. **No se modificó esa ACL ni el archivo.** La carpeta privada de respaldo protege este artefacto; no corrige la custodia de configuración existente. No se alteraron ACL fuera de las carpetas nuevas de respaldo.

## 7. Riesgo de `npm run desktop` y coordinación con RELEASE-03A

La ruta normal continúa sin estar acreditada para el destino principal actualizado:

- `electron/main.js:isExpectedBackendAvailable()` acepta únicamente estado HTTP 200 y el texto de salud. `ensureBackend()` puede reutilizar cualquier backend que responda así en 3000, antes de iniciar uno propio.
- `buildBackendEnvironment()` copia `process.env`. `backend/config/database.js` carga dotenv sin override: variables DB/PG/APP_CONFIG_PATH heredadas pueden cambiar el destino efectivo. La validación empaquetada comprueba presencia de claves, no identidad PostgreSQL ni procedencia efectiva.
- La salud `/` no confirma base, clúster, esquema o versión de código. Un backend anterior ya abierto puede eludir la nueva guardia de arranque por la reutilización.
- Un error de la guardia impide al backend nuevo escuchar, pero ese control por sí solo no protege contra reutilizar un servicio ajeno ni identifica todas las causas de arranque.

**Condiciones propuestas para RELEASE-03A, sin implementar aquí:**

1. Definir un contrato privado de ambiente esperado: principal, nombre exacto, clúster, dirección/puerto y versión/manifiesto de esquema. Configuración de origen único y protegida; rechazar conflictos con variables heredadas con un mensaje claro, sin valores de secretos.
2. Construir el entorno del hijo con allowlist de Windows y configuración explícitamente validada; evitar copiar DB/PG/JWT/proveedores/NODE_OPTIONS/APP_CONFIG_PATH del entorno no controlado. Mantener separados los modos protegidos existentes y no debilitar DEV.
3. Crear un backend propio y comprobar por **IPC privado con nonce por inicio** su identidad efectiva obtenida mediante consulta, versión de código, guardia de esquema y socket propio, **antes** de abrir el frontend o iniciar workers. No publicar contraseñas, tokens o diagnósticos detallados por HTTP público.
4. Rechazar un puerto 3000 ocupado por un servicio no acreditado. No reutilizar su texto de salud ni terminar procesos desconocidos automáticamente. La adquisición real del socket debe cerrar la carrera entre precomprobación y arranque.
5. Mostrar errores diferenciados y sin secretos: puerto ocupado, configuración conflictiva, conexión fallida, destino incorrecto o migración pendiente. Sin fallback a DEV/laboratorio o una configuración anterior. Al morir el backend, impedir operaciones sobre información obsoleta.
6. Probar con API/PG simulados: servicio ajeno con salud idéntica, backend de DEV/laboratorio, colisión de puerto, variables heredadas, nonce/versiones incorrectas, 017 ausente/parcial, cambio de sesión y cierre del hijo. Después verificar la identidad persistente con autorización específica.

No hay una entrega RELEASE-03A acreditada en los documentos encontrados; este contrato queda propuesto para esa fase. No se tocaron arranque, configuración privada ni credenciales. **No recomendar todavía `npm run desktop` contra principal.** El resultado buscado sigue siendo hacer seguro el comando habitual, no sustituirlo permanentemente por un lanzador de laboratorio.

## 8. Plan de ensayo de restauración — no ejecutado

Requiere autorización adicional que identifique custodio, directorio nuevo, puerto propio, nombres desechables, rol y alcance de datos del respaldo.

1. Verificar nuevamente SHA-256 y ACL del archivo. Preparar un **clúster PostgreSQL completamente nuevo**, con binarios compatibles, directorio privado nuevo y credenciales propias. No usar principal, DEV, PRE-RELEASE-03-LAB ni otros clústeres previos.
2. Reservar un puerto distinto de 5432 y de laboratorios existentes; identificar clúster nuevo, data_directory y base nueva/vacía antes de restaurar. Bloquear conexiones externas, workers y proveedores. No modificar servicios existentes.
3. Acordar recuperación de propietarios/ACL: aprovisionar roles equivalentes solo dentro del nuevo clúster o restaurar con un mapeo/`--no-owner --no-acl` explícito. Esta última opción valida datos/esquema, **no equivalencia de permisos**. El rol migrador/operativo necesita verificación aparte.
4. Restaurar solo a la base nueva con salida de error estricta y transacción cuando corresponda. No usar `--clean`, `--create` sin destino controlado, ni sobrescribir una base existente.
5. Comparar 18 tablas, conteos, columnas, PK/FK/UNIQUE/CHECK, índices, secuencias/próximos IDs, integridad de todas las FK y firmas de datos calculadas sin publicar filas o hashes de autenticación. Verificar vínculos externos y alcance de usuarios.
6. Ensayar allí 017 con el hash aprobado, conservación íntegra de datos y rechazo de esquemas parciales. Probar archivo/no aplicación, notificaciones y los tres perfiles con proveedores bloqueados, manteniendo los datos personales del respaldo dentro del laboratorio privado.
7. Registrar duración, errores, resultados y límites de propietarios/ACL. Obtener aprobación antes de cualquier intervención principal. Conservar un punto de recuperación y un procedimiento probado; no deducir RTO/RPO de los tiempos del dump.

No se inició PostgreSQL nuevo, no se creó ninguna base ni se restauró este respaldo durante la fase actual.

## 9. Procedimiento de despliegue futuro — pendiente de autorización

1. Identificar base, clúster, versión de PostgreSQL y paquete/código exacto, incluyendo los cambios no comprometidos y hashes aprobados. No basta citar HEAD.
2. Confirmar respaldo reciente, su custodia y **ensayo de restauración aprobado**. Si cambia la información desde este punto, generar y validar un respaldo final autorizado.
3. Acordar ventana sin operaciones, responsable, duración máxima y criterio de abortar; conservar los datos de prueba actuales. No ejecutar limpieza, seeds ni reinicialización.
4. Cerrar Electron, backend y clientes incompatibles mediante procedimientos autorizados. Verificar las sesiones restantes; no terminar procesos ajenos automáticamente.
5. Confirmar sincronizadores/proveedores sin actividad y recepción detenida según el procedimiento aprobado. No activarlos al concluir por implicación.
6. Revalidar identidad, ACL/configuración, rol migrador, esquema hasta 016 y ausencia completa de 017. Establecer search_path explícito `public,pg_catalog`, timeouts y salida estricta de psql (`-X`, `ON_ERROR_STOP`). Rechazar esquema parcial o hash diferente.
7. **Solo con autorización específica**, ejecutar exclusivamente el archivo 017 aprobado, respetando su BEGIN/COMMIT. No ejecutar schema.sql, seeds, otras migraciones ni mezclar wrappers transaccionales.
8. Verificar tipos/nullabilidad, FK/CHECK y sus definiciones/validación, índice parcial válido, nuevas columnas NULL en filas anteriores y conservación de todos los datos originales, IDs, vínculos, secuencias, usuarios y asignaciones.
9. Validar guardia del backend, privilegios de lectura/escritura realmente necesarios, cuenta runtime y pruebas de denegación ACCESS-SCOPE. El backend previo debe seguir cerrado. Mantener proveedores bloqueados.
10. Confirmar destino efectivo y backend propio con los controles de RELEASE-03A antes de abrir la interfaz. Si falta esa implementación/validación, detener el despliegue: un lanzador de pruebas no acredita el arranque habitual.
11. Ejecutar pruebas de Administrador, Consulta all y Consulta selected. Probar acciones válidas de archivo en el clúster restaurado; cualquier fixture o escritura adicional en principal necesita autorización delimitada. No archivar 124/126 para hacer un smoke test.
12. Con todos los criterios aprobados y el destino comprobado, abrir finalmente **`npm run desktop`** contra principal, dentro de la intervención autorizada. Reabrir y comprobar etiquetas/avisos/alcance sin activar recepción externa por defecto.

Ningún paso de modificación de esta lista se ejecutó en esta fase.

## 10. Criterios de aceptación de la futura intervención

- Identidad exacta, configuración protegida y sin precedencia silenciosa del entorno; rechazo demostrado de backend ajeno y de DEV/laboratorios.
- Respaldo final con hash y restauración ensayada; recuperación de propietarios/ACL acordada y verificable.
- Únicamente 017 aplicada de manera atómica; columnas/definiciones/índice completos y guardia satisfecha. Ningún cambio en columnas originales, IDs, reservaciones, usuarios, operaciones o vínculos.
- Vehículos y PAX reflejan consultas actuales, selección manual desde catálogo, grupos/capacidades/turnos/pickup conservados.
- Administrador realiza archivo consciente en datos autorizados; Consulta all lee sin escribir; selected no obtiene integraciones ni sus contadores, incluso por solicitudes directas.
- Archivar excluye listado/avisos y conserva historial, motivo, fecha y responsable; visto no equivale a resuelto y no repite avisos indebidamente. Una actividad iniciada no se registra saltando validaciones.
- Arranque y reapertura por el comando habitual verificados; proveedores siguen inactivos hasta su autorización individual. Ningún secreto en UI, logs o evidencias públicas.

## 11. Recuperación ante errores

**Antes del COMMIT de 017:** ante bloqueo, timeout, error SQL o validación previa fallida, detenerse y hacer ROLLBACK/cerrar la sesión; comprobar que principal sigue en el esquema anterior e impedir que arranque código incompatible. No repetir a ciegas ni aplicar otras migraciones.

**Después del COMMIT, antes de uso:** mantener clientes/proveedores cerrados y capturar diagnóstico de lectura. Preferir una corrección compatible revisada o recuperación ensayada, con nueva autorización; no eliminar columnas para forzar el arranque. No restaurar este dump sobre principal automáticamente.

**Después de archivar o recibir escrituras nuevas:** volver a un backend anterior **no es una reversión segura**. Podría ignorar `archived_at`, revivir pendientes o admitir acciones sobre eventos archivados. No borrar metadatos de archivo ni sustituirlos por aprobación/rechazo. Una restauración pre-017 perdería también cambios posteriores al respaldo; requiere inventariarlos, conciliarlos y aceptar explícitamente la pérdida/reaplicación antes de decidir destino/corte.

La recuperación total se ensayará primero en un clúster nuevo y privado, comparando integridad y datos. El cambio de destino o sustitución de principal, permisos y credenciales son intervenciones separadas; ninguna está autorizada actualmente. No existe rollback automático propuesto que sobrescriba datos.

## 12. Archivos y verificaciones de esta fase

Nuevos:

- `scripts/BackupPreRelease03Main.ps1`: crea solo carpetas nuevas privadas, verifica espacio/ignore/ACL y ejecuta el proceso con entorno acotado.
- `scripts/preRelease03ProdBackup.cjs`: guardias de identidad/hash, diagnóstico READ ONLY, snapshot compartido, pg_dump y verificación del archivo sin restaurar. No ofrece modo migración/restauración.
- `backend/__tests__/preRelease03ProdBackup.test.js`: **4 pruebas aprobadas**, sin conectar a PostgreSQL; rechazos de identidad/solo lectura, entorno, TOC y hash de 017.
- Este informe y `docs/pre-release-03-prod/{verificacion,jest-seguridad}.json`, sin credenciales ni filas personales.
- Directorio privado descrito en sección 3 y sus evidencias; excluido de Git. No se modificó `.gitignore`.

Se revisaron AGENTS.md, RELEASE-01, PRE-RELEASE-03/03-LAB/04/05, PROD-ACCESS-02B, migraciones relacionadas, guardia de esquema, conexión central y arranque Electron. Se conservó todo el trabajo anterior. No se editaron fuentes funcionales de Electron, backend/frontend, SQL, instalador, archivos privados ni lanzadores protegidos anteriores.

Dos verificaciones iniciales se detuvieron antes de pg_dump porque el validador incluía los NOT NULL tipo `n` de PostgreSQL 18 al contar las cuatro restricciones de ACCESS-SCOPE. Se corrigió únicamente esa selección de metadatos; no se modificó la base para satisfacerla. Esas carpetas conservan solo el registro de seguridad; **se generó un único respaldo validado**, sin sobrescribir archivos.

Evidencia pública: [verificación](pre-release-03-prod/verificacion.json) y [pruebas sin conexión](pre-release-03-prod/jest-seguridad.json). El inventario detallado, índice y manifiesto permanecen privados junto al respaldo.

## 13. Pendientes de autorización y confirmación final

Pendientes separados: ensayo real de restauración del archivo actual en un clúster completamente nuevo; custodia/configuración/cuentas y arranque seguro de RELEASE-03A; ventana, rol y ejecución de **solo 017** en principal; pruebas persistentes autorizadas y arranque habitual; cualquier copia fuera del equipo o activación individual de integraciones.

**No se ejecutó ninguna migración, DDL, DML ni cambio de secuencias en PostgreSQL. No se restauró/sobrescribió ninguna base, no se archivaron 124/126, no se alteraron reservaciones, usuarios, tours, permisos, contraseñas o configuración del servidor. No se conectó a DEV ni al laboratorio anterior. No se activaron GYG/FareHarbor/WhatsApp, no se cambió instalador y no hubo commit ni push.**

**RESPALDO GENERADO Y PLAN LISTO PARA REVISIÓN.** No continuar automáticamente con restauración, migración ni `npm run desktop`; se esperan instrucciones del usuario.
