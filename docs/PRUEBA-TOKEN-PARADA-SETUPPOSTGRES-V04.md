# V-04 — corrección de consulta de token, identidad de VM y parada

Alcance: `synthetic-acceptance-only`; `productionAuthorized=false`.
Es un kit de ensayo de un solo caso suspended, no candidate-05 ni setup-03.
No modifica ni adopta servicios anteriores.

## Lo establecido por el intento V-03

InstallationId: `00ae76d3-112e-4e38-b8e5-d094e1471879`.
OperationId: `00aa8c6e-9fa8-4133-8483-20af1c2c0a03`.

El usuario reportó StartServiceW accepted=true, START_PENDING y PID 5696. Existe
local-bound. El JSON exacto del worker registra NATIVE_BOOTSTRAP_FAILED en
machine-check, ManagementException, HRESULT -2146233087, sin Win32 disponible.
Faltan machine-bound y controller-bound en el respaldo. El controlador mostró
TOKEN_QUERY_SIZE y un secundario VALIDATION_SERVICE_STOP_UNPROVEN.

Esto respalda **conexión inicial SCM y ejecución hasta lectura local**; no es un
arranque completo ni aceptación del ensayo. El HRESULT de ManagementException es
genérico: no demuestra por sí solo acceso denegado. La parada/limpieza de ese
servicio sigue **sin demostrar**. No se afirma validación de token, Job o contención.

## Correcciones concretas

1. La consulta de tamaño conserva inmediatamente BOOL, Win32, clase, fase y
   longitud. Mantiene ERROR_INSUFFICIENT_BUFFER (122); acepta ERROR_BAD_LENGTH (24)
   **solo para TokenElevation, clase 20, tamaño exacto 4**. La segunda consulta sigue
   siendo obligatoria y debe devolver exactamente la longitud reservada; no hay
   datos sintéticos, reintento permisivo ni omisión de token/Job. Se identifica si
   se consulta el host ligado, el servicio, el candidato restringido o el hijo
   suspendido. OpenProcessToken conserva también su error nativo.
2. En el anfitrión se reprodujo en su propio token (solo TOKEN_QUERY) el caso clase
   20 → 24/4 → lectura satisfactoria de 4. No prueba el token de la VM ni identifica
   retrospectivamente la clase exacta del error V-03, que no la registraba.
3. El controlador conserva su comprobación WMI del fabricante/modelo/UUID y además
   liga la identidad SMBIOS en el intent privado v2. El servicio comprueba esa
   misma huella mediante GetSystemFirmwareTable, fabricante/modelo VirtualBox y
   bytes UUID exactos. No usa WMI en machine-check ni se le conceden permisos WMI.
   No se adivina el orden de UUID ni se acepta otra máquina al fallar: si la lectura,
   formato o huella no coinciden, falla cerrado. La lectura real bajo la cuenta
   virtual Windows 11 aún debe validarse.
4. Ante error, solo la instancia creada por ESA invocación recibe una solicitud
   SCM de parada ligada a su configuración. Se espera de forma acotada STOPPED/PID 0,
   handle de host señalado si fue retenido y ausencia comprobada de procesos propios.
   Solo entonces se deshabilita ese servicio nuevo y se informa limpieza completa.
   No se mata por PID/nombre ni se omite la validación de identidad o Job; un timeout,
   error de consulta o ausencia de prueba permanece como fallo.
5. controller-failure.json y cleanup-result.json separan error principal, etapas,
   observaciones de SCM y errores secundarios. El indicador jobValidated no se
   promueve por haber solicitado o confirmado una parada.

## Preservar los servicios anteriores

No ejecutar V-03 otra vez. No iniciar, detener, modificar, borrar ni parchear:

- `CTSK026-3326dcf8-f3ff-443e-866a-ee18ffcb60e1` (V-01).
- `CTSK026-00ae76d3-112e-4e38-b8e5-d094e1471879` (V-03 fallido).

Conservar V03Evidencia.rar, TXT/JSON, capturas, ZIP/EXE y snapshots existentes. Para
observar pasivamente el estado actual, se permite leer el servicio en Servicios o
consultar su estado sin pulsar Inicio/Detener. Si sigue activo o el estado es ambiguo,
conservar la observación y usar la instantánea solo después de exportar la evidencia;
no hacer una limpieza manual por nombre. Este kit no tiene una operación de
reparación/adopción de esos UUID. El intent v2 pertenece exclusivamente a una
instancia nueva; no editar el intent v1 anterior para hacerlo compatible.

## Antes de otro ensayo

La corrección está preparada, pero **no iniciar otro ensayo en el estado ambiguo
del invitado original**. Primero conservar la evidencia y leer pasivamente el estado
actual del servicio V-03, sin iniciar/detener/configurar nada. Esa observación no
certifica retrospectivamente la limpieza. Si persiste actividad o no puede probarse
el estado, mantener intacta la VM fallida y preparar un entorno de ensayo separado
a partir de una instantánea previa, conservando el respaldo. No usar V-04 para
reparar, adoptar o parar el servicio viejo.

## Ensayo V-04 posterior, una sola vez y en UUID nuevo

1. Exportar la evidencia anterior y conservar una instantánea de ese estado.
   Mantener red desconectada y protecciones activas. No repetir F-01/F-02, apertura
   de V-03 ni la operación fallida. No restaurar una instantánea sobre la única
   evidencia que exista dentro de la VM.
2. Extraer V-04 en carpeta nueva del disco invitado y cotejar los hashes NUEVOS con
   el informe externo y SHA256SUMS.txt. No sobrescribir kits anteriores ni carpetas
   de servicios. Es un binario diferente: la aceptación GUI de V-03 se conserva en
   su alcance y no se presenta como aceptación del EXE nuevo.
3. Abrir normalmente, sin argumentos ni elevación manual. Debe mostrar versión 04,
   perfil native-validation-only-v04-token-query-stop y solo suspended. La entrada
   gráfica y sus controles permanecen, sin una nueva ronda separada de aceptación.
4. Marcar el consentimiento limitado y pulsar Ejecutar **una sola vez**. La interfaz
   genera installationId y operationId nuevos; no introducir UUID antiguos. Aceptar
   UAC únicamente con el mismo usuario/SID. Si hay incoherencia, cancelar y conservar
   el resultado, sin volver a pulsar.
5. Esperar la conclusión. No ejecutar otros casos, initdb, bootstrap SQL o el
   instalador. No cambiar privilegios, permisos, cuentas, políticas, timeout de
   Windows o protecciones para hacer pasar el ensayo. No forzar procesos/servicios.

Si una protección bloquea el archivo, guardar la alerta y detenerse. No restaurar
cuarentena, crear exclusiones ni variar el archivo para eludirla.

## Archivos del intento NUEVO que devolver

- Carpeta mostrada `%LOCALAPPDATA%\ctsk-native-validation-<operationId>`:
  trial-plan.json y result.json.
- Dentro de `C:\ProgramData\CommunityTours\Acceptance026\<installationId>\control`:
  intent.json, validation-case.json, scm-before-start.json, scm-start-call.json,
  controller-failure.json y cleanup-result.json, si existen.
- En work: service-startup-local-bound.json, service-startup-machine-bound.json,
  service-startup-controller-bound.json y bootstrap-result.json, si existen.
- Captura/texto completo con nativeDiagnostics/secondaryFailures. Si falta un archivo,
  registrar ausencia; no fabricarlo ni modificar el original. Guardar hora/UUID de
  eventos NUEVOS SCM/Aplicación solo si hacen falta para el diagnóstico del caso.

El recolector opcional incluido solo consulta y exporta. Usarlo con UUID, hora local
Windows y carpeta de destino nuevos; no sus valores históricos predeterminados:

```powershell
.\Exportar-Evidencia-SCM.ps1 -InstallationId 'UUID-NUEVO' -Destination "$env:USERPROFILE\Desktop\V04-evidencia-nueva" -WindowsLocalStarts 'AAAA-MM-DDTHH:mm:ss'
```

Sustituir ambos marcadores; inicio de la ventana unos cinco minutos antes del ensayo.
Si una política bloquea el recolector, no cambiarla: copiar JSON con Explorador y
exportar eventos con Visor de eventos. No hacen falta contraseñas en la evidencia.

## Interpretación

- StartServiceW aceptado acredita conexión inicial, no éxito del worker.
- En un nuevo TOKEN_QUERY_SIZE/FAILED se necesitan informationClass, purpose, phase,
  sizing/readWin32Error, required/returnedBytes y violation. Win32 0 no es éxito.
- Machine-bound requiere coincidencia exacta de huella; su ausencia sigue siendo
  bloqueo de identidad y no justifica retirar la comprobación.
- cleanupCompleted=false, consulta fallida o ausencia del recibo deja limpieza sin
  demostrar. serviceStopped=true aislado no prueba ausencia de hijos ni Job vacío.
- Un suspended completo exige token independiente válido, fases sin resume,
  probeResumed=false, initdbResumed=false, postgresExecuted=false, jobEmpty=true,
  terminationProven=true, dataDirectoryEmpty=true y limpieza verificada. La prueba
  usa la propia imagen de ensayo suspendida; no certifica initdb/PostgreSQL reales.

La compilación y los tests no certifican la ejecución nativa en la VM. No se
construyen candidate-05/setup-03 ni se validan login, Reservaciones o Daily.

Referencias: [GetTokenInformation](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-gettokeninformation),
[GetLastWin32Error](https://learn.microsoft.com/en-us/dotnet/api/system.runtime.interopservices.marshal.getlastwin32error?view=netframework-4.8.1),
[GetSystemFirmwareTable](https://learn.microsoft.com/en-us/windows/win32/api/sysinfoapi/nf-sysinfoapi-getsystemfirmwaretable),
[consulta de estado SCM](https://learn.microsoft.com/en-us/windows/win32/api/winsvc/nf-winsvc-queryservicestatusex).
