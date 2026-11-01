# Revisión de instalación y seguridad — 31 de octubre de 2026

Estado: **bloqueado antes de integrar PostgreSQL y construir paquetes**.
Alcance: `synthetic-acceptance-only`, `productionAuthorized=false`.
No hay aprobación de instalación, ni aceptación real en Windows 11/VirtualBox.

## Resultado por fase

| Fase | Resultado verificable | Lo que falta |
| --- | --- | --- |
| 1 | Contrato SID corregido, rechazo conservador, correcciones de fuente nativa, frontera ACL reforzada y 104 pruebas seguras aprobadas | Compilación y comprobación real del código nativo, ACL y ciclo de vida; prohibidas durante esta revisión por la cuarentena |
| 2 | Comparación estática de servicio oficial y lanzador propio; dependencia de shells confirmada en PostgreSQL 18.3 | Una inicialización verificable sin shells; implementación detenida |
| 3 | Dependencias de PowerShell identificadas; pruebas literales de rutas y rechazo simulado bajo Restricted | Sustituto nativo verificado en servidor, cliente, mantenimiento y asistente; no se declara compatibilidad |
| 4 | Flujo anterior de ocho etapas probado con procesos/red simulados | `026-setup-03` no preparado ni construido: depende de las puertas anteriores |
| 5 | Unitarias, regresión, integración simulada y controles estáticos: 104/104 | Binarios, pruebas nativas y aceptación VirtualBox; no se construyó candidate-05 ni setup-03 |

## Correcciones de la fase 1

1. `scripts/windows-native/probe-contract.cjs` consume `groups` por SID
   (`S-1-5-32-544` y `S-1-5-32-547`). Ambos deben estar presentes. `null` significa
   ausencia explícita tras enumerar todos los grupos; omitir un SID no significa
   ausencia. Solo se admiten atributos deny-only 16 o 17, sin Enabled ni
   EnabledByDefault. Se rechazan cadenas, fracciones, desbordamientos y flags
   adicionales, sin coerción de bits de JavaScript.
2. El contrato versionado exige identidad, enumeraciones completas de grupos y
   privilegios, booleanos exactos, lista de privilegios sin duplicados y resultado
   de proceso sin error ni señal. El SID esperado debe proceder de la identidad
   confiable del padre en un futuro ejecutor; copiarlo del hijo no constituye una
   verificación independiente. Los contratos antiguos o contradictorios se rechazan.
   `verified:true` solo expresa propiedades de un informe: no autentica su origen,
   no acredita ejecución nativa y nunca establece equivalencia PostgreSQL.
3. `SecurityProbe.cs` emite ese mismo esquema. Comprueba tamaños y cantidades
   antes de leer buffers nativos, falla ante lectura parcial/estado ambiguo,
   declara grupos ausentes y detecta duplicados. No acepta ejecutables externos.
4. La fuente incorpora un job anónimo, no heredable, con
   `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. `PROC_THREAD_ATTRIBUTE_JOB_LIST` vincula
   al hijo durante su creación, antes de reanudarlo: no se usa asignación posterior
   que deje una ventana de hijo suspendido sin contención. Timeout, error de espera
   y fallo de reanudación pasan por terminación del job, espera acotada y cierre de
   handles. No se buscan ni terminan procesos por nombre/PID. También se liberan
   lista de atributos, buffers, SID fijados y descriptor de seguridad aunque falle
   la lectura del usuario. Los errores de limpieza impiden informar éxito.
5. Se redujo la apertura del token original a consulta/duplicación. Se conservan
   los SID y excepciones de privilegios previamente establecidos. Estos cambios
   son **correcciones de fuente sin compilar**, no prueba de equivalencia nativa.
6. `build-probe.cjs` queda bloqueado antes de imports, archivos o procesos. Su
   versión original está conservada en evidencia; no se restauró ni recompiló
   el ejecutable detectado, ni se presentó una solicitud a McAfee.

La vinculación de jobs mediante atributos está documentada por
[Microsoft](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute).
El cierre del último handle de un job con el límite correspondiente termina sus
procesos; falta comprobarlo con fallos reales y cierre abrupto del padre en la VM.
[Objetos job](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects).

## Revisión ACL de servidor y cliente

Se revisaron `backend/config/windowsConfigAcl.js` y `shared/windowsConfigAcl.js`,
incluida la copia que el empaquetador usa en Electron. Se conservan propietario
confiable, SID de usuario/SYSTEM/Administradores/TrustedInstaller, rechazo UNC y
reparse points, ACL sin reglas, reglas heredadas, InheritOnly y máscaras por nivel:
2032127 para archivo privado, 852310 para contenedor y 852032 para ancestros.
Las dos reglas de verificación coinciden; la copia backend tiene además una
declaración explícita de entrada UTF-8 que no tenía la copia compartida.

Ambas fronteras Node ahora rechazan resultado ausente, error o señal aun si aparece
`status:0`. Un código 3 solo representa archivo ausente si no hay error ni señal.
Los tests reproducen la aceptación anterior de un resultado contradictorio.

**Límite y bloqueo:** estas fuentes todavía ejecutan PowerShell codificado y no
son una solución autorizada para el candidato nuevo. Solo se invocaron dentro de
arneses que interceptan sus procesos. No se invocaron sus verificadores reales.
Las comprobaciones de reglas son estáticas: no demuestran derechos efectivos ni
eliminan carreras entre validar ruta y abrir archivo. El reemplazo nativo deberá
validar DACL nula/vacía, propietario, herencia, derechos genéricos/efectivos y
ancestros mediante handles, impedir sustitución por reparse points y crear
directorios con descriptor privado desde su creación. Debe fallar cerrado y estar
inventariado en ambos paquetes; queda pendiente, sin reemplazos permisivos.

## Fase 2: alternativas PostgreSQL y bloqueo obligatorio

En el código oficial `REL_18_3`, `pg_ctl` normal construye `COMSPEC /C` para
redirecciones. En modo servicio, `pgwin32_ServiceMain` llama a
`CreateRestrictedProcess(pgwin32_CommandLine(false), …, true)` y selecciona
`postgres` directamente. Esa ruta reutiliza reducción de token, DACL y gestión
de procesos oficial. Es una ventaja estática del servicio, no certificación del
binario instalado. [Código fijado de pg_ctl](https://github.com/postgres/postgres/blob/REL_18_3/src/bin/pg_ctl/pg_ctl.c).

`initdb` usa `PG_CMD_OPEN`/`popen_check` durante bootstrap y post-bootstrap;
`popen_check` llama `popen`.
[Código fijado de initdb](https://github.com/postgres/postgres/blob/REL_18_3/src/bin/initdb/initdb.c).
En Windows, `port.h` remapea esa llamada a `pgwin32_popen`, que acaba en `_popen`.
[port.h](https://github.com/postgres/postgres/blob/REL_18_3/src/include/port.h),
[system.c](https://github.com/postgres/postgres/blob/REL_18_3/src/port/system.c).
Microsoft documenta que `_popen` inicia un procesador de comandos.
[Referencia CRT](https://learn.microsoft.com/en-us/cpp/c-runtime-library/reference/popen-wpopen).

**Consecuencia:** ni cambiar a servicio ni lanzar `initdb.exe` directamente
elimina esa dependencia. Con PostgreSQL 18.3 oficial sin modificar no está
demostrada una instalación completa sin shells. No se implementó ni aprovisionó
ninguna de estas alternativas. No se usó un `spawn` simplificado, ni se tomó
el PostgreSQL existente o un clúster preinicializado como atajo.

La tabla siguiente define evidencia que se exigiría; las celdas son propuestas
de diseño pendientes, no controles ya certificados.

| Requisito | Servicio oficial exclusivo | Lanzador nativo propio equivalente |
| --- | --- | --- |
| Privilegios mínimos | Identidad de servicio exclusiva sin administración; privilegios y derecho de logon expresamente acotados; registro elevado solo en VM | Token de usuario reducido, entorno mínimo, binarios fijos; comprobar capacidades del padre y del hijo |
| Token restringido | Reutilizar ruta oficial y observar token efectivo de postgres | Demostrar SID deny-only, retiro de privilegios, DACL, handles y contención; el prototipo no basta |
| Identidad del clúster | Ligar servicio, cuenta, ruta canónica, hashes, marcador firmado, system identifier, puerto y creación del proceso | Mismas comprobaciones antes de cada acción; nunca confiar únicamente en postmaster.pid |
| Directorios y ACL | Datos/logs solo para identidad de servicio y administradores autorizados; auxiliares/cliente con sus propias ACL | Carpetas privadas creadas atómicamente; validar propietario y ancestros en cada límite de confianza |
| Exclusividad | SCM por nombre exacto; validar configuración/cuenta/ruta antes de actuar; rechazar colisiones y cambios ajenos | Handles del hijo y job propios; no enumerar/matar por nombre ni reutilizar PID como identidad |
| Inicio y parada | Consultar estados y límites; parada controlada del servicio; no forzar terminación ajena | Protocolo PostgreSQL de disponibilidad y parada más supervisión nativa; timeout no equivale a parada confirmada |
| Logs | Directorio privado, rotación y ausencia de secretos; accesos segregados | Redirección de handles explícita y lista mínima de herencia, sin shell; gestión de saturación/errores |
| Recuperación | Configuración SCM acotada; impedir duplicados; reconciliar identidad y estado antes de reiniciar | Estados persistentes y conciliación tras caída; init/bootstrap incompleto requiere revisión, sin reintento ciego |
| Persistencia | Clúster nuevo exclusivo en disco privado; T0 antes de bootstrap; conservar WAL/configuración | Mismo contrato; pruebas de apagado, reinicio y recuperación sin borrar datos ni modificar bases protegidas |
| Inicialización sin shells | **Bloqueada por initdb oficial** | **También bloqueada si conserva initdb oficial** |
| Costo y riesgo | Preferida provisionalmente por reutilizar mecanismos oficiales; cuenta y compatibilidad Home pendientes | Mucho más código de seguridad propio y mantenimiento; ninguna equivalencia demostrada |

Las ACL del SCM y del objeto servicio requieren controles separados; no basta con
un nombre exclusivo. [Derechos de servicios](https://learn.microsoft.com/en-us/windows/win32/services/service-security-and-access-rights).
La recuperación y configuración adicional se establecerían por API nativa y
se verificarían de nuevo, sin comandos intermedios.
[ChangeServiceConfig2W](https://learn.microsoft.com/en-us/windows/win32/api/winsvc/nf-winsvc-changeserviceconfig2w).

Opciones para desbloquear, **sin adoptarlas automáticamente**:

1. Mantener ausencia total de shells: obtener una solución de inicialización
   revisada y verificable (por ejemplo, cambio upstream o implementación auditada
   de pipes/procesos directos que cubra todas las llamadas internas), con procedencia,
   compilación reproducible y pruebas del árbol real. Alterar solo el lanzador no basta.
2. Someter a autorización una excepción muy acotada para las dependencias internas
   oficiales, manteniendo el servicio y controles equivalentes. **No autorizada ni
   implementada**; cambia el requisito actual y no se presume aceptada por esta tarea.
3. Revisar con McAfee la detección mediante su procedimiento sin restaurar archivos.
   Resolver la cuarentena permitiría plantear futuras pruebas nativas autorizadas,
   pero por sí solo no resuelve la dependencia de initdb.

Recomendación: conservar el requisito sin shells y estudiar primero una solución
verificable de inicialización; mantener el servicio oficial como opción preferida
solo cuando esa puerta y su identidad de mínimos privilegios se puedan demostrar.

## Fase 3: mapa de dependencias pendientes

Restricted no permite archivos de script. No se modifica esa política ni se usa
PowerShell codificado como salida alternativa.
[Políticas Microsoft](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies?view=powershell-5.1).

| Área | Dependencia encontrada | Sustitución necesaria, aún pendiente |
| --- | --- | --- |
| Express y herramientas Node | `backend/config/windowsConfigAcl.js` | Verificación nativa inventariada; mismo contrato de rechazo |
| Electron | `shared/windowsConfigAcl.js` copiado como `electron/windowsConfigAcl.js` al empaquetar | Mismo verificador; conservar revisiones periódicas de descriptor |
| Mantenimiento | Envolturas `.ps1`, ACL y `shared/windowsProcess.js` | Entradas Node directas tras verificar payload, más procesos/ACL nativos verificados |
| Aprovisionamiento | `enterprise026Provision.cjs`: initdb, pg_ctl y COMSPEC | Resolver fase 2; no quitar privilegios/restricciones para facilitar arranque |
| Asistente | `coordinator.cjs`: metadata/WMI, ACL de binarios, directorios, scripts y consola | API nativa de identidad/ACL/directorios/consola; Node para lógica existente |
| Bootstrap | `console-stage.ps1` y captura TTY | Interacción local segura con consola real o canal nativo auditado; sin contraseña en argumentos, logs o solicitudes |

Los perfiles de prueba incluyen `VMUser`, `VM User`, `VM Usuario Prueba`,
`María Álvarez` y `O'Connor & Á (Prueba) %PATH% ! ^ $` más acento grave y punto y coma.
Se comprobó su paso literal por stdin en las fronteras Node simuladas, sin
interpolación en argumentos. No se ejecutaron las suites históricas `paths` o
`compatibility` que invocan PowerShell real, ni las pruebas de certificados que
inician OpenSSL. No se promete compatibilidad nativa a partir de estas simulaciones.

## Pruebas, conservación y entrega

Comando reproducible (ejecuta exclusivamente tests JavaScript con procesos/red
bloqueados dentro del proceso de pruebas):

```text
node --require ./scripts/windows-native/safe-test-guard.cjs --test --experimental-test-isolation=none --test-reporter=tap scripts/windows-native/probe-contract.test.cjs scripts/windows-native/acl-regression.test.cjs scripts/windows-setup/coordinator.test.cjs scripts/windows-setup/ui.test.cjs scripts/windows-setup/restricted-policy.test.cjs
```

Resultado: **104 aprobadas, 0 fallos, 0 omitidas**. El guard impide invocar procesos
reales y conexiones de red en las suites seleccionadas; los procesos/red del
asistente se simulan. Las pruebas incluyen el bypass original por diferencia de
forma, informe incompleto, SID ausente, flags habilitados/desbordados, privilegios
incorrectos, identidad distinta, estado ambiguo, errores/timeout en ACL, etapas
simuladas, T0 rechazado, bootstrap interrumpido y rechazo de identidad HTTPS.
Los checks de ciclo de vida nativo y alineación del productor son **estáticos**;
no son inyección real de fallos Win32 ni certificación contra procesos huérfanos.

Evidencia nueva en `docs/local-fase-2e7-security-review/`:

- `baseline.json` y `before/`: SHA256 y copias previas de las seis fuentes revisadas.
- `tests.tap`: salida completa.
- `regressions.json`: caso sintético original y resultado corregido.
- `preservation.json`: verificación posterior de inventarios y SHA256 anteriores.
- `verification.json`, `review-inventory.json` y `SHA256SUMS.txt`: resultados,
  alcance, archivos de esta entrega y sus hashes; **no son inventarios de instaladores**.

Fuentes modificadas: `scripts/windows-native/SecurityProbe.cs`,
`probe-contract.cjs`, `probe-contract.test.cjs`, `build-probe.cjs`,
`backend/config/windowsConfigAcl.js` y `shared/windowsConfigAcl.js`.
Nuevos: `scripts/windows-native/acl-regression.test.cjs`, `safe-test-guard.cjs`,
`security-review-baseline.cjs`, `security-review-report.cjs`, este informe y la
carpeta de evidencia. Las demás fuentes se conservan como estaban al iniciar;
había cambios previos extensos en el repositorio, que no se revertieron.

No se conectó a PostgreSQL, no se alteraron `sian_kaan_reservaciones` ni
`sian_kaan_reservaciones_dev`, no se aprovisionó en Windows 10, no se cambió el
modelo de datos/roles/Reservaciones/Daily/integraciones. No se modificaron
archivos instalados ni paquetes protegidos por inventarios. No se añadieron
exclusiones ni se alteraron antivirus, SmartScreen o políticas.

No existen SHA256 nuevos de servidor/client candidate-05 ni setup-03 porque
**no se generaron esos artefactos**. La conservación cubre candidatos 01–04,
setup-01/setup-02 presentes y evidencia histórica de cuarentena.

## Puerta para continuar y aceptación final

Primero resolver la inicialización PostgreSQL sin shells de forma verificable.
Después validar el componente nativo autorizado, ACL reales, Unicode, mínimos
privilegios, herencia de handles, fallos de cada API, timeout, cierre abrupto,
ausencia de huérfanos y procesos ajenos, colisiones de servicio y reutilización de
PID. Solo entonces integrar servidor y cliente nuevos, inventariarlos y preparar
el asistente gráfico de ocho pasos con contraseña interactiva segura.

La aprobación requiere evidencia real en Windows 11 Home x64/VirtualBox con
Restricted sin cambios: instalación, directorios privados, certificados sintéticos,
T0 limpio, bootstrap único del primer Administrador, servidor, HTTPS autenticado,
primer login, cierre, reinicio y persistencia. Todo ello permanece pendiente.
