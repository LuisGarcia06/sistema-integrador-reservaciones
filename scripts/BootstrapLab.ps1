[CmdletBinding()]
param([ValidateSet('Verify','Stop')][string]$Mode='Verify',[string]$CStageDirectory,[string]$Directory)
$ErrorActionPreference='Stop'
function New-BootstrapDirectory {
    $taskDirectory=Join-Path $env:LOCALAPPDATA ('ctsk-standalone-'+[Guid]::NewGuid().ToString('N').Substring(0,12))
    if(Test-Path -LiteralPath $taskDirectory){throw 'NEW_BOOTSTRAP_DIRECTORY_REQUIRED'}
    [void][IO.Directory]::CreateDirectory($taskDirectory)
    $taskSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $taskAcl=[Security.AccessControl.DirectorySecurity]::new();$taskAcl.SetAccessRuleProtection($true,$false)
    $taskAcl.SetOwner([Security.Principal.SecurityIdentifier]::new($taskSid))
    foreach($taskTrusted in @($taskSid,'S-1-5-18','S-1-5-32-544')){$taskAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($taskTrusted),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
    Set-Acl -LiteralPath $taskDirectory -AclObject $taskAcl
    return $taskDirectory
}
if($Mode -eq 'Verify'){
    if($Directory -or !$CStageDirectory -or ![IO.Path]::IsPathRooted($CStageDirectory)){throw 'BOOTSTRAP_C_STAGE_REQUIRED'}
    $taskDirectories=@(New-BootstrapDirectory;New-BootstrapDirectory;New-BootstrapDirectory)
    $taskArguments=@('Verify',$CStageDirectory)+$taskDirectories
}else{if(!$Directory -or ![IO.Path]::IsPathRooted($Directory)){throw 'EXPLICIT_BOOTSTRAP_DIRECTORY_REQUIRED'};$taskArguments=@('Stop',$Directory)}
$taskInfo=[Diagnostics.ProcessStartInfo]::new();$taskInfo.FileName=(Get-Command node.exe -CommandType Application|Select-Object -First 1).Source
$taskInfo.Arguments='"'+(Join-Path $PSScriptRoot 'bootstrapLab.cjs')+'" '+(($taskArguments|ForEach-Object{'"'+$_+'"'}) -join ' ')
$taskInfo.WorkingDirectory=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'));$taskInfo.UseShellExecute=$false;$taskInfo.CreateNoWindow=$true;$taskInfo.RedirectStandardOutput=$true;$taskInfo.RedirectStandardError=$true
$taskInfo.EnvironmentVariables.Clear()
foreach($taskName in @('SystemRoot','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PATH','PATHEXT','SystemDrive')){$taskValue=[Environment]::GetEnvironmentVariable($taskName);if($null -ne $taskValue){$taskInfo.EnvironmentVariables[$taskName]=$taskValue}}
$taskChild=[Diagnostics.Process]::new();$taskChild.StartInfo=$taskInfo
try{[void]$taskChild.Start();$taskOut=$taskChild.StandardOutput.ReadToEndAsync();$taskErr=$taskChild.StandardError.ReadToEndAsync();$taskChild.WaitForExit();$taskOut.Result;$taskErr.Result;if($taskChild.ExitCode -ne 0){throw 'BOOTSTRAP_LAB_FAILED'}}finally{$taskChild.Dispose()}
