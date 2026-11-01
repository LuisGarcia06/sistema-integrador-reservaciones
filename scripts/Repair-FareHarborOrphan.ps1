# Recuperacion puntual autorizada. No cambia tareas, credenciales ni datos.
[CmdletBinding()]
param([switch]$Restore)
$ErrorActionPreference='Stop'
$privateDir=Join-Path $env:LOCALAPPDATA 'CommunityTours\integrations\fareharbor'
$reportFile=Join-Path $privateDir 'recovery-20261021.json'
$report=[ordered]@{startedAt=[datetime]::UtcNow.ToString('o'); restored=$false}
try {
    $config=Get-Content -LiteralPath (Join-Path $privateDir 'continuous.json') -Raw | ConvertFrom-Json
    $taskName='CommunityTours-FareHarborContinuous'
    $task=Get-ScheduledTask -TaskName $taskName
    if($task.State -eq 'Running'){throw 'FH_TASK_ALREADY_RUNNING'}
    if(@(Get-NetTCPConnection -State Listen -LocalPort 3443 -ErrorAction SilentlyContinue).Count){throw 'FH_PORT_IN_USE'}
    $agents=@(Get-CimInstance Win32_Process -Filter "Name='ngrok.exe'")
    if($agents.Count -ne 1){throw 'FH_AGENT_COUNT_UNEXPECTED'}
    $agent=$agents[0]
    if($agent.ProcessId -ne 21752 -or $agent.ParentProcessId -ne 27740 -or $agent.SessionId -ne 0 -or
        $agent.CreationDate.ToUniversalTime().ToString('yyyyMMddTHHmmss') -ne '20261021T152922'){throw 'FH_AGENT_IDENTITY_MISMATCH'}
    if(Get-CimInstance Win32_Process -Filter "ProcessId=27740"){throw 'FH_PARENT_STILL_EXISTS'}
    if(-not $agent.ExecutablePath -or -not $agent.CommandLine){throw 'FH_AGENT_DETAILS_UNAVAILABLE'}
    $owner=Invoke-CimMethod -InputObject $agent -MethodName GetOwnerSid
    if($owner.ReturnValue -ne 0 -or $owner.Sid -ne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value){throw 'FH_OWNER_MISMATCH'}
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FareHarborArgv {
 [DllImport("shell32.dll",CharSet=CharSet.Unicode)] static extern IntPtr CommandLineToArgvW(string cmd,out int count);
 [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr p);
 public static string[] Split(string cmd) {
  int n; var p=CommandLineToArgvW(cmd,out n); if(p==IntPtr.Zero) throw new Exception("ARGV_FAILED");
  try {var a=new string[n];for(int i=0;i<n;i++)a[i]=Marshal.PtrToStringUni(Marshal.ReadIntPtr(p,i*IntPtr.Size));return a;}finally{LocalFree(p);}
 }
}
'@
    $argv=[FareHarborArgv]::Split($agent.CommandLine)
    $expected=@('http','https://127.0.0.1:3443','--config',$config.ngrokConfigPath,
        '--upstream-tls-verify','--upstream-tls-verify-cas',$config.tls.caCertFile,
        '--inspect=false','--log=false','--url',('https://'+$config.ngrokDomain))
    if($argv.Count -ne $expected.Count+1){throw 'FH_ARGUMENT_COUNT_MISMATCH'}
    for($i=0;$i -lt $expected.Count;$i++){if($argv[$i+1] -cne $expected[$i]){throw 'FH_ARGUMENT_MISMATCH'}}
    if([IO.Path]::GetFileName($agent.ExecutablePath) -ne 'ngrok.exe'){throw 'FH_EXECUTABLE_MISMATCH'}
    # El parser existente rechaza endpoints adicionales y opciones ajenas al receptor.
    $validator='const fs=require("fs"),p=require("path");const c=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));require(p.join(c.runtimeRoot,"scripts/integrations/fareharborSupervisor.cjs")).parseAgentConfig(fs.readFileSync(c.ngrokConfigPath,"utf8"));'
    $previousNodePath=$env:NODE_PATH
    try {$env:NODE_PATH=$config.dependencyRoot; $validator | & $config.nodeExecutable - (Join-Path $privateDir 'continuous.json'); if($LASTEXITCODE -ne 0){throw 'FH_CONFIG_NOT_EXCLUSIVE'}}
    finally {$env:NODE_PATH=$previousNodePath}
    $children=@(Get-CimInstance Win32_Process -Filter 'ParentProcessId=21752')
    # ngrok de Microsoft Store crea un host de consola propio. No cerrar otros descendientes.
    foreach($dependent in $children){
        $dependentOwner=Invoke-CimMethod -InputObject $dependent -MethodName GetOwnerSid
        if($dependent.Name -ne 'conhost.exe' -or $dependent.ExecutablePath -ine "$env:SystemRoot\System32\conhost.exe" -or
            $dependentOwner.Sid -ne $owner.Sid -or $dependent.SessionId -ne $agent.SessionId -or
            [Math]::Abs(($dependent.CreationDate-$agent.CreationDate).TotalSeconds) -gt 2 -or
            @(Get-CimInstance Win32_Process -Filter ('ParentProcessId='+$dependent.ProcessId)).Count){throw 'FH_AGENT_CHILDREN_UNEXPECTED'}
    }
    $report.agent=[ordered]@{pid=$agent.ProcessId; parentPid=$agent.ParentProcessId;
        createdAt=$agent.CreationDate.ToUniversalTime().ToString('o'); executable=$agent.ExecutablePath;
        executableSha256=(Get-FileHash -LiteralPath $agent.ExecutablePath -Algorithm SHA256).Hash;
        configPath=$config.ngrokConfigPath; domain=$config.ngrokDomain; upstream='https://127.0.0.1:3443';
        ownerSid=$owner.Sid; exclusive=$true; parentAbsent=$true; exactArguments=$true;
        consoleHostPids=@($children | ForEach-Object {$_.ProcessId})}
    if($Restore){
        # Volver a comprobar identidad y ausencia de receptor antes del unico cierre permitido.
        $fresh=Get-CimInstance Win32_Process -Filter 'ProcessId=21752'
        if(-not $fresh -or $fresh.CreationDate -ne $agent.CreationDate -or $fresh.CommandLine -cne $agent.CommandLine -or
            @(Get-NetTCPConnection -State Listen -LocalPort 3443 -ErrorAction SilentlyContinue).Count -or
            (Get-ScheduledTask -TaskName $taskName).State -eq 'Running'){throw 'FH_STATE_CHANGED'}
        Stop-Process -Id 21752 -ErrorAction Stop
        Wait-Process -Id 21752 -Timeout 10 -ErrorAction SilentlyContinue
        if(Get-CimInstance Win32_Process -Filter 'ProcessId=21752'){throw 'FH_AGENT_DID_NOT_EXIT'}
        $report.closedAt=[datetime]::UtcNow.ToString('o')
        Start-ScheduledTask -TaskName $taskName
        $report.taskStartRequestedAt=[datetime]::UtcNow.ToString('o')
        $report.restored=$true
    }
    $report.result='FH_ORPHAN_EXCLUSIVE_VERIFIED'
} catch {
    $code=$_.Exception.Message
    $report.result=if($code -match '^FH_[A-Z_]+$'){$code}else{'FH_RECOVERY_INSPECTION_FAILED'}
} finally {
    $report.finishedAt=[datetime]::UtcNow.ToString('o')
    [IO.File]::WriteAllText($reportFile,($report|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
}
