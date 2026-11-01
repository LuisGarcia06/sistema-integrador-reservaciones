[CmdletBinding()]
param([ValidateSet('Verify','Stop')][string]$Mode='Verify',[string]$Directory)
$ErrorActionPreference='Stop'
if($Mode -eq 'Verify'){
    if($Directory){throw 'VERIFY_ALWAYS_CREATES_NEW_CLUSTER'}
    $Directory=Join-Path $env:LOCALAPPDATA ('ctsk-standalone-'+[Guid]::NewGuid().ToString('N').Substring(0,12))
    if(Test-Path -LiteralPath $Directory){throw 'NEW_RESERVATION_FRONTEND_LAB_REQUIRED'}
    [void][IO.Directory]::CreateDirectory($Directory)
    $apiSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $apiAcl=[Security.AccessControl.DirectorySecurity]::new();$apiAcl.SetAccessRuleProtection($true,$false)
    $apiAcl.SetOwner([Security.Principal.SecurityIdentifier]::new($apiSid))
    foreach($apiTrusted in @($apiSid,'S-1-5-18','S-1-5-32-544')){
        $apiAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($apiTrusted),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
    }
    Set-Acl -LiteralPath $Directory -AclObject $apiAcl
}elseif(!$Directory -or ![IO.Path]::IsPathRooted($Directory)){throw 'EXPLICIT_RESERVATION_FRONTEND_DIRECTORY_REQUIRED'}
$apiInfo=[Diagnostics.ProcessStartInfo]::new()
$apiInfo.FileName=(Get-Command node.exe -CommandType Application|Select-Object -First 1).Source
$apiInfo.Arguments='"'+(Join-Path $PSScriptRoot 'reservationFrontendLab.cjs')+'" '+$Mode+' "'+$Directory+'"'
$apiInfo.WorkingDirectory=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$apiInfo.UseShellExecute=$false;$apiInfo.CreateNoWindow=$true
$apiInfo.RedirectStandardOutput=$true;$apiInfo.RedirectStandardError=$true
$apiInfo.EnvironmentVariables.Clear()
foreach($apiName in @('SystemRoot','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PATH','PATHEXT','SystemDrive')){
    $apiValue=[Environment]::GetEnvironmentVariable($apiName);if($null -ne $apiValue){$apiInfo.EnvironmentVariables[$apiName]=$apiValue}
}
$apiChild=[Diagnostics.Process]::new();$apiChild.StartInfo=$apiInfo
try{
    [void]$apiChild.Start();$apiOut=$apiChild.StandardOutput.ReadToEndAsync();$apiErr=$apiChild.StandardError.ReadToEndAsync()
    $apiChild.WaitForExit();$apiOut.Result;$apiErr.Result
    if($apiChild.ExitCode -ne 0){throw 'RESERVATION_FRONTEND_LAB_FAILED'}
}finally{$apiChild.Dispose()}
