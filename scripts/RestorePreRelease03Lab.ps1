[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$restoreRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$restoreBase = Join-Path $restoreRoot '.access-scope-lab\pre-release-03-restore'
$restoreAllowed = @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18')
function Test-RestorePrivate([string]$restorePath) {
    $restoreAcl = Get-Acl -LiteralPath $restorePath
    $restoreRules = @($restoreAcl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
    return ($restoreAcl.AreAccessRulesProtected -and $restoreRules.Count -eq 2 -and @($restoreRules | Where-Object { $_.IdentityReference.Value -notin $restoreAllowed -or $_.AccessControlType -ne 'Allow' -or $_.IsInherited }).Count -eq 0)
}
function New-RestorePrivate([string]$restorePath) {
    if (Test-Path -LiteralPath $restorePath) { throw 'El destino nuevo ya existe.' }
    [void][IO.Directory]::CreateDirectory($restorePath)
    $restoreAcl = New-Object Security.AccessControl.DirectorySecurity
    $restoreAcl.SetAccessRuleProtection($true,$false)
    $restoreAcl.SetOwner((New-Object Security.Principal.SecurityIdentifier($restoreAllowed[0])))
    foreach ($restoreSid in $restoreAllowed) { $restoreAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($restoreSid)),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))) }
    Set-Acl -LiteralPath $restorePath -AclObject $restoreAcl
    if (!(Test-RestorePrivate $restorePath)) { throw 'No se pudo asegurar el directorio nuevo.' }
}
foreach ($restoreAncestor in @($restoreRoot,(Join-Path $restoreRoot '.access-scope-lab'))) { if ((Get-Item -LiteralPath $restoreAncestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Ruta redirigida.' } }
if (Test-Path -LiteralPath $restoreBase) {
    if ((Get-Item -LiteralPath $restoreBase -Force).Attributes -band [IO.FileAttributes]::ReparsePoint -or !(Test-RestorePrivate $restoreBase)) { throw 'Base de laboratorio existente no privada o redirigida; no se modificara.' }
} else { New-RestorePrivate $restoreBase }
$restoreRun = Join-Path $restoreBase ('run-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8))
& git -C $restoreRoot check-ignore --quiet -- $restoreRun
if ($LASTEXITCODE -ne 0) { throw 'El destino no esta ignorado por Git.' }
$restoreDrive = New-Object IO.DriveInfo([IO.Path]::GetPathRoot($restoreRun))
if (!$restoreDrive.IsReady -or $restoreDrive.AvailableFreeSpace -lt 1073741824) { throw 'Se requiere al menos 1 GB libre.' }
New-RestorePrivate $restoreRun
@{ protected=$true; authorizedSids=$restoreAllowed; createdAt=[DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $restoreRun 'directory-security.json') -Encoding UTF8
$restoreInfo = New-Object Diagnostics.ProcessStartInfo
$restoreInfo.FileName = (Get-Command node -CommandType Application | Select-Object -First 1).Source
$restoreInfo.Arguments = '"' + (Join-Path $restoreRoot 'scripts\preRelease03Restore.cjs') + '" --new-lab "' + $restoreRun + '"'
$restoreInfo.WorkingDirectory = $restoreRoot
$restoreInfo.UseShellExecute = $false
$restoreInfo.CreateNoWindow = $true
$restoreInfo.RedirectStandardOutput = $true
$restoreInfo.RedirectStandardError = $true
$restoreInfo.EnvironmentVariables.Clear()
foreach ($restoreKey in @('SystemRoot','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PATH','PATHEXT','SystemDrive')) { $restoreValue=[Environment]::GetEnvironmentVariable($restoreKey); if ($null -ne $restoreValue) { $restoreInfo.EnvironmentVariables[$restoreKey]=$restoreValue } }
Write-Host 'RESTAURACION AUTORIZADA: cluster nuevo, copia privada; sin conexiones a principal/DEV.'
Write-Host ('Directorio: ' + $restoreRun)
$restoreProcess = [Diagnostics.Process]::Start($restoreInfo)
$restoreOut = $restoreProcess.StandardOutput.ReadToEndAsync()
$restoreErr = $restoreProcess.StandardError.ReadToEndAsync()
try {
    while (!$restoreProcess.WaitForExit(250)) { Start-Sleep -Milliseconds 150 }
    $restoreOut.Result
    $restoreErr.Result
    if ($restoreProcess.ExitCode -ne 0) { throw 'Laboratorio detenido por una comprobacion; conservar el directorio y revisar el informe de fallo sin secretos.' }
} finally { $restoreProcess.Dispose() }
if (!(Test-RestorePrivate $restoreRun)) { throw 'La ACL del laboratorio cambio.' }
Write-Host 'Ensayo terminado. El cluster nuevo queda conservado y su servidor detenido.'
