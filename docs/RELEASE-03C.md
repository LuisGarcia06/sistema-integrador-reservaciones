# RELEASE-03C — Preparación final de principal

Proyecto: Sistema Integrador de Reservaciones — Community Tours Sian Ka’an. Directorio `A:\sistema-integrador-reservaciones`, rama `GYG+FRHB-implementado`, HEAD conservado `23d9ea21c04070aba3a49fd212d6a3106276c3a2`.

**Diagnóstico del 18/10/2026, 09:33 de Cancún —14:33 UTC—. NO LISTO para autorizar el despliegue completo.** La identidad e IPv4 son correctos, pero faltan resolver el alcance de las ACL de Windows y el impacto de TEMP/PUBLIC, preparar runtime/configuración y obtener un respaldo final. Este documento no autoriza ninguna etapa A–F.

## 1. Alcance y evidencia

Se revisaron AGENTS.md, RELEASE-01, PRE-RELEASE-03-PROD/RESTORE, RELEASE-03A/B, contrato de configuración, guardias PostgreSQL/esquema, `electron/main.js`, `electron/ownedBackend.js`, propuesta de runtime, 017 y herramientas de respaldo. Se conservaron los cambios anteriores.

El inventario utilizó exclusivamente una conexión explícita a **127.0.0.1:5432**, con las credenciales existentes en memoria, `dotenv.parse()` sin cargar variables, `default_transaction_read_only=on`, `REPEATABLE READ READ ONLY`, timeouts y ROLLBACK. No importó el servidor, workers ni pool de aplicación. Primero contrastó identidad; solo después consultó catálogos, conteos y estados. No consultó contraseñas de roles, texto de consultas ajenas, payloads, nombres ni datos personales de reservaciones.

Archivos de esta fase:

- `scripts/inspectRelease03c.cjs`: inventario de lectura con entrada obligatoria `--read-only-principal` y rechazo de otros destinos/identidades. No sirve como lanzador ni migrador.
- `docs/release-03c/inventario.json`: resultado completo sanitizado.
- `docs/release-03c/windows.json`, `acl-contrato.json`, `configuracion-flags.json`: listeners, ACL y presencia/compatibilidad de configuración, sin secretos.
- `docs/release-03c/baseline.json` y `verificacion.json`: conservación de fuentes y verificaciones de esta fase.
- Este informe. No se modificaron fuentes funcionales, configuración privada o SQL existente.

Un primer intento se detuvo porque el inventariador comparaba literalmente `127.0.0.1` con `127.0.0.1/32`. Todos los demás identificadores coincidían. Se corrigió únicamente esa representación equivalente, ya admitida por RELEASE-03A, y se repitió la lectura completa. Se conserva `intento-representacion-ipv4.json`. No hubo una sustitución de clúster ni se relajaron puerto, versión o identidad.

## 2. Estado actual de principal

| Elemento | Comprobación actual |
|---|---|
| Base / esquema | `sian_kaan_reservaciones` / `public` |
| Clúster | **7632825987452064788**, histórico correcto |
| PostgreSQL | **18.3**, `server_version_num=180003` |
| Conexión efectiva | **127.0.0.1/32:5432**, IPv4 comprobado por conexión real |
| Usuario actual | **postgres**, superusuario, CREATEDB/CREATEROLE/replicación/BYPASSRLS |
| Propietarios | Base y las 18 tablas: `postgres`; esquema public: `pg_database_owner` |
| Colación / encoding | `Spanish_Mexico.1252` / UTF8 |
| 017 | **Ausente por completo**: ninguna de sus tres columnas, dos restricciones o índice. Guardia completa devuelve SCHEMA_INVALID, como corresponde. No hay ledger que acredite versiones por número. |
| ACCESS-SCOPE estructural | Columna/default/CHECK de alcance y tres restricciones de plataformas visibles presentes |
| Filas | 1.150 reservaciones; 136 eventos; 4 usuarios; 2 roles; 10 operaciones; 10 transportes; 2 vehículos; 8 vínculos; 65 entradas de bitácora |
| Resto de catálogos | 14 tours, 3 países, 5 plataformas, 1 operador, 1 guía, 2 asignaciones de plataforma, 1 equivalencia, 1 estado de sincronización, 0 Daily |
| Integridad estructural | 18 PK, 18 FK, 12 UNIQUE, 15 CHECK; todos validados. 34 índices válidos/preparados. Este inventario no vuelve a certificar por contenido todas las FK/filas. |
| Eventos 124 / 126 | Ambos `approved` / `not_applied`. Solo lectura; no archivo, aplicación o edición. |
| Runtime propuesto | **ctsk_runtime no existe** |

Los conteos coinciden con el respaldo de 17/10/2026 21:21:24 UTC. No se detectaron altas/actualizaciones de reservaciones posteriores según sus timestamps. **Esto no demuestra identidad completa de filas ni ausencia de cambios en otras tablas**; no se exportó ni comparó el contenido íntegro actual. Los TIMESTAMP sin zona y su interpretación de sesión limitan también ese indicador. Se recomienda un respaldo final nuevo aunque los conteos coincidan; es obligatorio si hubo cambios posteriores. No se generó ahora.

## 3. Instancia compartida, PUBLIC y consumidores

La instancia también contiene `isc_playground`, `proyectoPrueba`, `sian_kaan_reservaciones_dev`, `sian_kaan_reservaciones_test`, `postgres` y templates. Se vieron sus entradas de catálogo desde principal; **no se abrió conexión a esas bases ni a laboratorios**.

Solo existen dos roles LOGIN: `postgres` y `sian_kaan_dev_app`. Este último es limitado/NOINHERIT, sin atributos elevados ni membresías. Actualmente puede CONNECT/TEMP en principal por PUBLIC y USAGE en public; no tiene CREATE del esquema/base ni grants sobre las tablas de principal. Las 18 tablas solo muestran grants al propietario; no hay grants de tablas a PUBLIC ni default ACL personalizados. El rol DEV no se reutilizará como runtime de principal.

PUBLIC tiene **CONNECT y TEMPORARY sobre principal**, **USAGE pero no CREATE sobre public**, y **EXECUTE sobre las cuatro funciones pg_control_system/checkpoint/init/recovery**. Por ello una cuenta nueva heredaría TEMP aunque se le hiciera REVOKE individual y aunque fuera NOINHERIT. Los permisos son acumulativos; este comportamiento de PUBLIC está descrito en [PostgreSQL 18, privilegios](https://www.postgresql.org/docs/18/ddl-priv.html).

Consecuencias concretas:

1. La guardia de RELEASE-03A rechaza TEMP efectivo. **La creación del runtime por sí sola no bastaría.** Retirar TEMP de PUBLIC únicamente en principal requiere autorización e inventario actualizado de consumidores. No tocar TEMP en DEV, otras bases ni templates.
2. La revocación de CREATE/public de la propuesta genérica es innecesaria en el estado leído: PUBLIC ya carece de él. Omitirla en el procedimiento adaptado, conservando la comprobación posterior.
3. No se propone retirar CONNECT de PUBLIC, USAGE del esquema ni EXECUTE de las otras funciones de control. Esas revocaciones no son necesarias para este arranque y tendrían otro alcance. El aislamiento SQL de conexiones a otras bases no queda garantizado por el GRANT CONNECT puntual: PUBLIC permite conexiones a otras bases; restringirlas requeriría una revisión HBA separada, sin revocar CONNECT globalmente.
4. `pg_control_system()` está disponible actualmente a cualquier futuro runtime por PUBLIC. Es admisible concederle EXECUTE directo y específico para documentar su dependencia. No necesita superusuario, pg_monitor ni revocaciones adicionales. No se atribuye a la futura cuenta un ensayo de autenticación: todavía no existe.

En la instantánea no había clientes ajenos en ninguna base; solo la sesión de inventario y procesos internos de PostgreSQL. Cero transacciones preparadas y cero locks sobre eventos/usuarios en el punto leído. **No acredita ausencia de consumidores ocasionales**, tareas programadas o programas que se conecten como postgres. El responsable debe confirmar quién utiliza cada base y si necesita TEMP en principal; una observación instantánea no permite resolverlo.

PostgreSQL escucha en `0.0.0.0:5432` y `[::]:5432`, PID observado 6720; `listen_addresses=*`. Las reglas HBA leídas permiten loopback con SCRAM-SHA-256 y no muestran errores. No se cambió escucha, firewall, HBA, servicio ni conexiones; la exposición remota efectiva no se comprobó. Convertir toda la instancia a loopback podría afectar otros programas y queda fuera de esta fase.

## 4. Compatibilidad de código y configuración

RELEASE-03B aprobó 19 grupos PostgreSQL/Electron y 943 pruebas de regresión, con fixtures en otro clúster, sin principal. Es evidencia histórica conservada; no se repitió esa batería ni se inició Electron durante RELEASE-03C. El harness no certifica el arranque habitual o el instalador.

**Confirmado:** la propuesta protegida `database/security/RELEASE-03A-runtime-role.sql` conserva su `\quit` y contiene:

```sql
GRANT UPDATE (id_plataforma) ON TABLE public.plataformas TO ctsk_runtime;
```

Se necesita para `usuarios.service.prepararAlcanceUsuario()` y su `SELECT ... FOR KEY SHARE`. No concede UPDATE de tabla completa; es una capacidad SQL real sobre esa columna, cuya credencial debe permanecer privada. [PostgreSQL 18, SELECT](https://www.postgresql.org/docs/18/sql-select.html) exige UPDATE al menos de una columna para ese bloqueo. No modificar PK ni reglas para evitar ese permiso.

El arranque desde fuentes lee exclusivamente **`A:\sistema-integrador-reservaciones\.env`**; el empaquetado futuro lee `userData/config.env`. `APP_CONFIG_PATH` no cambia esa ubicación en modo normal. El archivo actual:

- Usa `DB_USER=postgres`; no cumple el runtime permitido.
- Carece de APP_ENVIRONMENT, DB_CLUSTER_ID, DB_SERVER_VERSION y DB_SCHEMA_VERSION.
- Contiene ocho claves adicionales de WhatsApp/GYG/FareHarbor que el contrato rechaza. No se imprimieron sus valores; no se activaron proveedores.
- Tiene contraseña/JWT presentes; JWT satisface el mínimo de longitud. Gmail está configurado `false`; hay cutoff y expiración JWT compatible. **Conservar el cutoff y la expiración autorizados sin copiarlos a este informe.** Longitud no demuestra generación segura o custodia.
- `validateConfig()` devuelve CONFIG_INVALID. No se intentó arrancar para comprobarlo.

Configuración objetivo ilustrativa; **los marcadores no son secretos utilizables ni deben guardarse literalmente**:

```dotenv
APP_ENVIRONMENT=principal
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sian_kaan_reservaciones
DB_USER=ctsk_runtime
DB_PASSWORD=<captura privada del nuevo secreto runtime>
DB_CLUSTER_ID=7632825987452064788
DB_SERVER_VERSION=18.3
DB_SCHEMA_VERSION=017
JWT_SECRET=<secreto aprobado mediante custodia privada>
GYG_GMAIL_SYNC_ENABLED=false
```

Opcionales: JWT_EXPIRES_IN e INTEGRATION_DASHBOARD_CUTOFF_AT, conservando los valores actuales autorizados. Una clave por línea, sin duplicados, expansión, multilinea o claves adicionales. Aunque DB_HOST sea `localhost` en el contrato, el pool usa 127.0.0.1 literal. No se modificó ese pin ni el de clúster.

No había nombres de variables heredadas conflictivas en el inventariador; el terminal futuro debe volver a comprobarlos. `PSModulePath` heredado puede impedir cargar el módulo Security en Windows PowerShell y causar CONFIG_ACL; usar una consola limpia compatible, sin cambiar globalmente Windows. El padre Electron valida ACL antes de crear el hijo: la allowlist del hijo no soluciona un entorno incompatible del padre.

## 5. Bloqueo Windows y custodia

El archivo actual permite por herencia Modify a Authenticated Users y a otros SIDs, además de lectura a Usuarios. El contenedor del proyecto permite escritura ajena. **`A:\` también permite Modify a Authenticated Users**, incluyendo derechos que el verificador rechaza en ancestros. No hay reparse points en esta cadena. El verificador real devuelve CONFIG_ACL tanto con el entorno heredado como sin PSModulePath: existe un problema real de ACL, además de la observación de módulos.

**No basta restringir `.env` o bloquear la herencia de la carpeta del proyecto.** La posibilidad de eliminación/sustitución desde un ancestro debe resolverse. No se propone `icacls A:\ /reset`, revocaciones recursivas, cambios indiscriminados de propietarios o una excepción al verificador.

Antes de autorizar C se requiere elegir y revisar:

1. Mantener la ruta A: y autorizar una intervención Windows específica sobre los derechos exactos de ancestros, identificando usuarios/programas afectados, custodia del SDDL y recuperación administrativa. Todavía no existe ese análisis de impacto; **no hay comando de cambio de ACL de A: aprobado**.
2. Autorizar una ubicación de despliegue con toda su cadena segura. Implica acordar cómo se ejecutará `npm run desktop` desde esa ubicación o cambiar explícitamente el contrato de ubicación; no se copia/mueve ahora el repositorio ni se convierte el laboratorio en despliegue. Si se exige la ruta A: sin alterar ancestros, la incompatibilidad permanece.

La cuenta PostgreSQL migradora se mantendrá fuera de `.env`; se propone usar la cuenta administrativa existente únicamente de forma interactiva, en ventana autorizada, sin crear otro superusuario. El runtime no será propietario ni miembro de postgres/pg_*.

El lector actual requiere contraseña/JWT legibles desde un archivo privado; ACL no equivale a cifrado DPAPI. Si la política exige ausencia de secretos persistidos en texto, habrá que autorizar un cambio específico de custodia/lector antes de C; ese soporte no está implementado en el arranque normal. La exposición histórica de ACL justifica evaluar rotación de JWT/credenciales con sus custodios, sin afirmar que hubo acceso indebido. Rotar JWT invalida sesiones, no restablece contraseñas ni usuarios de la aplicación. No reutilizar secretos del laboratorio ni borrar claves de proveedores sin decidir su custodia aparte.

## 6. Convenciones para la intervención futura

**Los comandos siguientes son propuestas, no se ejecutaron.** Cada etapa requiere autorización independiente, responsable, registro privado y conformidad con los criterios de parada. No concatenar etapas en un script de despliegue automático. No usar transcripción de consola al capturar secretos; no poner passwords/JWT en argumentos, URLs, historial o informes.

Preparación común propuesta en una consola Windows PowerShell compatible:

```powershell
Set-Location -LiteralPath 'A:\sistema-integrador-reservaciones'
$r03cPsql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
& $r03cPsql --version
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -in @(3000,5432) } |
    Select-Object LocalAddress,LocalPort,OwningProcess
```

Antes de B/D, abrir una sesión administrativa con prompt de contraseña, sin valores en argv:

```powershell
& $r03cPsql -X -W --host=127.0.0.1 --port=5432 --username=postgres --dbname=sian_kaan_reservaciones --set=ON_ERROR_STOP=1
```

Guardia propuesta dentro de **esa misma sesión psql**, antes de cualquier DDL/GRANT y nuevamente antes de D:

```sql
SELECT current_database()='sian_kaan_reservaciones'
 AND current_user='postgres'
 AND inet_server_addr() = inet '127.0.0.1'
 AND inet_server_port()=5432
 AND current_setting('server_version_num')='180003'
 AND (SELECT system_identifier::text FROM pg_catalog.pg_control_system())='7632825987452064788'
 AS ok \gset r03c_
\if :r03c_ok
\echo 'Identidad principal verificada; continuar solo con la etapa autorizada.'
\else
\echo 'DETENER: identidad inesperada. No ejecutar el siguiente bloque.'
\quit
\endif
SET search_path=public,pg_catalog;
SET lock_timeout='5s';
SET statement_timeout='60s';
```

No guardar secretos en archivos de SQL. `\password` solicita la nueva contraseña de forma privada y evita incluirla literalmente en historial/SQL: [psql, documentación oficial](https://www.postgresql.org/docs/18/app-psql.html). El operador debe verificar además que no hay grabación de pantalla/log de terminal de secretos.

## 7. Etapa A — Respaldo final e integridad

**Previos:** autorización de respaldo y custodia, ventana coordinada sin nuevas escrituras, identidad correcta, herramientas 18.3, espacio suficiente, carpeta privada sin redirecciones y respaldo histórico conservado. A no implica B–F. Repetir el inventario si transcurre tiempo; no asumir vigentes los conteos de este informe.

Comando propuesto, antes de sustituir la configuración actual administrativa:

```powershell
& 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoProfile -NonInteractive -File 'A:\sistema-integrador-reservaciones\scripts\BackupPreRelease03Main.ps1'
if ($LASTEXITCODE -ne 0) { throw 'RESPALDO_NO_VALIDADO: no continuar' }
```

Reutiliza el procedimiento revisado: carpeta run nueva privada, snapshot, dump custom completo y manifest, sin sobrescribir el respaldo anterior. **El helper histórico fija IPv6 ::1**, verifica el mismo clúster/puerto y requiere postgres/configuración histórica; no se cambió a escondidas. La comprobación IPv4 de RELEASE-03C es independiente. Si se exige también IPv4 para el dump, adaptar/revisar el helper en otra autorización antes de A, sin eliminar sus guardias.

Comprobación offline posterior, seleccionando el archivo nuevo generado —no el histórico por costumbre—:

```powershell
$r03cBackup = Read-Host 'Ruta absoluta del NUEVO .backup privado validado'
Get-FileHash -LiteralPath $r03cBackup -Algorithm SHA256
& 'C:\Program Files\PostgreSQL\18\bin\pg_restore.exe' --list $r03cBackup | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'RESPALDO_ILEGIBLE' }
```

**Objetos:** solo archivos nuevos y ACL de esas carpetas nuevas; ninguna fila/esquema/rol PostgreSQL. **Posteriores:** salida 0, PGDMP, hash manifest, TOC, lectura completa/COPY con conteos de snapshot, metadatos, 17 secuencias y huellas privadas de todas las filas/columnas originales para E. El script histórico valida conteos/estructura/secuencias del dump, pero **no genera una comparación de todas las filas actuales pre/post intervención**: completar ese registro privado con la técnica de COPY/huellas de RESTORE/03B, bajo autorización A y sin publicar filas.

El respaldo de 17/10 fue restaurado y ensayado en RESTORE/03B. Esto no acredita automáticamente el archivo nuevo. Si cambia esquema/contenido, hay advertencias o se requiere recuperar un punto nuevo, ensayar el nuevo hash en **otro clúster nuevo autorizado**, con destino manifiesto y colación original; los helpers RESTORE/03B fijan el respaldo histórico y no deben ejecutarse suponiendo que prueban el nuevo. Esta fase no crea ese laboratorio.

**Parada:** destino/ACL/hash distintos, actividad no coordinada, errores/advertencias, conteos incompatibles o custodia no aprobada. **Recuperación:** conservar evidencia/archivo incompleto identificado; no borrar base ni sobrescribir copias; repetir A con autorización en otra carpeta. Dump no incluye contraseñas globales, servicio/HBA, JWT o ACL Windows: registrar esos estados privados antes de B/C y definir custodia externa/cifrada. Copia local no cubre pérdida del equipo/unidad; ubicación externa requiere autorización.

## 8. Etapa B — Runtime y privilegios

**Previos:** A aceptada, inventario vigente, ausencia de ctsk_runtime confirmada, responsable migrador/custodio y decisión firmada sobre TEMP. No ejecutar directamente la propuesta 03A ni quitar su `\quit`. Preparar una transcripción SQL nueva revisada; los bloques de este documento muestran su contenido propuesto.

**Decisión PUBLIC pendiente:** los únicos LOGIN actuales son postgres y sian_kaan_dev_app. La opción conservadora siguiente mantiene TEMP efectivo a los consumidores actuales: postgres conserva propiedad/superusuario; el rol DEV recibe TEMP explícito **solo en principal**, capacidad que ya tiene vía PUBLIC. Esa concesión debe aprobarse con su responsable aunque no amplíe el privilegio efectivo. No modifica DEV. Si se decide que DEV no debe tener TEMP en principal, aprobar expresamente la retirada y omitir ese GRANT; no asumirlo. Si aparecen otros roles/consumidores, detener y rehacer la matriz.

Dentro de la sesión administrativa con identidad verificada, **solo con esa decisión autorizada**:

```sql
BEGIN;
CREATE ROLE ctsk_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
 NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 10;
-- Solo si se aprobó preservar TEMP efectivo del consumidor existente:
GRANT TEMPORARY ON DATABASE sian_kaan_reservaciones TO sian_kaan_dev_app;
REVOKE TEMPORARY ON DATABASE sian_kaan_reservaciones FROM PUBLIC;
GRANT CONNECT ON DATABASE sian_kaan_reservaciones TO ctsk_runtime;
GRANT USAGE ON SCHEMA public TO ctsk_runtime;
GRANT SELECT ON TABLE public.roles,public.usuarios,public.tours,public.paises,
 public.plataformas,public.vehiculos,public.operadores,public.guias,
 public.operaciones_tour,public.transportes_operacion,public.reservaciones,
 public.daily_observaciones,public.bitacora,public.usuario_plataformas_visibles,
 public.eventos_integracion,public.reservas_integracion_link,
 public.equivalencias_tours_externos,public.integracion_sync_estado TO ctsk_runtime;
GRANT INSERT,UPDATE ON TABLE public.usuarios,public.tours,public.vehiculos,
 public.operadores,public.guias,public.operaciones_tour,public.transportes_operacion,
 public.reservaciones,public.daily_observaciones,public.eventos_integracion TO ctsk_runtime;
GRANT INSERT ON TABLE public.paises,public.plataformas,public.bitacora,
 public.reservas_integracion_link TO ctsk_runtime;
GRANT INSERT,DELETE ON TABLE public.usuario_plataformas_visibles TO ctsk_runtime;
GRANT UPDATE(id_plataforma) ON TABLE public.plataformas TO ctsk_runtime;
DO $$
DECLARE item record; seq_name text;
BEGIN
 FOR item IN SELECT * FROM (VALUES
 ('usuarios','id_usuario'),('tours','id_tour'),('paises','id_pais'),
 ('plataformas','id_plataforma'),('vehiculos','id_vehiculo'),('operadores','id_operador'),
 ('guias','id_guia'),('operaciones_tour','id_operacion_tour'),
 ('transportes_operacion','id_transporte_operacion'),('reservaciones','id_reservacion'),
 ('daily_observaciones','id_daily_observacion'),('bitacora','id_bitacora'),
 ('eventos_integracion','id_evento_integracion'),('reservas_integracion_link','id_reserva_integracion_link')
 ) AS allowed(table_name,column_name)
 LOOP
  seq_name:=pg_get_serial_sequence(format('public.%I',item.table_name),item.column_name);
  IF seq_name IS NULL THEN RAISE EXCEPTION 'Secuencia requerida no identificada'; END IF;
  EXECUTE format('GRANT USAGE ON SEQUENCE %s TO ctsk_runtime',seq_name::regclass);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO ctsk_runtime;
COMMIT;
\password ctsk_runtime
```

El nuevo secreto se captura fuera del SQL/argv, verificando SCRAM y custodia. **Mantener NOLOGIN hasta C/D aceptadas.** La habilitación final pertenece a B y necesita confirmación específica antes de E:

```sql
ALTER ROLE ctsk_runtime LOGIN;
```

**Objetos:** un rol de clúster, ACL de principal, sus tablas/columna/14 secuencias y función de control en principal; posible grant TEMP al rol DEV exclusivamente sobre principal. No propiedad, membresías, defaults globales, pg_monitor, revocaciones de funciones o cambios de otras bases. SELECT no elimina ACCESS-SCOPE: sigue siendo responsabilidad del backend; no se introduce RLS.

**Posteriores:** matriz de privilegios efectiva bajo el rol, sin CREATE/TEMP/DDL/propiedad/elevación/grant option, USAGE de 14 secuencias sin UPDATE, bitácora INSERT sin UPDATE/DELETE, DELETE solo en plataformas visibles. `has_column_privilege(...id_plataforma,'UPDATE')=true` y `has_table_privilege(...plataformas,'UPDATE')=false`. Verificar consumidores preservados. **No probar DDL/DML negativos en principal**, ni siquiera CREATE TEMP o nextval: usar consultas has_* y la evidencia aislada de 03B.

**Parada:** rol ya existente, consumidores no confirmados, cualquier permiso efectivo inesperado o cambio de propietarios. **Recuperación:** si sigue la transacción, ROLLBACK. Tras COMMIT, mantener/deshabilitar LOGIN del nuevo rol mediante autorización; reponer exactamente ACL previas según registro, no REVOKE ALL/DROP OWNED. Para volver al TEMP anterior: GRANT TEMP a PUBLIC y retirar solo el grant explícito al DEV añadido por esta intervención, tras comprobar que no existía previamente y con aplicación detenida. Esto vuelve a hacer incompatible el runtime: no iniciar Electron hasta resolver. No borrar el rol o sus dependencias automáticamente.

## 9. Etapa C — Configuración privada Windows

**BLOQUEADA** por la cadena A: y decisiones de custodia. **Previos:** alcance de ACL/ubicación aprobado, acceso administrativo de recuperación probado, SDDL anterior registrado privadamente, custodia de configuración anterior fuera de Git, runtime NOLOGIN y sin consumidores activos. C no autoriza cambiar ACL compartidas por inferencia.

Comandos exactos de evaluación previa propuesta:

```powershell
Get-Acl -LiteralPath 'A:\' | Format-List Owner,AccessToString
Get-Acl -LiteralPath 'A:\sistema-integrador-reservaciones' | Format-List Owner,AccessToString
Get-Acl -LiteralPath 'A:\sistema-integrador-reservaciones\.env' | Format-List Owner,AccessToString
```

**No se incluye un comando para cambiar ACL de A:** falta identificar el impacto y obtener autorización específica. Es un bloqueo real, no un paso que pueda suplirse con un permiso supuesto. Una vez resuelta y aprobada la cadena de directorios, este bloque propuesto restringe **solo el archivo**; no resuelve sus ancestros ni debe usarse como sustituto:

```powershell
$r03cEnv = 'A:\sistema-integrador-reservaciones\.env'
$r03cSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$r03cAcl = New-Object Security.AccessControl.FileSecurity
$r03cAcl.SetAccessRuleProtection($true,$false)
$r03cAcl.SetOwner($r03cSid)
foreach ($r03cAllowed in @($r03cSid.Value,'S-1-5-18')) {
    $r03cIdentity = New-Object Security.Principal.SecurityIdentifier($r03cAllowed)
    $r03cRule = New-Object Security.AccessControl.FileSystemAccessRule($r03cIdentity,'FullControl','Allow')
    $r03cAcl.AddAccessRule($r03cRule)
}
Set-Acl -LiteralPath $r03cEnv -AclObject $r03cAcl
```

Después, captura privada de los campos de §4 mediante herramienta/custodio aprobado, sin escritura de secretos en comandos. La conservación o rotación del JWT y la custodia de claves antiguas de proveedores requieren decisión explícita. No hay un comando con contraseña/JWT literal en este plan. El archivo debe ser de una línea por clave y continuar bajo la ACL aprobada después de guardarlo.

Verificación propuesta, sin conectar PostgreSQL:

```powershell
@'
try {
 const path=require('node:path');
 const p=require('./backend/config/desktopPolicy');
 p.cleanEnvironment();
 p.readConfig(path.resolve('.env'));
 console.log('CONFIGURACION_Y_ACL_VALIDAS');
} catch(e) { console.log(e.code || 'VALIDACION_FALLIDA'); process.exitCode=1; }
'@ | node
```

**Objetos:** solo archivos/ACL exactos aprobados; no usuarios de aplicación ni base. **Posteriores:** lectura por cuenta operativa y rechazo por cuentas ajenas, archivo/ancestros aprobados por el verificador real, sin configuración de proveedores, duplicados o variables heredadas. **Parada:** CONFIG_ACL/CONFIG_INVALID, pérdida de acceso, sustitución desde ancestros o custodia no aceptada. **Recuperación:** restaurar únicamente archivo/SDDL afectados desde la copia privada por el administrador y mantener aplicación detenida; no volver a autorizar el arranque usando postgres o deshabilitando ACL. No ejecutar cambios globales de PSModulePath.

## 10. Etapa D — Aplicación exclusiva de 017

**Previos:** A/B/C aceptadas, autorización D específica, copia final recuperable, ventana sin clientes/proveedores, identidad revalidada y 017 totalmente ausente. Si existe un objeto parcial, definición distinta o 017 completa sin acta conocida, detener y diagnosticar; no repetir IF NOT EXISTS para ocultarlo. Solo el migrador interviene; runtime no ejecuta DDL.

Hash propuesto antes de abrir la sesión administrativa:

```powershell
$r03cMigration = 'A:\sistema-integrador-reservaciones\database\migrations\017_archivo_eventos_integracion.sql'
if ((Get-FileHash -LiteralPath $r03cMigration -Algorithm SHA256).Hash.ToLowerInvariant() -ne '5dd8c57790aa368a3ce2d6be96e2f186db1fbc491e881e21fccbfa07e1bfb817') { throw 'HASH_017_NO_APROBADO' }
```

En la misma sesión psql administrativa que verificó identidad (§6), comprobar sin texto de consultas ajenas:

```sql
SELECT pid,usename,state,xact_start FROM pg_stat_activity
 WHERE datname=current_database() AND backend_type='client backend' AND pid<>pg_backend_pid();
SELECT count(*) AS transacciones_preparadas FROM pg_prepared_xacts WHERE database=current_database();
```

Si hay sesiones no coordinadas o transacciones preparadas, detener; sus responsables deben cerrarlas por su procedimiento. **No usar pg_terminate_backend ni Stop-Process.** Solo después del visto bueno y con search_path/timeouts ya fijados:

```sql
\i 'A:/sistema-integrador-reservaciones/database/migrations/017_archivo_eventos_integracion.sql'
```

**Objetos:** tres columnas nullable en eventos, una FK a usuarios, un CHECK y un índice parcial. El archivo incluye BEGIN/COMMIT; **no** envolver con otra transacción/`--single-transaction`. No UPDATE/backfill, DELETE, seeds, schema.sql, otras migraciones o secuencias.

**Riesgos:** lock de tabla, espera de transacciones, timeout, interrupción/resultado de COMMIT incierto. **Posteriores:** E completa antes de abrir clientes; 19 FK, 16 CHECK y 35 índices esperados, tres NULL en cada evento preexistente, definiciones exactas válidas. **Parada:** cualquier error, espera superior al timeout o desconexión. **Recuperación:** antes de COMMIT, ROLLBACK y comprobar ausencia/estado por catálogo; tras desconexión no asumir rollback ni reejecutar, primero inventariar. Tras COMMIT no borrar columnas ni restaurar automáticamente un dump: mantener ventana cerrada y aplicar el procedimiento de §13.

## 11. Etapa E — Esquema, conservación y runtime

**Previos:** D registrada y B2 —habilitación LOGIN— autorizada con secreto custodiado; configuración/ACL aceptadas. E no registra, cancela, aplica o archiva eventos/reservas. No usar API de login para crear usuarios ni fixtures en principal.

Comando propuesto de comprobación completa del runtime con **el mismo verificador que usa el arranque**, sin Electron/servidor/workers:

```powershell
@'
(async()=>{
 const path=require('node:path');
 const policy=require('./backend/config/desktopPolicy');
 policy.cleanEnvironment();
 const {config:c}=policy.readConfig(path.resolve('.env'));
 const {Pool}=require('pg');
 const pool=new Pool({host:'127.0.0.1',port:5432,database:c.DB_NAME,user:c.DB_USER,
  password:c.DB_PASSWORD,ssl:false,max:1,connectionTimeoutMillis:5000,
  options:'-c default_transaction_read_only=on -c search_path=public,pg_catalog -c statement_timeout=10000 -c lock_timeout=2000'});
 try {
  await require('./backend/config/desktopPostgres').verifyPostgres(pool,c);
  console.log('IDENTIDAD_ROL_Y_ESQUEMA_VALIDOS');
 } finally {await pool.end();}
})().catch(e=>{console.log(e.code||'VERIFICACION_FALLIDA');process.exitCode=1;});
'@ | node
```

Además, en psql `--username=ctsk_runtime -X -W` contra el mismo destino, sin contraseña en argumentos:

```sql
BEGIN READ ONLY;
SELECT has_database_privilege(current_user,current_database(),'TEMP') AS temp_debe_ser_false,
 has_database_privilege(current_user,current_database(),'CREATE') AS create_db_debe_ser_false,
 has_schema_privilege(current_user,'public','CREATE') AS create_schema_debe_ser_false,
 has_column_privilege(current_user,'public.plataformas','id_plataforma','UPDATE') AS update_pk_debe_ser_true,
 has_table_privilege(current_user,'public.plataformas','UPDATE') AS update_tabla_debe_ser_false;
SELECT count(*) AS reservas FROM reservaciones;
SELECT count(*) AS eventos FROM eventos_integracion;
SELECT id_evento_integracion,review_status,application_status,
 archived_at IS NULL AS fecha_archivo_nula,
 archived_by IS NULL AS responsable_archivo_nulo,
 archive_reason IS NULL AS motivo_archivo_nulo
 FROM eventos_integracion WHERE id_evento_integracion IN (124,126);
SELECT count(*) AS eventos_archivados FROM eventos_integracion WHERE archived_at IS NOT NULL;
ROLLBACK;
```

Antes de F todos los eventos existentes deben mantener NULL de archivo y sus estados/filas originales. El simple conteo no basta: comparar privadamente **todas las filas originales usando columnas originales**, usuarios y hashes de autenticación incluidos sin mostrarlos, operaciones, asignaciones, vehículos, vínculos, PK/FK/UNIQUE/CHECK/índices y 17 secuencias contra la instantánea final de A. Leer last_value/is_called e incremento; nunca nextval/setval para verificar. El script `inspectRelease03c` presupone credenciales administrativas anteriores y consulta HBA: **no usarlo como validador runtime después de reemplazar `.env`**.

**Objetos modificados:** ninguno durante E; B2 es la autorización separada indicada. **Parada:** guardia falla, privilegio inesperado, cambio de una fila original, metadatos de archivo no NULL, secuencia insegura o evidencia A incompleta. **Recuperación:** mantener aplicación cerrada, diagnosticar y pedir intervención específica; no corregir filas, PK, secuencias o permisos automáticamente.

## 12. Etapa F — Primera ejecución de Electron

**Previos:** actas A–E, decisión Windows resuelta, código completo/hash aprobado —HEAD no identifica por sí solo los cambios sin commit—, configuración privada, cuenta Windows de operación y personal de aceptación. No se modifica instalador ni se activan proveedores.

Comandos propuestos:

```powershell
Set-Location -LiteralPath 'A:\sistema-integrador-reservaciones'
$r03cListeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -eq 3000 })
if ($r03cListeners.Count -gt 0) {
    $r03cListeners | Select-Object LocalAddress,LocalPort,OwningProcess
    throw 'PUERTO_3000_OCUPADO: identificar al responsable; no detenerlo automáticamente'
}
@'
try {require('./backend/config/desktopPolicy').cleanEnvironment();console.log('ENTORNO_VALIDO');}
catch(e){console.log(e.code||'ENTORNO_INVALIDO');process.exitCode=1;}
'@ | node
if ($LASTEXITCODE -ne 0) { throw 'NO_INICIAR_ELECTRON' }
npm run desktop
```

Solo F autoriza la última línea. Puerto backend **127.0.0.1:3000** y PG **127.0.0.1:5432**; no cambiar puertos para eludir conflictos. La comprobación de listeners es orientativa: el bind exclusivo retenido y la identidad IPC del hijo siguen siendo la protección efectiva frente a carreras. No consultar un `/health` ajeno ni reutilizarlo. Si otro proceso ocupa 3000 entre comprobación e inicio, Electron debe rechazarlo.

**Aceptación inicial:** login con cuentas existentes autorizadas, lectura de reservas/Daily/operaciones, vehículos y grupos correctos; campana/eventos solo para roles permitidos; selected sin integraciones ni cantidades. No archivar 124/126 ni escribir reservas reales para demostrar el arranque. Las pruebas de escritura sintéticas ya existen en 03B; cualquier prueba operativa con escritura en principal necesita autorización explícita. Abrir/cerrar y volver a abrir, comprobar cierre del hijo propio y ausencia de datos obsoletos. No provocar deliberadamente una caída de PG ni matar un backend ajeno en principal.

**Riesgos/parada:** CONFIG_ACL/CONFIG_INVALID/ENV_CONFLICT, PG_ROLE/PG_CLUSTER/PG_IDENTITY, SCHEMA_INVALID, puerto ocupado, IPC inválido o cierre del hijo. No debilitar controles ni cambiar al usuario postgres. **Recuperación:** cerrar por UI solo la instancia propia, mantener aplicación detenida, conservar código/diagnóstico sanitizado y revisar E. No reiniciar proveedores ni servicios por implicación. El paquete instalado y su actualización/Windows siguen pendientes de otra aceptación.

## 13. Recuperación y conservación

La política prioriza conservar el estado actual. **Nunca** limpieza, seeds, reinicialización de usuarios, restablecimiento de secuencias, cambios de asignaciones, archivo/aplicación de 124/126 o reemplazo de principal con una copia de laboratorio.

- Antes de COMMIT de B/D: ROLLBACK en la sesión propia, inventario posterior; no asumir éxito si se interrumpió la conexión.
- B confirmado pero F no iniciada: conservar runtime NOLOGIN o deshabilitarlo por autorización; revertir solamente grants/ACL identificados por el diff privado. Ningún DROP OWNED/REASSIGN OWNED o REVOKE general.
- C fallida: administrador recupera archivo/SDDL exactos desde custodia privada. No exponer la configuración anterior ni usarla como fallback de arranque. Resolver otra ubicación requiere decisión de contrato/ruta.
- D confirmada y datos íntegros: mantener 017; un fallo de UI/configuración no justifica borrar columnas o restaurar datos. Preparar corrección compatible revisada y repetir E.
- Si se necesita recuperar datos: **autorización nueva** para crear un clúster destino nuevo y manifiesto, restaurar el hash final con colación original, comparar todas las filas/relaciones/secuencias y reconciliar cualquier escritura posterior. No hay comando de restauración sobre principal en este plan. `pg_restore --no-owner --no-acl` no recupera roles/propietarios/permisos; mapearlos y validarlos por separado antes de un eventual corte autorizado.
- No volver al backend anterior después de archivar eventos: puede ignorar el archivo y permitir aplicaciones indebidas. No eliminar metadatos para forzar compatibilidad.

El RPO es el instante del respaldo final más la conciliación necesaria; no se fija un RTO con los segundos medidos en laboratorios pequeños. Definir custodios, retención, ubicación externa y recuperación administrativa antes de la ventana.

## 14. Dictamen y ausencia de modificaciones

**RELEASE-03C: DIAGNÓSTICO Y PLAN COMPLETADOS; DESPLIEGUE BLOQUEADO POR PRECONDICIONES.**

Es posible solicitar una autorización acotada de A —nuevo respaldo— tras confirmar custodia/ventana. **No está listo solicitar ejecución conjunta de B–F** hasta resolver:

1. Alcance y recuperación de ACL de la cadena A: o nueva ubicación/contrato de despliegue aprobados.
2. Necesidades de consumidores y decisión explícita sobre TEMP/PUBLIC en principal; no basta la ausencia momentánea de sesiones.
3. Custodia de secretos, runtime separado y configuración estricta aceptada, incluidos cutoff y política de JWT.
4. Respaldo final y evidencia privada de conservación/recuperación aceptados; luego autorizaciones individuales B–F.

**No se ejecutó ninguna etapa A–F, migración, DDL, DML, GRANT/REVOKE, cambio de roles/contraseñas/ACL, dump nuevo, limpieza, cierre de conexiones o Electron.** No se modificaron principal, DEV, laboratorios, `.env`, credenciales, instaladores o integraciones; no hubo commit ni push. PostgreSQL recibió únicamente las consultas y transacciones de lectura descritas; las nuevas escrituras locales son este informe, el inventariador y evidencia sanitizada. Se esperan instrucciones del usuario.
