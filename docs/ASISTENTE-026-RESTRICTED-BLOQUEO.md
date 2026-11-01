# POLICY_BLOCKED: diagnóstico y bloqueo de candidate-04

Estado: detenido antes de modificar candidatos o construir un asistente nuevo.
No se generó `026-setup-03`. Candidate-03, candidate-04 y setup-02 se conservaron.

## Causa inmediata confirmada por orden de ejecución

En el asistente empaquetado `026-setup-02`, `dispatch('verify')` ejecuta primero:

```text
powershell.exe -NoProfile -NonInteractive -File
  <server instalado>\Verify-Payload.ps1 -Side server
```

La llamada está en `scripts/windows-setup/coordinator.cjs`, función `runScript()`
línea 31, invocada desde la línea 91. Si stderr contiene PSSecurityException,
UnauthorizedAccess o los mensajes de carga previstos, se devuelve POLICY_BLOCKED.
El servidor se verifica antes que el cliente: el primer rechazo impide llegar a
la verificación del cliente y a las comprobaciones posteriores de versiones.

El usuario confirmó Windows 11 Home con todas las políticas de ámbito Undefined
y política efectiva Restricted. Es coherente con el comportamiento documentado:
Restricted no permite archivos de script y es el resultado predeterminado en
Windows cliente cuando todos los ámbitos están sin definir. Firmar el ps1 no
lo habilita bajo Restricted.
[Referencia Microsoft](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies?view=powershell-5.1).

Las comprobaciones previas `context()` también usan PowerShell codificado para
WMI/SID y ACL. Eso es distinto del rechazo del archivo ps1: no se afirma que
Restricted bloquee todo comando PowerShell. Esos mecanismos quedan igualmente
excluidos por la restricción explícita actual del usuario. No se ejecutaron
durante este diagnóstico.

## Auditoría de las ocho etapas

Todas las acciones, incluido Revisar estado, comienzan por `context()`, que utiliza
PowerShell codificado. Las dependencias específicas adicionales son:

| Etapa | Dependencias de setup-02 y candidate-04 |
|---|---|
| 1. Verificación | Verify-Payload.ps1 de servidor y cliente, mediante -File |
| 2. Directorios | Repite verificación; private-directories.ps1; ACL codificada |
| 3. Confianza | Node/OpenSSL generan material; las comprobaciones ACL llaman PowerShell codificado |
| 4. Init/T0 | Maintain-Server.ps1; maintenance.cjs/provision llaman ACL y windowsProcess codificados |
| 5. Administrador | console-stage.ps1 y Maintain-Server.ps1; ACL y control de clúster internos |
| 6. Cliente | Maintain-Server.ps1; lectura de plan y descriptor con ACL internas |
| 7. Servidor | Start-Server.ps1, console-stage.ps1, ACL y windowsProcess internos |
| 8. Electron | Lanzamiento directo de electron.exe, pero el descriptor y el cliente original llaman sus propias ACL codificadas |

La dependencia del cliente no termina al abrir la ventana: su supervisor vuelve
a leer el descriptor periódicamente y repite esas comprobaciones.

## Por qué un asistente externo no basta

Los puntos de entrada Node existentes son utilizables directamente:

- `tools/maintenance.cjs --isolated-lab <solicitud>` conserva init, T0, bootstrap
  y emisión del descriptor, sin necesidad de su envoltura ps1.
- `tools/server-control.cjs check|run <plan> <autoridad>` conserva preflight y
  supervisor, sin necesidad de Start-Server.ps1.
- `tools/payload.cjs.verify()` permite verificar los archivos sin Verify-Payload.ps1.

Sin embargo, el mantenimiento directo vuelve a invocar
`app/backend/config/windowsConfigAcl.js`; este ejecuta PowerShell codificado.
`app/shared/windowsProcess.js` hace lo mismo para iniciar y detener pg_ctl.
El cliente distribuido contiene su propio `electron/windowsConfigAcl.js` y lo
invoca al leer el descriptor y durante la supervisión. Esos puntos de uso no
ofrecen una selección soportada de implementación nativa externa.

Un puente nativo añadido solo al asistente no sustituye automáticamente esas
dependencias internas. No se utilizarán monkey patches, interceptación de require,
ejecutables que suplanten powershell.exe, cambios de SystemRoot ni eliminación
de comprobaciones. Cambiar esos archivos in situ invalidaría los inventarios.

Por tanto, para cumplir toda la cadena sin PowerShell se requiere un candidato
nuevo del servidor y también del cliente. Esto es un bloqueo técnico justificado,
no una autorización para reconstruirlos en esta tarea: el usuario pidió detenerse
y precisar primero los cambios mínimos.

## Cambios mínimos propuestos, no implementados

1. Añadir un componente nativo Windows con comandos cerrados para leer identidad
   de VM/SID, verificar ACL/propietario/ancestros y crear directorios con DACL privada.
   Emplear las API Windows de descriptores de seguridad; fs.chmod/fs.access no
   sustituyen las comprobaciones DACL de Windows. Debe conservar exactamente los
   SIDs y máscaras del verificador actual, rechazar UNC/reparse points y fallar
   cerrado. Incorporarlo en los inventarios de servidor y cliente.
   [GetNamedSecurityInfoW](https://learn.microsoft.com/en-us/windows/win32/api/aclapi/nf-aclapi-getnamedsecurityinfow).
2. Sustituir la implementación PowerShell de
   `backend/config/windowsConfigAcl.js` y de su copia distribuida en el cliente
   por ese componente, manteniendo su contrato de error y todos sus puntos de uso.
3. Sustituir `shared/windowsProcess.js` por lanzamiento nativo, con parámetros
   delimitados, UTF-16, cwd y entorno controlados. Conservar PGDATA limitado al
   hijo y los chequeos de marcador, identidad y PID/puerto en `control()`.
4. Abrir Node directamente en una consola nueva para bootstrap y servidor,
   mediante un lanzador nativo, sin cmd, PowerShell, tuberías de contraseña ni
   argumentos con secretos. Conservar `localCapture()` y los comprobadores
   originales de bootstrap, constancia y reinscripción.
   [CREATE_NEW_CONSOLE](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags).
5. En el asistente, reemplazar `context()`, `runScript()`, `launchConsole()`,
   creación de directorios y console-stage por Node y el componente nativo.
   Reutilizar las herramientas Node originales para la lógica de mantenimiento.
6. Regenerar inventarios, hashes y referencias de un candidato independiente,
   preservando candidate-03/04. Nuevas autoridades y descriptores deben enlazar
   los inventarios nuevos. No se requieren cambios de esquema ni de roles.

### Requisito adicional sobre shells

El pg_ctl oficial de Windows usa CMD internamente para arrancar PostgreSQL y
redirigir su log. Eso no es una llamada introducida por la interfaz del asistente.
Si se exige ausencia total de shells en la cadena, lanzar pg_ctl con CreateProcess
no basta: se necesita un arranque nativo de PostgreSQL que conserve el token
restringido, la gestión de handles/logs, espera e identidad del proceso y el cierre
seguro. No sería aceptable sustituirlo por un spawn sencillo que herede privilegios
más altos. El alcance de ese lanzador debe revisarse antes del candidato nuevo.
[Código oficial de pg_ctl](https://github.com/postgres/postgres/blob/REL_18_STABLE/src/bin/pg_ctl/pg_ctl.c).

## Recuperación segura de la etapa 1

`dispatch('verify')` no llama a `state.perform()`, no toma un bloqueo y no crea ni
escribe el archivo privado de sesión. El fallo devuelve la etapa 1 a Pendiente
en la interfaz y deja las siguientes deshabilitadas. Las llamadas previas de
metadata/ACL son de lectura; el perfil gráfico de Electron puede contener su
caché normal, que no es la configuración privada del laboratorio.

Si solo se intentó la etapa 1, cerrar normalmente el asistente es suficiente.
No borrar ni editar state.json, directorios, claves o bases. No volver a intentar
las etapas con setup-02 para buscar una vía de ejecución PowerShell alternativa.
Una versión compatible podrá reiniciar la verificación sin limpiar esos datos.
Si hay una sesión de trabajos anteriores, deberá inspeccionarse con herramientas
nativas verificadas y conservarse, no resetearse automáticamente.

## Pruebas realizadas y límites

Archivo nuevo: `scripts/windows-setup/restricted-policy.test.cjs`.
Diez pruebas aprobadas, cero fallos. El rechazo de -File se simula con el error
de política; las demás llamadas a PowerShell se interceptan sin iniciar procesos.
Esto reproduce la incompatibilidad y no certifica una versión corregida.

Se comprobaron la llamada exacta de etapa 1, ausencia de escrituras privadas,
dependencia ACL al invocar Node directamente, dependencia del cliente con perfiles
VMUser, VM User, VM Usuario Prueba y caracteres especiales, dependencia del
lanzador de pg_ctl, recuperación visual de etapa 1 y verificación de payload
mediante Node. No se modificó ninguna política del anfitrión.

Evidencias: `local-fase-2e7-restricted/restricted-tests.tap` y `verification.json`.
Los hashes e inventarios de candidate-03, candidate-04 y setup-02 se verificaron
de nuevo. No se ejecutaron PowerShell, shells ni aprovisionamiento como parte de
las pruebas de la aplicación; no hubo conexiones PostgreSQL ni instalación real.

Quedan pendientes una implementación nativa autorizada, pruebas con denegación
de todos los intérpretes, ACL reales, rutas Unicode/especiales, consola TTY, las
ocho etapas completas y primer login en Windows 11 con Restricted sin cambios.
