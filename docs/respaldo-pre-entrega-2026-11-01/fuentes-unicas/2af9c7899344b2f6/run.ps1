[CmdletBinding()]
param([string]$Candidate='candidate-01',[string]$Attempt='attempt-01')
$ErrorActionPreference='Stop'
$taskPaths=@()
foreach($taskPrefix in @('ctsk-e026-authority-','ctsk-e026-source-','ctsk-e026-restore-','ctsk-e026-client-')){
 $taskDirectory=Join-Path $env:LOCALAPPDATA ($taskPrefix+[Guid]::NewGuid().ToString('N'))
 if(Test-Path -LiteralPath $taskDirectory){throw 'NEW_DIRECTORY_REQUIRED'}
 [void][IO.Directory]::CreateDirectory($taskDirectory)
 $taskSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 $taskAcl=[Security.AccessControl.DirectorySecurity]::new();$taskAcl.SetAccessRuleProtection($true,$false);$taskAcl.SetOwner([Security.Principal.SecurityIdentifier]::new($taskSid))
 foreach($taskTrusted in @($taskSid,'S-1-5-18','S-1-5-32-544')){$taskAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($taskTrusted),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
 Set-Acl -LiteralPath $taskDirectory -AclObject $taskAcl
 $taskPaths+=,$taskDirectory
}
$taskInfo=[Diagnostics.ProcessStartInfo]::new();$taskInfo.FileName=(Get-Command node.exe -CommandType Application|Select-Object -First 1).Source
$taskInfo.Arguments='"'+(Join-Path $PSScriptRoot 'run.cjs')+'" '+$Candidate+' '+$Attempt+' '+(($taskPaths|ForEach-Object {'"'+$_+'"'})-join ' ');$taskInfo.WorkingDirectory=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'));$taskInfo.UseShellExecute=$false;$taskInfo.CreateNoWindow=$true;$taskInfo.RedirectStandardOutput=$true;$taskInfo.RedirectStandardError=$true;$taskInfo.EnvironmentVariables.Clear()
foreach($taskName in @('SystemRoot','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PATH','PATHEXT','SystemDrive')){$taskValue=[Environment]::GetEnvironmentVariable($taskName);if($null -ne $taskValue){$taskInfo.EnvironmentVariables[$taskName]=$taskValue}}
$taskChild=[Diagnostics.Process]::new();$taskChild.StartInfo=$taskInfo
try{[void]$taskChild.Start();$taskOut=$taskChild.StandardOutput.ReadToEndAsync();$taskErr=$taskChild.StandardError.ReadToEndAsync();$taskChild.WaitForExit();$taskOut.Result;$taskErr.Result;if($taskChild.ExitCode -ne 0){throw 'ENTERPRISE026_ACCEPTANCE_FAILED'}}finally{$taskChild.Dispose()}
