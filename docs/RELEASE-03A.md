# RELEASE-03A — Arranque de Electron y configuración PostgreSQL

Proyecto: Sistema Integrador de Reservaciones — Community Tours Sian Ka’an. Rama: `GYG+FRHB-implementado`. Referencia Git conservada: `23d9ea21c04070aba3a49fd212d6a3106276c3a2`.

**Código preparado y verificado con simuladores y procesos aislados. No se ejecutó el arranque habitual contra principal. La configuración, el rol y el esquema de principal todavía requieren una intervención posterior autorizada.** No iniciar otra fase automáticamente.

## 1. Diagnóstico

El `ensureBackend()` anterior aceptaba cualquier servicio en `127.0.0.1:3000` que respondiera HTTP 200 y el texto de `GET /`. No acreditaba proceso, código, base ni clúster. Además, `buildBackendEnvironment()` heredaba todo `process.env`; `dotenv.config()` no sobrescribía variables existentes, por lo que podían prevalecer destinos distintos del archivo. La salida completa del backend y excepciones de arranque se enviaban a consola.

RELEASE-01 documentó ACL amplias de `.env` y `DB_USER=postgres`. PRE-RELEASE-03-PROD documentó principal sin 017; PRE-RELEASE-03-RESTORE aprobó el ensayo de un respaldo en otro clúster. **Son antecedentes históricos, no consultas nuevas del estado actual de principal.** No se leyó el contenido de `.env`, ni se probaron sus credenciales durante RELEASE-03A.

Se revisaron AGENTS.md, RELEASE-01 y los informes PRE-RELEASE-03/03-PROD/03-RESTORE/04/05, la configuración, sesiones, SQL 017 y lanzadores protegidos. Se conservaron los cambios pendientes anteriores.

## 2. Archivos de esta fase

| Archivo | Responsabilidad |
|---|---|
| `electron/main.js` | Sustituye salud HTTP por inicio privado; abre UI después de la verificación; cierra ante caída del hijo; mantiene IPC PDF y sandbox. |
| `electron/ownedBackend.js` — nuevo | `startOwnedBackend()`: entorno permitido, nonce, PID, protocolo, huellas, plazos, cancelación y cierre propio. |
| `backend/desktopChild.js` — nuevo | `runChild()`: reserva exclusiva de 3000, validaciones antes de montar Express, red saliente restringida y cierre por desconexión del padre. |
| `backend/config/desktopPolicy.js` — nuevo | Contrato estricto, `readConfig()`, `cleanEnvironment()`, huella del código y diagnósticos sin valores privados. |
| `backend/config/windowsConfigAcl.js` — nuevo | Inspección Windows de archivo, propietario, ACL y cadena de directorios; nunca cambia permisos. |
| `backend/config/desktopConfiguration.js` — nuevo | Configuración privada en memoria, inicializada antes de importar servicios/rutas. |
| `backend/config/desktopPostgres.js` — nuevo | `verifyPostgres()`: transacción de lectura, identidad efectiva y rechazo de rol elevado/propietario. |
| `backend/config/desktopSchema.js` — nuevo | `verifySchema()`: tablas requeridas, alcance 016 y contrato completo de archivo 017. |
| `backend/config/database.js` | Pool central con destino explícito; no carga `.env` por importación. Preserva entradas protegidas conocidas. |
| `backend/server.js` | Exporta la aplicación Express para su dueño; elimina escucha/worker independientes del arranque privado. El inicio directo se rechaza. |
| `scripts/arrancarDevDb02.cjs`, `scripts/probarElectronDevDb03.cjs` | Añaden `--ctsk-mode=dev` al Electron que ya iniciaban. No se ejecutaron aquí. |
| `scripts/arrancarProdAccessTest.cjs`, `scripts/probarProdAccess02b.cjs` | Añaden `--ctsk-mode=principal-test`. No se ejecutaron aquí. |
| `database/security/RELEASE-03A-runtime-role.sql` — nuevo | Propuesta inactiva de rol/permisos, sin contraseñas y con `\quit` al comienzo. No ejecutada. |
| `backend/__tests__/release03a{Policy,Startup,Processes}.test.js` — nuevos | Configuración, identidad, esquema, ciclo de vida y conexiones ficticias. |
| `backend/__tests__/helpers/release03a{Fixtures,Child,NetworkGuard}.cjs` — nuevos | Filas sintéticas, hijo Node con API ficticia y bloqueo de conexiones externas/PG. |
| `backend/__tests__/devDb02.test.js` | Adapta el Electron simulado al argumento explícito de modo. |
| `backend/__tests__/helpers/printBrandingHarness.cjs` | Selecciona la fecha fija del fixture y responde al resumen sintético de avisos. Mantiene las aserciones y el IPC original. |
| `docs/release-03a/` y este informe | Resultados y verificaciones, sin secretos reales. |

No se modificaron frontend funcional, rutas de autorización, reglas de negocio, SQL 017, dependencias, package scripts ni instalador en esta fase. Los otros archivos que aparecen modificados/untracked en Git pertenecen a entregas anteriores y se conservaron.

## 3. Arranque seguro y propiedad de 3000

1. Electron obtiene su bloqueo de instancia. Una segunda instancia no inicia backend ni abre otra ventana.
2. Comprueba conflictos de ambiente y configuración determinista, incluidos ACL, antes de leer secretos. Calcula su huella esperada.
3. Crea su propio hijo con el ejecutable absoluto de Electron, `ELECTRON_RUN_AS_NODE=1`, entrada `backend/desktopChild.js` y descriptor privado `ipc`. No usa shell ni argumentos con credenciales.
4. Envía por IPC una solicitud `boot`: nonce criptográfico de 32 bytes, PID padre, protocolo, ruta fija de configuración y huellas. **No envía contraseña ni JWT.**
5. El hijo comprueba su padre/IPC y realiza un único `listen({host:'127.0.0.1',port:3000,exclusive:true})`. Conserva ese mismo servidor hasta cerrar. Durante las verificaciones devuelve 503 genérico, sin servir la UI/API funcional.
6. El hijo relee/verifica la configuración, código y PostgreSQL. Solo entonces monta el Express existente y confirma `ready` por el mismo IPC, con nonce, PID propio, protocolo, huellas, entorno y puerto esperados.
7. El padre contrasta la respuesta con **el objeto ChildProcess que acaba de crear**, vuelve a calcular la huella y permite abrir `/app/`.

No hay comprobación HTTP de salud ni paso de “comprobar y liberar puerto”. La reserva retenida elimina esa carrera. Un `EADDRINUSE` cancela el arranque con el mensaje de puerto ocupado; no se consulta, reutiliza o termina al dueño ajeno. `GET /` conserva su respuesta histórica pero ya no acredita identidad.

La huella SHA-256 incluye nombres/contenido del backend y frontend desplegados y la versión del protocolo; excluye pruebas y configuración. No depende de `package.json` en `app.asar.unpacked`. Detecta código distinto o modificado durante el inicio; **no sustituye una firma digital ni protege contra alguien que controla la misma cuenta Windows y puede modificar el programa**. La calificación del paquete instalado sigue pendiente.

## 4. Verificación PostgreSQL

El contrato protegido exige explícitamente principal, localhost/5432, `sian_kaan_reservaciones`, versión 18.3, esquema 017 y clúster histórico `7632825987452064788`. El pin histórico se contrasta tanto con el archivo protegido como con la respuesta real: no permite omitir ACL/configuración.

El pool normal conecta a **127.0.0.1:5432**, IPv4 literal de localhost, sin DNS ni alternativas. Dentro de `BEGIN READ ONLY` se comprueban:

- `current_database()` y `current_user` frente al archivo.
- `inet_server_addr()` igual a 127.0.0.1 —incluida su representación `/32`— y `inet_server_port()=5432`.
- Esquema efectivo `public` y `server_version_num=180003`.
- Permiso de ejecución y resultado de `pg_catalog.pg_control_system()`. El identificador debe coincidir; **sin permiso se detiene**, sin GRANT automático ni fallback.
- Ausencia de superusuario, creación de roles/bases, replicación, bypass RLS, membresías privilegiadas `pg_*`, propiedad de base/esquema/relaciones públicas y privilegios CREATE/TEMP incompatibles.
- Contrato de esquema descrito abajo. Siempre ROLLBACK y liberación de conexión; ningún DDL/DML de arranque.

El pool mantiene tiempo de conexión y consultas acotado a 5 s, `max=5` y `search_path` explícito. Una conexión inaccesible o una comprobación no verificable impide abrir la UI. No solicita credenciales alternativas ni intenta DEV. Es una verificación de arranque; antes de mantenimiento o sustitución de PostgreSQL debe cerrarse la aplicación. No se certificó una reconexión después de cambiar un clúster en operación.

## 5. Contrato de esquema y 017

La guardia normal nueva comprueba el conjunto de las 18 tablas requeridas, columna/default de alcance de usuarios, su CHECK y las tres restricciones identificadas de la tabla de plataformas visibles. No pretende una comparación íntegra de todas las columnas/índices del esquema histórico.

Para **017** comprueba los tres campos con sus tipos exactos, nullable y sin defaults; FK validada/no diferible a `usuarios(id_usuario)`, sin cascadas; CHECK validado/no diferible con expresión completa de metadatos/motivo/estados; índice parcial no único válido/preparado con columnas, orden y predicado exactos. Cambiar nombres solamente no satisface el contrato. La normalización admite las representaciones equivalentes conocidas de ARRAY/casts VARCHAR/text, conservando operadores, paréntesis, literales y límites.

`schemaArchivoEventos.js` se conserva para sus consumidores históricos. El arranque habitual utiliza la guardia más completa `desktopSchema.js`. **Ninguna guardia ejecuta 017 ni repara objetos.** Una representación de catálogo no reconocida falla cerrada y debe revisarse en un entorno autorizado, sin debilitar la validación para forzar el inicio.

Hash de 017 conservado: `5dd8c57790aa368a3ce2d6be96e2f186db1fbc491e881e21fccbfa07e1bfb817`. No se requiere una migración adicional para RELEASE-03A.

## 6. Política de configuración

Ubicación única, sin fallback ni `APP_CONFIG_PATH` normal:

- Fuentes, `npm run desktop`: `.env` de la raíz real del proyecto, independientemente del directorio de trabajo.
- Aplicación empaquetada futura: `app.getPath('userData')/config.env`.

No se creó, copió ni editó ninguno de esos archivos. El contrato de una línea por clave rechaza duplicados, claves desconocidas, `export`, multilinea y campos obligatorios ausentes. Se usa `dotenv.parse()`, sin expansión ni carga automática. Las claves admitidas son:

```text
APP_ENVIRONMENT=principal
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sian_kaan_reservaciones
DB_USER=<rol_runtime_limitado_aprobado>
DB_PASSWORD=<secreto_propio_no_incluido_en_este_informe>
DB_CLUSTER_ID=7632825987452064788
DB_SERVER_VERSION=18.3
DB_SCHEMA_VERSION=017
JWT_SECRET=<secreto_propio_de_al_menos_32_caracteres_no_blancos>
GYG_GMAIL_SYNC_ENABLED=false
```

Esto es **un contrato ilustrativo, no un archivo listo para usar**. Los placeholders no deben copiarse como secretos. Se admiten opcionalmente `JWT_EXPIRES_IN` de 1h a 12h —default 8h— e `INTEGRATION_DASHBOARD_CUTOFF_AT` ISO explícito. Conservar el cutoff autorizado para no alterar la clasificación histórica de pendientes.

Se rechazan variables heredadas `DB_*`, `PG*`, `APP_*`, JWT, GYG/GETYOURGUIDE, FareHarbor, Google, WhatsApp, INTEGRATION, proxies y opciones/rutas/CA adicionales Node, incluso si aparentan coincidir. Un `NODE_ENV` presente debe ser production. El diagnóstico no imprime sus valores. Las demás variables ajenas no se pasan al hijo.

Allowlist Windows: PATH/PATHEXT para herramientas del sistema; SystemRoot/WINDIR/SystemDrive/COMSPEC para Windows; TEMP/TMP para temporales; USERPROFILE/APPDATA/LOCALAPPDATA/HOMEDRIVE/HOMEPATH para perfil y runtime; ProgramFiles/ProgramFiles(x86)/ProgramData/ALLUSERSPROFILE para ubicaciones del sistema; USERNAME/USERDOMAIN para contexto Windows. Se añaden únicamente `ELECTRON_RUN_AS_NODE=1` y `NODE_ENV=production`. **Contraseña/JWT/proveedores no están en argv ni en el entorno heredado del hijo.** El JWT se publica solo en la memoria de ese proceso después de validar el archivo, para conservar el contrato actual de autenticación.

Las modalidades históricas requieren coincidencia de su variable y argumento explícito `--ctsk-mode=dev` o `--ctsk-mode=principal-test`, fuentes y sus propias guardias. Una variable heredada sola no carga archivos de laboratorio. Los cuatro lanzadores se actualizaron, pero no se ejecutaron ni se revalidaron con sus bases en esta fase. `npm start`/`node backend/server.js` ya no inicia una API independiente: informa que se necesita el arranque privado. Importar servicios sin configuración privada no permite consultar un pool por defecto.

## 7. Credenciales, ACL y errores

Antes y después de leer, se inspeccionan el archivo y sus directorios hasta la raíz, rechazando reparse points/UNC, propietarios no confiables y permisos no verificables. Archivo: sin lectura/escritura ajena; contenedor: sin escritura ajena; ancestros: sin capacidad ajena de borrar/sustituir o cambiar DACL/propietario. Se confía en el usuario Windows actual, SYSTEM, Administradores y TrustedInstaller. Una regla ALLOW amplia se rechaza conservadoramente aunque exista también DENY; no se intenta calcular una excepción permisiva.

PowerShell se ejecuta oculto con script constante, ruta por stdin y diagnóstico por código de salida; no recibe contenido ni secretos. No utiliza Set-Acl/icacls para modificar nada. Se probó su parser real y el archivo ficticio ausente; los escenarios ACL restante se simularon. **No se acredita una ACL segura actual de `.env`.** El hallazgo histórico de RELEASE-01 permanece pendiente.

Remediación futura autorizada: inventariar propietarios/permisos efectivos del archivo y cada ruta; registrar el estado previo sin leer secretos; definir la cuenta Windows de operación; restringir herencia/reglas amplias del archivo y contenedor, manteniendo solo las cuentas administrativas aprobadas; impedir sustitución por otros usuarios en ancestros; comprobar acceso efectivo y recuperación administrativa. Si eso afecta directorios compartidos, revisar otra ubicación/configuración antes de tocar ACL de forma general. Volver a probar el validador. No modificar automáticamente la raíz del disco ni todos los permisos del proyecto. Evaluar por separado la rotación de secretos indicada en RELEASE-01.

stdout/stderr del hijo normal no se reenvían. El IPC de error usa un catálogo cerrado de códigos; la UI/consola del padre no vuelca excepciones, contraseña, JWT, nonce, huellas de configuración ni respuesta PostgreSQL. No se añade un endpoint de identidad/diagnóstico privado.

## 8. Rol limitado y mantenimiento

La propuesta SQL permanece inactiva por `\quit`; no ejecutarla ni quitar ese cierre automáticamente. Crea un rol **NOLOGIN**, sin atributos elevados ni membresías, para habilitarlo solo después de contraseña privada, autenticación SCRAM, ACL, permisos y revisión autorizados. No contiene una contraseña real ni instrucción automática de activación.

| Datos/consumidor | Privilegios propuestos |
|---|---|
| 18 tablas existentes; login, sesiones, Dashboard, Daily, historial y notificaciones | SELECT. El alcance de cada usuario sigue validándose en backend; la cuenta PG compartida no sustituye ACCESS-SCOPE. |
| Usuarios, tours, vehículos, operadores, guías, operaciones, transportes, reservas y Daily | INSERT/UPDATE según servicios actuales; sin DELETE. |
| Países/plataformas | INSERT; sin UPDATE/DELETE no utilizados por los servicios actuales. |
| Bitácora | SELECT/INSERT; sin alterar/eliminar auditoría. Las transacciones de negocio se conservan. |
| `usuario_plataformas_visibles` | SELECT/INSERT/DELETE, requerido por reemplazo transaccional de las asignaciones administrativas. |
| Eventos | SELECT/INSERT/UPDATE para persistencia, revisión, aplicación y archivo; sin DELETE. Conceder privilegios no activa receptores. |
| Vínculos externos | SELECT/INSERT; sin UPDATE/DELETE. |
| Equivalencias | Solo SELECT; mantenimiento fuera del runtime. |
| Estado de sincronización Gmail | Solo SELECT en esta propuesta. Su futura activación necesita revisión separada de INSERT/UPDATE y secuencia; no concedidos ahora. |
| 14 secuencias de tablas con INSERT | USAGE exclusivamente, resueltas por `pg_get_serial_sequence`; no setval/UPDATE, grants globales ni defaults para objetos futuros. |
| Identidad | EXECUTE directo de `pg_catalog.pg_control_system()`, si el administrador lo autoriza; sin pg_monitor/superusuario. |

No se concede propiedad, DDL, TRUNCATE, TRIGGER, REFERENCES o WITH GRANT OPTION. La cuenta propietaria/de mantenimiento se conserva fuera del archivo de aplicación; su autenticación y custodia se revisan durante la intervención. No se transfieren propietarios ni se crea un segundo superusuario para la app.

TEMP suele venir de PUBLIC; revocarlo solo a runtime no basta. El SQL propone retirar TEMP de PUBLIC y CREATE del esquema público, **con inventario previo y reotorgamiento explícito a otros consumidores que lo necesiten**. Son cambios compartidos que requieren revisión, no una recomendación de ejecutarlos ahora. La guardia rechazará permisos heredados incompatibles. No se verificaron grants/propietarios/pg_hba actuales contra una base real ni se certificó ejecución del SQL de propuesta.

## 9. Pruebas y evidencia

La ejecución usa `noPostgres.js` para sustituir pg y `release03aNetworkGuard.cjs` para impedir red externa/5432/55473. Se excluye `api.test.js`, que prepara/limpia una base persistente. Los procesos hijo nuevos de la prueba prohíben pg, dotenv, Google y **toda conexión saliente**, usan configuración/filas en memoria y HTTP efímero propio. No leen secretos ni reutilizan los laboratorios anteriores.

Los 20 escenarios solicitados tienen cobertura: puerto lógico 3000 libre/ocupado; salud idéntica; otro ambiente; PID/nonce/protocolo/versión incorrectos; base/clúster diferentes; ambiente contradictorio; configuración/secretos ausentes; PG inaccesible; 017 ausente/parcial/válida; salida inesperada; cierre normal; cancelación/timeout; roles; errores sin credenciales. **3000 se comprueba mediante simulación del contrato listen; la comprobación adicional con sockets reales usa puertos efímeros.** Nunca se ocupa o consulta un 3000 ajeno.

El testigo HTTP real devuelve el texto histórico pero recibe cero solicitudes; el intento de bind del hijo falla y el testigo sigue vivo. Otro recorrido intercambia IPC con un hijo Node real, consulta exclusivamente su API ficticia, cierra y confirma puerto liberado. El main real se ejecuta en VM con Electron simulado; los recorridos funcionales de UI/PDF utilizan Electron real con APIs ficticias. No se presenta eso como arranque normal de Electron con PostgreSQL principal.

Incidencia de regresión resuelta: el harness de impresión tenía respuesta fija del 16 de octubre y selector predeterminado del día actual. La comprobación original del IPC rechazó la discrepancia. Se selecciona ahora la fecha del fixture y se responde al resumen de avisos vigente. No se relajaron permisos ni se modificó el IPC del producto; su contenido se comparó con HEAD y es idéntico.

Los JSON de `docs/release-03a/` conservan ejecuciones iniciales/fallidas y verificaciones posteriores; no deben sumarse reintentos como pruebas nuevas. El resultado final y los conteos consolidados se registran en `resultado.json`. `verificacion.json` comprueba sintaxis de los 21 JS/CJS modificados/nuevos, hash intacto de 017 e IPC PDF intacto.

**Resultado consolidado: 50 suites y 923 pruebas distintas aprobadas, cero fallos en la última ejecución de cada suite.** No es una sola ejecución completa verde: `jest-final.json` registró 49 suites aprobadas y cuatro fallos de la suite nueva de arranque, al instalar un manejador genérico antes del error específico de bind. Se corrigió el orden; `jest-arranque-final.json` aprobó las tres suites de arranque completas —113 pruebas—, sustituyendo sus resultados anteriores. Las otras 47 suites quedaron aprobadas en la regresión completa, incluido PDF, PRE-RELEASE-02/03/04/05, sesiones, roles, capacidad y WhatsApp deshabilitado. `resultado.json` identifica la ejecución de origen de cada suite.

Comando de reproducción, únicamente para la misma regresión simulada:

```powershell
Set-Location 'A:\sistema-integrador-reservaciones'
node node_modules/jest/bin/jest.js --runInBand --no-cache --testPathIgnorePatterns backend/__tests__/api.test.js --setupFiles ./backend/__tests__/helpers/noPostgres.js ./backend/__tests__/helpers/release03aNetworkGuard.cjs
```

## 10. Compatibilidad y límites de aceptación

Se conservaron rutas, roles, sesiones, revalidación, Dashboard, reservas, historial, bitácora, Daily/PDF y componentes de PRE-RELEASE-02/03/04. No se cambia el máximo 12/24 PAX, mínimo de vehículo, grupos/turnos, IDs, catálogo, pickup individual ni asignación manual. La vista previa PRE-RELEASE-05 conserva su entrada separada.

El backend normal no arranca el worker Gmail, no acepta configuración de proveedores y restringe red Node saliente a PG local; la sesión Chromium normal permite solo el origen propio y deniega permisos externos. WhatsApp conserva su deshabilitación existente. Recepción/autenticación externa y despliegue de integraciones siguen siendo otra fase. No se considera una reserva sintética evidencia de recepción real.

Quedan pendientes validación de los metadatos reales con el rol mínimo en un entorno autorizado, evaluación de planes/tiempos con los límites de 5 s, pruebas de instalación/paquete y aceptación humana. No se cambia la política para permitir el arranque si esas comprobaciones fallan.

## 11. Intervención e instalación posteriores

Solo con nueva autorización específica:

1. Revisar esta entrega, destino, código aprobado, cuentas Windows/PG y ventana sin clientes/proveedores. Conservar respaldo reciente y procedimiento de recuperación aprobado.
2. Inventariar PUBLIC, membresías, propietarios, funciones, autenticación y consumidores; revisar el SQL propuesto y ensayarlo en un entorno nuevo autorizado antes de principal.
3. Acordar/realizar la remediación ACL y generación/custodia de secretos, sin sobrescrituras ni copias públicas. Preparar la configuración estricta en su ubicación determinista. No usar postgres como runtime ni copiar ciegamente la `.env` anterior con claves de proveedores.
4. Coordinar 017 en principal mediante su fase separada: respaldo/destino comprobados, parada, SQL aprobado y verificación de conservación. RELEASE-03A no la aplica.
5. Verificar grants mínimos/identidad y habilitar LOGIN únicamente después de autenticación/configuración seguras. Conservar la cuenta de mantenimiento fuera del runtime.
6. En consola de operación sin variables conflictivas, y una vez aprobados los pasos anteriores, probar `npm run desktop`. Revisar login y los tres perfiles, operaciones, Daily/PDF, archivo y avisos. No reutilizar un backend existente en 3000.
7. Calificar el paquete/instalador en otra fase. No se generó ni modificó uno aquí. La activación de Gmail/FareHarbor/WhatsApp sigue sin autorización.

No se ejecutó este procedimiento. La aplicación habitual debe detenerse con la configuración anterior si es insegura/incompleta, el rol sigue elevado o falta 017; **eso no es una validación de principal ni una invitación a saltar la guardia**.

## 12. Cierre

No hubo conexiones a PostgreSQL principal, DEV ni laboratorios anteriores. No hubo migraciones/restauraciones, escrituras en reservas/eventos reales —incluidos 124/126—, limpieza, cambios de contraseñas/ACL, sincronizaciones externas, instaladores, commit o push. Se mantuvieron la rama y HEAD originales.

**RELEASE-03A IMPLEMENTADO CON OBSERVACIONES.** Validación realizada en el alcance aislado descrito; configuración/rol/esquema principal, prueba operativa e instalación quedan pendientes de autorización y revisión del usuario.
