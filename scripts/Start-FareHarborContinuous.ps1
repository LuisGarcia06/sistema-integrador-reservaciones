# Recepcion continua independiente. Sin opciones solo valida; no abre puertos.
[CmdletBinding()]
param([switch]$Run,[switch]$Install,[switch]$Stop,[switch]$InitialValidate,[switch]$DeferStart,[switch]$PreviewTask,[switch]$KeepAwakeOnAC)
$ErrorActionPreference='Stop'
$privateDir=Join-Path $env:LOCALAPPDATA 'CommunityTours\integrations\fareharbor'
$configFile=Join-Path $privateDir 'continuous.json'
$taskName='CommunityTours-FareHarborContinuous'
$repoPath=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (@($Run,$Install,$Stop,$InitialValidate).Where({$_}).Count -gt 1) { throw 'FH_MODE_REQUIRED' }
if (($DeferStart -or $PreviewTask -or $KeepAwakeOnAC) -and -not $Install) { throw 'FH_INSTALL_MODE_REQUIRED' }
if ($Stop) {
    $config=[IO.File]::ReadAllText($configFile)|ConvertFrom-Json
    $config.enabled=$false; $config.executionAuthorized=$false
    [IO.File]::WriteAllText($configFile,($config|ConvertTo-Json -Depth 30),[Text.UTF8Encoding]::new($false))
    $task=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($null -ne $task) { Disable-ScheduledTask -TaskName $taskName|Out-Null }
    Write-Host 'FH_STOP_REQUESTED'; exit 0
}
if ($Install) {
    $config=[IO.File]::ReadAllText($configFile)|ConvertFrom-Json
    # Mantener la politica compartida y la autorizacion existente; nunca habilitar altas internas.
    if (-not $config.enabled -or -not $config.executionAuthorized -or $null -ne $config.autoApplyUserId -or
        -not $config.initialBackupVerifiedAt) { throw 'FH_INSTALL_BLOCKED' }
    $runtimeLauncher=Join-Path $config.runtimeRoot 'scripts\Start-FareHarborContinuous.ps1'
    if ($config.runtimeRoot -ne (Join-Path $privateDir 'runtime') -or -not (Test-Path -LiteralPath $runtimeLauncher)) { throw 'FH_RUNTIME_REQUIRED' }
    'const fs=require("node:fs"),path=require("node:path");const c=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));if(!require(path.join(c.runtimeRoot,"scripts/integrations/fareharborCapturePolicy.cjs")).captureAllowed(c)||c.autoApplyUserId!==null)process.exit(1);' | & $config.nodeExecutable - $configFile
    if ($LASTEXITCODE -ne 0) { throw 'FH_INSTALL_BLOCKED' }
    if ($null -ne (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)) { throw 'FH_TASK_ALREADY_EXISTS' }
    # No repetir la comparacion inicial del respaldo contra una base que ya recibe eventos.
    $user=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $action=New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "'+$runtimeLauncher+'" -Run') -WorkingDirectory $config.runtimeRoot
    $triggers=@((New-ScheduledTaskTrigger -AtStartup),(New-ScheduledTaskTrigger -AtLogOn -User $user),
        (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Minutes 5)))
    # Misma identidad y ACL; S4U no almacena contrasena Windows ni requiere sesion interactiva.
    # No se utilizan recursos compartidos ni autenticacion Windows en los proveedores.
    $principal=New-ScheduledTaskPrincipal -UserId $user -LogonType S4U -RunLevel Limited
    $settings=New-ScheduledTaskSettingsSet -Hidden -StartWhenAvailable -RunOnlyIfNetworkAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
    if ($DeferStart) { $settings.Enabled=$false }
    $definition=New-ScheduledTask -Action $action -Trigger $triggers -Principal $principal -Settings $settings -Description 'Receptor FareHarbor independiente, inicio Windows/red, solo eventos pendientes; sin altas internas automaticas.'
    if ($PreviewTask) {
        [pscustomobject]@{taskName=$taskName; userSid=$user; logonType='S4U'; runLevel='Limited';
            enabled=$settings.Enabled; networkRequired=$settings.RunOnlyIfNetworkAvailable;
            restartCount=$settings.RestartCount; restartInterval=$settings.RestartInterval;
            executionTimeLimit=$settings.ExecutionTimeLimit; multipleInstances=$settings.MultipleInstances;
            triggers=@('Windows startup','User logon','Every 5 minutes indefinitely');
            executable=$action.Execute; arguments=$action.Arguments; workingDirectory=$action.WorkingDirectory;
            automaticApplication=$false; keepAwakeOnAC=[bool]$KeepAwakeOnAC} | ConvertTo-Json -Depth 4
        exit 0
    }
    $identity=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'FH_WINDOWS_ADMIN_REQUIRED' }
    Register-ScheduledTask -TaskName $taskName -InputObject $definition|Out-Null
    if ($KeepAwakeOnAC) {
        & "$env:SystemRoot\System32\powercfg.exe" /setacvalueindex SCHEME_CURRENT SUB_SLEEP STANDBYIDLE 0
        if ($LASTEXITCODE -ne 0) { throw 'FH_AC_SLEEP_CONFIGURATION_FAILED' }
        & "$env:SystemRoot\System32\powercfg.exe" /setactive SCHEME_CURRENT
        if ($LASTEXITCODE -ne 0) { throw 'FH_AC_SLEEP_CONFIGURATION_FAILED' }
    }
    if (-not $DeferStart) { Start-ScheduledTask -TaskName $taskName }
    Write-Host 'FH_AUTOSTART_INSTALLED'; exit 0
}
$child=$null; $childStarted=$false; $job=$null; $resultCode=1
$runMutex=$null; $ownsMutex=$false; $recoveredPid=$null; $tunnelPid=$null; $statusCode='FH_LAUNCHER_STARTING'
$failureType=$null;$failureLine=$null;$failureHResult=$null
. (Join-Path $PSScriptRoot 'FareHarborProcessRecovery.ps1')
try {
    if ($env:OS -ne 'Windows_NT') { throw 'WINDOWS_REQUIRED' }
    if (-not ('FareHarborContinuousJob' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public sealed class FareHarborContinuousJob : IDisposable {
    [StructLayout(LayoutKind.Sequential)] struct Basic {
        public long ProcessTime, JobTime; public uint Flags;
        public UIntPtr MinWorkingSet, MaxWorkingSet; public uint ActiveProcesses;
        public UIntPtr Affinity; public uint PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)] struct Io { public ulong R1,R2,R3,R4,R5,R6; }
    [StructLayout(LayoutKind.Sequential)] struct Extended {
        public Basic Basic; public Io Io;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr attr, string name);
    [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr job, int cls, ref Extended value, uint size);
    [DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll")] static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool result);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    IntPtr handle;
    public FareHarborContinuousJob() {
        handle=CreateJobObject(IntPtr.Zero,null);
        if(handle==IntPtr.Zero) throw new InvalidOperationException("JOB_CREATE_FAILED");
        var limits=new Extended(); limits.Basic.Flags=0x2000;
        if(!SetInformationJobObject(handle,9,ref limits,(uint)Marshal.SizeOf(typeof(Extended)))) { Dispose(); throw new InvalidOperationException("JOB_LIMIT_FAILED"); }
    }
    public void Assign(IntPtr process) { if(!AssignProcessToJobObject(handle,process)) throw new InvalidOperationException("JOB_ASSIGN_FAILED"); }
    public bool Contains(IntPtr process) { bool result; if(!IsProcessInJob(process,handle,out result)) throw new InvalidOperationException("JOB_QUERY_FAILED"); return result; }
    public void Dispose() { if(handle!=IntPtr.Zero) { CloseHandle(handle); handle=IntPtr.Zero; } }
}
'@
    }
    $entryPath=Join-Path $PSScriptRoot 'integrations\fareharborContinuous.cjs'
    $config=[IO.File]::ReadAllText($configFile)|ConvertFrom-Json
    if ($Run -and $null -ne $config.autoApplyUserId) { throw 'FH_AUTOMATIC_APPLICATION_DISABLED' }
    if ($repoPath -ne $config.runtimeRoot -or -not [IO.Path]::IsPathRooted($config.nodeExecutable)) { throw 'FH_RUNTIME_REQUIRED' }
    if($Run){
        $runMutex=[Threading.Mutex]::new($false,'Local\CommunityTours-FareHarborContinuous')
        try {$ownsMutex=$runMutex.WaitOne(0)} catch [Threading.AbandonedMutexException] {$ownsMutex=$true}
        if(-not $ownsMutex){throw 'FH_LAUNCHER_ALREADY_RUNNING'}
        # Validar integridad y rutas antes de permitir cualquier recuperacion de procesos.
        if($config.ngrokDomain -cne 'fleshed-patchy-cassette.ngrok-free.dev' -or
            $config.ngrokConfigPath -cne (Join-Path $privateDir 'ngrok.yml') -or
            $config.tls.caCertFile -cne (Join-Path $privateDir 'tls\localhost-cert.pem') -or
            $config.enabled -ne $true -or $config.executionAuthorized -ne $true){throw 'FH_RECOVERY_CONFIG_INVALID'}
        foreach($property in $config.sourceHashes.PSObject.Properties){
            $sourceFile=[IO.Path]::GetFullPath((Join-Path $repoPath $property.Name))
            if(-not $sourceFile.StartsWith($repoPath+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or
                (Get-FileHash -LiteralPath $sourceFile -Algorithm SHA256).Hash.ToLowerInvariant() -cne $property.Value){throw 'FH_SOURCE_CHANGED'}
        }
        Initialize-FareHarborArgv
        $recoveredPid=Remove-FareHarborVerifiedOrphan -Config $config -PrivateDirectory $privateDir
    }
    $nodePath=$config.nodeExecutable
    $mode=if($Run){'--start'}elseif($InitialValidate){'--initial-validate'}else{'--validate'}
    $info=[Diagnostics.ProcessStartInfo]::new()
    $info.FileName=$nodePath; $info.Arguments='"'+$entryPath+'" '+$mode
    $info.WorkingDirectory=$repoPath; $info.UseShellExecute=$false; $info.CreateNoWindow=$true
    $info.RedirectStandardInput=$true; $info.RedirectStandardError=$true; $info.RedirectStandardOutput=$true
    $allowed='path systemroot windir comspec pathext temp tmp userprofile appdata localappdata programfiles programfiles(x86) programdata systemdrive allusersprofile username userdomain homedrive homepath'.Split(' ')
    $info.EnvironmentVariables.Clear()
    foreach($entry in [Environment]::GetEnvironmentVariables().GetEnumerator()) {
        if($entry.Key.ToLowerInvariant() -in $allowed){$info.EnvironmentVariables[$entry.Key]=$entry.Value}
    }
    # Las dependencias provienen de la version protegida existente, no de node_modules de A:.
    $info.EnvironmentVariables['NODE_PATH']=$config.dependencyRoot
    $job=[FareHarborContinuousJob]::new()
    $child=[Diagnostics.Process]::new(); $child.StartInfo=$info
    [void]$child.Start(); $childStarted=$true
    $errorDrain=$child.StandardError.ReadToEndAsync()
    $outputDrain=$child.StandardOutput.ReadToEndAsync()
    $job.Assign($child.Handle)
    $child.StandardInput.WriteLine('ARM'); $child.StandardInput.Flush()
    $statusCode='FH_LAUNCHER_RUNNING'
    if($Run){Write-FareHarborLauncherStatus $privateDir $statusCode $child.Id $null $recoveredPid $tunnelPid}
    $nextContainment=[datetime]::UtcNow
    while(-not $child.WaitForExit(250)){
        if($Run -and [datetime]::UtcNow -ge $nextContainment){
            $nextContainment=[datetime]::UtcNow.AddSeconds(2)
            # El hijo Node sigue vivo: su PID no puede haberse reutilizado. Registrar
            # su tunel real. No reasignar jobs de aplicaciones Microsoft Store.
            foreach($agent in @(Get-CimInstance Win32_Process -Filter ("Name='ngrok.exe' AND ParentProcessId="+$child.Id))){
                if($tunnelPid -ne $agent.ProcessId){
                    $tunnelPid=[int]$agent.ProcessId
                    Write-FareHarborLauncherStatus $privateDir $statusCode $child.Id $null $recoveredPid $tunnelPid
                }
            }
        }
    }
    $resultCode=$child.ExitCode
    $statusCode=if($resultCode -eq 0){'FH_LAUNCHER_STOPPED'}else{'FH_RECEIVER_EXITED'}
    if($resultCode -ne 0 -and $outputDrain.IsCompleted){
        foreach($line in ($outputDrain.Result -split "`n")){
            if($line -match '^\{"code":"(FH_[A-Z_]+)"\}\s*$'){$statusCode=$Matches[1]}
        }
    }
} catch {
    $failureType=$_.Exception.GetType().FullName;$failureLine=$_.InvocationInfo.ScriptLineNumber;$failureHResult=$_.Exception.HResult
    $exception=$_.Exception
    while($null -ne $exception.InnerException){$exception=$exception.InnerException}
    $statusCode=if($exception.Message -cmatch '^(FH_[A-Z_]+|EXISTING_NGROK_PROCESS|JOB_[A-Z_]+)$'){$exception.Message}else{'FH_WINDOWS_CONTINUOUS_FAILED'}
    Write-Host $statusCode
}
finally {
    if($childStarted -and -not $child.HasExited){
        try{$child.StandardInput.WriteLine('STOP');$child.StandardInput.Flush();[void]$child.WaitForExit(12000)}catch{}
        if(-not $child.HasExited){$child.Kill()}
    }
    if($null -ne $job){$job.Dispose()}
    if($null -ne $child){$child.Dispose()}
    if($Run -and $ownsMutex){
        try {Write-FareHarborLauncherStatus $privateDir $statusCode $null $resultCode $recoveredPid $tunnelPid $failureType $failureLine $failureHResult}catch{}
        $runMutex.ReleaseMutex()
    }
    if($null -ne $runMutex){$runMutex.Dispose()}
}
exit $resultCode
