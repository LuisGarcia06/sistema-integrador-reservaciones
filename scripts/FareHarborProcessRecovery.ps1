# Solo se usa desde el lanzador protegido. No recibe secretos como argumentos.
function Initialize-FareHarborArgv {
    if ('FareHarborRecoveryArgv' -as [type]) { return }
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FareHarborRecoveryArgv {
 [DllImport("shell32.dll",CharSet=CharSet.Unicode)] static extern IntPtr CommandLineToArgvW(string cmd,out int count);
 [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr p);
 public static string[] Split(string cmd) {
  int n;var p=CommandLineToArgvW(cmd,out n);if(p==IntPtr.Zero)throw new Exception("FH_ARGV_FAILED");
  try{var a=new string[n];for(int i=0;i<n;i++)a[i]=Marshal.PtrToStringUni(Marshal.ReadIntPtr(p,i*IntPtr.Size));return a;}finally{LocalFree(p);}
 }
}
'@
}

function Test-FareHarborOrphanIdentity {
    param($Agent,$Config,[string]$OwnerSid,[string]$ExpectedSid,[bool]$ParentAbsent,[bool]$PortFree,
        [int]$ExpectedSessionId=[Diagnostics.Process]::GetCurrentProcess().SessionId)
    if(-not $ParentAbsent -or -not $PortFree -or $OwnerSid -cne $ExpectedSid -or
        $Agent.Name -ine 'ngrok.exe' -or $Agent.SessionId -ne $ExpectedSessionId -or
        -not $Agent.ExecutablePath -or -not $Agent.CommandLine -or -not $Agent.CreationDate){return $false}
    $arguments=[FareHarborRecoveryArgv]::Split($Agent.CommandLine)
    $expected=@('http','https://127.0.0.1:3443','--config',$Config.ngrokConfigPath,
        '--upstream-tls-verify','--upstream-tls-verify-cas',$Config.tls.caCertFile,
        '--inspect=false','--log=false','--url',('https://'+$Config.ngrokDomain))
    if($arguments.Count -ne $expected.Count+1 -or [IO.Path]::GetFileName($Agent.ExecutablePath) -ine 'ngrok.exe'){return $false}
    for($i=0;$i -lt $expected.Count;$i++){if($arguments[$i+1] -cne $expected[$i]){return $false}}
    return $true
}

function Remove-FareHarborVerifiedOrphan {
    param($Config,[string]$PrivateDirectory,[int]$ExpectedSessionId=[Diagnostics.Process]::GetCurrentProcess().SessionId)
    $agents=@(Get-CimInstance Win32_Process -Filter "Name='ngrok.exe'")
    if(-not $agents.Count){return $null}
    if($agents.Count -ne 1){throw 'EXISTING_NGROK_PROCESS'}
    $agent=$agents[0]
    $owner=Invoke-CimMethod -InputObject $agent -MethodName GetOwnerSid
    $parentAbsent=-not (Get-CimInstance Win32_Process -Filter ('ProcessId='+$agent.ParentProcessId))
    $portFree=-not @(Get-NetTCPConnection -LocalPort 3443 -State Listen -ErrorAction SilentlyContinue).Count
    $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    if($owner.ReturnValue -ne 0 -or -not (Test-FareHarborOrphanIdentity -Agent $agent -Config $Config -OwnerSid $owner.Sid -ExpectedSid $sid -ParentAbsent $parentAbsent -PortFree $portFree -ExpectedSessionId $ExpectedSessionId)){
        throw 'EXISTING_NGROK_PROCESS'
    }
    # Configuracion sin endpoints adicionales; mismo parser que el receptor continuo.
    $validator='const fs=require("fs"),p=require("path");const c=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));require(p.join(c.runtimeRoot,"scripts/integrations/fareharborSupervisor.cjs")).parseAgentConfig(fs.readFileSync(c.ngrokConfigPath,"utf8"));'
    $previousNodePath=$env:NODE_PATH
    try {
        $env:NODE_PATH=$Config.dependencyRoot
        $validator | & $Config.nodeExecutable - (Join-Path $PrivateDirectory 'continuous.json')
        if($LASTEXITCODE -ne 0){throw 'FH_ORPHAN_CONFIG_UNVERIFIED'}
    } finally {$env:NODE_PATH=$previousNodePath}
    foreach($dependent in @(Get-CimInstance Win32_Process -Filter ('ParentProcessId='+$agent.ProcessId))){
        $dependentOwner=Invoke-CimMethod -InputObject $dependent -MethodName GetOwnerSid
        if($dependent.Name -ine 'conhost.exe' -or $dependent.ExecutablePath -ine "$env:SystemRoot\System32\conhost.exe" -or
            $dependentOwner.ReturnValue -ne 0 -or $dependentOwner.Sid -cne $sid -or $dependent.SessionId -ne $agent.SessionId -or
            [Math]::Abs(($dependent.CreationDate-$agent.CreationDate).TotalSeconds) -gt 2 -or
            @(Get-CimInstance Win32_Process -Filter ('ParentProcessId='+$dependent.ProcessId)).Count){throw 'FH_ORPHAN_DEPENDENT_UNVERIFIED'}
    }
    $fresh=Get-CimInstance Win32_Process -Filter ('ProcessId='+$agent.ProcessId)
    if(-not $fresh -or $fresh.CreationDate -ne $agent.CreationDate -or $fresh.CommandLine -cne $agent.CommandLine -or
        (Get-CimInstance Win32_Process -Filter ('ProcessId='+$agent.ParentProcessId)) -or
        @(Get-NetTCPConnection -LocalPort 3443 -State Listen -ErrorAction SilentlyContinue).Count){throw 'FH_ORPHAN_STATE_CHANGED'}
    Stop-Process -Id $agent.ProcessId -ErrorAction Stop
    Wait-Process -Id $agent.ProcessId -Timeout 10 -ErrorAction SilentlyContinue
    if(Get-CimInstance Win32_Process -Filter ('ProcessId='+$agent.ProcessId)){throw 'FH_ORPHAN_STOP_FAILED'}
    return [int]$agent.ProcessId
}

function Write-FareHarborLauncherStatus {
    param([string]$Directory,[string]$Code,$ChildPid,$ExitCode,$RecoveredPid,$NgrokPid,$FailureType,$FailureLine,$FailureHResult)
    # Solo codigos y PID; no stderr, payloads, URL ni credenciales.
    $value=[ordered]@{updatedAt=[datetime]::UtcNow.ToString('o');code=$Code;launcherPid=$PID;
        receiverPid=$ChildPid;exitCode=$ExitCode;recoveredOrphanPid=$RecoveredPid;ngrokPid=$NgrokPid;
        failureType=$FailureType;failureLine=$FailureLine;failureHResult=$FailureHResult}
    $file=Join-Path $Directory 'launcher-status.json'
    $temporary=$file+'.'+$PID+'.tmp'
    [IO.File]::WriteAllText($temporary,($value|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporary -Destination $file -Force
}
