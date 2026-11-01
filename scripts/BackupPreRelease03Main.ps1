[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$backupRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$backupBase = Join-Path $backupRoot '.access-scope-lab\pre-release-03-main-backup'
$backupAllowed = @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'S-1-5-18')
function Test-BackupAcl([string]$backupPath) {
    $backupAcl = Get-Acl -LiteralPath $backupPath
    if (!$backupAcl.AreAccessRulesProtected) { return $false }
    $backupRules = @($backupAcl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
    if ($backupRules.Count -ne 2) { return $false }
    foreach ($backupRule in $backupRules) {
        if ($backupRule.IdentityReference.Value -notin $backupAllowed -or $backupRule.AccessControlType -ne 'Allow' -or $backupRule.IsInherited -or $backupRule.FileSystemRights -ne 'FullControl') { return $false }
    }
    return $true
}
function New-PrivateBackupDirectory([string]$backupPath) {
    if (Test-Path -LiteralPath $backupPath) { throw 'El directorio nuevo ya existe; no se sobrescribe.' }
    [void][IO.Directory]::CreateDirectory($backupPath)
    $backupAcl = New-Object Security.AccessControl.DirectorySecurity
    $backupAcl.SetAccessRuleProtection($true,$false)
    $backupOwner = New-Object Security.Principal.SecurityIdentifier($backupAllowed[0])
    $backupAcl.SetOwner($backupOwner)
    foreach ($backupSid in $backupAllowed) {
        $backupIdentity = New-Object Security.Principal.SecurityIdentifier($backupSid)
        $backupRule = New-Object Security.AccessControl.FileSystemAccessRule($backupIdentity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
        $backupAcl.AddAccessRule($backupRule)
    }
    Set-Acl -LiteralPath $backupPath -AclObject $backupAcl
    if (!(Test-BackupAcl $backupPath)) { throw 'No se pudo restringir la carpeta nueva al usuario actual y SYSTEM.' }
}
# Nunca modificar las ACL de directorios anteriores ni seguir enlaces de laboratorio.
foreach ($backupAncestor in @($backupRoot,(Join-Path $backupRoot '.access-scope-lab'))) {
    if ((Get-Item -LiteralPath $backupAncestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'No se admiten directorios de destino redirigidos.' }
}
if (Test-Path -LiteralPath $backupBase) {
    if ((Get-Item -LiteralPath $backupBase -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'La carpeta base esta redirigida.' }
    if (!(Test-BackupAcl $backupBase)) { throw 'La carpeta base existente no tiene ACL privada; no se modificara automaticamente.' }
} else { New-PrivateBackupDirectory $backupBase }
$backupRun = Join-Path $backupBase ('run-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8))
& git -C $backupRoot check-ignore --quiet -- $backupRun
if ($LASTEXITCODE -ne 0) { throw 'El directorio de respaldo no esta ignorado por Git.' }
$backupDrive = New-Object IO.DriveInfo([IO.Path]::GetPathRoot($backupRun))
if (!$backupDrive.IsReady -or $backupDrive.AvailableFreeSpace -lt 104857600) { throw 'Espacio libre insuficiente.' }
New-PrivateBackupDirectory $backupRun
$backupProbe = Join-Path $backupRun 'access-probe.tmp'
$backupProbeHandle = [IO.File]::Open($backupProbe,[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
$backupProbeHandle.WriteByte(1)
$backupProbeHandle.Dispose()
Remove-Item -LiteralPath $backupProbe
@{ protected=$true; onlyAuthorized=$true; authorizedSids=$backupAllowed; ownerSid=$backupAllowed[0]; freeBytes=$backupDrive.AvailableFreeSpace; createdAt=[DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backupRun 'directory-security.json') -Encoding UTF8

Write-Host 'PRE-RELEASE-03-PROD: diagnostico READ ONLY y pg_dump de principal; no migracion ni restauracion.'
Write-Host ('Directorio privado nuevo: ' + $backupRun)
$backupNode = (Get-Command node -CommandType Application | Select-Object -First 1).Source
$backupInfo = New-Object Diagnostics.ProcessStartInfo
$backupInfo.FileName = $backupNode
$backupInfo.Arguments = '"' + (Join-Path $backupRoot 'scripts\preRelease03ProdBackup.cjs') + '" --backup "' + $backupRun + '"'
$backupInfo.WorkingDirectory = $backupRoot
$backupInfo.UseShellExecute = $false
$backupInfo.CreateNoWindow = $true
$backupInfo.RedirectStandardOutput = $true
$backupInfo.RedirectStandardError = $true
$backupInfo.EnvironmentVariables.Clear()
foreach ($backupKey in @('SystemRoot','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PATH','PATHEXT','SystemDrive')) {
    $backupValue = [Environment]::GetEnvironmentVariable($backupKey)
    if ($null -ne $backupValue) { $backupInfo.EnvironmentVariables[$backupKey] = $backupValue }
}
$backupProcess = [Diagnostics.Process]::Start($backupInfo)
$backupOut = $backupProcess.StandardOutput.ReadToEndAsync()
$backupErr = $backupProcess.StandardError.ReadToEndAsync()
try {
    if (!$backupProcess.WaitForExit(240000)) { $backupProcess.Kill(); throw 'El diagnostico/respaldo excedio su tiempo.' }
    $backupOut.Result
    $backupErr.Result
    if ($backupProcess.ExitCode -ne 0) { throw 'Respaldo detenido. No ejecutar migraciones ni restauraciones; revisar el codigo de bloqueo.' }
} finally { $backupProcess.Dispose() }
# Los archivos heredan de la carpeta privada; revisar cada uno sin cambiar ACL existentes.
foreach ($backupFile in Get-ChildItem -LiteralPath $backupRun -File) {
    $backupFileAcl = Get-Acl -LiteralPath $backupFile.FullName
    $backupFileRules = @($backupFileAcl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
    if ($backupFileRules.Count -ne 2 -or @($backupFileRules | Where-Object { $_.IdentityReference.Value -notin $backupAllowed -or $_.AccessControlType -ne 'Allow' }).Count -ne 0) { throw 'Un archivo del respaldo tiene permisos inesperados.' }
}
if (!(Test-BackupAcl $backupRun)) { throw 'La ACL del directorio cambio durante el respaldo.' }
Write-Host 'RESPALDO_VALIDADO_SIN_RESTAURAR: archivo y evidencia privados; no se ejecuto 017.'
