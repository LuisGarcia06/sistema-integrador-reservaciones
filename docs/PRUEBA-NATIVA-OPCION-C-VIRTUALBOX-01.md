# Prueba nativa opción C — VirtualBox 01 (V-01)

Alcance: `synthetic-acceptance-only`; `productionAuthorized=false`.
Estado al entregar: EXE compilado; **no ejecutado ni validado en Windows 11**.
F-01 y F-02 permanecen satisfactorias según el reporte manual. No repetirlas.

## Qué entrega este kit

`SetupPostgres.exe` es una compilación **NATIVE_VALIDATION_ONLY** del host de
opción C. Comparte cuenta virtual, registro SCM, transporte UAC del mismo actor,
ACL privadas, reducción de token, creación suspendida, lista de tres handles,
asociación atómica de Job, lectura independiente del token y limpieza con las
fuentes del instalador. Una interfaz local permite elegir cada caso.

El proceso hijo es una copia verificada del propio EXE, **no initdb**. El protocolo
acepta únicamente UUID, caso y consentimiento. No acepta rutas, ejecutables,
comandos, contraseña ni acciones de instalación. Ni `initialize`, ni SQL, ni
credenciales, ni la promoción a `pg_ctl runservice` son entradas disponibles en
esta compilación. No incluye ni necesita PostgreSQL.

Esto permite medir las primitivas nativas sin inventar un inventario autenticado
de PostgreSQL. **No certifica el token de initdb, su contexto CMD/perfil, sus DLL,
su inicialización, el servicio oficial, T0, login ni módulos.** El perfil posterior
de aprovisionamiento debe volver a validarse con su propio hash y las referencias
oficiales autenticadas; V-01 no habilita automáticamente candidate-05/setup-03.
Los campos de puerto/hash en `intent.json` se conservan por compatibilidad del
registro bootstrap: el puerto 55443 no se abre, y el hash referencia el host de
prueba, nunca una distribución PostgreSQL.

## Efectos permitidos, uno por clic

- Transporte privado UAC nuevo: `%LOCALAPPDATA%\ctsk-native-rpc-<operationId>`.
- Plan y resultado: `%LOCALAPPDATA%\ctsk-native-validation-<operationId>`.
- Un servicio **nuevo**, `CTSK026-<installationId>`, cuenta virtual del mismo nombre,
  SID restrictivo, solo `SeChangeNotifyPrivilege`, sin contraseña y sin recuperación
  automática. Si el nombre/destino ya existe, se rechaza; no se adopta.
- Un destino nuevo `C:\ProgramData\CommunityTours\Acceptance026\<installationId>`,
  con `control`, `work` y `data`. `data` debe quedar vacío. Si faltan los dos
  contenedores CommunityTours/Acceptance026, se crean con ACL desde su creación;
  si existen se inspeccionan y no se cambian sus ACL.
- Consulta/ejecución de la copia privada del host bajo la cuenta de servicio.
  Un Job no heredable lleva KILL_ON_JOB_CLOSE; solo tres handles se heredan.
- Conclusión normal: servicio verificado detenido y deshabilitado. Se conservan
  archivos/servicio como evidencia. Una muerte abrupta puede dejarlo detenido con
  inicio manual. No existe limpieza global ni reintento de aprovisionamiento.

No modifica PostgreSQL instalado, bases, cuentas funcionales, descriptores,
servicios previos, firewall, registro AutoRun, políticas, antivirus o cuarentena.
No restaura ni usa el componente en cuarentena.

## Preparar Windows11-CommunityTours-Test

1. Apagar la VM y crear un snapshot llamado `antes-V01-sin-cluster`. Conservar el
   estado anterior y la evidencia F-01/F-02. Encender la misma VM Windows 11 x64.
2. Mantener activas las protecciones. Para este ensayo no hace falta red: desconectar
   el adaptador de la VM; no añadir NAT/puentes. Transferir el ZIP como datos y
   extraerlo dentro del disco del invitado, en una carpeta nueva del mismo usuario,
   fuera de carpetas compartidas de VirtualBox, red y destinos de instalación.
3. Abrir PowerShell normal en esa carpeta y calcular:

   ```powershell
   Get-FileHash -LiteralPath .\SetupPostgres.exe -Algorithm SHA256
   Get-FileHash -LiteralPath .\validation-approval.json -Algorithm SHA256
   ```

   Comparar con `SHA256SUMS.txt`, `kit-inventory.json` y el informe entregado fuera
   de la VM. Un hash solo identifica el archivo; no sustituye la revisión de código
   ni una firma Authenticode. No se presenta el EXE como firmado por un editor.
4. Abrir **SetupPostgres.exe con doble clic normal**. No usar “Ejecutar como
   administrador”. Confirmar título “validacion nativa 01 (sin PostgreSQL)” y ambos
   indicadores de alcance. No ejecutar EXE anteriores ni la biblioteca `.dll`.
5. Usar una cuenta que pueda consentir UAC con **su mismo SID**, normalmente un
   administrador local en sesión no elevada. Si UAC exige otra cuenta, cancelar:
   esa elevación no está admitida. No crear usuarios, conceder privilegios, activar
   SeDebug ni modificar políticas para hacer pasar la prueba.

El host comprueba Windows 11 x64, fabricante/modelo VirtualBox y UUID. No puede
verificar el nombre de la VM visible en VirtualBox: el operador debe corroborarlo.
Si una protección bloquea el archivo, detenerse, conservar la alerta/hash y acudir
a revisión legítima. No restaurar, excluir, desbloquear ni variar el binario para
eludir la detección. Si una política bloquea el observador, no cambiarla.

## Orden y criterios

Cada caso genera dos UUID nuevos y requiere marcar de nuevo el consentimiento.
Ejecutar **solo un caso cada vez**. Guardar plan/resultado antes del siguiente.
La cancelación de UAC de la primera fila es un control preliminar opcional y no
crea un servicio. Para la secuencia de primitivas, primero ejecutar `suspended`
aceptando UAC. Si no termina satisfactoriamente, **detener toda la
secuencia** y devolver su resultado; el resto no puede certificar token/Job si la
primera creación falla. No hay repetición automática.

| Caso | Acción del operador | Evidencia que debe observarse |
|---|---|---|
| UAC cancelada | Seleccionar `suspended`, consentir el caso y cancelar UAC | `complete=false`, `ELEVATION_NOT_COMPLETED`, normalmente Win32 1223; no servicio ni instancia nuevos. Solo puede quedar transporte/plan local. |
| `suspended` | Aceptar UAC del mismo usuario | `complete=true`; `probeResumed=false`; token hijo leído por handle; identidad coincide con SID virtual; Medium (`S-1-16-8192`), sesión 0, no elevado, tipo 1, SID restrictivo presente; Administradores/Power Users ausentes o deny-only; solo privilegios permitidos. Secuencia created-suspended → job-assigned → token-checked → termination-proven → job-empty. No `probe-started.json`. |
| `reject-sid` | Ejecutar después de `suspended` | `expectedFailureObserved=FIRST_TOKEN_IDENTITY`, sin resume ni marcador. Se pasa al verificador un SID esperado incorrecto; el token real no se cambia. |
| `reject-privilege` | Ejecutar | `FIRST_TOKEN_PRIVILEGE`, sin resume. Inyección **solo en una copia de la instantánea en memoria**, con SeDebug no permitido; no se concede SeDebug al proceso. El token real original queda en la constancia. |
| `reject-job` | Ejecutar | `VALIDATION_JOB_GATE_REJECTED`, sin resume. Se exige deliberadamente un recuento incorrecto de 2 donde el Job real contiene 1. No se quita ni debilita el Job. |
| `timeout` | Ejecutar; esperar resultado | Solo el probe se reanuda; `INITDB_TIMEOUT` observado después de 2 s de espera; Job terminado y vacío; servicio detenido/deshabilitado. |
| `cancel` | Ejecutar; esperar resultado | Cancelación interna determinista tras 2 s, `INITDB_CANCELLED`, limpieza probada. No equivale por sí sola a matar un controlador. |
| `job-tree` | Ejecutar | Probe y descendiente propios, ambos marcadores; recuento real 2 en el mismo Job; después `terminationProven=true`, `jobEmpty=true`; servicio detenido/deshabilitado. |
| `caller-death` | Seguir procedimiento de muerte de abajo | El servicio detecta la pérdida del llamador/controlador y no sobreviven sus probes. Resultado abortado, nunca éxito de aprovisionamiento. |
| `controller-death` | Seguir procedimiento de muerte | Cierre del controlador elevado detectado por handle/creación/imagen; limpieza del Job del host. |
| `host-death` | Seguir procedimiento de muerte | Ya hay 2 procesos dentro del Job; al morir el host desaparecen ambos sin esperar su salida natural. |

Para todos los casos terminados normalmente exigir `controllerCleanupVerified=true`,
`serviceDisabled=true`, `dataDirectoryEmpty=true`, `postgresExecuted=false`,
`initdbResumed=false` y alcance cerrado. `complete=true` significa **ese caso**;
los rechazos esperados se distinguen de un error temprano. Nunca interpretar un
código cero o `complete=false` con limpieza como aprobación del caso.

Si aparece `INITDB_CREATE_SUSPENDED` con Win32 **1314**, significa que la cuenta
mínima no pudo ejecutar CreateProcessAsUser. Es un resultado real útil y bloqueo:
conservarlo y detenerse. No agregar privilegios, no probar otro método ni ejecutar
manualmente initdb. Aplicar el mismo criterio a acceso denegado (5), fallo al fijar
Medium, perfil, SID, token, Job o limpieza no demostrada.

## Observación independiente y pruebas de muerte

El archivo `trial-plan.json` está en la ruta mostrada por la ventana antes de UAC.
Contiene UUID, ruta exacta del intento y PID/creación/imagen del llamador.
`work\death-ready.json` contiene los PID del controlador elevado, del host y del
hijo, más el primer token. Los marcadores `probe-started.json` y
`probe-grandchild.json` contienen PID, creación e imagen de los probes.

1. Preparar Administrador de tareas → Detalles, con columnas PID, nombre de usuario
   y línea de comandos; usar “Abrir ubicación del archivo” para cotejar imagen.
   No actuar aún. Preparar aparte una consola PowerShell elevada **con el mismo
   usuario**, solo para consultas. No alterar las ACL para lograr acceso.
2. Elegir el caso de muerte y aceptar UAC. Esperar `death-ready.json`. Conservar su
   contenido junto con los marcadores; cotejar UUID, ruta, PID, creación e imagen.
   Si falta o hay discrepancia, detenerse sin finalizar procesos.
3. Actuar inmediatamente, **antes de 10 segundos desde el marcador**:
   - `caller-death`: cerrar únicamente la ventana de validación que inició el caso.
   - `controller-death`: finalizar únicamente el PID de `controllerPid`, imagen
     del EXE extraído y comando `--elevated-request` de esa operación.
   - `host-death`: finalizar únicamente `host.pid`, imagen exactamente
     `<instancia>\control\SetupPostgres.exe`, comando `--service-instance <UUID>`.
     Debe haber 2 probes confirmados en este caso.
   No elegir “Finalizar árbol”, no matar por nombre ni seleccionar PostgreSQL.
4. Dentro de los 10 segundos siguientes, ejecutar el observador de solo lectura:

   ```powershell
   .\Observar-Prueba.ps1 -PlanFile 'RUTA EXACTA\trial-plan.json'
   ```

   Guardar salida y hora; repetir la consulta dos veces, a los 2 y 5 segundos.
   Exigir `ownedProcesses=[]`, servicio `Stopped`, PID 0 y `dataDirectoryEmpty=true`.
   Cotejar `serviceAccount` y `serviceImage` con el UUID del plan. No basta que el
   PID original desaparezca: la consulta busca todas las copias bajo el SID propio
   y todos los probes de su imagen, incluidos descendientes. Si el observador no
   tiene acceso completo, no se certifica ausencia.
5. En muerte abrupta se espera `complete=false`, respuesta ausente o error de
   transporte. El recibo de servicio puede ser incompleto/ausente en `host-death`.
   Conservar eso como aborto y adjuntar las observaciones externas. No fabricar un
   `jobEmpty=true` a partir de un recibo que no existe. Un inicio `Manual` después
   de muerte del controlador es residual esperado; no reiniciar el servicio.

Los probes salen naturalmente a los 45 segundos. Si no se actúa/observa dentro de
las ventanas anteriores, la desaparición tardía **no demuestra KILL_ON_JOB_CLOSE**:
registrar “no concluyente” y detenerse para revisión. Si queda un hijo o servicio
activo, registrar fallo y exportar evidencia; usar la restauración del snapshot
para descartar exclusivamente la VM de ensayo. No limpiar procesos/servicios por
patrones ni borrar destinos previos. No modificar instalaciones existentes.

## Entrega de evidencia y salida

Guardar por caso: hash del EXE/kit, versión/build de Windows, nombre y UUID de VM,
plan, resultado local, `intent.json`, `validation-case.json`, todos los JSON de
`work`, salida del observador y capturas de UAC/errores. No incluyen contraseñas.
No hay credenciales ni clúster en este ensayo. Exportar esa evidencia fuera de la
VM antes de restaurar `antes-V01-sin-cluster`. Los kits F-01/F-02 no se alteran.

Registrar por separado: aprobado, fallo seguro o no concluyente. Sin marcadores
no inferir resume; sin primer token no inferir identidad; sin consulta de Job y
terminación no inferir contención; sin evidencia externa no aprobar muerte abrupta.

Después de revisar V-01: resolver bloqueos reales del ejecutor, autenticar las
referencias de PostgreSQL EXE/DLL y validar el perfil real bajo hash propio; solo
entonces preparar candidate-05/setup-03. La siguiente aceptación autorizada tendrá
que recorrer clúster sintético nuevo → identidad SQL 180006/T0 → primer Administrador
→ autoridad/descriptores firmados → backend/HTTPS → abrir Community Tours → login
→ Reservaciones y Daily sintéticos → cierre/reinicio/persistencia. Nada de eso se
marca como probado por este kit, ni se inicia automáticamente.

Referencias técnicas: los requisitos y el error 1314 se cotejaron con
[CreateProcessAsUserW](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessasuserw).
La lista de handles/Job y la terminación por cierre se contrastan con
[UpdateProcThreadAttribute](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute) y
[Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects).
Estos contratos documentales no sustituyen la observación en la VM.
