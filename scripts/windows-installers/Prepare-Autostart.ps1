param(
    [Parameter(Mandatory=$true)][string]$ServerConfig,
    [Parameter(Mandatory=$true)][string]$Authority,
    [Parameter(Mandatory=$true)][string]$OutputXml
)
$ErrorActionPreference = 'Stop'
# Solo genera XML. No importa/registra/activa una tarea en esta computadora.
& (Join-Path $PSScriptRoot 'Start-Server.ps1') -ServerConfig $ServerConfig -Authority $Authority -CheckOnly
if ($LASTEXITCODE -ne 0) { throw 'AUTOSTART_PREFLIGHT_REJECTED' }
if (Test-Path -LiteralPath $OutputXml) { throw 'AUTOSTART_OUTPUT_EXISTS' }
function Escape-Xml([string]$value) { [Security.SecurityElement]::Escape($value) }
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$exe = Escape-Xml (Join-Path $PSScriptRoot 'runtime/node.exe')
$control = Join-Path $PSScriptRoot 'tools/server-control.cjs'
foreach ($value in @($control,$ServerConfig,$Authority)) {
    if ($value.Contains('"') -or $value.Contains("`r") -or $value.Contains("`n")) { throw 'AUTOSTART_PATH' }
}
$arguments = Escape-Xml ('"{0}" run "{1}" "{2}"' -f $control,$ServerConfig,$Authority)
$xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
 <RegistrationInfo><Description>Candidato 026 sintético. Revisión e importación manual solo en VM.</Description></RegistrationInfo>
 <Triggers><LogonTrigger><Enabled>true</Enabled><UserId>$sid</UserId></LogonTrigger></Triggers>
 <Principals><Principal id="Author"><UserId>$sid</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
 <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><AllowHardTerminate>false</AllowHardTerminate><ExecutionTimeLimit>PT0S</ExecutionTimeLimit></Settings>
 <Actions Context="Author"><Exec><Command>$exe</Command><Arguments>$arguments</Arguments></Exec></Actions>
</Task>
"@
$stream = [IO.File]::Open($OutputXml,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try { $bytes = [Text.Encoding]::Unicode.GetPreamble() + [Text.Encoding]::Unicode.GetBytes($xml); $stream.Write($bytes,0,$bytes.Length) } finally { $stream.Dispose() }
Write-Output 'AUTOSTART_XML_PREPARED_NOT_REGISTERED'
