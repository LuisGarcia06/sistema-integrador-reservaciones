# Diagnóstico y corrección TOKEN_QUERY_SIZE / parada — V-04

Alcance: `synthetic-acceptance-only`; `productionAuthorized=false`.
Única entrega final: `local-fase-2e7-native-validation-04/CTSK-026-NativeValidation-04.zip`.
`build-attempt-01` conserva una revisión intermedia no distribuida: no ejecutarla ni
usar sus hashes. No se construyeron candidate-05/setup-03.

## Qué ocurrió en el intento V-03

Instalación `00ae76d3-112e-4e38-b8e5-d094e1471879`, servicio CTSK026 del mismo UUID,
operación `00aa8c6e-9fa8-4133-8483-20af1c2c0a03`.

| Evidencia disponible | Conclusión limitada |
|---|---|
| Resumen del usuario de scm-start-call: accepted=true, START_PENDING, PID 5696 | Se superó la conexión inicial con SCM. No se presenta START_PENDING como inicio completo. No se recibió aquí el JSON íntegro de ese archivo. |
| local-bound presente | El worker llegó a lectura/vinculación local de su registro e identidad. No es verificación independiente del token hijo. |
| bootstrap-result exacto pegado por el usuario: NATIVE_BOOTSTRAP_FAILED, machine-check, ManagementException, HRESULT -2146233087 | El worker falló durante la comprobación WMI de VM. El HRESULT es genérico; falta ManagementStatus y no se afirma acceso denegado ni una causa WMI más específica. |
| machine-bound y controller-bound ausentes del respaldo | Coherente con ese fallo anterior a la ejecución del worker de probe. No hay evidencia de primera creación suspendida/Job en ese camino. |
| Interfaz: TOKEN_QUERY_SIZE y secundario VALIDATION_SERVICE_STOP_UNPROVEN | El controlador falló en una consulta de token y tampoco demostró la parada. No se interpretan Win32 0, ausencia de recibo o tiempo transcurrido como éxito. |

La revisión separa tres problemas concurrentes: consulta de token del controlador,
comprobación WMI del servicio y comprobación de parada. El recibo del worker tiene
un error diferente al de la interfaz; no deben sustituirse uno por otro.
La lectura del token del host en ProcessLease.Open ocurre antes de retener el host
como validado; si falla, el handle local se libera y la referencia del controlador
queda sin asignar. Ese camino encaja con el error secundario observado, pero no
recupera retrospectivamente una clase de token o estado SCM que V-03 no registró.

El servicio original **no se considera detenido ni limpiado**. No se ha repetido
V-03 ni se han modificado/adoptado sus servicios. La apertura gráfica V-03 sigue
satisfactoria dentro de su alcance. El estado vigente marca su único suspended
como consumido y fallido; no invita a ejecutarlo otra vez.

## TOKEN_QUERY_SIZE: defecto reproducido y corrección estricta

Se realizó aquí un diagnóstico nativo de **solo lectura del token propio** con
TOKEN_QUERY, Windows 10 build 19045 y .NET 10.0.11. Clase 20 (TokenElevation): la
consulta de longitud cero devolvió BOOL falso, Win32 **24**, tamaño **4**; la segunda
consulta leyó correctamente esos 4 bytes. Las otras ocho clases utilizadas también
se consultaron sin cambiar identidad, grupos o privilegios.

V-03 exigía 122 en todas las consultas de tamaño. Rechazaba ese resultado válido y
lanzaba InvalidOperationException sin conservar el Win32/clase/longitud, produciendo
el 0/no disponible de la interfaz. **No se afirma que la clase 20 sea la clase exacta
observada en Windows 11**, porque el recibo antiguo no la incluía. La reproducción
demuestra un defecto concreto del código y la corrección lo cubre.

V-04 admite 24 solo para clase 20 y tamaño exacto 4; sigue admitiendo 122 con tamaños
válidos. Otros códigos, cero, tamaño incorrecto/desbordado, clase desconocida,
lectura fallida o longitud cambiada se rechazan. La segunda consulta nativa es
obligatoria; no se inventa una instantánea ni se relaja Require. Se conserva por
error: API, clase, propósito (host/servicio/candidato/hijo suspendido), fase,
BOOL/Win32 y longitudes, capturados antes de otra llamada nativa.

La validación independiente sigue abriendo el token por handle del hijo suspendido,
leyendo sus datos reales y exigiendo identidad, Medium, sesión, elevación, grupos,
privilegios y SID restrictivos antes de ResumeThread. La asociación atómica al Job,
lista de tres handles y comprobación de vaciado se conservan.

## Fallo machine-check sin cambiar permisos WMI

El controlador conserva WMI para comprobar fabricante/modelo/UUID en su contexto
normal, que ya permitió abrir V-03. Antes de registrar una instancia nueva captura
además la identidad SMBIOS mediante GetSystemFirmwareTable. El intent privado v2
liga ambos valores; el servicio exige la misma huella de fabricante/modelo, versión
y bytes UUID exactos. No adivina orden de UUID ni acepta otra máquina por fallback.
La barrera Windows 11 se mantiene explícita en la comprobación del servicio.

Esto elimina la dependencia WMI del contexto de la cuenta virtual sin otorgarle
permisos, SeDebug, impersonación u otros privilegios. Los derechos/ACL de destinos
nuevos previstos por el ensayo se conservan; no se alteran permisos existentes.
El parser limita tamaños, longitudes, índices, terminadores y unicidad del registro,
exige VirtualBox y rechaza UUID vacío o todo FF. No se modifica ni migra un intent
v1 existente: v2 pertenece solo a nuevas instancias creadas por el ejecutor nuevo.

Se probó la ABI de lectura de firmware en el anfitrión sin exportar su identidad;
el parser lo rechazó correctamente como no VirtualBox. Se probaron fixtures de
UUID distintos, fabricante ajeno, duplicados y registros malformados. **La lectura
bajo la cuenta virtual de la VM aún está pendiente**, no se presenta como validada.

## VALIDATION_SERVICE_STOP_UNPROVEN

V-03 consultaba SCM una sola vez al salir del error. Si el host aún estaba RUNNING
o STOP_PENDING, fallaba sin esperar la transición. Como la consulta del token podía
haber fallado antes de retener el handle validado, tampoco se podía acreditar su
salida. La evidencia anterior no prueba que el proceso sobreviviera ni que saliera.

V-04 solicita parada únicamente del servicio recién creado por ESA invocación,
ligado a su nombre/cuenta/SID/imagen/configuración. Espera de forma acotada
STOPPED/PID 0, observa salida del handle retenido si existe, comprueba ausencia de
procesos propios y solo después deshabilita ese servicio nuevo. No mata procesos
sin token validado ni por nombre/PID; no usa esta ruta para adoptar/parar UUID viejos.
La solicitud de parada por sí sola nunca se marca como limpieza completa.

cleanup-result.json conserva estados, PID, códigos de salida, checkpoint/waitHint,
resultado de cada barrera y errores de persistencia. controller-failure.json conserva
el error primario; todos los secundarios permanecen separados. Una consulta fallida,
timeout o ausencia de prueba conserva el fallo. Confirmar parada no certifica Job.

## Archivos modificados y nuevos

- Token y error: `OptionCNativePrimitives.cs`, `OptionCRuntime.cs`, `OptionCScmStart.cs`;
  nuevo `OptionCQueryContracts.cs` con contratos puros de consulta y espera.
- Identidad nativa: nuevos `OptionCFirmwareIdentity.cs`, `OptionCSmbiosContract.cs`;
  vínculo privado en `OptionCContract.cs`, `OptionCBootstrap.cs`, `SetupPostgres.cs` y
  entorno/controlador de `OptionCNativeValidation.cs`.
- Limpieza: nuevo `OptionCValidationCleanup.cs`; estado ampliado en
  `OptionCServiceConfig.cs`, petición acotada en `OptionCServiceRegistration.cs`.
- Perfil visible actualizado en `OptionCValidationEntry.cs`, conservando las rutas
  de apertura gráfica/UAC/solicitud/probe y el dispatcher SCM temprano.
- Construcción/pruebas/evidencia: `build-validation-entry.cjs`,
  `export-scm-start-evidence.ps1`, `scm-start.test.cjs`; nuevos
  `token-query-stop.test.cjs`, `test-token-stop-contracts.ps1` y diagnóstico de solo
  lectura `diagnostics/OwnTokenQueryDiagnostic.cs`.
- Procedimiento: `docs/PRUEBA-TOKEN-PARADA-SETUPPOSTGRES-V04.md`.

Las rutas C# anteriores pertenecen a scripts/windows-setup-native; las restantes a
scripts/windows-setup. Cambios/hash por fuente: verification.json. Se preservaron
copias previas. No se tocaron base de datos, backend/frontend funcional o integraciones.

## Qué se probó realmente

- Compilación offline de **17 fuentes** como winexe x64 exclusivo de validación y
  biblioteca del perfil normal, con advertencias como errores.
- **469 pruebas aisladas aprobadas, 0 fallidas/omitidas**, con procesos/red bloqueados;
  misma selección histórica acotada más regresiones específicas. No son 469 ensayos
  nativos en Windows 11 y no certifican toda la suite histórica excluida.
- **37 casos C# compilados/ejecutados** de consulta, transiciones y SMBIOS. Parada SCM
  y firmware VirtualBox se simularon con callbacks/fixtures; los casos de tamaños
  usan los resultados del diagnóstico real de token propio.
- **12 pruebas C# de selección de entrada**, callbacks simulados; inspección PE/IL
  confirma subsistema gráfico, STA, rutas GUI/UAC y perfil. No se abrió el host aquí.
- Dos lecturas nativas limitadas: token propio y firmware del anfitrión. **No se
  llamó SCM, no se redujeron tokens ni crearon Jobs**, no se cambió seguridad y no
  se ejecutó SetupPostgres/PostgreSQL ni el componente en cuarentena.
- Inventario/fuentes cotejados, **24 entradas ZIP** verificadas por hash. Entregas
  V-01/V-02/V-03 y native-approval.json conservan sus hashes y barreras generales.

No hay aceptación real V-04 en Windows 11, de token independiente, Job, limpieza,
initdb, T0, login, Reservaciones o Daily. No se construyeron candidate-05/setup-03.

EXE final SHA256: `3bab51b195bad54962f5430f45a62201577b44ce0fcb00459713c86cf71dcbd3`.
ZIP final SHA256: `23a560c5b5306fdf5641573a7ce538803652a2b537b8f227726dd3d58661900e`.
Firma Authenticode: NotSigned. El ZIP contiene fuentes, inventario y SHA256SUMS.txt.

## Siguiente paso manual

Primero preservar los registros y observar **sin cambiar nada** el estado actual
original. Si hay actividad o no puede demostrarse su estado, conservar intacta la
VM fallida y preparar un ensayo separado desde una instantánea previa; no ejecutar
V-04 encima del estado ambiguo ni usarlo para limpiar/adoptar V-03. El procedimiento
especifica un único suspended futuro con UUID nuevo y mismos límites, sin repetir
V-03 ni las verificaciones anteriores satisfactorias.

Referencias: [GetTokenInformation](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-gettokeninformation),
[GetLastWin32Error](https://learn.microsoft.com/en-us/dotnet/api/system.runtime.interopservices.marshal.getlastwin32error?view=netframework-4.8.1),
[GetSystemFirmwareTable](https://learn.microsoft.com/en-us/windows/win32/api/sysinfoapi/nf-sysinfoapi-getsystemfirmwaretable),
[QueryServiceStatusEx](https://learn.microsoft.com/en-us/windows/win32/api/winsvc/nf-winsvc-queryservicestatusex)
y [Stopping a Service](https://learn.microsoft.com/en-us/windows/win32/services/stopping-a-service).
