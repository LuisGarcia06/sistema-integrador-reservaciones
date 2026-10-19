[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$previewRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$previewElectron = Join-Path $previewRoot 'node_modules\electron\dist\electron.exe'
$previewEntry = Join-Path $previewRoot 'scripts\preview\main.cjs'
if (!(Test-Path -LiteralPath $previewElectron -PathType Leaf)) { throw 'Falta Electron local. Esta vista previa no instala dependencias.' }
if (!(Test-Path -LiteralPath $previewEntry -PathType Leaf)) { throw 'No se encuentra la entrada de demostracion.' }

Write-Host 'DEMO PRE-RELEASE: datos ficticios en memoria. Sin PostgreSQL ni proveedores.' -ForegroundColor Yellow
Write-Host 'En la barra amarilla: Administrador > Entrar / cambiar perfil.'
Write-Host 'Cierra con Cerrar demo, la X de Electron o Ctrl+C en esta consola.'
Write-Host 'Los cambios se descartan al cerrar; cada inicio usa otro puerto y perfil temporal.'

$previewInfo = New-Object System.Diagnostics.ProcessStartInfo
$previewInfo.FileName = $previewElectron
$previewInfo.Arguments = '"' + $previewEntry + '" --preview-parent=' + $PID
$previewInfo.WorkingDirectory = $previewRoot
$previewInfo.UseShellExecute = $false
$previewInfo.CreateNoWindow = $true
$previewInfo.RedirectStandardInput = $true
# No heredar DB_*, PG*, tokens, proxies, NODE_OPTIONS ni configuracion de la aplicacion.
$previewInfo.EnvironmentVariables.Clear()
foreach ($previewKey in @('SystemRoot','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PATH','PATHEXT','SystemDrive','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE')) {
    $previewValue = [Environment]::GetEnvironmentVariable($previewKey)
    if ($null -ne $previewValue) { $previewInfo.EnvironmentVariables[$previewKey] = $previewValue }
}
$previewInfo.EnvironmentVariables['NODE_ENV'] = 'test'
$previewProcess = $null
try {
    $previewProcess = [Diagnostics.Process]::Start($previewInfo)
    while (!$previewProcess.WaitForExit(200)) { Start-Sleep -Milliseconds 100 }
    if ($previewProcess.ExitCode -ne 0) { throw ('La demostracion termino con codigo ' + $previewProcess.ExitCode) }
} finally {
    if ($null -ne $previewProcess) {
        if (!$previewProcess.HasExited) {
            try { [void]$previewProcess.CloseMainWindow() } catch {}
            if (!$previewProcess.WaitForExit(5000)) {
                # Solo el arbol del proceso hijo que acaba de lanzar este script.
                & "$env:SystemRoot\System32\taskkill.exe" /PID $previewProcess.Id /T /F | Out-Null
            }
        }
        $previewProcess.Dispose()
    }
    Write-Host 'Demostracion cerrada. Los datos sinteticos no se conservaron.'
}
