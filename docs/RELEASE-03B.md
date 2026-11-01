# RELEASE-03B — PostgreSQL real, runtime mínimo y arranque privado

Proyecto: Sistema Integrador de Reservaciones — Community Tours Sian Ka’an. Rama `GYG+FRHB-implementado`; HEAD `23d9ea21c04070aba3a49fd212d6a3106276c3a2`. Trabajo sin commit, push, instalador ni despliegue.

**Ensayo definitivo aprobado el 17 de octubre de 2026, 21:35:25–21:36:16 de Cancún —18 de octubre, 02:35:25–02:36:16 UTC—.**

## 1. Objetivo y límites

Esta fase contrasta con PostgreSQL 18.3 real los controles de RELEASE-03A: identidad efectiva, rol limitado, esquema 017, configuración privada y canal de arranque. Utiliza un clúster nuevo, el respaldo aprobado y fixtures adicionales. No utiliza `.env`, credenciales, conexiones ni permisos de principal/DEV; tampoco conecta a los laboratorios PostgreSQL de fases anteriores.

Se revisaron AGENTS.md, RELEASE-01, PRE-RELEASE-03-PROD/RESTORE, RELEASE-03A, su SQL de propuesta, entradas Electron/backend, guardias y servicios/rutas relevantes. Los cambios previos se conservaron.

**No se ejecutó `npm run desktop` contra principal. Puertos de producción 3000/5432 y clúster histórico siguen protegidos.** El harness es una entrada explícita separada, no una variable que habilita un bypass en el modo habitual.

## 2. Laboratorio y aislamiento

Cada intento crea una carpeta nueva `CTSK-Release03B-<id>/run-<fecha>-<id>` bajo LocalAppData del usuario Windows. Se eligió esta ubicación para validar la cadena completa de ACL sin modificar el directorio raíz del proyecto ni sus ancestros. Solo se establecen ACL en carpetas nuevas y en un archivo ficticio de prueba dentro de ellas.

El procedimiento utiliza los binarios existentes `C:\Program Files\PostgreSQL\18\bin`. `initdb` crea un clúster SCRAM nuevo, sin servicio Windows ni inicio automático. PostgreSQL escucha únicamente en 127.0.0.1 y un puerto libre efímero; se excluyen 3000, 5432, 55473, 57593 y otros puertos históricos. Se rechazan los identificadores de clúster registrados anteriormente.

Antes de crear/restaurar, se comprueban por consulta versión 18.3, dirección, puerto, usuario, base, directorio de datos, ID de sistema, bases iniciales y archivo PID propio. La base destino se acredita vacía. Los pools de ensayo vuelven a verificar destino/rol/clúster antes de escrituras. Las herramientas nativas reciben host, puerto, base y rol explícitos.

Una barrera Node permite únicamente el PG nuevo y los puertos HTTP propios registrados. Bloquea 3000/5432/55473/57593 antes del socket, proveedores, `dotenv.config()` y carga de un pool predeterminado no inyectado. No hay resolución DNS para conectar a PostgreSQL ni fallback a otra API/base.

La identidad del ensayo definitivo, los tiempos y el estado de cierre se consignan en `docs/release-03b/resultado.json`. Los intentos detenidos se conservan separados en `intento-*.json`; sus directorios privados no se reutilizan.

| Identidad definitiva | Valor |
|---|---|
| PG | **127.0.0.1:61716**, PostgreSQL 18.3 |
| Base/clúster | `release03b_6cad2b6b2b48` |
| ID de sistema | **7697830920421265760** |
| Directorio privado | `C:\Users\luisg\AppData\Local\CTSK-Release03B-319d0936\run-20261018T023525721Z-2db3ed9e` |
| Estado | **Detenido y conservado** |

## 3. Respaldo, restauración y 017

Se usa exclusivamente `sian_kaan_reservaciones_2026-10-17T21-21-24-484Z_d403e067.backup`, leído del directorio privado aprobado, sin sobrescribirlo.

SHA-256: `99ea69f746333879c77ce0f434181f372d12f582acf0d51641b7544d0aae660e`.

Restauración a base nueva UTF8/libc con `LC_COLLATE` y `LC_CTYPE=Spanish_Mexico.1252`, mediante `--exit-on-error --single-transaction --no-owner --no-acl --role=r03b_owner`. No se ejecuta `--clean`, `--create` ni SQL de creación de principal. La restauración lógica no replica los roles/permisos del servidor original.

Antes de 017 se comparan las 18 tablas, todas sus filas mediante huellas de COPY, columnas/restricciones/índices y las 17 secuencias contra el respaldo/inventario. Se comprueban 1.150 reservas, 136 eventos, cuatro usuarios, dos roles, operaciones/vehículos y 18 FK sin huérfanos. Se guardan PK y firmas agregadas privadas de los registros originales para repetir la comparación después.

Se ejecuta **017 una vez por clúster nuevo**, con su transacción y hash aprobado `5dd8c57790aa368a3ce2d6be96e2f186db1fbc491e881e21fccbfa07e1bfb817`. No se ejecutan schema.sql, seeds ni migraciones históricas. La guardia completa rechaza el esquema anterior y acepta las tres columnas, FK/CHECK e índice parcial después de migrar. Las secuencias y filas originales permanecen iguales antes/después de la migración.

Para comprobar el rechazo de esquema incompleto se retira temporalmente **solo el CHECK nuevo de 017**, mediante el migrador del nuevo laboratorio; se prueba el rechazo del hijo y se repone su definición catalogada/validada en un `finally`. No se altera una restricción histórica ni se opera con reservas mientras falta ese CHECK. No se vuelve a ejecutar la migración para acomodar la prueba.

## 4. Separación de roles y permisos efectivos

| Rol del laboratorio | Función |
|---|---|
| `r03b_migrator` | Administrador propio del clúster nuevo; inicialización, restauración, migración y grants del ensayo. Su credencial no es la del runtime. |
| `r03b_owner` | NOLOGIN, propietario de base y tablas restauradas. No se concede membresía al runtime. |
| `r03b_runtime` | LOGIN/SCRAM propio, NOINHERIT, sin superusuario, CREATEDB, CREATEROLE, replicación o BYPASSRLS; no posee base, esquema ni relaciones de aplicación. |

Se retira CONNECT/TEMP de PUBLIC en las bases del clúster nuevo y CREATE/privilegios públicos del esquema correspondiente. El runtime recibe CONNECT solo al destino y USAGE de public; no CREATE ni TEMP. No se modifica PUBLIC en un servidor existente.

La matriz efectiva por tabla y los atributos/membresías/propietarios se registran en el resultado, no se deducen solamente del texto de GRANT:

| Objeto/uso | Runtime del ensayo |
|---|---|
| Las 18 tablas de aplicación | SELECT. |
| Usuarios, tours, vehículos, operadores, guías, operaciones, transportes, reservas, Daily y eventos | INSERT/UPDATE conforme a servicios actuales. |
| Países, plataformas, bitácora y vínculos | INSERT, además del SELECT indicado. |
| `usuario_plataformas_visibles` | INSERT/DELETE para reemplazo transaccional de asignaciones; sin otras bajas de datos. |
| `plataformas.id_plataforma` | UPDATE de esa columna exclusivamente, por el bloqueo `FOR KEY SHARE`; no UPDATE de tabla. Véase corrección abajo. |
| Equivalencias y estado de sincronización | SELECT; sin mantenimiento ni worker activo. |
| 14 secuencias de tablas con INSERT | USAGE, sin UPDATE/setval. Se prueba nextval real y se verifican siguientes IDs seguros. Los huecos por pruebas/rollback son normales. |
| Funciones de control | EXECUTE directo de `pg_control_system()`; sin roles pg_monitor ni otros roles privilegiados. |

**Hallazgo real:** en el clúster recién inicializado, `has_function_privilege()` devolvía EXECUTE efectivo para las cuatro funciones `pg_control_*` a través de los privilegios iniciales. Para aislar la concesión específica, se revoca ese EXECUTE de PUBLIC **solo en el clúster nuevo**, se comprueba que el arranque se detiene sin él y se concede únicamente `pg_control_system()` al runtime. Después se verifica por SQL que solo esa función está permitida. El ID de sistema facilita identificar una instalación; este grant no concede monitoreo general ni capacidad de modificar el clúster. Los defaults/permisos actuales de principal no se consultaron.

La propuesta `database/security/RELEASE-03A-runtime-role.sql` mantiene su `\quit`: no se ejecutó quitando esa protección. El ensayo usa un procedimiento propio revisado. El archivo sigue siendo una propuesta para otra autorización, no una migración ni instrucción de aplicarlo ahora.

## 5. Corrección mínima demostrada

`usuarios.service.js`, función `prepararAlcanceUsuario()`, valida plataformas con:

```sql
SELECT id_plataforma FROM plataformas
WHERE id_plataforma = ANY($1::int[])
ORDER BY id_plataforma FOR KEY SHARE
```

PostgreSQL requiere un permiso UPDATE para ese bloqueo. Con la propuesta inicial —SELECT/INSERT sobre plataformas—, la actualización de alcance del usuario ficticio recibió 500 y SQLSTATE **42501**. Tras conceder **`UPDATE(id_plataforma)`** exclusivamente en el laboratorio, la misma API funcionó. Se comprobó `has_column_privilege(...)=true` y `has_table_privilege(...,'UPDATE')=false`.

Se añadió ese grant puntual a la propuesta SQL protegida y su justificación. No se otorgó superusuario, UPDATE global o permiso sobre todas las columnas. El backend continúa sin exponer edición de esa PK; no se modificó ninguna PK existente. La cuenta de DB debe mantenerse privada, pues ese permiso de columna es una capacidad SQL real, aunque la API solo lo use para bloquear.

## 6. Funcionalidades y transacciones reales

El Express y los routers/controladores/servicios reales se montan sobre un pool central inyectado al runtime nuevo. La API escucha en loopback/puerto efímero, con JWT ficticio propio y sin workers. Todos los usuarios, catálogos, reservas, operaciones y eventos que reciben escrituras son fixtures nuevos identificados como RELEASE03B/R03B.

Se prueban login/sesión de los tres perfiles, catálogos, alta y modificación de reservas, operaciones/transporte, asignación manual de reserva, selección y cambio de vehículo 12→8 plazas, Daily, Dashboard con fecha explícita, bitácora, historial por los filtros de reservas y plataformas visibles.

Un evento GYG nuevo ficticio se persiste, aprueba y **aplica realmente**: crea una reserva adicional y un vínculo nuevo bajo el runtime. Otro evento FH ficticio con actividad transcurrida se archiva por la API, con motivo/usuario/fecha; se excluye del resumen y sigue en el historial. No son recepciones externas ni prueban Gmail/webhook operativo.

El ensayo registró **59 solicitudes API**, con dos respuestas 500 **deliberadas** —permiso de bloqueo faltante y auditoría retirada para probar rollback— y las denegaciones 403/404 esperadas. Reservas ficticias nuevas **1801/1802/1804**, operación **445**, transporte **427**, evento GYG aplicado **138** y FH archivado **139**. Son IDs internos del laboratorio; no designan unidades físicas ni acciones sobre principal. La reserva 1801 conserva tres entradas nuevas de auditoría. El INSERT revertido deja un hueco de secuencia, no una reserva parcial.

Para comprobar atomicidad de reserva/bitácora se retira temporalmente INSERT de bitácora **del runtime nuevo**, se intenta crear otra reserva ficticia y se espera el fallo; los conteos de reservas y auditoría se mantienen iguales por ROLLBACK. El permiso se restituye en `finally`. No se limpia una reserva parcial ni se eliminan filas para hacer pasar la prueba. Las secuencias pueden avanzar aunque la transacción se revierta.

Las reglas de 12 PAX por grupo/24 por tour-turno, grupos 1/2, turno explícito, mínimo operativo y capacidad física se conservan en código y regresión. No se introduce asignación automática ni se cambia pickup, estados, IDs o catálogo real.

## 7. Denegaciones PostgreSQL

Con el LOGIN runtime real se verifican rechazos SQLSTATE **42501** de CREATE TABLE, ALTER TABLE, DROP, TRUNCATE, DELETE no autorizado, tablas temporales, CREATE ROLE, CREATE DATABASE, membresía del propietario, ALTER ROLE y cambios de privilegios por defecto del propietario.

Las pruebas destructivas se dirigen a una tabla de una **schema de sondeo exclusiva del laboratorio**, con una fila ficticia, o usan `WHERE false`; nunca borran/truncan datos originales. La copia conserva las 18 tablas de aplicación y añade esa tabla técnica fuera de public para sondeo. Las transacciones del ensayo se revierten.

Un GRANT de tabla sin grant option puede producir advertencia en PostgreSQL en lugar de excepción. Se registra su código y se verifica que el ACL de la tabla no cambia; no se interpreta “comando terminó” como elevación efectiva. Los grants/membresías/DDL del administrador están separados de estas pruebas runtime.

## 8. Arranque Electron real mediante harness explícito

`release03bElectron.cjs` abre Electron real, frontend real y backend propio contra el PG nuevo. Importa `startOwnedBackend()` y `runChild()` reales. La inyección está en los scripts de laboratorio, nunca en flags/env del arranque habitual:

- `readConfig()` conserva parser, digest y validación ACL; recibe por opción de función un validador de identidad del laboratorio. Su validador por defecto de producción sigue intacto.
- `verifyPostgresWithIdentity()` comparte transacción, SQL, rol, clúster y esquema con producción. Solo sustituye explícitamente el contraste de identidad/puerto para el laboratorio. `verifyPostgres()` normal siempre utiliza el contrato fijo de principal.
- El adaptador de `createServer()` convierte el bind lógico 3000 solicitado por el componente en `listen(0)` exclusivo y publica el puerto real por IPC privado del harness. Las comprobaciones de nonce/PID/huella/protocolo se ejecutan sin falsear esos valores para los casos válidos. El puerto fijo de producción nunca se abre.
- El pool del hijo se inyecta antes de importar rutas y conecta exclusivamente al PG nuevo. No se cambia el host/puerto del pool normal.
- La ventana tiene perfil propio temporal privado, sandbox, sin Node, aislamiento de contexto y red limitada al origen efímero exacto.

Se ensayan aceptación válida, PID incorrecto, nonce incorrecto, código distinto, base esperada incorrecta, clúster incorrecto, CHECK faltante, rol privilegiado, cierre normal y muerte inesperada del backend. Las discrepancias de DB/clúster se contrastan con consultas reales, no con filas simuladas. Los casos rechazados no abren ventana funcional y terminan solo su hijo. El perfil válido comprueba usuarios ficticios Admin/all/selected en el frontend real y ausencia de campana/resumen para selected.

El propio harness retiene su proceso hasta guardar el resultado del cierre inesperado; eso no cambia el cierre del producto. Las credenciales ficticias de usuarios se entregan por IPC privado desde el driver, sin argv, variables de entorno ni dependencia de stdin GUI de Windows. El nonce no se registra en la evidencia.

**Alcance:** esto acredita los componentes reales con inyección explícita y HTTP efímero. No acredita `electron/main.js` completo, `npm run desktop` con principal ni paquete instalado. No se debilitó el contrato de principal para forzar esa parte.

## 9. Credenciales y ACL

Las credenciales PG/JWT y usuarios del laboratorio se generan aleatoriamente; no se copian de `.env`, DPAPI o almacenes reales. La custodia persistente es DPAPI bajo la cuenta Windows actual. Los archivos `runtime.env`/`privileged.env` contienen solo secretos ficticios de este clúster, bajo ACL de usuario actual/SYSTEM. El password transitorio de initdb se retira; el runtime se habilita solo tras establecer su SCRAM.

El verificador Windows real comprueba archivo y ancestros hasta la raíz. Se demuestra aceptación del archivo privado, rechazo de otro ficticio con lectura Everyone y rechazo de configuración contradictoria. Solo se modifica/restaura la ACL de ese archivo nuevo de prueba; nunca la de LocalAppData, proyecto o instalación habitual.

Los hijos tienen allowlist de Windows y destinos explícitos. Las contraseñas no aparecen en argumentos, JSON públicos o logs. Se revisan salidas de Electron buscando los secretos ficticios antes de persistir diagnósticos; el backend de pruebas conserva códigos/verbos de error, sin parámetros/filas. No se imprimen hashes de autenticación, nombres de clientes originales ni payloads originales. Los perfiles y datos privados quedan conservados para inspección.

La auditoría de cierre revisó 1.623 entradas: cero reparse points, propietarios inesperados o permisos ajenos fuera de los cachés propios. Chromium añadió 82 ACE de su SID de capacidad de sandbox en 68 entradas de Cache, Network y Shared Dictionary de los dos perfiles nuevos; no alcanzan los archivos de configuración, credenciales ni datos PG. Se conservan esas ACL legítimas. Los seis archivos privados vuelven a aprobar el verificador original de archivo/ancestros; no se cambiaron permisos compartidos para conseguirlo.

En la auditoría independiente, el `PSModulePath` heredado del terminal PowerShell de Codex impedía cargar `Microsoft.PowerShell.Security` en Windows PowerShell. El verificador rechazó con CONFIG_ACL, sin aceptar permisos desconocidos. La repetición bajo el entorno limpio que ya utiliza el lanzador y sus hijos —sin ese valor heredado— aprobó los seis archivos. El verificador de producto no se modificó. Un arranque desde otro terminal con ese entorno incompatible queda como observación; no invalida las comprobaciones reales realizadas por los hijos con su allowlist.

## 10. ACCESS-SCOPE

| Perfil ficticio | Comportamiento real probado |
|---|---|
| Administrador | Login, consulta/modificación autorizada, revisión/aplicación/archivo y resumen de eventos. |
| Consulta all | Lectura de reservas/eventos/avisos; modificación y archivo reciben 403. |
| Consulta selected | Solo reservas de la plataforma nueva asignada; detalle de otra plataforma recibe 404; eventos, resumen GET/HEAD y Operaciones reciben 403. No recibe cantidades de avisos ni campana del frontend. |

El token se obtiene por el login real con bcrypt/JWT propios. Backend relee usuario/alcance, no confía en un rol impuesto por el simulador. No se modifican usuarios, roles o asignaciones originales del respaldo.

## 11. Conservación, regresión y cierre

La comparación final repite las firmas de **todas las filas originales de las 18 tablas usando sus columnas originales**, comprueba metadatos de archivo NULL en los 136 eventos originales y las 19 FK después de 017. Los eventos 124/126 no se seleccionan para acciones ni se archivan. Las nuevas filas/vínculos/auditoría pertenecen exclusivamente a fixtures. Las 17 secuencias conservan siguientes IDs seguros; no se renumera ni resetea nada.

La regresión usa `noPostgres.js` y la barrera de red, excluyendo `api.test.js` porque prepara/limpia una base persistente. Incluye RELEASE-03A, nuevos rechazos de laboratorio y PRE-RELEASE-02/03/04/05. **La ejecución final completa aprobó 51 suites y 943 pruebas, cero fallos, en 109,285 s**, registrada en `jest-final.json`. `jest-seguridad.json`, `jest-regresion.json` y `jest-notificaciones-revalidacion.json` conservan comprobaciones previas y el fallo de temporización corregido; no se suman repeticiones como casos distintos.

Al terminar se cierran pools y todos los procesos Electron/backend propios; `pg_ctl stop` solo se ejecuta tras contrastar data/puerto/PID del nuevo clúster. Se verifica ausencia de postmaster.pid/listener propio. No se borra el laboratorio ni los intentos conservados. La información definitiva de pruebas/tiempos se encuentra en `resultado.json`, y la verificación final de archivos/custodia en `verificacion.json`.

**19 grupos de comprobaciones PostgreSQL/Electron aprobados**, incluyendo 13 rechazos SQL, 14 nextval reales y nueve escenarios de Electron. Restauración: **0,709 s**; 017: **0,010 s**; ensayo definitivo completo, incluyendo arranques/cierres: **50,377 s**. No se suman intentos anteriores como pruebas adicionales ni se presentan estos tiempos locales como garantía de operación.

## 12. Archivos y problemas corregidos

Nuevos: `scripts/Release03BLab.ps1`, `scripts/release03b{Safety,Lab,Cases,Child,Electron,ElectronDriver}.cjs`, `backend/__tests__/release03bSafety.test.js`, este informe y `docs/release-03b/`.

Cambios de producto mínimos: opción de validador por inyección en `desktopPolicy.readConfig()` y extracción de `verifyPostgresWithIdentity()` en `desktopPostgres.js`, manteniendo defaults de producción. La propuesta SQL recibe el grant de columna demostrado; su `\quit` permanece. No cambian `electron/main.js`, `electron/ownedBackend.js`, `backend/desktopChild.js`, pool normal, esquema de aplicación, frontend, sesiones o reglas funcionales en esta fase.

Los reintentos conservados documentan incidencias del verificador: supuesto inicial sobre EXECUTE heredado de PUBLIC, llamada de Dashboard sin fecha obligatoria, transporte de entrada GUI por stdin sustituido por IPC, cierre automático del harness antes de guardar evidencia y alias SQL reservado del sondeo. Se corrigió el harness/procedimiento; no datos, esquema histórico, permisos de producción o reglas para acomodar un resultado. Los intentos incompletos permanecen detenidos y no sustituyen la validación definitiva.

También se corrigió la espera del cierre por señal: un hijo terminado puede tener `exitCode=null` y `signalCode=SIGTERM`; no debe esperarse de nuevo un evento ya ocurrido. El frontend/producto no se alteró por ello. En la regresión concurrente, el harness de avisos midió una solicitud all que ya estaba en vuelo al cambiar a selected: ahora espera las consultas all antes de iniciar esa medición, conservando las mismas aserciones estrictas de cero consultas selected y de ausencia de indicador. Cambio adicional de prueba: `backend/__tests__/helpers/notificacionesUiHarness.cjs`.

## 13. Riesgos pendientes y procedimiento para principal

Esta prueba usa un respaldo histórico, no un inventario nuevo de principal ni prueba de recepción externa. No reproduce permisos/roles/servicios Windows del servidor habitual. La cuenta de ejecución compartida depende de las validaciones ACCESS-SCOPE del backend; no se introduce RLS ni acceso SQL al usuario final. El grant de columna y cualquier ajuste de PUBLIC requieren revisar consumidores y permisos efectivos reales.

Antes de principal, mediante otra autorización: revisar esta evidencia y el SQL protegido; inventariar identidad/roles/propietarios/PUBLIC/funciones y autenticación reales; coordinar respaldo final/ventana sin clientes ni proveedores; preparar runtime sin propiedad y credenciales/ACL seguras; autorizar 017 y verificar conservación; ensayar después el arranque habitual con su configuración fija y aceptación de los tres perfiles. El primer intento de `npm run desktop` contra principal y el instalador pertenecen a esa intervención posterior.

**Principal, DEV y puerto 3000 no fueron modificados ni utilizados para pruebas.** Tampoco se cambiaron credenciales reales/ACL habituales, instaladores, integraciones externas, datos originales, commit o push. No se aplican automáticamente estas modificaciones a principal.

## 14. Resultado de esta fase

**RELEASE-03B VALIDADO CON OBSERVACIONES.**

El laboratorio nuevo aprobó las pruebas PostgreSQL/Electron, ACCESS-SCOPE, conservación, permisos y regresión. Quedó detenido, con sus datos privados conservados; los seis intentos previos de esta fase también están detenidos. Las observaciones son el grant puntual requerido por el bloqueo de plataformas, los privilegios iniciales de PUBLIC sobre funciones de control, la incompatibilidad del entorno de módulos del terminal de auditoría y el alcance limitado al harness explícito. El arranque habitual contra principal y el paquete instalado siguen pendientes de una fase autorizada independiente. No se inició otra fase ni se desplegó en producción.
