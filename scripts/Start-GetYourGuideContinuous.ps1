[CmdletBinding()]
param([switch]$Run,[switch]$Install)
$ErrorActionPreference='Stop'
if (@($Run,$Install).Where({$_}).Count -ne 1) { throw 'GYG_MODE_REQUIRED' }
$privateDir=Join-Path $env:LOCALAPPDATA 'CommunityTours\integrations\getyourguide'
$configPath=Join-Path $privateDir 'continuous.json'
$config=Get-Content -LiteralPath $configPath -Raw|ConvertFrom-Json
$runtime=Join-Path $privateDir 'runtime'
if ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')) -ne $runtime -or -not $config.enabled) { throw 'GYG_PRIVATE_RUNTIME_REQUIRED' }
$launcher=Join-Path $runtime 'scripts\Start-GetYourGuideContinuous.ps1'
if ((Get-FileHash -LiteralPath $launcher -Algorithm SHA256).Hash.ToLowerInvariant() -ne $config.sourceHashes.'scripts/Start-GetYourGuideContinuous.ps1') { throw 'GYG_CODE_CHANGED' }
if ($Install) {
    $name='CommunityTours-GetYourGuideContinuous'
    if ($null -ne (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue)) { throw 'GYG_TASK_ALREADY_EXISTS' }
    $principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'GYG_WINDOWS_ADMIN_REQUIRED' }
    $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $action=New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "'+$launcher+'" -Run') -WorkingDirectory $runtime
    $triggers=@((New-ScheduledTaskTrigger -AtStartup),(New-ScheduledTaskTrigger -AtLogOn -User $sid),
        (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Minutes 5)))
    $user=New-ScheduledTaskPrincipal -UserId $sid -LogonType S4U -RunLevel Limited
    $settings=New-ScheduledTaskSettingsSet -Hidden -StartWhenAvailable -RunOnlyIfNetworkAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $name -Action $action -Trigger $triggers -Principal $user -Settings $settings -Description 'Gmail GetYourGuide cada dos minutos; captura continua independiente de publicacion y aprobacion manual.'|Out-Null
    Start-ScheduledTask -TaskName $name
    exit 0
}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public sealed class GygWorkerJob : IDisposable {
 [StructLayout(LayoutKind.Sequential)] struct Basic { public long P1,P2; public uint Flags; public UIntPtr M1,M2; public uint Active; public UIntPtr Affinity; public uint Priority,Schedule; }
 [StructLayout(LayoutKind.Sequential)] struct Io { public ulong R1,R2,R3,R4,R5,R6; }
 [StructLayout(LayoutKind.Sequential)] struct Extended { public Basic B; public Io I; public UIntPtr M1,M2,M3,M4; }
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr a,string n);
 [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr j,int c,ref Extended e,uint s);
 [DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr j,IntPtr p);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 IntPtr handle;
 public GygWorkerJob() { handle=CreateJobObject(IntPtr.Zero,null); var e=new Extended(); e.B.Flags=0x2000;
  if(handle==IntPtr.Zero || !SetInformationJobObject(handle,9,ref e,(uint)Marshal.SizeOf(typeof(Extended)))) throw new Exception("GYG_JOB_FAILED"); }
 public void Assign(IntPtr p) { if(!AssignProcessToJobObject(handle,p))throw new Exception("GYG_JOB_FAILED"); }
 public void Dispose() { if(handle!=IntPtr.Zero){CloseHandle(handle);handle=IntPtr.Zero;} }
}
'@
$child=$null;$job=$null;$code=1
try {
    $info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName=$config.nodeExecutable
    $info.Arguments='"'+(Join-Path $runtime 'scripts\integrations\getyourguideContinuous.cjs')+'"'
    $info.WorkingDirectory=$runtime;$info.UseShellExecute=$false;$info.CreateNoWindow=$true
    $allowed='path systemroot windir comspec pathext temp tmp userprofile appdata localappdata programfiles programfiles(x86) programdata systemdrive allusersprofile username userdomain homedrive homepath'.Split(' ')
    $info.EnvironmentVariables.Clear()
    foreach($entry in [Environment]::GetEnvironmentVariables().GetEnumerator()) { if($entry.Key.ToLowerInvariant() -in $allowed){$info.EnvironmentVariables[$entry.Key]=$entry.Value} }
    $info.EnvironmentVariables['NODE_PATH']=$config.dependencyRoot
    $job=[GygWorkerJob]::new();$child=[Diagnostics.Process]::new();$child.StartInfo=$info
    [void]$child.Start();$job.Assign($child.Handle);$child.WaitForExit();$code=$child.ExitCode
} finally { if($job){$job.Dispose()};if($child){$child.Dispose()} }
exit $code
