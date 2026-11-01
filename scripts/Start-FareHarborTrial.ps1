# Supervisor local de una prueba temporal. Sin -Start solo valida con lecturas PostgreSQL.
[CmdletBinding()]
param([switch]$Start)
$ErrorActionPreference = 'Stop'
$child = $null
$childStarted = $false
$job = $null
$resultCode = 1
try {
    if ($env:OS -ne 'Windows_NT') { throw 'WINDOWS_REQUIRED' }
    if (-not ('FareHarborTrialJob' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public sealed class FareHarborTrialJob : IDisposable {
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
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    IntPtr handle;
    public FareHarborTrialJob() {
        handle=CreateJobObject(IntPtr.Zero,null);
        if(handle==IntPtr.Zero) throw new InvalidOperationException("JOB_CREATE_FAILED");
        var limits=new Extended(); limits.Basic.Flags=0x2000; // KILL_ON_JOB_CLOSE
        if(!SetInformationJobObject(handle,9,ref limits,(uint)Marshal.SizeOf(typeof(Extended)))) { Dispose(); throw new InvalidOperationException("JOB_LIMIT_FAILED"); }
    }
    public void Assign(IntPtr process) { if(!AssignProcessToJobObject(handle,process)) throw new InvalidOperationException("JOB_ASSIGN_FAILED"); }
    public void Dispose() { if(handle!=IntPtr.Zero) { CloseHandle(handle); handle=IntPtr.Zero; } }
}
'@
    }
    $repoPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $entryPath = Join-Path $PSScriptRoot 'integrations\fareharborSupervisor.cjs'
    $nodePath = (Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    if ($Start -and @(Get-Process -Name ngrok -ErrorAction SilentlyContinue).Count -gt 0) { throw 'EXISTING_NGROK_PROCESS' }
    $mode = if ($Start) { '--start' } else { '--validate' }
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = $nodePath
    $info.Arguments = '"' + $entryPath + '" ' + $mode
    $info.WorkingDirectory = $repoPath
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $true
    $info.RedirectStandardError = $true
    # No transmitir NODE_OPTIONS, DB/PG, proxies ni secretos del proceso invocador.
    $allowed = 'path systemroot windir comspec pathext temp tmp userprofile appdata localappdata programfiles programfiles(x86) programdata systemdrive allusersprofile username userdomain homedrive homepath'.Split(' ')
    $info.EnvironmentVariables.Clear()
    foreach ($entry in [Environment]::GetEnvironmentVariables().GetEnumerator()) {
        if ($entry.Key.ToLowerInvariant() -in $allowed) { $info.EnvironmentVariables[$entry.Key] = $entry.Value }
    }
    $job = [FareHarborTrialJob]::new()
    $child = [Diagnostics.Process]::new()
    $child.StartInfo = $info
    [void]$child.Start()
    $childStarted = $true
    $errorDrain = $child.StandardError.ReadToEndAsync() # Descartar diagnósticos que puedan contener datos privados.
    $job.Assign($child.Handle)
    $child.StandardInput.WriteLine('ARM')
    $child.StandardInput.Flush()
    if ($Start) { Write-Host 'Prueba supervisada: Ctrl+C para detener. Ventana limitada por configuracion privada.' }
    while (-not $child.WaitForExit(250)) { }
    $resultCode = $child.ExitCode
} catch {
    Write-Host 'FH_WINDOWS_SUPERVISOR_FAILED: no continuar; revisar configuracion privada y estado de procesos propios.'
} finally {
    if ($childStarted -and -not $child.HasExited) {
        try { $child.StandardInput.WriteLine('STOP'); $child.StandardInput.Flush(); [void]$child.WaitForExit(12000) } catch { }
        if (-not $child.HasExited) { $child.Kill() }
    }
    # Si no hubo cierre normal, Windows termina únicamente este hijo y sus descendientes.
    if ($null -ne $job) { $job.Dispose() }
    if ($null -ne $child) { $child.Dispose() }
    if ($Start) {
        # Desarmar solamente controles propios; conservar KEY, token y constancias no verificadas.
        try {
            $privateDir = Join-Path $env:LOCALAPPDATA 'CommunityTours\integrations\fareharbor'
            foreach ($name in @('supervisor.json','trial.json','trial-control.json')) {
                $privateFile = Join-Path $privateDir $name
                if (Test-Path -LiteralPath $privateFile) {
                    $control = [IO.File]::ReadAllText($privateFile) | ConvertFrom-Json
                    if ($name -eq 'supervisor.json') { $control.enabled=$false; $control.executionAuthorized=$false }
                    elseif ($name -eq 'trial.json') { $control.enabled=$false }
                    else { $control.receiptAuthorized=$false }
                    [IO.File]::WriteAllText($privateFile,($control|ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
                }
            }
        } catch { Write-Host 'FH_PRIVATE_DISARM_CHECK_REQUIRED' }
    }
}
exit $resultCode
