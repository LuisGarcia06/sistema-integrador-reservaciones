[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$r03bRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$r03bBase=Join-Path $env:LOCALAPPDATA ('CTSK-Release03B-'+[Guid]::NewGuid().ToString('N').Substring(0,8))
$r03bSids=@([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18')
function New-R03bPrivate([string]$r03bPath) {
 if(Test-Path -LiteralPath $r03bPath){throw 'RELEASE03B_DESTINO_YA_EXISTE'}
 [void][IO.Directory]::CreateDirectory($r03bPath)
 $r03bAcl=New-Object Security.AccessControl.DirectorySecurity
 $r03bAcl.SetAccessRuleProtection($true,$false)
 $r03bAcl.SetOwner((New-Object Security.Principal.SecurityIdentifier($r03bSids[0])))
 foreach($r03bSid in $r03bSids){$r03bAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($r03bSid)),'FullControl','ContainerInherit,ObjectInherit','None','Allow')))}
 Set-Acl -LiteralPath $r03bPath -AclObject $r03bAcl
}
if(Test-Path -LiteralPath $r03bBase){throw 'RELEASE03B_BASE_YA_EXISTE_NO_REUTILIZAR'}
New-R03bPrivate $r03bBase
$r03bRun=Join-Path $r03bBase ('run-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8))
New-R03bPrivate $r03bRun
@{createdAt=[DateTime]::UtcNow.ToString('o');authorizedSids=$r03bSids;onlyNewPathsChanged=$true}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $r03bRun 'directory-security.json') -Encoding UTF8
$r03bInfo=New-Object Diagnostics.ProcessStartInfo
$r03bInfo.FileName=(Get-Command node.exe -CommandType Application|Select-Object -First 1).Source
$r03bInfo.Arguments='"'+(Join-Path $PSScriptRoot 'release03bLab.cjs')+'" --new-lab "'+$r03bRun+'"'
$r03bInfo.WorkingDirectory=$r03bRoot;$r03bInfo.UseShellExecute=$false;$r03bInfo.CreateNoWindow=$true
$r03bInfo.RedirectStandardOutput=$true;$r03bInfo.RedirectStandardError=$true
$r03bInfo.EnvironmentVariables.Clear()
foreach($r03bKey in @('SystemRoot','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PATH','PATHEXT','SystemDrive')){
 $r03bValue=[Environment]::GetEnvironmentVariable($r03bKey);if($null -ne $r03bValue){$r03bInfo.EnvironmentVariables[$r03bKey]=$r03bValue}
}
Write-Host ('RELEASE-03B: laboratorio NUEVO '+$r03bRun)
$r03bProcess=[Diagnostics.Process]::Start($r03bInfo)
$r03bOut=$r03bProcess.StandardOutput.ReadToEndAsync();$r03bErr=$r03bProcess.StandardError.ReadToEndAsync()
try{while(!$r03bProcess.WaitForExit(300)){Start-Sleep -Milliseconds 150};$r03bOut.Result;$r03bErr.Result;if($r03bProcess.ExitCode -ne 0){throw 'RELEASE03B_ENSAYO_DETENIDO_REVISAR_EVIDENCIA'}}finally{$r03bProcess.Dispose()}
