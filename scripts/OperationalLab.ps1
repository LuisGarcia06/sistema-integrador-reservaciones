[CmdletBinding()]
param([ValidateSet('Baseline','Verify')][string]$Mode='Verify')
$ErrorActionPreference='Stop'
$opDirectory=Join-Path $env:LOCALAPPDATA ('ctsk-standalone-'+[Guid]::NewGuid().ToString('N').Substring(0,12))
if(Test-Path -LiteralPath $opDirectory){throw 'NEW_OPERATIONAL_LAB_REQUIRED'}
[void][IO.Directory]::CreateDirectory($opDirectory)
$opSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$opAcl=[Security.AccessControl.DirectorySecurity]::new();$opAcl.SetAccessRuleProtection($true,$false)
$opAcl.SetOwner([Security.Principal.SecurityIdentifier]::new($opSid))
foreach($opTrusted in @($opSid,'S-1-5-18','S-1-5-32-544')){
    $opAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($opTrusted),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
}
Set-Acl -LiteralPath $opDirectory -AclObject $opAcl
$opInfo=[Diagnostics.ProcessStartInfo]::new()
$opInfo.FileName=(Get-Command node.exe -CommandType Application|Select-Object -First 1).Source
$opInfo.Arguments='"'+(Join-Path $PSScriptRoot 'operationalLab.cjs')+'" '+$Mode+' "'+$opDirectory+'"'
$opInfo.WorkingDirectory=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$opInfo.UseShellExecute=$false;$opInfo.CreateNoWindow=$true
$opInfo.RedirectStandardOutput=$true;$opInfo.RedirectStandardError=$true
$opInfo.EnvironmentVariables.Clear()
foreach($opName in @('SystemRoot','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PATH','PATHEXT','SystemDrive')){
    $opValue=[Environment]::GetEnvironmentVariable($opName);if($null -ne $opValue){$opInfo.EnvironmentVariables[$opName]=$opValue}
}
$opChild=[Diagnostics.Process]::new();$opChild.StartInfo=$opInfo
try{
    [void]$opChild.Start();$opOut=$opChild.StandardOutput.ReadToEndAsync();$opErr=$opChild.StandardError.ReadToEndAsync()
    $opChild.WaitForExit();$opOut.Result;$opErr.Result
    if($opChild.ExitCode -ne 0){throw 'OPERATIONAL_LAB_FAILED'}
}finally{$opChild.Dispose()}
