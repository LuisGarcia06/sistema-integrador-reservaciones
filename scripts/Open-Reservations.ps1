# Abrir la release protegida verificada sin variables DB/PG/proveedores heredadas.
$ErrorActionPreference='Stop'
$base=Join-Path $env:LOCALAPPDATA 'CommunityTours\secure-runtime'
if([IO.Path]::GetFullPath($PSScriptRoot) -ne $base){throw 'PRIVATE_LAUNCHER_REQUIRED'}
$allowed='path systemroot windir comspec pathext temp tmp userprofile appdata localappdata programfiles programfiles(x86) programdata systemdrive allusersprofile username userdomain homedrive homepath'.Split(' ')
$info=[Diagnostics.ProcessStartInfo]::new()
$info.FileName='C:\Program Files\nodejs\node.exe'
$info.Arguments='"'+(Join-Path $base 'admin\openReservations.cjs')+'"'
$info.WorkingDirectory=$base;$info.UseShellExecute=$false;$info.CreateNoWindow=$true
$info.EnvironmentVariables.Clear()
foreach($entry in [Environment]::GetEnvironmentVariables().GetEnumerator()) { if($entry.Key.ToLowerInvariant() -in $allowed){$info.EnvironmentVariables[$entry.Key]=$entry.Value} }
$child=[Diagnostics.Process]::new();$child.StartInfo=$info
try { [void]$child.Start();$child.WaitForExit();if($child.ExitCode -ne 0){throw 'DESKTOP_OPEN_FAILED'} } finally { $child.Dispose() }
