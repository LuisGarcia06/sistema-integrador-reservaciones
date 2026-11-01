[CmdletBinding()]
param([ValidateSet('Verify','Stop','RenewGeneration')][string]$Mode='Verify',[string]$Directory)
$ErrorActionPreference='Stop'
if($Mode -eq 'Verify'){
    if($Directory){throw 'VERIFY_ALWAYS_CREATES_NEW_CLUSTER'}
    $Directory=Join-Path $env:LOCALAPPDATA ('ctsk-standalone-'+[Guid]::NewGuid().ToString('N').Substring(0,12))
    if(Test-Path -LiteralPath $Directory){throw 'NEW_REVISION_LAB_REQUIRED'}
    [void][IO.Directory]::CreateDirectory($Directory)
    $revisionSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $revisionAcl=[Security.AccessControl.DirectorySecurity]::new();$revisionAcl.SetAccessRuleProtection($true,$false)
    $revisionAcl.SetOwner([Security.Principal.SecurityIdentifier]::new($revisionSid))
    foreach($revisionTrusted in @($revisionSid,'S-1-5-18','S-1-5-32-544')){
        $revisionAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($revisionTrusted),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
    }
    Set-Acl -LiteralPath $Directory -AclObject $revisionAcl
}elseif(!$Directory -or ![IO.Path]::IsPathRooted($Directory)){throw 'EXPLICIT_REVISION_LAB_DIRECTORY_REQUIRED'}
$revisionInfo=[Diagnostics.ProcessStartInfo]::new()
$revisionInfo.FileName=(Get-Command node.exe -CommandType Application|Select-Object -First 1).Source
$revisionInfo.Arguments='"'+(Join-Path $PSScriptRoot 'revisionSchemaLab.cjs')+'" '+$Mode+' "'+$Directory+'"'
$revisionInfo.WorkingDirectory=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$revisionInfo.UseShellExecute=$false;$revisionInfo.CreateNoWindow=$true
$revisionInfo.RedirectStandardOutput=$true;$revisionInfo.RedirectStandardError=$true
$revisionInfo.EnvironmentVariables.Clear()
foreach($revisionName in @('SystemRoot','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PATH','PATHEXT','SystemDrive')){
    $revisionValue=[Environment]::GetEnvironmentVariable($revisionName);if($null -ne $revisionValue){$revisionInfo.EnvironmentVariables[$revisionName]=$revisionValue}
}
$revisionChild=[Diagnostics.Process]::new();$revisionChild.StartInfo=$revisionInfo
try{
    [void]$revisionChild.Start();$revisionOut=$revisionChild.StandardOutput.ReadToEndAsync();$revisionErr=$revisionChild.StandardError.ReadToEndAsync()
    $revisionChild.WaitForExit();$revisionOut.Result;$revisionErr.Result
    if($revisionChild.ExitCode -ne 0){throw 'REVISION_SCHEMA_LAB_FAILED'}
}finally{$revisionChild.Dispose()}
