# N-03 — Hashes SHA256, cabeceras PE y vínculo de procedencia

31 de octubre de 2026. **Preparado para revisión; todavía no ejecutado.**
Solo ejecución manual por el usuario dentro de Oracle VirtualBox, VM
`Windows11-CommunityTours-Test`. `synthetic-acceptance-only`;
`productionAuthorized=false`.

## Alcance y permisos antes de empezar

Se abrirá **Windows PowerShell de Microsoft**, sin perfil y sin elevación, para
diagnósticos interactivos de lectura. Se usarán cmdlets integrados y lectura binaria
de cabeceras; **no se ejecutará ni cargará como código ningún archivo PostgreSQL**,
incluidos el instalador, DLL, `initdb`, `postgres` y `pg_ctl`. No se empleará CMD.

Se necesita permiso normal de lectura de los siete archivos: seis ejecutables
instalados y el instalador original. No se necesita contraseña ni permiso de
administrador. Cancelar cualquier UAC. Ante acceso denegado, archivo bloqueado,
política distinta, lenguaje restringido o alerta antivirus, detenerse y devolver
el error; no cambiar permisos, políticas o protecciones para continuar.

Los comandos se introducirán a la vista en esa consola, revisados, **no desde un
archivo .ps1**, ni mediante `-Command`, `-EncodedCommand`, IEX o un auxiliar.
Restricted permite comandos individuales y bloquea archivos de script; aquí no
se convierte un script bloqueado en otro mecanismo para ejecutarlo.
[Microsoft: Restricted](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies?view=powershell-5.1).
Si este modo interactivo no es aceptable para la revisión, no ejecutar N-03;
queda pendiente una alternativa de lectura autorizada, sin cambiar la política.

Efectos previstos: lectura de aproximadamente 415 MB del instalador y de los seis
archivos; CPU/disco durante el hash y memoria para el lector. El lector PE mantiene
cada archivo abierto solo para lectura y sin compartir escritura/borrado durante
su lectura, y cierra el handle incluso si falla. No escribe informes, archivos
temporales, bases, claves de registro, certificados o configuración de Windows.
La consola/Terminal puede mantener historial y Windows/antivirus pueden registrar
la actividad o actualizar cachés; no se promete ausencia de esos efectos propios
del sistema. Los comandos no contienen credenciales. No exportar historial completo.

No instalar herramientas, descargar o extraer archivos, ejecutar el instalador
con `--extract-only` o `--help`, iniciar/parar servicios, abrir pgAdmin, tocar datos
o ejecutar cualquier herramienta PostgreSQL con `--version`. Esta prueba no altera
los archivos protegidos por inventarios. No usar Guest Control, RDP, SSH ni automatización.

## A. Confirmar contexto y política

1. Comprobar el título `Windows11-CommunityTours-Test` en VirtualBox. No realizar
   ningún paso en el anfitrión Windows 10.
2. En **Ejecutar** de la VM (Win+R), introducir esta línea y aceptar **sin**
   «Ejecutar como administrador». Solo abre el PowerShell integrado de Windows:

```text
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoLogo -NoProfile
```

3. Introducir cada comando por separado y registrar las salidas:

```powershell
Get-ExecutionPolicy
Get-ExecutionPolicy -List
$ExecutionContext.SessionState.LanguageMode
```

Se espera política efectiva **Restricted**, sin haberla cambiado, y
**FullLanguage** para las operaciones de lectura .NET siguientes. Restricted y
LanguageMode son controles diferentes. Si no coinciden, detener los pasos B/C,
registrar el resultado y no intentar relajar ninguno de los dos. Una salida
distinta no determina por sí sola que PostgreSQL sea inseguro: requiere revisión.

## B. Hash del instalador original, sin abrirlo como programa

En el Explorador localizar el mismo original revisado en N-02. Obtener su ruta
completa; no usar una ruta inventada como `C:\Users\...`. Introducir estas líneas
por separado. En la pregunta interactiva pegar la ruta **sin comillas externas**.
`Read-Host` trata ese texto como dato, incluso si el perfil tiene espacios, acentos,
apóstrofos, `%`, `&` o `!`; no se evalúa como comando.

```powershell
$n03Installer = Read-Host 'Ruta completa del instalador original, sin comillas externas'
Get-Item -LiteralPath $n03Installer -ErrorAction Stop | Format-List Name,Length,FullName
Get-FileHash -LiteralPath $n03Installer -Algorithm SHA256 -ErrorAction Stop | Format-List Algorithm,Hash,Path
```

Se espera nombre `postgresql-18.6-5-windows-x64.exe`, **414966472 bytes**, algoritmo
SHA256 y 64 caracteres hexadecimales completos. No aceptar capturas que corten el
hash. La referencia publicada consultada es:

```text
227e2bc08091b4c2b8338c7d61b11d057f895711480b006f90bfcfcd2410a58a
```

Fue publicada por `mayankjaiswal-dev`, marcado Contributor, en respuesta del
repositorio **EnterpriseDB/edb-installers**, issue 746; no es un manifiesto firmado
ni un hash que hayamos calculado de la VM.
[Publicación en el repositorio EDB](https://github.com/EnterpriseDB/edb-installers/issues/746).
La búsqueda no acredita por sí sola la autoridad personal del contribuidor.
Las URLs laterales `.sha256` no pudieron leerse con la herramienta de navegación;
no se presentan como una segunda fuente comprobada. La referencia y su atribución
se conservan en la evidencia local para revisión.

Comparar los 64 caracteres, ignorando solo mayúsculas/minúsculas. **Si difiere,
detener N-03 antes de C** y comunicar ambos valores; no borrar, reparar o sustituir
el original. Si coincide, registrar «coincide con la referencia publicada», además
del estado de firma de N-02. Eso vincula el archivo leído a esa referencia bajo
la confianza de su publicación; no recupera la URL histórica desconocida ni
demuestra aún la procedencia de los archivos instalados.

El nombre `windows-x64` del instalador describe la distribución; su bootstrap
podría tener otra arquitectura. **No se exige PE x64 al instalador** en esta prueba.
La comprobación x64 de C se aplica a los seis ejecutables PostgreSQL instalados.

## C. Hash y cabecera de cada ejecutable, leyendo el mismo handle

Realizarlo solo si A y B no dieron discrepancias. Seleccionar un nombre de esta
lista, cambiar únicamente el nombre literal en la primera línea y repetir para
los seis: `initdb.exe`, `postgres.exe`, `pg_ctl.exe`, `pg_dump.exe`, `pg_restore.exe`,
`pg_controldata.exe`. Mantener `C:\Program Files\PostgreSQL\18\bin` como carpeta.
Si la instalación está en otra ubicación, detenerse y revisar antes de adaptar.

La siguiente operación interactiva abre un flujo de datos de lectura, comprueba
límites y firmas MZ/PE, lee Machine y Optional Header Magic, vuelve al inicio y
calcula SHA256 sobre **el mismo flujo**. No usa el cargador de ejecutables, DLL,
`Assembly.Load`, `Add-Type`, compilación o depuración.

```powershell
$n03Path = 'C:\Program Files\PostgreSQL\18\bin\initdb.exe'
$n03Stream = $null
$n03Reader = $null
try {
    $n03Stream = [System.IO.File]::Open($n03Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
    $n03Reader = [System.IO.BinaryReader]::new($n03Stream)
    if ($n03Stream.Length -lt 64) { throw 'N03_PE_TRUNCATED' }
    if ($n03Reader.ReadUInt16() -ne 0x5A4D) { throw 'N03_MZ_INVALID' }
    $n03Stream.Position = 60
    $n03PeOffset = [long]$n03Reader.ReadUInt32()
    if ($n03PeOffset -lt 64 -or $n03PeOffset -gt ($n03Stream.Length - 26)) { throw 'N03_PE_OFFSET_INVALID' }
    $n03Stream.Position = $n03PeOffset
    if ($n03Reader.ReadUInt32() -ne 0x00004550) { throw 'N03_PE_SIGNATURE_INVALID' }
    $n03Machine = $n03Reader.ReadUInt16()
    $n03Stream.Position = $n03PeOffset + 20
    $n03OptionalSize = $n03Reader.ReadUInt16()
    if ($n03OptionalSize -lt 112 -or $n03OptionalSize -gt ($n03Stream.Length - $n03PeOffset - 24)) { throw 'N03_OPTIONAL_HEADER_INVALID' }
    $n03Stream.Position = $n03PeOffset + 24
    $n03Magic = $n03Reader.ReadUInt16()
    $n03Length = $n03Stream.Length
    $n03Stream.Position = 0
    $n03Hash = Get-FileHash -InputStream $n03Stream -Algorithm SHA256 -ErrorAction Stop
    if ($n03Hash.Algorithm -ne 'SHA256' -or $n03Hash.Hash -notmatch '\A[0-9A-Fa-f]{64}\z') { throw 'N03_HASH_INVALID' }
    [pscustomobject]@{
        File = $n03Path
        Bytes = $n03Length
        SHA256 = $n03Hash.Hash
        Machine = ('0x{0:X4}' -f $n03Machine)
        OptionalMagic = ('0x{0:X4}' -f $n03Magic)
        X64Header = ($n03Machine -eq 0x8664 -and $n03Magic -eq 0x020B)
    } | Format-List
} finally {
    if ($null -ne $n03Reader) { $n03Reader.Dispose() }
    if ($null -ne $n03Stream) { $n03Stream.Dispose() }
}
```

Copiar como una operación interactiva legible, sin guardarla en .ps1. Ante cualquier
error no continuar con otro método para saltarlo; devolver el mensaje y el archivo.
No confundir una salida de una ejecución anterior con el resultado de otra.

Resultados esperados en cada uno: `Machine = 0x8664`, `OptionalMagic = 0x020B`,
`X64Header = True`, tamaño positivo y hash completo. Para los tres tamaños ya
comunicados se espera además **633344**, **379904**, **108032** respectivamente.
Machine AMD64 y Magic PE32+ indican cabecera x64; PE32+ por sí solo no basta para
distinguir x64 de ARM64. La lectura no valida todas las estructuras PE, autenticidad
o inocuidad del ejecutable.
[Especificación PE de Microsoft](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format).
[Get-FileHash: lectura de archivos y streams](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/get-filehash?view=powershell-5.1).

Si aparece x86, ARM64, cabecera inválida, tamaño distinto o error, detenerse y
conservar evidencia. No reemplazar binarios, ejecutar pruebas para «confirmarlo»
ni cambiar ACL. Los tamaños conocidos son observaciones anteriores, no hashes
oficiales de referencia.

## D. Verificación de procedencia por archivo — puerta independiente

Para cada SHA256 instalado se necesita un SHA256 de referencia del **mismo archivo
de la distribución exacta 18.6-5 Windows x64**, obtenido de un origen autenticado,
con trazabilidad de cómo se leyó. No se dispone todavía de ese manifiesto por archivo.
Un hash local sin esa referencia es inventario observado, no verificación de origen.

La vía propuesta es comparar contra entradas del archivo oficial de binarios
`postgresql-18.6-5-windows-x64-binaries.zip` autenticado antes de su lectura, sin
ejecutar el instalador. EDB describe esos ZIP como archivos instalados por sus
instaladores y PostgreSQL enlaza esa distribución.
[EDB: archivo de binarios](https://www.enterprisedb.com/download-postgresql-binaries),
[PostgreSQL: distribución Windows](https://www.postgresql.org/download/windows/).
La misma respuesta del repositorio publica para ese ZIP:

```text
e2246ba91d22345bc3d017586c09ede52d9df180b1eeb480f050445f1cad84e2
```

Ese valor es una referencia publicada de contenedor, **no el hash de ninguno de
los seis EXE**. Antes de utilizarlo se revisará su atribución y la adquisición
del archivo. Una coincidencia eventual del ZIP no prueba los EXE instalados hasta
comparar las entradas correspondientes byte a byte mediante SHA256.

**No descargar, extraer, transferir ni abrir ese ZIP ahora.** Si ya existe un
manifiesto de archivos autenticado o una copia de referencia previamente verificada,
indicarlo al devolver resultados, sin ejecutar sus archivos. La adquisición y lectura
de referencia necesita un procedimiento adicional revisado; no está incluida en A–C.
La alternativa es un manifiesto por archivo confirmado por el proveedor a través
de un canal autenticado. No se envían consultas a terceros automáticamente.

Si no hay referencia autorizada, el resultado correcto es **«hashes y cabeceras
observados; procedencia por archivo pendiente»**. No se afirmará que esta prueba
ha completado aquello que sus lecturas no pueden demostrar. No usar `--extract-only`:
aunque evite una instalación normal, ejecutaría el instalador y excedería este alcance.

## Registro y cierre

Devolver política efectiva/lista, LanguageMode y tabla con valores completos:

| Archivo | Bytes | SHA256 (64 caracteres) | Machine | OptionalMagic | X64Header |
| --- | --- | --- | --- | --- | --- |
| initdb.exe | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente |
| postgres.exe | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente |
| pg_ctl.exe | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente |
| pg_dump.exe | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente |
| pg_restore.exe | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente |
| pg_controldata.exe | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente |
| Instalador original | Pendiente | Pendiente | No solicitado | No solicitado | No aplica |

Añadir coincidencia/no coincidencia con el hash publicado del instalador, errores,
solicitudes UAC/alertas y confirmar que no se ejecutó PostgreSQL. Se pueden entregar
transcripción de salidas o capturas recortadas; no contraseñas ni historial completo.
Cerrar la consola normalmente al finalizar. No guardar informes en directorios
protegidos ni copiar binarios a la aplicación.

El estado posterior se evaluará por separado: hash del instalador contra referencia
publicada; cabeceras de los seis; hashes locales; correspondencia por archivo todavía
pendiente si falta D. No es aceptación de dependencias DLL/`share`, identidad SQL,
primer token, Job, ACL, AutoRun, servicio, parada o recuperación. No se consulta
PostgreSQL ni se autoriza aprovisionamiento, construcción o instalación. Conserva
las garantías de opción C y el bloqueo de candidate-05/setup-03.
