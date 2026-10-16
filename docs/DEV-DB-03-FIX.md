# DEV-DB-03-FIX — Compatibilidad con Windows PowerShell 5.1

Verificado el 15 de octubre de 2026. Corrección mínima de `scripts/DevDb03.ps1`; no se cambiaron los scripts auxiliares ni la arquitectura.

## Causa y ubicación

La línea 51 original asignaba `$taskInfo.StandardInputEncoding`. El objeto es `System.Diagnostics.ProcessStartInfo`. La propiedad está disponible en el runtime moderno utilizado por PowerShell Core, pero no existe en el .NET Framework de Windows PowerShell 5.1. La reflexión en el proceso Desktop confirmó su ausencia en System, Version=4.0.0.0.

La comprobación previa se había ejecutado en PowerShell Core y no detectó esta diferencia. En esta corrección se invocó explícitamente el ejecutable de Windows PowerShell para verificar el entorno solicitado.

## Corrección

Se retiró la asignación incompatible y se creó un `System.IO.StreamWriter` con `System.Text.UTF8Encoding(false)` sobre `$taskProcess.StandardInput.BaseStream`, después de iniciar el proceso. La implementación corregida comienza en la línea 61; el escritor se crea en la 62.

El JSON sigue enviándose exclusivamente por el pipe privado, en memoria, como UTF-8 sin BOM. El escritor se libera en finally: esto vacía los bytes pendientes y cierra el pipe para indicar EOF a Node. Se retiró el cierre redundante del escritor original de StandardInput para evitar el acceso a un flujo ya cerrado en .NET Framework.

Se conservaron la recuperación DPAPI, la comprobación del nombre de la credencial, el saneamiento del entorno, APP_CONFIG_PATH, la base exclusiva de desarrollo, las validaciones del clúster/esquema/rol, el rechazo de postgres y roles elevados, el control del puerto y el backend propio por IPC. No se añadieron secretos a argumentos, archivos o logs.

## Pruebas ejecutadas

- Windows PowerShell 5.1.19041.6456, PSEdition Desktop, CLR 4.0.30319.42000: análisis de sintaxis sin errores.
- Transferencia JSON UTF-8 sin BOM al stdin real de Node, incluyendo caracteres acentuados, CJK y emoji: recuperación exacta y EOF correctos.
- `DevDb03.ps1 -Modo EstadoFinal` desde ese PowerShell: recuperación DPAPI y conexión real de solo lectura como sian_kaan_dev_app a sian_kaan_reservaciones_dev; permanecen cuatro usuarios, seis reservaciones y dos asignaciones.
- Comando original `DevDb03.ps1 -Modo Electron` desde ese PowerShell, sin depurador: ventana real abierta y GET http://127.0.0.1:3000/ con HTTP 200 y respuesta esperada. Se cerró normalmente solo la ventana iniciada por la prueba; el lanzador terminó con código 0.
- Suites existentes devDb02.test.js y devDb03.test.js, con bloqueo noPostgres: 50 pruebas aprobadas en 2 suites. No se ejecutaron pruebas destructivas.
- Comparación SHA-256: .env, configuración independiente y ambos archivos cifrados de credenciales sin cambios. Sin listener en el puerto 3000 ni procesos de aplicación de esta tarea al finalizar.

Los informes y el script de comprobación quedan en `.access-scope-lab/dev-db-03-fix/`, carpeta local ya excluida. El primer sondeo HTTP de comprobación apuntó a una ruta inexistente (/api/health); se corrigió la comprobación para usar la ruta raíz real, sin modificar el servidor.

## Archivos

Modificado: scripts/DevDb03.ps1. Creado: docs/DEV-DB-03-FIX.md. No se modificaron otros archivos de código. Las evidencias locales son archivos de diagnóstico excluidos de distribución.

## Arranque seguro

Desde Windows PowerShell 5.1:

```powershell
Set-Location -LiteralPath 'A:\sistema-integrador-reservaciones'
.\scripts\DevDb03.ps1 -Modo Electron
```

No requiere PowerShell 7 ni nuevas dependencias. Se conservaron las credenciales existentes. No se utilizó Git, no se modificó la base principal, no se ejecutaron migraciones ni cambios de tablas/usuarios, no se modificó .env y no se realizaron llamadas a APIs externas. No quedan bloqueos conocidos de esta incompatibilidad.
