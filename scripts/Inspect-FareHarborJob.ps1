$ErrorActionPreference='Stop'
$privateDir=Join-Path $env:LOCALAPPDATA 'CommunityTours\integrations\fareharbor'
$report=[ordered]@{at=[datetime]::UtcNow.ToString('o')}
try {
 Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FareHarborJobInspector {
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint rights,bool inherit,int pid);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool IsProcessInJob(IntPtr process,IntPtr job,out bool result);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 public static bool InJob(int pid) {var h=OpenProcess(0x1000,false,pid);if(h==IntPtr.Zero)throw new Exception("FH_PROCESS_OPEN_FAILED");try{bool result;if(!IsProcessInJob(h,IntPtr.Zero,out result))throw new Exception("FH_JOB_QUERY_FAILED");return result;}finally{CloseHandle(h);}}
}
'@
 $listeners=@(Get-NetTCPConnection -LocalPort 3443 -State Listen)
 $agents=@(Get-CimInstance Win32_Process -Filter "Name='ngrok.exe'")
 if($listeners.Count -ne 1 -or $agents.Count -ne 1){throw 'FH_PROCESS_COUNT_MISMATCH'}
 $receiver=Get-CimInstance Win32_Process -Filter ('ProcessId='+$listeners[0].OwningProcess)
 $agent=$agents[0]
 if($agent.ParentProcessId -ne $receiver.ProcessId){throw 'FH_PROCESS_PARENT_MISMATCH'}
 $report.processes=@($receiver,$agent) | ForEach-Object {
  [ordered]@{name=$_.Name;pid=$_.ProcessId;parentPid=$_.ParentProcessId;session=$_.SessionId;executable=$_.ExecutablePath;inWindowsJob=[FareHarborJobInspector]::InJob($_.ProcessId)}
 }
 $report.result='FH_JOB_INSPECTED'
}catch{$report.result=$_.Exception.Message}
[IO.File]::WriteAllText((Join-Path $privateDir 'job-inspection-20261021.json'),($report|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
