# V-03: siguiente ensayo único SCM con suspended

Alcance: `synthetic-acceptance-only`; `productionAuthorized=false`.
Estado: **apertura gráfica V-03 satisfactoria**, según el reporte manual del usuario
sobre Windows11-CommunityTours-Test. Se confirmó perfil, controles y ausencia de
consola/VALIDATION_ARGUMENTS. No se reportó un ensayo de cierre y no se le atribuye.
No se ejecutó suspended ni UAC. **SCM, primer token, Job y contención siguen pendientes.**

Registro: `local-fase-2e7-native-validation-03/V03-user-observation.json`.
Estado vigente: `local-fase-2e7-native-validation-03/manual-acceptance-status.json`.
Las constancias históricas de construcción se conservan como tales, sin reescribirlas.

## Usar lo ya aprobado

Usar la misma extracción V-03 y el mismo SetupPostgres.exe cuyo hash ya cotejó el
usuario: `6668fac607d0234a7bfe033497973ae638dd51426c54de3b537a1c759236a7d5`.
No hay nuevo EXE, ZIP, compilación, cambio de configuración o aprobación general.
**No repetir F-01, F-02, la aceptación de apertura gráfica ni el cotejo manual del
mismo archivo que permanece intacto.** Los controles automáticos de integridad,
ACL y contexto que hace el programa en cada operación permanecen activos.

Conservar capturas, resultados y eventos V-01/V-02 y el registro de apertura V-03.
El servicio protegido es **CTSK026-3326dcf8-f3ff-443e-866a-ee18ffcb60e1**; no iniciarlo,
detenerlo, configurarlo, borrarlo ni copiar archivos a su carpeta. No restaurar un
snapshot sobre el único ejemplar de evidencia no exportada.

## Efectos limitados del intento

Un clic genera installationId y operationId nuevos, escribe plan/transporte
privados y solicita UAC del mismo usuario. Solo después crea un servicio nuevo
CTSK026-UUID con cuenta virtual propia, SID restrictivo y destinos nuevos control,
work y data. No adopta un nombre/directorio previo. El caso crea una copia del probe
**suspendida**, lee su token y comprueba el Job, y la termina **sin reanudarla**.
No ejecuta initdb/pg_ctl/PostgreSQL, no abre un clúster ni realiza bootstrap SQL.
El puerto del registro bootstrap no se abre en este ensayo.

## Pasos en Windows11-CommunityTours-Test

1. Mantener la red desactivada y las protecciones activas. Conservar los snapshots
   previos. Crear un snapshot adicional del estado actual llamado
   `V03-GUI-ok-antes-SCM`, sin sustituir los anteriores. Es una salvaguarda del
   nuevo intento, no una repetición de las pruebas superadas.
2. Continuar en la ventana V-03 ya validada; si se cerró, abrir el mismo EXE
   normalmente para acceder al caso. No volver a ejecutar la comprobación de GUI.
3. Dejar **suspended** como único caso. Marcar el consentimiento limitado y pulsar
   **Ejecutar caso seleccionado una sola vez**. El programa genera ambos UUID en
   ese momento; no hay un UUID preasignado en este documento ni se introduce a mano.
4. Anotar/capturar la nueva ruta de plan, installationId y servicio que muestra la
   ventana. El UUID debe ser distinto de **3326dcf8-f3ff-443e-866a-ee18ffcb60e1**
   y pertenecer a este intento nuevo. Aceptar UAC únicamente con el mismo usuario
   Windows/SID. Si muestra otra cuenta, un UUID previo o un destino incoherente,
   cancelar UAC y detenerse, sin repetir el clic. Si UAC tomó foco antes de poder
   copiar la ruta, conservarla al volver a la ventana; no generar otro intento.
5. Esperar el resultado sin volver a pulsar, cerrar el controlador ni terminar
   procesos. Conservar el JSON/texto visible y la captura, tanto si pasa como si
   falla. El transporte tiene un plazo interno de hasta 7 minutos después de UAC;
   si no concluye, registrar hora/estado y detener el procedimiento sin forzar una
   limpieza o iniciar otro intento.
6. Copiar como datos la evidencia del UUID NUEVO descrita abajo. No ejecutar la
   copia privada del host ni usar sc start/sc stop, Servicios o Administrador de
   tareas para cambiar estados. No modificar la cuenta, privilegios, SID, ACL,
   ImagePath, timeout de Windows o protecciones como respuesta a un fallo.
7. Detener aquí el ensayo, incluso si la interfaz informa complete=true. No ejecutar
   otros casos, crear clúster, bootstrap o continuar al instalador. La constancia
   se revisará dentro de su alcance antes de considerar aceptada la corrección SCM.

## Evidencia mínima del UUID nuevo

En la ruta mostrada por la interfaz:

- `%LOCALAPPDATA%\ctsk-native-validation-<operationId>\trial-plan.json`
- En esa misma carpeta: `result.json`.

En `C:\ProgramData\CommunityTours\Acceptance026\<installationId>`:

- `control\intent.json` y `control\validation-case.json`.
- `control\scm-before-start.json` y `control\scm-start-call.json`.
- `work\service-startup-local-bound.json`, `work\service-startup-machine-bound.json`
  y `work\service-startup-controller-bound.json`.
- `work\bootstrap-result.json`, si existe.

Si falta un archivo, registrar **ausente**; no crearlo ni modificar los originales.
Conservar installationId, operationId, hora mostrada por la VM y cualquier error.
Si falla, guardar los eventos NUEVOS Sistema/Service Control Manager y Aplicación
(.NET Runtime/Application Error) relacionados con ese UUID/SetupPostgres en la
ventana del intento. No repetir la búsqueda de los eventos antiguos 7000/7009.
Guardar XML/RecordID/TimeCreated si están disponibles; no ajustar el reloj para
hacer coincidir la hora histórica 9:59 con la mostrada entonces como 15:59:09.

El recolector **Exportar-Evidencia-SCM.ps1 ya incluido en V-03 es opcional** y solo
consulta el intento indicado y exporta a una carpeta nueva. Para el intento nuevo
hay que pasar **su UUID y su hora local de Windows**, no los valores históricos
predeterminados. Ejemplo con marcadores que se deben sustituir:

```powershell
.\Exportar-Evidencia-SCM.ps1 -InstallationId 'UUID-NUEVO-DEL-PLAN' -Destination "$env:USERPROFILE\Desktop\V03-SCM-intento-nuevo" -WindowsLocalStarts 'AAAA-MM-DDTHH:mm:ss'
```

Usar como inicio unos cinco minutos antes de la hora mostrada por la VM. No ejecutar
el ejemplo sin sustituir esos marcadores. Si una política bloquea el recolector,
no cambiarla: copiar los archivos con Explorador y guardar los eventos desde Visor
de eventos. No restaurar, excluir ni usar componentes en cuarentena.

## Interpretación que evita falsos positivos

| Evidencia | Qué demuestra y qué no |
|---|---|
| `scm-start-call.json → call.accepted=false` | StartServiceW falló. Conservar su Win32 inmediato y estado posterior por separado. Win32 0/no disponible nunca significa éxito. |
| `call.accepted=true` | SCM aceptó la conexión/entrada de servicio; no basta para certificar inicialización del worker, token o Job. |
| Hitos local-bound, machine-bound, controller-bound | Llegó a esas barreras. Sus complete=false/tokenValidated=false son intencionales: son hitos, no constancias finales. |
| `complete=false` o falta recibo | Ensayo no aceptado. Preservar code, win32ErrorAvailable, hresult, nativeDiagnostics, startupStage y secondaryFailure si existen; no repetir. |
| `complete=true` para suspended | Solo resultado candidato de este caso; revisar identidad/constancia/postcondiciones completas antes de aceptarlo. No autoriza aprovisionamiento. |

Para un suspended completo se esperan exactamente las fases
`created-suspended → job-assigned → token-checked → termination-proven → job-empty`,
con `probeResumed=false`, `initdbResumed=false`, `postgresExecuted=false`,
`jobEmpty=true`, `terminationProven=true`, `dataDirectoryEmpty=true`,
`controllerCleanupVerified=true` y `serviceDisabled=true`. El primer token debe
corresponder al SID virtual del plan/servicio, ser restrictivo, Medium, sesión 0,
no elevado y con los grupos/privilegios permitidos. No debe existir
`work\probe-started.json`, puesto que el probe no debe ejecutarse.

Ante 1053/7009 se revisará si persiste la conexión; ante 1314, acceso denegado u otro
error se conservará la nueva causa sin conceder privilegios ni escoger un método
alternativo. Una limpieza ambigua o un servicio nuevo que siga activo es fallo,
no permiso para matar por nombre, borrar datos o reparar la instancia anterior.
Tras exportar la evidencia nueva, el snapshot adicional permite descartar solo el
ensayo nuevo si hace falta; no borrar manualmente servicios/directorios previos.

**No se construyeron candidate-05/setup-03 ni se validaron login, Reservaciones o
Daily.** El siguiente avance depende del resultado real de este único intento.
