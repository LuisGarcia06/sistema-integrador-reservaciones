# N-04 — Comparación de C con el ZIP oficial exacto

31 de octubre de 2026. **Procedimiento preparado, no ejecutado.**
`synthetic-acceptance-only`; `productionAuthorized=false`.

Objetivo: completar exclusivamente D para los seis EXE observados en N-03 C.
Se reutilizan sus lecturas ya cotejadas; no se repite ninguna prueba en la VM.
No se ejecuta, instala, extrae o modifica PostgreSQL. Esta prueba no crea un
clúster, inicia servicios ni desbloquea por sí sola candidate-05/setup-03.

## Lugar, permisos y efectos para revisar antes de ejecutar

Se propone efectuar la adquisición y lectura **fuera de la VM**, en una carpeta
nueva de evidencia del equipo de análisis. En Windows 10 eso significa únicamente
guardar y leer un archivo ZIP como datos: no instalar/aprovisionar componentes,
extraer EXE/DLL, ejecutar el instalador o tocar bases. La interacción dentro de la
VM sigue siendo exclusivamente manual y no es necesaria para N-04.

Permisos normales: guardar el ZIP en la carpeta nueva y leerlo. Sin elevación,
contraseñas, cambios de política/ACL o protecciones. Abrir Windows PowerShell
integrado sin perfil; se usarán comandos interactivos legibles y bibliotecas
.NET del sistema, sin archivos .ps1, código compilado, PowerShell codificado,
Bypass, CMD o programas auxiliares descargados. Si un control impide la operación,
detenerse; no debilitarlo. No confundir la política del equipo de análisis con la
evidencia pendiente de N-03 A en la VM.

Efectos: descarga aproximada de 385 MB si no existe una referencia acreditada;
lectura del contenedor para SHA256 y descompresión en memoria de seis entradas,
con un máximo de 32 MiB por entrada. Las entradas no se escriben a disco ni se
cargan como código. La consola y el navegador pueden conservar historial/caché;
Windows/antivirus pueden registrar la lectura. El único archivo nuevo previsto
para la adquisición es el ZIP; el usuario guardará aparte las salidas de evidencia.
No escribir en Program Files, directorios del clúster o inventarios anteriores.

## 1. Adquirir y documentar una referencia de proveedor

Usar el archivo exacto **`postgresql-18.6-5-windows-x64-binaries.zip`**. No usar el
ZIP de capturas adjuntado por el usuario, el instalador EXE u otra revisión 18.6.
EDB identifica estos ZIP como archivos de sus instaladores:
[página de binarios EDB](https://www.enterprisedb.com/download-postgresql-binaries).

URL del artefacto citada en el repositorio EnterpriseDB:

```text
https://get.enterprisedb.com/postgresql/postgresql-18.6-5-windows-x64-binaries.zip
```

Descargarlo como archivo desde ese canal HTTPS oficial, sin advertencias de
certificado, solo después de revisar esta adquisición. No ejecutar descargas ni
usar enlaces publicitarios/espejos. Si aparece una redirección, registrar el destino;
un dominio no acreditado o un origen no documentable requiere revisión antes de
continuar. No aceptar una copia desconocida basándose solo en su nombre.

Registrar antes de interpretar la comparación: fecha/hora de adquisición, URL
solicitada y final cuando esté disponible, canal oficial usado, nombre local,
tamaño y estado de cualquier advertencia. Una referencia ya existente solo evita
la descarga si se conserva esa trazabilidad. Un checksum calculado de una copia
de origen desconocido no acredita su procedencia.

La respuesta de un Contributor en el repositorio EDB publica esta referencia
SHA256 de contenedor:

```text
e2246ba91d22345bc3d017586c09ede52d9df180b1eeb480f050445f1cad84e2
```

[Publicación y atribución](https://github.com/EnterpriseDB/edb-installers/issues/746).
Es una publicación mutable, no un manifiesto firmado. La etiqueta Contributor no
demuestra representación del proveedor. Su coincidencia es un contraste adicional;
el origen oficial HTTPS documentado también debe quedar acreditado, o confirmarse
por un canal autenticado del proveedor. No se convierte el comentario por sí solo
en autenticación del ZIP. No hace falta exigir firmas individuales si se acredita
la cadena del contenedor y se comparan sus entradas.

## 2. Leer el ZIP sin extraer ni ejecutar entradas

Ejecutar manualmente solo tras revisar el origen y efectos del paso 1. Abrir el
PowerShell integrado sin perfil y sin «Ejecutar como administrador»:

```text
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoLogo -NoProfile
```

La operación siguiente carga únicamente el ensamblado ZIP **del sistema .NET**,
sin compilar C# ni cargar DLL PostgreSQL. Pregunta la ruta como dato. Mantiene
un handle de lectura sin compartir escritura/borrado durante hash y comparación;
rechaza un hash de contenedor distinto antes de enumerar entradas. Después muestra
las rutas candidatas y pide su prefijo común del directorio `bin`.

Seleccionar el prefijo **a partir de lo mostrado**, con barra final, por ejemplo
`pgsql/bin/` si esa es la ruta real. No adivinar ni elegir una copia de pgAdmin u
otro subproducto. Si el directorio principal no es inequívoco, detenerse. El lector
exige una sola entrada exacta por nombre, tamaño esperado y lectura acotada; cierra
todos los handles incluso ante error. Microsoft documenta la lectura de entradas
sin extraerlas mediante
[ZipArchive](https://learn.microsoft.com/en-us/dotnet/api/system.io.compression.ziparchive?view=netframework-4.8.1).

```powershell
Add-Type -AssemblyName System.IO.Compression
$n04Path = Read-Host 'Ruta completa del ZIP oficial, sin comillas externas'
$n04Expected = @(
    @{ File='initdb.exe'; Bytes=246784; Hash='D59423EA6106821670EA7289B6D5476FEB8741D5FDC8537DE25F22DDA1F13532' }
    @{ File='postgres.exe'; Bytes=10266624; Hash='8B8BF5D400487159E3E117053D3F5A89FAD0C740B310A3AC69E5720CE4F818E1' }
    @{ File='pg_ctl.exe'; Bytes=133120; Hash='329DACA106CAB8F02ABE15B3A2EA9D833C60F94995D57A54161C218A940F9193' }
    @{ File='pg_dump.exe'; Bytes=633344; Hash='9414DAC0554065AA6EDF739D7126B6E6E6D6FC3B56B9706B72CEE47CEE45B22C' }
    @{ File='pg_restore.exe'; Bytes=379904; Hash='94C2B545FB870C08414DCF03CD93723F78662E1D489A0272150B40A0267F0D55' }
    @{ File='pg_controldata.exe'; Bytes=108032; Hash='F82B31E5CB116BB7BB4EF1594F1D65F70C4111BA045D646C96AF08B500987EE6' }
)
$n04Input = $null
$n04Zip = $null
try {
    $n04Input = [System.IO.File]::Open($n04Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
    $n04ZipBytes = $n04Input.Length
    if ($n04ZipBytes -le 0 -or $n04ZipBytes -gt 512MB) { throw 'N04_CONTAINER_SIZE' }
    $n04Container = Get-FileHash -InputStream $n04Input -Algorithm SHA256 -ErrorAction Stop
    [pscustomobject]@{ Zip=$n04Path; Bytes=$n04ZipBytes; SHA256=$n04Container.Hash } | Format-List
    if ($n04Container.Hash -ine 'e2246ba91d22345bc3d017586c09ede52d9df180b1eeb480f050445f1cad84e2') { throw 'N04_CONTAINER_HASH_MISMATCH' }
    $n04Input.Position = 0
    $n04Zip = [System.IO.Compression.ZipArchive]::new($n04Input, [System.IO.Compression.ZipArchiveMode]::Read, $true)
    if ($n04Zip.Entries.Count -gt 100000) { throw 'N04_ENTRY_COUNT_LIMIT' }
    $n04Zip.Entries | Where-Object { $_.Name -cin $n04Expected.File } | Select-Object FullName,Length | Format-List
    $n04Prefix = Read-Host 'Prefijo del bin principal mostrado, con barra final'
    if ($n04Prefix -cnotmatch '\A(?:[A-Za-z0-9_.-]+/)*bin/\z' -or @($n04Prefix.Split('/') | Where-Object { $_ -eq '.' -or $_ -eq '..' }).Count -gt 0) { throw 'N04_PREFIX_INVALID' }
    foreach ($n04Row in $n04Expected) {
        $n04Name = $n04Prefix + $n04Row.File
        $n04Entries = @($n04Zip.Entries | Where-Object { $_.FullName -ceq $n04Name })
        if ($n04Entries.Count -ne 1) { throw ('N04_ENTRY_MISSING_OR_DUPLICATE: ' + $n04Name) }
        $n04Entry = $n04Entries[0]
        if ($n04Entry.Length -ne $n04Row.Bytes -or $n04Entry.Length -gt 32MB) { throw ('N04_ENTRY_SIZE: ' + $n04Name) }
        $n04Data = $null
        $n04Reader = $null
        try {
            $n04Data = $n04Entry.Open()
            $n04Reader = [System.IO.BinaryReader]::new($n04Data)
            $n04Bytes = $n04Reader.ReadBytes([int]($n04Row.Bytes + 1))
            if ($n04Bytes.Length -ne $n04Row.Bytes) { throw ('N04_ENTRY_READ_LENGTH: ' + $n04Name) }
        } finally {
            if ($null -ne $n04Reader) { $n04Reader.Dispose() }
            if ($null -ne $n04Data) { $n04Data.Dispose() }
        }
        $n04Hasher = [System.Security.Cryptography.SHA256]::Create()
        try { $n04Hash = [System.BitConverter]::ToString($n04Hasher.ComputeHash($n04Bytes)).Replace('-','') } finally { $n04Hasher.Dispose() }
        $n04Equal = ($n04Hash -ceq $n04Row.Hash)
        [pscustomobject]@{ Entry=$n04Name; Bytes=$n04Bytes.Length; ReferenceSHA256=$n04Hash; ObservedN03SHA256=$n04Row.Hash; Match=$n04Equal } | Format-List
        if (-not $n04Equal) { throw ('N04_FILE_HASH_MISMATCH: ' + $n04Name) }
    }
    'N04_SIX_CONTENT_MATCHES_SOURCE_REVIEW_REQUIRED'
} finally {
    if ($null -ne $n04Zip) { $n04Zip.Dispose() }
    if ($null -ne $n04Input) { $n04Input.Dispose() }
}
```

El lector **no autentica por sí mismo el canal de adquisición**. El mensaje final
solo significa seis coincidencias de contenido con el contenedor leído. No genera
archivos ni actualiza automáticamente un inventario operativo. No ejecutar este
bloque desde .ps1 ni introducir alternativas para eludir una restricción.

## 3. Resultado a devolver y criterios de cierre

Conservar procedencia de adquisición, nombre/hash/tamaño del ZIP, prefijo elegido,
y para cada entrada ruta completa, bytes, hash de referencia, hash observado de C
y Match. Los 64 caracteres deben verse completos. Registrar cualquier error.
Un hash de PNG o del ZIP de capturas nunca sustituye el de una entrada EXE.

Con seis coincidencias **y** cadena de adquisición acreditada, registrar D completada
para esos seis archivos tal como se observaron en C. No equivale a revalidar el
estado actual del disco de la VM: antes de una futura ejecución se necesitará
integridad en el momento de uso, con las ACL/rutas y mecanismos revisados, sin
repetir diagnósticos manuales de forma redundante.

Si falta origen, hay ambigüedad, error o diferencia, D sigue pendiente. No reparar,
reinstalar o sobrescribir nada para forzar coincidencia. Las discrepancias son
evidencia a revisar, no prueba automática de malware o de transcripción errónea.

A y B de N-03 permanecen pendientes aunque esta comparación terminase bien.
D aquí no acredita DLL/`share`, token, ACL, AutoRun, servicio, clúster, parada o
recuperación. Esas garantías mínimas de opción C se priorizan en el
[informe de avance](N03-COTEJO-VISUAL-COMPLETADO.md). No autoriza aprovisionamiento,
prueba funcional ni construcción. No se ejecutó N-04 al preparar este documento.
