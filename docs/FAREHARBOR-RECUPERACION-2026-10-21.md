# Recuperación de FareHarbor — 21 de octubre de 2026

Hora local: Cancún (UTC−05:00).

## Incidente y procedencia del proceso

La tarea existente `CommunityTours-FareHarborContinuous` estaba detenida, sin escucha en 3443. Quedó ngrok PID 21752, creado a las 10:29:22, padre Node PID 27740 ya inexistente. El registro de verificación de las 10:32 identificaba ese mismo árbol como la integración independiente de Windows.

La inspección elevada verificó el SID del propietario, la fecha de creación, el padre ausente, todos los argumentos (sin argumentos adicionales), la configuración mediante el parser existente y la ausencia de receptor. El único descendiente era su propio `conhost.exe` de System32. Ejecutable: `C:\Program Files\WindowsApps\ngrok.ngrok_3.39.9.0_x64__1g87z0zv29zzc\ngrok.exe`; SHA256 `28317F39D20029119E11562673B134ADA4EF6FEB508B4A22453731751A675362`.

Único dominio: `fleshed-patchy-cassette.ngrok-free.dev`. Único destino: `https://127.0.0.1:3443`. Configuración privada: `%LOCALAPPDATA%\CommunityTours\integrations\fareharbor\ngrok.yml`. No se reproduce ninguna credencial.

Tras esas comprobaciones se cerró únicamente PID 21752 y se inició la tarea existente. La primera comprobación pública `FH_CONTINUOUS_READY` se obtuvo a las 14:48:30.

## Causa y recuperación

El bloqueo persistente de los reintentos sí está demostrado: el lanzador rechazaba cualquier ngrok existente, incluso el huérfano de esta integración.

La causa exacta de la terminación inicial no quedó registrada. Windows suspendió el equipo por inactividad a las 12:02 y lo reanudó a las 12:20. PowerShell registró a las 12:23:31 un aviso 4100, “Error del sistema”, para el lanzador FareHarbor (PID de ese aviso: 24228). No equivale a demostrar por qué terminó el árbol original. El historial operacional de Task Scheduler estaba deshabilitado.

Cambios limitados al lanzador:

- Exclusión de instancias mediante mutex, además de `IgnoreNew` de la tarea.
- Recuperación de huérfanos exclusivamente tras verificar propietario, sesión, padre ausente, puerto libre, argumentos exactos y configuración sin otros endpoints. Nueva verificación de PID y fecha antes de cerrar. Si falta evidencia, no cierra el proceso.
- Conservación del job Windows del receptor con `KILL_ON_JOB_CLOSE`, y seguimiento del PID del túnel hijo. No se fuerza el ngrok de Microsoft Store a otro job: una comprobación adicional de pertenencia/reasignación falló durante el despliegue y se retiró. La recuperación de huérfanos verificados funcionó bajo la propia identidad S4U de la tarea.
- Drenaje de stdout y stderr del proceso Node; diagnóstico persistente acotado en `launcher-status.json`, sin cuerpos, claves o datos personales.
- Conservación de los disparadores existentes y de los reinicios de Windows. Sin cambios de identidad ni elevación permanente.

El primer despliegue se revirtió automáticamente al no confirmar el arranque. Se descubrió que `Get-ScheduledTaskInfo` devolvía segundos incorrectos: 14:59:59 frente a 14:59:39 en el calendario COM nativo y el XML. El procedimiento corregido usa COM para programar y verificar el arranque automático; no altera la definición de la tarea. Los intentos posteriores que detectaron el fallo de reasignación del job también restauraron la versión anterior automáticamente. Se conservan sus reportes, sin presentarlos como verificaciones exitosas.

Resultado final: **FH_AUTOMATIC_RECOVERY_VERIFIED**. El disparador Windows existente inició la tarea a las 15:09:39, sin un arranque manual en esa verificación. El nuevo lanzador reconoció y cerró el huérfano PID 48976 bajo su identidad S4U, y la comprobación pública terminó en `FH_CONTINUOUS_READY` a las **15:09:59**.

Estado final verificado:

- Un único receptor HTTPS: `127.0.0.1:3443`, Node PID **47792**.
- Un único túnel ngrok operativo: PID **53812**, hijo de ese receptor.
- Lanzador Windows PID **41516** → `svchost.exe` PID 2284 → `services.exe` PID 892; todos en sesión 0. No depende de Codex ni de Electron.
- Tarea `Running`, `IgnoreNew`, sin límite de ejecución (`PT0S`), reinicio por error cada minuto (999 intentos) y disparadores de inicio Windows, inicio de sesión y cada cinco minutos.
- Definiciones de ambas tareas idénticas a las previas. Huellas de archivos privados idénticas. Cero discrepancias en las huellas de fuentes del receptor.
- 17 comprobaciones nuevas y aisladas pasadas: identidad, propietario, destino, argumentos extra, ausencia de evidencia, otra sesión, padre vivo, puerto ocupado, PID reutilizado, cierre simulado exclusivo y cierre del job en procesos aislados. No se repitieron las pruebas funcionales previas ni se abrieron túneles en esas pruebas.

Respaldo del despliegue final: `%LOCALAPPDATA%\CommunityTours\integrations\fareharbor\recovery-backups\20261021T200817Z`. Evidencia operativa: `recovery-deployment-20261021.json`, `launcher-status.json` y `continuous-status.json` en el directorio privado de FareHarbor.

## Datos y entregas

Auditoría mediante transacciones PostgreSQL `READ ONLY`: 1,150 reservaciones, 8 eventos FareHarbor y 3 vínculos existentes; se compararon huellas de las filas completas. No se generaron eventos ni reservaciones de prueba en la base principal.

Comprobación posterior, a las 15:10:46: las huellas de las 1,150 reservaciones, los 8 eventos FareHarbor y los 3 vínculos son idénticas. La aprobación automática permanece en NULL y no existen filtros UUID, marcadores, límite de eventos ni límite temporal. No ingresó ningún evento nuevo durante esta comprobación; `READY` demuestra disponibilidad pública del receptor, no una entrega real nueva inventada para probarlo.

Pendientes locales: 0 modificaciones y 0 cancelaciones. Existe una cancelación histórica del 12 de octubre, sin pendientes. El usuario confirmó con la empresa que entre las 11:59 y las 14:48 no hubo altas, modificaciones ni cancelaciones. Por tanto, no hay eventos de ese intervalo que recuperar, según esa confirmación; no se presupone que FareHarbor los reenvíe. Esto no extiende la confirmación a intervalos posteriores.

No se pudo consultar el panel remoto: la herramienta de navegador falló antes de iniciar. La búsqueda de correos FareHarbor en el intervalo no produjo resultados. La documentación oficial advierte que los reintentos tienen una ventana limitada y pueden agotarse: [FareHarbor — Webhooks](https://demo.fareharbor.com/api/external/v1/webhooks).

Full Capture cloud continúa **sin confirmar**. No se cambió KEY, webhook, dominio, archivos ngrok ni certificados. GetYourGuide no se modificó. La aplicación manual de reservaciones sigue intacta.

## Archivos

- `scripts/Start-FareHarborContinuous.ps1`: lanzador actualizado.
- `scripts/FareHarborProcessRecovery.ps1`: verificación, cierre acotado de huérfanos y diagnóstico.
- `scripts/Test-FareHarborRecovery.ps1`: 17 comprobaciones aisladas, sin túneles ni base de datos.
- `scripts/Repair-FareHarborOrphan.ps1`: recuperación puntual autorizada del PID original.
- `scripts/Inspect-FareHarborJob.ps1`: inspección elevada de procesos, solo lectura.
- `scripts/Deploy-FareHarborRecovery.ps1`: respaldo, despliegue, verificación y reversión.
- `scripts/inspectFareHarborRecovery.cjs`: auditoría de datos en solo lectura.

En la instalación privada solo se despliegan el lanzador y su auxiliar; `continuous.json` actualiza las huellas de esos dos archivos. Los archivos de recepción y la aplicación protegida de Electron no se sustituyen.

Los reportes operativos y respaldos se conservan en `%LOCALAPPDATA%\CommunityTours\integrations\fareharbor\`. La reversión restaura los bytes originales de `continuous.json` y del lanzador desde `recovery-backups\<fecha>`, verifica/cierra exclusivamente cualquier huérfano de la integración y arranca la misma tarea. No restaura la base ni modifica datos.
