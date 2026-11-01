[CmdletBinding()]
param([ValidateSet('Prepare','Verify','Stop')][string]$Mode='Prepare',[string]$Manifest)
$ErrorActionPreference='Stop'
$standaloneRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if($Mode -eq 'Prepare' -or $Mode -eq 'Verify') {
    if($Manifest){throw 'NEW_LAB_REQUIRED'}
    $standaloneDir=Join-Path $env:LOCALAPPDATA ('ctsk-standalone-'+[Guid]::NewGuid().ToString('N').Substring(0,12))
    if(Test-Path -LiteralPath $standaloneDir){throw 'LAB_ALREADY_EXISTS'}
    [void][IO.Directory]::CreateDirectory($standaloneDir)
    $standaloneSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $standaloneAcl=New-Object Security.AccessControl.DirectorySecurity
    $standaloneAcl.SetAccessRuleProtection($true,$false)
    $standaloneAcl.SetOwner((New-Object Security.Principal.SecurityIdentifier($standaloneSid)))
    foreach($standaloneTrusted in @($standaloneSid,'S-1-5-18','S-1-5-32-544')) {
        $standaloneAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($standaloneTrusted)),'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
    }
    Set-Acl -LiteralPath $standaloneDir -AclObject $standaloneAcl
} else {
    if(-not $Manifest){throw 'MANIFEST_REQUIRED'}
    $standaloneDir=Split-Path -Parent ([IO.Path]::GetFullPath($Manifest))
}
$standaloneInfo=[Diagnostics.ProcessStartInfo]::new()
$standaloneInfo.FileName=(Get-Command node.exe -CommandType Application|Select-Object -First 1).Source
$standaloneInfo.Arguments='"'+(Join-Path $PSScriptRoot 'standaloneDev.cjs')+'" '+$Mode+' "'+$standaloneDir+'"'
$standaloneInfo.WorkingDirectory=$standaloneRoot
$standaloneInfo.UseShellExecute=$false;$standaloneInfo.CreateNoWindow=$true
$standaloneInfo.RedirectStandardOutput=$true;$standaloneInfo.RedirectStandardError=$true
$standaloneInfo.EnvironmentVariables.Clear()
foreach($standaloneName in @('SystemRoot','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PATH','PATHEXT','SystemDrive')) {
    $standaloneValue=[Environment]::GetEnvironmentVariable($standaloneName)
    if($null -ne $standaloneValue){$standaloneInfo.EnvironmentVariables[$standaloneName]=$standaloneValue}
}
$standaloneChild=[Diagnostics.Process]::new();$standaloneChild.StartInfo=$standaloneInfo
try {
    [void]$standaloneChild.Start()
    $standaloneOut=$standaloneChild.StandardOutput.ReadToEndAsync()
    $standaloneErr=$standaloneChild.StandardError.ReadToEndAsync()
    $standaloneChild.WaitForExit()
    $standaloneOut.Result;$standaloneErr.Result
    if($standaloneChild.ExitCode -ne 0){throw 'STANDALONE_LAB_FAILED'}
} finally {$standaloneChild.Dispose()}
