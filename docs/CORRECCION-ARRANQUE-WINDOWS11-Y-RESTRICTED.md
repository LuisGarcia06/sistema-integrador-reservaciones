# Arranque Windows 11 y asistente Restricted — resultado

31 de octubre de 2026. `synthetic-acceptance-only`; `productionAuthorized=false`.
**N-04 en pausa. Correcciones en fuentes, sin modificar instalaciones existentes.**

## Diagnóstico del cierre de Community Tours

Se revisaron dos entradas diferentes. El cliente de `2e7-candidate-04` tiene su
propia entrada en `client/runtime/resources/app/electron/main.js`; no es la misma
entrada de desarrollo `electron/main.js` del repositorio. Esta última intenta
iniciar un backend propio usando `.env` o `config.env` y tiene otras condiciones
de rechazo. Falta confirmar cuál acceso directo/ejecutable se lanzó en la VM.

Secuencia confirmada del cliente distribuido:

1. Restringe módulos, argumentos peligrosos y entorno.
2. Exige exactamente un `--ctsk-descriptor` y un `--ctsk-trust`. Los accesos directos
   NSIS apuntan a archivos externos en `ctsk-client026-<release>`.
3. `readClient` verifica rutas, ACL, autoridad vigente, inventario, descriptor
   firmado, identidad del paquete y certificados. No genera configuración faltante.
4. Instala confianza TLS local y consulta `/api/installation` con nonce; comprueba
   firma e identidad de instalación/servidor antes de permitir la interfaz.
5. Crea la ventana y carga `/app/`. El cliente no inicia ni aprovisiona PostgreSQL.

**Defecto confirmado de diagnóstico:** el catch distribuido solo escribe
`CLIENT026_REJECTED <código>` en stderr y llama a `app.quit()`. Los accesos directos
gráficos no muestran ese texto. Las validaciones de entorno/opciones también estaban
fuera de ese catch. Además anunciaba READY sin esperar la promesa de `loadURL`.

**Cierre esperado de seguridad:** sin argumentos aparece `PUBLIC_DESCRIPTOR_REQUIRED`;
con rutas del acceso directo cuyos archivos no existen puede aparecer `ENOENT` antes
de la ACL. No es prueba de fallo del runtime: falta aprovisionamiento/configuración.
ACL no acreditada, inscripción caducada, integridad alterada, servidor apagado o
identidad/TLS inválidos también deben impedir abrir la aplicación.

**Hipótesis pendiente para la VM concreta:** falta el código del cierre observado.
No se declara confirmada falta de configuración, caída GPU, renderer o antivirus.
Una ventana breve por sí sola no permite distinguirlas.

## Correcciones del cliente

Se promovió la entrada distribuida a una fuente mantenible nueva:
`electron/enterprise026Main.js`, reutilizando ventana, preload, restricciones e IPC/PDF
originales. `enterprise026Startup.js` añade clasificación pública cerrada y mensaje
gráfico que espera a que el usuario lo lea. La configuración inexistente queda como
`CLIENT_CONFIGURATION_REQUIRED`; archivos presentes siguen pasando por `readClient`:
la comprobación de presencia no sustituye ACL, firmas, inventario o HTTPS.

Los rechazos de entorno/opciones entran ahora en la misma ruta de diagnóstico. Se
espera la carga de página antes de READY, se distingue `CLIENT_PAGE_LOAD_FAILED` de
`CLIENT_RENDERER_GONE` y se detiene la conexión propia al rechazar. No se muestran
secretos, stderr, rutas privadas o texto arbitrario de excepciones. Sandbox y demás
protecciones permanecen. `prepare-path-candidate.cjs` copia estas fuentes solo a una
derivación futura nueva; no se ejecutó ni se recompiló un candidato.

## POLICY_BLOCKED del asistente: operaciones concretas

| Operación heredada | Dependencia | Resultado de esta corrección |
| --- | --- | --- |
| Primera verificación de servidor/cliente | `Verify-Payload.ps1` invocado con `-File` | Sustituida en la entrada activa por `payload.cjs` y hashes desde Node; no se ejecuta PowerShell |
| Identidad VM/usuario | CIM y SID mediante `-EncodedCommand` en context | Retirada de la entrada activa; pendiente lector nativo válido, nunca inferida de variables de entorno |
| ACL de programas y secretos | `Get-Acl`, SID, propietario, herencia y ancestros en PowerShell codificado | No sustituida por fs.access/mode; devuelve bloqueo explícito `NATIVE_SECURITY_REQUIRED` antes de escritura |
| Crear directorios privados | `private-directories.ps1` con DACL al crear | No ejecutable desde el flujo nuevo hasta disponer de creación/lectura ACL nativa segura |
| Inicializar y configurar cliente | `Maintain-Server.ps1` envuelve `tools/maintenance.cjs`; este conserva validaciones ACL | Etapas bloqueadas; invocar Node directamente no elimina por sí solo la dependencia ACL interna |
| Arranque y comprobación servidor | `Start-Server.ps1` envuelve `tools/server-control.cjs` | No se inicia; pendiente identidad/ACL/servicio opción C |
| Consolas de bootstrap/servidor | Lanzador codificado y `console-stage.ps1` | Retirados de la entrada activa; no se sustituyen por un shell nuevo ni contraseña en argumentos |
| Control PostgreSQL heredado | `shared/windowsProcess.js` usa PowerShell codificado | Sigue pendiente fuera de esta corrección; ningún flujo nuevo lo invoca |

El fallo reportado `POLICY_BLOCKED` concuerda con la llamada a `Verify-Payload.ps1`
y se reproduce con el setup-02 congelado bajo mocks Restricted. Los scripts
bloqueados no se reparan mediante Bypass, codificación o cambio de política.

`readiness.cjs` hace ahora únicamente lectura: Windows 11 x64, entorno, inventario
del helper y árbol completo de ambos payloads, digest fijado y release correspondiente.
No ejecuta `--version` ni PostgreSQL. Su resultado es **verified=false**, con las
comprobaciones nativas pendientes identificadas. UI e IPC no convierten un resultado
parcial en permiso para crear carpetas o aprovisionar. Tampoco se lee un estado
privado existente sin acreditar su ACL, ni se resetea ese estado en disco.

El coordinador anterior se conserva como evidencia. Sus etapas de escritura no
están disponibles en la entrada nueva hasta integrar la vía nativa de seguridad.
Esto corrige el mecanismo inicial bloqueado y la explicación al usuario; **no
declara resuelta la instalación completa con Restricted**.

El worker se espera con `close`, tras vaciar pipes, y no se acepta éxito con salida
no cero/señal. Al vencer su timeout se termina únicamente el hijo propio. Estas
modificaciones no controlan procesos por nombre o PID encontrado externamente.

## Archivos de código

- Cliente: nuevos `electron/enterprise026Main.js`, `electron/enterprise026Startup.js`;
  integración futura en `scripts/windows-installers/prepare-path-candidate.cjs`.
- Asistente: `coordinator.cjs`, nuevos `readiness.cjs` y alias `payload.cjs`,
  `main.js`, `policy.cjs`, `ui/app.js`, lista de fuentes en `build-helper.cjs`.
- Demo parcial existente: `scripts/preview/main.cjs`, `controls.js` y nuevo
  `windows11-contract.cjs`. Sin cambios en frontend, backend productivo o bases.
- Regresión: `startup-repair.test.cjs`, `readiness.test.cjs`, `partial.test.cjs`,
  `ui.test.cjs`. `coordinator.test.cjs` queda explícitamente como regresión histórica
  contra la copia previa; `restricted-policy.test.cjs` usa setup-02 distribuido.

## Pruebas y prueba parcial preparada

**311 pruebas aprobadas, cero fallos y omitidas.** Registro `tests-safe.tap` en la
evidencia. El guard impide procesos, sockets/listeners y workers reales. Electron,
TLS y procesos se simulan. La API sintética se invoca por su handler, sin abrir
puerto. Se prueban falta de configuración, ACL/autoridad/integridad inválidas,
servidor no disponible, fallo de página/renderer, mensajes sin secretos, orden de
READY, inventario alterado, SO ambiguo y bloqueo de escritura tras preflight parcial.
Los modelos históricos no acreditan funcionamiento nativo.

Se preparó **P-01**, reutilizando la demo existente: frontend original + API HTTP
sintética en memoria, sin cargar Express productivo, pg, .env o proveedores. El
kit contiene copia íntegra del runtime existente Electron 43.4.1 y fuentes
seleccionadas; no un instalador ni candidate-05/setup-03. No se ejecutó Electron
en el anfitrión ni en la VM. Se mantiene inventario de fuentes/runtime y SHA del ZIP.

[Procedimiento P-01, permisos y efectos](PRUEBA-PARCIAL-WINDOWS11-SIN-POSTGRESQL.md).
Permite revisar una apertura de interfaz sin esperar el clúster completo. Su resultado
no se extenderá a Express, PostgreSQL, HTTPS real, bootstrap o persistencia.

## Qué falta para abrir cada aplicación en Windows 11

| Aplicación/alcance | Siguiente paso exacto |
| --- | --- |
| P-01 parcial | Revisar el procedimiento y ejecutar manualmente el kit en la VM. Confirmar apertura estable, entrada ficticia, lectura de una pantalla y cierre/reapertura. No requiere aprovisionamiento |
| Cliente instalado actual | Identificar el acceso directo/versión y código de rechazo. No parchear su payload. Para abrir el cliente integral necesita descriptor/autoridad vigentes y ligados a su inventario, ACL verificadas y servidor HTTPS con identidad válida |
| Cliente corregido en fuentes | Validación gráfica nativa del mensaje y renderer; transferencia futura controlada con inventarios nuevos, sin sobrescribir candidatos. No se autoriza construir instaladores todavía |
| Asistente corregido en fuentes | Validar el preflight Node en layout verificado dentro de la VM. Para superar la etapa parcial faltan lector nativo de identidad/ACL y prerrequisitos acreditados; para escribir, creación privada, primer token/contención y servicio/identidad/parada de opción C |
| Instalación integral | Integrar esos controles y flujos Restricted, luego procedimiento autorizado de clúster nuevo sintético, T0, primer Administrador seguro, HTTPS/login y cierre/reinicio. No sustituir controles por spawn simplificado |

No se implementa un depurador completo ni se usa/reconstruye el componente en
cuarentena. Se conserva el bloqueo de información incompleta. N-04 queda en pausa
y no condiciona la prueba parcial, que no usa PostgreSQL. Ninguna base existente,
política, ACL, servicio o protección se ha cambiado. Los candidatos y asistentes
anteriores permanecen intactos; las correcciones no están instaladas en la VM.
