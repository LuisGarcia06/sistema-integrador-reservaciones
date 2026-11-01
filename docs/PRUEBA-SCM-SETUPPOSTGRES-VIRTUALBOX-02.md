# V-02: conexión SCM de SetupPostgres, ensayo limitado

Alcance: `synthetic-acceptance-only`; `productionAuthorized=false`.
**Solo se habilita suspended. No se instala PostgreSQL ni Community Tours.**

## Evidencia original y diagnóstico

El intento V-01 pertenece a `3326dcf8-f3ff-443e-866a-ee18ffcb60e1`, servicio
`CTSK026-3326dcf8-f3ff-443e-866a-ee18ffcb60e1`. El usuario reportó hashes cotejados,
interfaz abierta, consentimiento/UAC aceptados y fallo OWN_SERVICE_START_FAILED,
win32Error=0, complete=false. No se repitió ni se ejecutaron otros casos.

Los textos reportados de eventos Sistema/Service Control Manager **7000 y 7009**
indican un timeout de conexión del servicio de **30000 ms**. La hora mostrada por
Windows fue **01/11/2026 15:59:09**. La referencia inicial aproximada fue **9:59 a. m.
America/Cancun**. Se conservan ambas; no conocemos la zona del invitado ni el
TimeCreated/SystemTime XML y no atribuimos una causa a la diferencia. No cambiar
reloj ni zona horaria para hacer coincidir evidencias.

Defectos confirmados en las fuentes V-01:

1. StartServiceW retornaba falso, pero Check.That lanzaba una excepción sin el
   GetLastError. El transporte terminaba mostrando 0 por defecto. Ese 0 **no es
   éxito ni el código real de SCM**. Los eventos confirman el timeout, pero no
   recuperan retrospectivamente el DWORD exacto que devolvió StartServiceW.
2. El host hacía Contract.Machine (WMI), lectura/hash/ACL del intent y otra
   Contract.Machine antes de ServiceBase.Run. Es trabajo de inicialización antes
   de establecer el protocolo SCM. Las consultas podían consumir parte o todo
   el plazo y un fallo temprano no dejaba recibo de worker. No se ha demostrado
   cuál de esas instrucciones demoró/falló en la VM; no se afirma que WMI fuese
   por sí sola la causa exacta.

Corrección concreta: Main reconoce --service-instance primero. Solo valida el UUID,
crea ServiceBase y llama Run. OnStart solicita plazo y despacha un worker. Las mismas
comprobaciones de Windows/VM, identidad, imagen, registros privados y controlador
se ejecutan después de conectar. **No se omiten ni se permite crear el probe antes
de ellas.** Se añaden hitos durables después del enlace local, VM y controlador.

La API captura inmediatamente el error de StartServiceW antes de consultar estado,
escribir o liberar handles. Se conserva separado de dwWin32ExitCode,
dwServiceSpecificExitCode, checkpoint y waitHint. Un error cero/ausente con BOOL
falso permanece fallo, con win32ErrorAvailable=false. Un BOOL verdadero solo indica
aceptación SCM; no certifica primer token, Job, contención ni inicialización.

## Revisión de imagen, cuenta, SID, ACL y argumentos

- CreateService crea exclusivamente un nombre nuevo; no tiene fallback de adopción.
  Servicio OWN_PROCESS, inicialmente deshabilitado y después manual para el ensayo.
- Imagen: copia privada `C:\ProgramData\CommunityTours\Acceptance026\<UUID>\control\SetupPostgres.exe`,
  hash ligado al host extraído; ruta absoluta entre comillas.
- Línea fija: `"<imagen privada>" --service-instance <UUID>`. StartServiceW recibe
  cero argumentos adicionales. No se lee stdin, ni se pide UAC o muestra GUI dentro
  de la ruta SCM. El directorio actual de SCM no se usa para localizar registros.
- Cuenta virtual: `NT SERVICE\CTSK026-<UUID>`, contraseña NULL, SID resuelto de esa
  misma cuenta y configuración SERVICE_SID_TYPE_RESTRICTED. No se cambia por
  LocalSystem, usuario humano ni otra cuenta.
- Solo SeChangeNotifyPrivilege para el bootstrap, sin reinicio automático. No se
  añaden privilegios, derechos de inicio de sesión ni excepciones de protección.
- Preflight lee configuración real, SDDL del servicio y de host/control/work/data,
  verifica rutas/propietario/ACL e integridad. El servicio recibe lectura/ejecución
  del host/control y escritura de sus destinos de trabajo nuevos, igual que antes.
  Esto documenta la configuración; no se presenta como prueba del token efectivo.
- La identidad de UAC permanece ligada al mismo SID Windows. El servicio consulta
  vida del controlador por handle, creación e imagen; no recibe acceso a su memoria
  o token. Se conserva la restauración de DACL del proceso controlador.

Los fallos de escritura de diagnósticos y de limpieza no reemplazan el error SCM
principal. Se conserva una causa secundaria separada. Si StartServiceW falla, el
kit no intenta iniciar de nuevo ni modificar el servicio detenido como remedio.

## Conservar V-01 antes de probar otra instancia

1. Mantener apagada la red. No reiniciar, detener, configurar ni eliminar el
   servicio CTSK026-3326dcf8-f3ff-443e-866a-ee18ffcb60e1. No copiar el EXE nuevo
   encima de su control ni editar intent/result/approval del intento original.
2. En Visor de eventos, seleccionar los dos eventos originales 7000/7009 y usar
   **Guardar eventos seleccionados…** en una carpeta nueva de evidencia. En cada
   uno: Detalles → Vista XML → copiar todo, incluyendo RecordID y
   TimeCreated/SystemTime. Guardar capturas originales y anotar que la zona del
   invitado aún debe cotejarse. Guardar eventos no limpia el registro.
3. Copiar como datos, sin ejecutar, la carpeta del intento original en ProgramData,
   su carpeta `%LOCALAPPDATA%\ctsk-native-validation-<operationId>` y el transporte
   `%LOCALAPPDATA%\ctsk-native-rpc-<operationId>`. El operationId está en
   trial-plan.json/intent.json. Conservar también ZIP/hashes V-01.
4. Opcional: el kit incluye Exportar-Evidencia-SCM.ps1. Lee el servicio exacto,
   imagen/hash/ACL, archivos conocidos y eventos del UUID; escribe solo una carpeta
   de exportación nueva. Para el original, en PowerShell elevado del mismo usuario:

   ```powershell
   .\Exportar-Evidencia-SCM.ps1 -InstallationId '3326dcf8-f3ff-443e-866a-ee18ffcb60e1' -Destination "$env:USERPROFILE\Desktop\V01-original-conservado"
   ```

   Consulta dos ventanas locales independientes (15:54–16:04 y 9:54–10:04) y conserva
   XML, horas/zona del invitado y errores de consulta. No atribuye equivalencia de
   horas ni certifica seguridad. Si una política bloquea el script, no cambiarla:
   conservar la evidencia mediante los pasos gráficos. No hay restauración ni
   uso de cuarentena.
5. Exportar la evidencia fuera de la VM como datos y comprobar que puede leerse.
   Crear un snapshot adicional `despues-V01-fallo-conservado`. Conservar el snapshot
   previo. No restaurarlo antes de sacar los archivos/eventos del intento fallido.

## Un solo intento V-02 en instancia nueva

1. En Windows11-CommunityTours-Test, extraer CTSK-026-NativeValidation-02.zip dentro
   del disco del invitado en una carpeta NUEVA del mismo usuario. No usar una
   carpeta compartida, red, ruta del kit 01 ni directorio del servicio anterior.
   Mantener protecciones activas. El EXE no tiene firma Authenticode de editor.
2. Calcular SHA256 de ZIP y EXE, cotejarlos con el informe de V-02 externo a la VM
   y SHA256SUMS.txt/kit-inventory.json. El hash identifica la entrega; no habilita
   excepciones al antivirus. Si una protección bloquea el archivo, detenerse y
   conservar la alerta, sin restaurar, excluir ni reconstruir para eludirla.
3. Abrir SetupPostgres.exe **normalmente**. El título debe indicar
   **validacion nativa 02 — diagnostico SCM**. Solo debe existir `suspended`.
4. Marcar el consentimiento y pulsar una sola vez. Anotar el NUEVO installationId,
   operationId y ruta de plan mostrados antes de UAC. El UUID debe ser diferente
   del original. Aceptar UAC únicamente con el mismo usuario/SID.
5. Esperar el resultado, guardarlo y detener la sesión de pruebas, tanto si pasa
   como si falla. No iniciar otro caso, repetir el clic, usar sc start, cambiar
   ImagePath, cambiar cuenta/ACL/privilegios o ejecutar manualmente el host privado.
   Este ensayo no inicializa un clúster ni abre puertos PostgreSQL.

## Qué devolver del intento NUEVO

- `trial-plan.json`, `result.json` de la ruta mostrada por la ventana.
- `control\scm-before-start.json` y `control\scm-start-call.json`: identidad,
  ImagePath, cuenta/SID, SDDL/privilegios, hash, BOOL de API, Win32 inmediato,
  estado/exit codes posteriores. Si no se produjo uno, registrar su ausencia.
- Los hitos `work\service-startup-local-bound.json`, `...-machine-bound.json` y
  `...-controller-bound.json`; `work\bootstrap-result.json` si existe.
- Eventos Sistema SCM y Aplicación (.NET Runtime/Application Error/Windows Error
  Reporting) de esa ventana, con XML y horas. Exportar-Evidencia-SCM.ps1 acepta
  el UUID nuevo y `-WindowsLocalStarts 'AAAA-MM-DDTHH:mm:ss'`; usar la hora mostrada
  por el invitado unos cinco minutos antes del intento y un destino nuevo.
- Hashes del nuevo EXE/ZIP y captura del resultado. No contiene contraseñas.

Interpretación:

| Resultado | Lectura permitida |
|---|---|
| accepted=false y Win32 1053, eventos 7009 | Persiste fallo de conexión. No inferir que el worker/token/Job empezó. Revisar también errores de CLR/loader y si hubo hitos. |
| accepted=false con otro Win32 | Conservar ese código primario y estado separado; investigar esa causa sin cambiar cuenta o permisos. |
| accepted=false, Win32 0 | Error no disponible; siempre fallo. No presentar salidas de servicio 0 como éxito. |
| accepted=true, hito local-bound | Hubo entrada al worker y lectura/autenticación local. No demuestra token hijo ni Job. |
| hito machine-bound / controller-bound | Se completó esa etapa; no se certifican etapas posteriores por inferencia. |
| complete=false con startupStage | Fallo de etapa identificada. Conservarlo aunque el servicio haya terminado. |
| complete=true de suspended | Revisar constancia completa, primer token y postcondiciones; hasta esa revisión no se marca aceptación nativa. No autoriza aprovisionamiento. |

En conclusión normal el servicio nuevo queda detenido/deshabilitado según sus
postvalidaciones. Si falla el arranque o la limpieza es ambigua, puede conservarse
manual/detenido u otro estado: no repararlo ni reintentarlo, conservar evidencia.
El servicio original permanece intacto. Tras exportar los resultados se puede
volver al snapshot conservado para descartar únicamente el ensayo nuevo.

## Referencias verificadas

[StartServiceW](https://learn.microsoft.com/en-us/windows/win32/api/winsvc/nf-winsvc-startservicew)
exige consultar GetLastError ante retorno falso; su aceptación no equivale a inicio
completo del servicio. [StartServiceCtrlDispatcherW](https://learn.microsoft.com/en-us/windows/win32/api/winsvc/nf-winsvc-startservicectrldispatcherw)
indica conectar cuanto antes y ejecutar inicialización específica después de esa
conexión. [ServiceBase.Run](https://learn.microsoft.com/en-us/dotnet/api/system.serviceprocess.servicebase.run?view=netframework-4.8.1)
registra la entrada administrada y permite recibir OnStart. Esas reglas justifican
la corrección del orden; no prueban retrospectivamente la instrucción exacta que
falló en V-01.
