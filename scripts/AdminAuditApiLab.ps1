[CmdletBinding()]
param([ValidateSet('Verify','Stop')][string]$Mode='Verify',[string]$Directory)
$ErrorActionPreference='Stop'
if($Mode -eq 'Verify'){
    if($Directory){throw 'VERIFY_ALWAYS_CREATES_NEW_CLUSTER'}
    $Directory=Join-Path $env:LOCALAPPDATA ('ctsk-standalone-'+[Guid]::NewGuid().ToString('N').Substring(0,12))
    if(Test-Path -LiteralPath $Directory){throw 'NEW_ADMIN_AUDIT_API_LAB_REQUIRED'}
    [void][IO.Directory]::CreateDirectory($Directory)
    $auditSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $auditAcl=[Security.AccessControl.DirectorySecurity]::new();$auditAcl.SetAccessRuleProtection($true,$false)
    $auditAcl.SetOwner([Security.Principal.SecurityIdentifier]::new($auditSid))
    foreach($auditTrusted in @($auditSid,'S-1-5-18','S-1-5-32-544')){
        $auditAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($auditTrusted),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
    }
    Set-Acl -LiteralPath $Directory -AclObject $auditAcl
}elseif(!$Directory -or ![IO.Path]::IsPathRooted($Directory)){throw 'EXPLICIT_ADMIN_AUDIT_API_DIRECTORY_REQUIRED'}
$auditInfo=[Diagnostics.ProcessStartInfo]::new()
$auditInfo.FileName=(Get-Command node.exe -CommandType Application|Select-Object -First 1).Source
$auditInfo.Arguments='"'+(Join-Path $PSScriptRoot 'adminAuditApiLab.cjs')+'" '+$Mode+' "'+$Directory+'"'
$auditInfo.WorkingDirectory=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$auditInfo.UseShellExecute=$false;$auditInfo.CreateNoWindow=$true
$auditInfo.RedirectStandardOutput=$true;$auditInfo.RedirectStandardError=$true
$auditInfo.EnvironmentVariables.Clear()
foreach($auditName in @('SystemRoot','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PATH','PATHEXT','SystemDrive')){
    $auditValue=[Environment]::GetEnvironmentVariable($auditName);if($null -ne $auditValue){$auditInfo.EnvironmentVariables[$auditName]=$auditValue}
}
$auditChild=[Diagnostics.Process]::new();$auditChild.StartInfo=$auditInfo
try{
    [void]$auditChild.Start();$auditOut=$auditChild.StandardOutput.ReadToEndAsync();$auditErr=$auditChild.StandardError.ReadToEndAsync()
    $auditChild.WaitForExit();$auditOut.Result;$auditErr.Result
    if($auditChild.ExitCode -ne 0){throw 'ADMIN_AUDIT_API_LAB_FAILED'}
}finally{$auditChild.Dispose()}

