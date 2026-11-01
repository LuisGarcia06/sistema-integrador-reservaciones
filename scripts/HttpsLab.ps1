[CmdletBinding()]
param([ValidateSet('Prepare','Verify','Stop')][string]$Mode='Prepare',[string]$Server)
$ErrorActionPreference='Stop'
$httpsRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if($Mode -in @('Prepare','Verify')){
    if($Server){throw 'NEW_LAB_REQUIRED'}
    $httpsDir=Join-Path $env:LOCALAPPDATA ('ctsk-standalone-'+[Guid]::NewGuid().ToString('N').Substring(0,12))
    if(Test-Path -LiteralPath $httpsDir){throw 'LAB_ALREADY_EXISTS'}
    [void][IO.Directory]::CreateDirectory($httpsDir)
    $httpsSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $httpsAcl=New-Object Security.AccessControl.DirectorySecurity
    $httpsAcl.SetAccessRuleProtection($true,$false)
    $httpsAcl.SetOwner((New-Object Security.Principal.SecurityIdentifier($httpsSid)))
    foreach($httpsTrusted in @($httpsSid,'S-1-5-18','S-1-5-32-544')){
        $httpsAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($httpsTrusted)),'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
    }
    Set-Acl -LiteralPath $httpsDir -AclObject $httpsAcl
}else{
    if(-not $Server){throw 'SERVER_CONFIG_REQUIRED'}
    $httpsDir=Split-Path -Parent (Split-Path -Parent ([IO.Path]::GetFullPath($Server)))
}
$httpsInfo=[Diagnostics.ProcessStartInfo]::new()
$httpsInfo.FileName=(Get-Command node.exe -CommandType Application|Select-Object -First 1).Source
$httpsInfo.Arguments='"'+(Join-Path $PSScriptRoot 'httpsLab.cjs')+'" '+$Mode+' "'+$httpsDir+'"'
$httpsInfo.WorkingDirectory=$httpsRoot;$httpsInfo.UseShellExecute=$false;$httpsInfo.CreateNoWindow=$true
$httpsInfo.RedirectStandardOutput=$true;$httpsInfo.RedirectStandardError=$true
$httpsInfo.EnvironmentVariables.Clear()
foreach($httpsName in @('SystemRoot','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PATH','PATHEXT','SystemDrive')){
    $httpsValue=[Environment]::GetEnvironmentVariable($httpsName);if($null -ne $httpsValue){$httpsInfo.EnvironmentVariables[$httpsName]=$httpsValue}
}
$httpsChild=[Diagnostics.Process]::new();$httpsChild.StartInfo=$httpsInfo
try{
    [void]$httpsChild.Start();$httpsOut=$httpsChild.StandardOutput.ReadToEndAsync();$httpsErr=$httpsChild.StandardError.ReadToEndAsync()
    $httpsChild.WaitForExit();$httpsOut.Result;$httpsErr.Result
    if($httpsChild.ExitCode -ne 0){throw 'HTTPS_LAB_FAILED'}
}finally{$httpsChild.Dispose()}
