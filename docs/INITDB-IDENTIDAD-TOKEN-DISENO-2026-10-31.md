# Fase 2E.7 — Diseño de identidad y token para initdb

Fecha: 31 de octubre de 2026, America/Cancun. Alcance:
`synthetic-acceptance-only`, `productionAuthorized=false`.

**Resultado:** diseño y modelo offline verificables; seguridad nativa todavía no
demostrada. No se construyó ni integró candidate-05/setup-03. Este documento
desarrolla la arquitectura de servicio oficial PostgreSQL 18.3 exclusivo sin
modificar los informes históricos, la fase 1 o las bases existentes.

## Invariante que resuelve el problema conceptual

No se debe ejecutar el primer initdb bajo un token más potente esperando que él
lo reduzca. El primer proceso, su reejecución y cada CMD/postgres descendiente
deben tener un token identificado y aprobado **antes de ejecutar código de usuario**.
Un supervisor externo al proceso inicializador lee esos tokens mediante handles;
el proceso inspeccionado no declara su propia seguridad.

La rama de fallo interna de initdb puede continuar en su proceso original. Si ese
proceso ya fue restringido y medido, dicha continuación no constituye un regreso
a un token privilegiado. Aun así, el intento se rechaza: no se emite constancia de
inicialización ni se usa ese directorio como T0. **Esto no promete ausencia de toda
escritura parcial**: el proceso original puede haber escrito bajo su token seguro
antes de detectar el fallo interno. Se conserva el intento para revisión, sin
borrado, reutilización o reintento automático.

La solución conceptual no corrige el código oficial ni convierte un modelo en
prueba real. Sigue faltando una implementación nativa revisada y validación en VM.

## Cuenta de privilegios mínimos y continuidad de identidad

Se propone la cuenta virtual `NT SERVICE\CTSK026-<UUID>` para un servicio nuevo
exclusivo. El nombre/SID se obtiene de SCM y de LookupAccountName/LookupAccountSid,
no de una cadena aceptada en una solicitud. El UUID se genera internamente, se
liga al plan firmado y no selecciona una instancia existente. No se usa
LocalSystem, administrador local ni la cuenta interactiva para ejecutar initdb.
[API de cuentas de servicio](https://learn.microsoft.com/en-us/windows/win32/api/winsvc/nf-winsvc-createservicea).

Para evitar cuentas virtuales diferentes entre inicialización y operación, se
propone usar **el mismo registro de servicio y cuenta** en dos estados:

| Estado | Imagen del servicio | Actividad permitida |
| --- | --- | --- |
| Inicialización pendiente | Broker nativo revisado, todavía no implementado | Un único intento de initdb oficial, con supervisión; sin interfaz para ejecutables/comandos arbitrarios |
| Initdb confirmado, servicio totalmente detenido | Cambio mediante API SCM, por el configurador autorizado | Verificar otra vez nombre, cuenta, SID, inventarios, ACL, ausencia de procesos y recibo; sustituir exclusivamente la imagen/argumentos esperados |
| Operación | `pg_ctl.exe runservice` oficial 18.3 | Inicio y parada de ese clúster; servidor Node y cliente permanecen separados |

No se inicia initdb como si fuera un servicio: no implementa el protocolo SCM.
No se crea otro servicio con la esperanza de que su cuenta virtual sea idéntica.
El broker temporal es infraestructura de inicialización; el servidor permanente
sigue siendo el servicio oficial PostgreSQL. La transición es una propuesta
explícita de configuración, no una modificación ya aplicada.

El configurador elevado solo registra y configura el servicio nuevo; no hereda
su token al inicializador. Se limitan SCM, DACL de servicio y privilegios requeridos.
El broker puede necesitar SeIncreaseQuotaPrivilege para la llamada de creación;
debe demostrarlo y conservar solo lo imprescindible en su propio token. El hijo no
lo retiene. No se recurre a logon interactivo, otras credenciales o privilegios
adicionales si falla la API. Crear con una versión restringida del token del
llamador no requiere SeAssignPrimaryTokenPrivilege; otras precondiciones siguen
debiendo verificarse.
[CreateProcessAsUserW](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessasuserw).

Se propone registrar SERVICE_SID_TYPE_RESTRICTED antes del primer arranque. La
identidad efectiva y SID de logon se vuelven a medir por sesión. La lista de SID
restrictivos esperada comprende SID del servicio, World, SID de logon y
Write-restricted; no se deduce desde el nombre de la cuenta.
[SERVICE_SID_INFO](https://learn.microsoft.com/en-us/windows/win32/api/winsvc/ns-winsvc-service_sid_info).

**Pendiente:** soporte real de esa cuenta, perfil, SID restrictivo, derechos,
APIs de creación y transición en Windows 11 Home. No se presume por documentación
genérica de Windows ni se relajan controles si hay incompatibilidad.

## Secuencia nativa propuesta antes de escribir datos PostgreSQL

1. El configurador verifica Windows 11 x64/VirtualBox, inventario cerrado y plan
   firmado. Solo prepara metadatos y carpetas vacías con DACL privada, sin datos
   PostgreSQL ni secretos en una carpeta aún no verificada.
2. SCM ejecuta el broker bajo la cuenta virtual del servicio nuevo. Se contrastan
   cuenta/SID, TokenUser, SID de logon, privilegios reales y configuración del
   servicio contra la inscripción. Inconsistencia o lectura parcial abortan.
3. Se abren y conservan handles de directorios/ancestros, archivos de ejecutables
   y registro. Se verifican propietario, DACL/SACL pertinentes, herencia, etiquetas,
   volumen, file ID y ausencia de reparse points/UNC. Las rutas son finalizadas por
   handle, no solo con `realpath` antes de volver a abrirlas.
4. Se fabrica una versión restringida del token propio. Se retiran privilegios
   fuera de SeChangeNotifyPrivilege/SeLockMemoryPrivilege, se invalidan grupos
   administrativos permisivos y se conserva la restricción de SID. Se baja la
   integridad del hijo a Medium y se relee el token. No se modifica una política
   Windows: se restringe ese token. Cualquier fallo aborta sin lanzar initdb.
5. Se crea un job privado, KILL_ON_JOB_CLOSE, sin breakaway ni permisos para que el
   hijo cambie sus límites. La pertenencia se establece durante la creación con
   la lista de jobs de STARTUPINFOEX; asignarlo después deja una ventana que no se
   acepta. Ni GUI ni hijos reciben un handle que mantenga el job abierto al morir
   el supervisor.
6. Se crea exclusivamente el initdb inventariado mediante CreateProcessAsUserW,
   lpApplicationName absoluto, argumentos cerrados UTF-16, entorno explícito,
   cwd privado, CREATE_SUSPENDED y DEBUG_PROCESS. No DEBUG_ONLY_THIS_PROCESS,
   breakaway, shell propio o API alternativa como fallback. La herencia usa una
   lista mínima de handles de I/O; nunca tokens del broker ni handles del job,
   SCM, registro o control. Se protege también la DACL de objetos proceso/hilo.
7. El supervisor consulta el token **del proceso suspendido**, imagen y handles,
   además del token con el que solicitó la creación. Solo después permite
   ContinueDebugEvent y ResumeThread del primer hilo, en el orden verificado por
   la implementación. Un fallo entre ambas llamadas es rechazo y limpieza.
8. El mismo hilo supervisor procesa el árbol completo. Cada evento de creación
   debe pasar las mismas puertas antes de permitir código de usuario. El canal de
   salida se drena sin registrar secretos y sin truncar evidencia silenciosamente.

El descriptor Medium del hijo importa: los servicios reciben normalmente
integridad System, y una cuenta no administradora no prueba por sí sola la
integridad deseada. Acceso denegado al bajar/releer integridad es bloqueo, no razón
para continuar con System.
[Mandatory Integrity Control](https://learn.microsoft.com/en-us/windows/win32/secauthz/mandatory-integrity-control).

## Observación independiente y barrera anterior a la ejecución

El sondeo por PID, WMI/ETW y mensajes de job son útiles como contraste, pero no
garantizan observar a tiempo un CMD corto. Microsoft advierte que varias
notificaciones de completion port del job no tienen entrega garantizada.
[Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects).

Se propone depuración de creación, sin modificar memoria, inyectar código ni
alterar funciones de PostgreSQL. DEBUG_PROCESS incluye descendientes. En
CREATE_PROCESS_DEBUG_EVENT, Windows entrega handles y detiene el nuevo proceso
antes de que ejecute en modo usuario; el supervisor consulta ahí su token. No se
adjunta después mediante PID a un proceso ya activo.
[Flags de creación](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags),
[eventos de depuración](https://learn.microsoft.com/en-us/windows/win32/debug/debugging-events).

Este mecanismo tiene una superficie de seguridad relevante: los handles de
depuración poseen derechos potentes. El supervisor se inventaría, carece de
entrada de comandos libres y no entrega esos handles al hijo/renderer. Debe
demostrar que se puede depurar bajo la cuenta propuesta **sin conceder
SeDebugPrivilege**; si no puede, se detiene esta vía.

Las consultas independientes mínimas son:

| Objeto | Comprobación |
| --- | --- |
| Token primario | TokenUser igual al SID del servicio; TokenType primario; TokenHasRestrictions real; privilegios enumerados completos sin adicionales; Administradores/Power Users ausentes explícitamente o deny-only; no elevada; integridad Medium; lista restrictiva y logon ligados a esa sesión |
| Proceso | Handle propio, PID + FILETIME de creación, ruta/file ID/hash de imagen inventariada, rol y relación de creación conocidos; no nombre/PID aislado |
| CMD | Imagen Windows aprobada; creación exclusivamente desde initdb reejecutado; cadena real ajustada a las plantillas internas auditadas; entorno y registro verificados |
| PostgreSQL hijo | Imagen oficial esperada; bootstrap, post-bootstrap o `--check` reconocidos; mismo SID/token aprobado; PGDATA privado exacto |
| DLL | LOAD_DLL_DEBUG_EVENT e inventario del runtime/Windows antes de permitir entrada; handle ausente, módulo mutable o no inventariado bloquea |
| Job/depurador | Pertenencia completa, sin escapes, muerte al cerrar el último handle; mismo hilo creador; KillOnExit activado después de establecer conexión; nunca detach permisivo |

Las clases de información de token se consultan con GetTokenInformation y
validación de tamaño/estado; nombres de cuenta o flags ambientales no las
sustituyen.
[TOKEN_INFORMATION_CLASS](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ne-winnt-token_information_class).

En depuración, los handles de proceso/hilo devueltos por eventos tienen reglas
propias de cierre por el sistema al continuar eventos de salida. Si se necesita
conservarlos para conciliación, se duplican como handles propios con derechos
mínimos y se liberan una sola vez; los de imagen/DLL se cierran explícitamente.
[WaitForDebugEvent](https://learn.microsoft.com/en-us/windows/win32/api/debugapi/nf-debugapi-waitfordebugevent).
La salida del hilo depurador debe terminar sus debuggees, con la opción verificada
de KillOnExit y el job como defensa adicional.
[DebugSetProcessKillOnExit](https://learn.microsoft.com/windows/win32/api/winbase/nf-winbase-debugsetprocesskillonexit).

No se afirma que el ciclo nativo esté implementado. Quedan pendientes manejo de
breakpoints iniciales, excepciones first/second chance, hilos y posibles tokens
de impersonación, llamadas fallidas, cierre abrupto y compatibilidad antivirus.
Una excepción desconocida no se consume para fingir éxito. Los límites de job no
son por sí mismos un filtro de creación de tokens ni una prueba de todos los hijos.

## Reducción fallida y criterio de aceptación

El initdb oficial se invoca con PG_RESTRICT_EXEC ausente. Su reejecución interna
legítima añade `PG_RESTRICT_EXEC=1`; eso se permite **solo dentro de esa cadena**,
sin tomarlo como prueba del token. Se exige observar una única reejecución válida
antes de sus CMD de trabajo. No se usa la variable para saltar la protección.

| Caso | Reacción |
| --- | --- |
| Fallo de reducir o medir el token externo | No reanudar el primer initdb; terminar solo el intento propio |
| Fallo interno de reejecución | Token original ya seguro; rechazar diagnóstico, ausencia de reexec o topología root→CMD; conservar cualquier dato parcial |
| Token/hijo no autorizado en evento de creación | No continuar ese evento; abortar árbol propio por job/handles |
| `--check` devuelve 1 para una configuración no viable | Puede ser parte de la búsqueda normal; no equivale a fallo de token. Solo plantillas/códigos revisados; desconocidos bloquean |
| initdb termina con 0 pero evidencia truncada/hijos vivos | Rechazar; el código cero no reemplaza token, árbol y postcondiciones |
| Timeout/cancelación/caída del supervisor | Contención; estado requiere revisión, nunca constancia de éxito ni nuevo intento automático |

La reducción que initdb aplica a un token **ya** restringido no debe compararse
por un booleano equivalente. Se inspeccionan otra vez privilegios y grupos. Como
el token externo ya retiró los privilegios adicionales, la deshabilitación interna
no autoriza a conservar nombres adicionales. Se reutiliza intacto el evaluador
conservador de fase 1; no se flexibiliza para conseguir una aprobación.

La terminación exige todos los handles señalizados, ningún proceso activo y
conciliación con TotalProcesses/ActiveProcesses del job, incluidos hijos rápidos.
[Contabilidad de jobs](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_basic_accounting_information).
La limpieza que no puede demostrarse mantiene bloqueo. No se usa taskkill, búsqueda
por nombre, limpieza del PGDATA parcial o terminación de un PID ajeno.

## CMD, rutas, variables y ACL

Permanece limitada la excepción a las llamadas oficiales 18.3 fijadas al commit
`62d6c7d3df6287f1bd83199c1a746e50d31571a0`. El broker no ejecuta CMD directamente.
Se revisan system/popen de initdb y las ramas documentadas de pg_ctl. No existen
comandos propios, `.cmd`/`.bat`, `.ps1`, PowerShell codificado ni Bypass.

La verificación nativa debe leer AutoRun de HKLM y del hive del SID **efectivo** del
servicio, vistas pertinentes; acceso denegado, valor presente (incluso vacío) o
evidencia parcial bloquean. También debe verificar la configuración efectiva de
expansión/extension y las ACL de esas claves. Sus handles y avisos de cambios se
mantienen durante el intento. Las notificaciones posteriores no vuelven atómica
una lectura: el diseño presupone claves sin escritura para principales no
confiables. No defiende contra un administrador malicioso que cambie el sistema
durante la ejecución, ni declara ese riesgo resuelto con una notificación.
[CMD y AutoRun](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/cmd).

COMSPEC apunta al cmd.exe de Windows cuyo archivo y runtime fueron inventariados;
PATH, cwd, TEMP/TMP, PGDATA y LC_ALL se construyen sin heredar entorno interactivo.
Variables PG externas, credenciales, Node options, aliases duplicados por
capitalización y expansiones no previstas se rechazan. El entorno de la
reejecución admite solo los cambios internos exactos auditados. La cadena CMD real
se compara con una gramática cerrada de plantillas y valores revisados, no con un
simple filtro de metacaracteres ni con el quoting CRT usado para otras API.

Los binarios permanecen en ruta de programa protegida. Los datos se proponen en
ProgramData, bajo UUID ASCII, para que espacios/acentos/símbolos del perfil no
lleguen a cadenas CMD. Node/Electron conservan rutas Unicode literales del usuario.
No se usan nombres cortos 8.3, copiar binarios a TEMP ni cambios de nombre para
sortear antivirus. Esa separación de rutas no certifica la compatibilidad real.

Solo la cuenta/SID del servicio, SYSTEM y administradores autorizados acceden al
PGDATA privado. El servicio no obtiene acceso a claves del cliente/autoridad o
contraseñas del usuario funcional. Se verifican propietario, DACL nula/vacía,
herencia, máscaras genéricas/efectivas, etiquetas y ancestros por handles antes de
escribir secretos. La integridad del paquete no sustituye ACL ni viceversa.

## Entrega al servicio oficial, clúster y parada

Tras éxito de initdb se comprueba offline la estructura esperada y system identifier
mediante herramienta oficial también restringida; no se conecta a otras bases.
Se emite un recibo ligado a plan, inventarios, SID, UUID, directorio/file ID y
system identifier. Los ejemplos de pruebas usan hashes y SID sintéticos.

Con todo el árbol terminado se permite la transición SCM a pg_ctl runservice,
solo para el registro propio y conservando cuenta/SID/ACL. Se lee de vuelta toda
la configuración, se impiden reinicios paralelos y se rechazan colisiones o cambios
de imagen. Caída entre registrar el recibo y cambiar la imagen deja estado de
revisión, sin rollback que reejecute initdb. No se reemplaza un servicio existente.
[Configuración de servicios](https://learn.microsoft.com/en-us/windows/win32/services/service-configuration).

Esto confirma solo el clúster vacío. El T0 funcional, esquema, credenciales técnicas,
bootstrap único de Administrador y HTTPS conservan sus contratos y puertas
posteriores. La contraseña funcional sigue siendo interactiva, sin argv/logs o
archivos de solicitud. No se inventan nuevos campos/tablas SQL.

El inicio oficial debe volver a comprobar imagen, SID, tokens, clúster, puerto y
handles. SERVICE_RUNNING/STOPPED no sustituyen disponibilidad ni terminación real.
La parada normal pasa por SCM y protocolo PostgreSQL, esperando únicamente el
árbol inscrito. Un timeout exige revisión; nunca un kill global ni reinicio sobre
procesos residuales. Logs privados, persistencia/WAL y recuperación se prueban
con fallos y reinicio reales, sin tocar las bases protegidas del anfitrión.

## Cambios verificables y pruebas

Nuevos archivos de código:

- `scripts/windows-native/initdb-attestation.cjs`: validador puro de trazas de
  referencia. Nunca crea procesos, servicios, directorios del producto o datos.
- `scripts/windows-native/initdb-attestation-fixtures.cjs`: escenario sintético de
  ocho procesos y las fases check/bootstrap/post-bootstrap.
- `scripts/windows-native/initdb-attestation.test.cjs`: 76 pruebas nuevas.
- `scripts/windows-native/initdb-review-evidence.cjs`: hashes, conservación y
  resultados; no es un constructor ni atestador de la VM.

Resultado: **237/237 aprobadas**, cero fallos/omitidas: 161 anteriores + 76 nuevas.
Se cubren fallo de token de raíz/hijos, identidad/SID/logon/privilegios incorrectos,
reanudación prematura, replay, PID reutilizado, jobs escapables, AutoRun,
diagnósticos incompletos, fallo interno con salida cero, DLL ajena, timeout,
monitor perdido, hijos vivos y contabilidad que omite procesos rápidos.

Todos los resultados mantienen `nativeVerified=false`,
`installationApproved=false` y `productionAuthorized=false`, incluso cuando la
traza sintética satisface el modelo. Los campos de fixture como `commandApproved`
o `privateAclChecked` son entradas de prueba: aún no existe el lector nativo que
pueda acreditarlos. El modelo valida orden y rechazo, no autenticidad ni APIs.
No es una máquina de estados persistente de producción ni implementa su limpieza.

Se ejecutó con el guard de pruebas anterior, que bloquea procesos/red reales dentro
de las suites. Evidencia nueva: `docs/local-fase-2e7-initdb-design/tests.tap`,
escenario sintético, `verification.json`, `preservation.json`, inventario y SHA256.
No se ejecutó ni compiló código nativo ni se abrió una conexión PostgreSQL.

## Bloqueos restantes y orden de continuación

1. Vía legítima de revisión de McAfee sin restauración, exclusiones o recompilación;
   documentada en `MCAFEE-REVISION-SIN-RESTAURACION-2026-10-31.md`. No es una
   autorización actual de ejecutar el prototipo ni una garantía de falso positivo.
2. Broker/supervisor revisado, procedencia, inventario y plan de validación nativa
   expresamente admitido. No se implementó como otro nombre/lenguaje del prototipo.
3. Demostrar en VM la identidad virtual, privilegios mínimos, integridad Medium,
   restricciones por SID y depuración de todos los hijos sin SeDebugPrivilege.
4. Implementar y revisar el lector de token/ACL/registro y la gramática real de CMD,
   antirreplay, canal autenticado, decisiones por handles, limpieza y persistencia.
   Pruebas de modelo no satisfacen esta puerta.
5. Inyección nativa de fallos antes/después de cada API, procesos rápidos, pérdida
   del monitor, cambio de registro, cierre abrupto, detección antivirus, transiciones
   SCM interrumpidas y prueba de no escritura por un token no aprobado.
6. Solo después integrar servidor/cliente/mantenimiento sin PowerShell, candidate-05
   y las ocho etapas de setup-03. Aceptación real obligatoria: T0, bootstrap,
   servidor, HTTPS, primer login, cierre y reinicio/persistencia en Windows 11 Home.

No se cambió ninguna política, base existente, antivirus, confianza global,
Reservaciones, Daily, roles o integración. Los inventarios anteriores y la
evidencia de cuarentena se verifican intactos. No se presenta este diseño como una
solución nativa ya comprobada ni se generan instaladores con garantías pendientes.
