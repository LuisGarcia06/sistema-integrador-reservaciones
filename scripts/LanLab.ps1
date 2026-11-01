[CmdletBinding()]
param([ValidateSet('Inspect','Prepare','VerifyComponents','FirewallPlan','StartDatabase','StopDatabase')][string]$Mode='Inspect',[string]$Topology,[string]$Name,[string]$Server)
$ErrorActionPreference='Stop'
function New-LanPrivateDirectory([string]$Prefix){
    $lanNew=Join-Path $env:LOCALAPPDATA ($Prefix+[Guid]::NewGuid().ToString('N').Substring(0,12))
    if(Test-Path -LiteralPath $lanNew){throw 'LAN_NEW_DIRECTORY_REQUIRED'}
    [void][IO.Directory]::CreateDirectory($lanNew)
    $lanSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $lanAcl=[Security.AccessControl.DirectorySecurity]::new();$lanAcl.SetAccessRuleProtection($true,$false)
    $lanAcl.SetOwner([Security.Principal.SecurityIdentifier]::new($lanSid))
    foreach($lanTrusted in @($lanSid,'S-1-5-18','S-1-5-32-544')){
        $lanAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($lanTrusted),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
    }
    Set-Acl -LiteralPath $lanNew -AclObject $lanAcl
    return $lanNew
}
$lanScript=Join-Path $PSScriptRoot 'lanLabTools.cjs'
$lanArgs=@($lanScript,$Mode)
if($Mode -eq 'VerifyComponents'){
    if($Topology -or $Name -or $Server){throw 'LAN_COMPONENT_ARGUMENTS'}
    $lanArgs+=@((New-LanPrivateDirectory 'ctsk-standalone-'),(New-LanPrivateDirectory 'ctsk-lan-client-'))
}elseif($Mode -eq 'Prepare'){
    if(-not $Topology -or -not $Name -or $Server){throw 'LAN_TOPOLOGY_AND_NAME_REQUIRED'}
    # Una carpeta nueva, vacía, privada. Ningún archivo/servicio Windows existente se modifica.
    $lanArgs+=@((New-LanPrivateDirectory 'ctsk-standalone-'),(New-LanPrivateDirectory 'ctsk-lan-client-'),[IO.Path]::GetFullPath($Topology),$Name)
}elseif($Mode -in @('FirewallPlan','StartDatabase','StopDatabase')){
    if(-not $Server){throw 'LAN_SERVER_REQUIRED'};$lanArgs+=@([IO.Path]::GetFullPath($Server))
}elseif($Topology -or $Name -or $Server){throw 'LAN_INSPECT_ARGUMENTS'}
if(@($lanArgs | Where-Object {$_ -match '["\r\n]'}).Count){throw 'LAN_ARGUMENT_INVALID'}
$lanInfo=[Diagnostics.ProcessStartInfo]::new()
$lanInfo.FileName=(Get-Command node.exe -CommandType Application|Select-Object -First 1).Source
$lanInfo.Arguments=($lanArgs | ForEach-Object {'"'+$_+'"'}) -join ' '
$lanInfo.WorkingDirectory=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$lanInfo.UseShellExecute=$false;$lanInfo.CreateNoWindow=$true
$lanInfo.RedirectStandardOutput=$true;$lanInfo.RedirectStandardError=$true
$lanInfo.EnvironmentVariables.Clear()
foreach($lanKey in @('SystemRoot','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PATH','PATHEXT','SystemDrive')){
    $lanValue=[Environment]::GetEnvironmentVariable($lanKey);if($null -ne $lanValue){$lanInfo.EnvironmentVariables[$lanKey]=$lanValue}
}
$lanChild=[Diagnostics.Process]::new();$lanChild.StartInfo=$lanInfo
try{
    [void]$lanChild.Start();$lanOut=$lanChild.StandardOutput.ReadToEndAsync();$lanErr=$lanChild.StandardError.ReadToEndAsync()
    $lanChild.WaitForExit();$lanOut.Result;$lanErr.Result
    if($lanChild.ExitCode -ne 0){throw 'LAN_LAB_REJECTED'}
}finally{$lanChild.Dispose()}
