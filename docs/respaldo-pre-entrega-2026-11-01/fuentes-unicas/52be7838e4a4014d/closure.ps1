[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$taskDirectories=@(Get-ChildItem -LiteralPath $env:LOCALAPPDATA -Directory -Filter 'ctsk-e026-*')
$taskClusters=@();$taskPorts=@()
foreach($taskDirectory in $taskDirectories){
 $taskMarker=Join-Path $taskDirectory.FullName 'provision026.marker'
 $taskServer=Join-Path $taskDirectory.FullName 'server026.json'
 if((Test-Path -LiteralPath $taskMarker) -and (Test-Path -LiteralPath $taskServer)){
  $taskManifest=(Get-Content -LiteralPath $taskServer -Raw|ConvertFrom-Json).manifest
  if($taskManifest.directory -ne $taskDirectory.FullName -or $taskManifest.dataDirectory -ne (Join-Path $taskDirectory.FullName 'data')){throw 'CLOSURE_IDENTITY'}
  $taskClusters+=,[pscustomobject]@{directory=$taskManifest.directory;database=$taskManifest.database;cluster=$taskManifest.cluster;pgPort=$taskManifest.pgPort;httpPort=$taskManifest.httpPort;postmasterPidPresent=(Test-Path -LiteralPath (Join-Path $taskManifest.dataDirectory 'postmaster.pid'))}
  $taskPorts+=,$taskManifest.pgPort;$taskPorts+=,$taskManifest.httpPort
 }
}
foreach($taskAttempt in @(Get-ChildItem -LiteralPath $PSScriptRoot -Directory -Filter 'attempt-*')){
 $taskReport=Join-Path $taskAttempt.FullName 'verification.json'
 if(Test-Path -LiteralPath $taskReport){$taskData=Get-Content -LiteralPath $taskReport -Raw|ConvertFrom-Json;foreach($taskConnection in $taskData.connections){$taskPorts+=,$taskConnection.port}}
}
$taskPorts=@($taskPorts|Sort-Object -Unique)
$taskListeners=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue|Where-Object {$_.LocalPort -in $taskPorts}|Select-Object LocalAddress,LocalPort,OwningProcess)
$taskProcesses=@(Get-CimInstance Win32_Process|Where-Object {$_.Name -match '^(node|electron|postgres)\.exe$' -and ($_.CommandLine -like '*local-fase-2e6-enterprise*' -or $_.CommandLine -like '*ctsk-e026-*')}|Select-Object ProcessId,Name)
$taskClosed=@($taskClusters|Where-Object {$_.postmasterPidPresent}).Count -eq 0 -and $taskListeners.Count -eq 0 -and $taskProcesses.Count -eq 0
$taskResult=[pscustomobject]@{checkedAt=[DateTime]::UtcNow.ToString('o');closed=$taskClosed;scope='Only directories and ports created by enterprise026 acceptance';clusters=$taskClusters;ports=$taskPorts;listeners=$taskListeners;processes=$taskProcesses;stoppedOrKilledByThisInspection=$false;existingDatabasesQueried=$false}
$taskFile=Join-Path $PSScriptRoot 'closure.json'
if(Test-Path -LiteralPath $taskFile){throw 'CLOSURE_EVIDENCE_EXISTS'}
[IO.File]::WriteAllText($taskFile,($taskResult|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
$taskResult|Select-Object closed,@{Name='clusters';Expression={$_.clusters.Count}},@{Name='ports';Expression={$_.ports.Count}},@{Name='processes';Expression={$_.processes.Count}},@{Name='listeners';Expression={$_.listeners.Count}}|ConvertTo-Json -Compress
if(!$taskClosed){throw 'OWN_PROCESSES_OR_PORTS_REMAIN'}
