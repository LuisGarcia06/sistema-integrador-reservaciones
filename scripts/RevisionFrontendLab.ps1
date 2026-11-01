[CmdletBinding()]
param([ValidateSet('Verify','Stop')][string]$Mode='Verify',[string]$Directory)
$ErrorActionPreference='Stop'
if($Mode -eq 'Verify'){
    if($Directory){throw 'VERIFY_ALWAYS_CREATES_NEW_CLUSTER'}
    $Directory=Join-Path $env:LOCALAPPDATA ('ctsk-standalone-'+[Guid]::NewGuid().ToString('N').Substring(0,12))
    if(Test-Path -LiteralPath $Directory){throw 'NEW_FRONTEND_LAB_REQUIRED'}
    [void][IO.Directory]::CreateDirectory($Directory)
    $frontSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $frontAcl=[Security.AccessControl.DirectorySecurity]::new();$frontAcl.SetAccessRuleProtection($true,$false)
    $frontAcl.SetOwner([Security.Principal.SecurityIdentifier]::new($frontSid))
    foreach($frontTrusted in @($frontSid,'S-1-5-18','S-1-5-32-544')){
        $frontAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($frontTrusted),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
    }
    Set-Acl -LiteralPath $Directory -AclObject $frontAcl
}elseif(!$Directory -or ![IO.Path]::IsPathRooted($Directory)){throw 'EXPLICIT_FRONTEND_LAB_DIRECTORY_REQUIRED'}
$frontInfo=[Diagnostics.ProcessStartInfo]::new()
$frontInfo.FileName=(Get-Command node.exe -CommandType Application|Select-Object -First 1).Source
$frontInfo.Arguments='"'+(Join-Path $PSScriptRoot 'revisionFrontendLab.cjs')+'" '+$Mode+' "'+$Directory+'"'
$frontInfo.WorkingDirectory=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$frontInfo.UseShellExecute=$false;$frontInfo.CreateNoWindow=$true
$frontInfo.RedirectStandardOutput=$true;$frontInfo.RedirectStandardError=$true
$frontInfo.EnvironmentVariables.Clear()
foreach($frontName in @('SystemRoot','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PATH','PATHEXT','SystemDrive')){
    $frontValue=[Environment]::GetEnvironmentVariable($frontName);if($null -ne $frontValue){$frontInfo.EnvironmentVariables[$frontName]=$frontValue}
}
$frontChild=[Diagnostics.Process]::new();$frontChild.StartInfo=$frontInfo
try{
    [void]$frontChild.Start();$frontOut=$frontChild.StandardOutput.ReadToEndAsync();$frontErr=$frontChild.StandardError.ReadToEndAsync()
    $frontChild.WaitForExit();$frontOut.Result;$frontErr.Result
    if($frontChild.ExitCode -ne 0){throw 'REVISION_FRONTEND_LAB_FAILED'}
}finally{$frontChild.Dispose()}
