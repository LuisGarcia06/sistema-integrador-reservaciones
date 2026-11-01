$ErrorActionPreference='Stop'
$taskReport=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'verification.json') -Raw|ConvertFrom-Json
$taskPaths=@($taskReport.clusters|ForEach-Object {$_.directory})+@($taskReport.clients)
$taskProcesses=@(Get-CimInstance Win32_Process|Where-Object {$taskLine=$_.CommandLine;$taskLine -and @($taskPaths|Where-Object {$taskLine.IndexOf($_,[StringComparison]::OrdinalIgnoreCase) -ge 0}).Count -gt 0}|Select-Object ProcessId,ParentProcessId,Name)
$taskPorts=@($taskReport.clusters|ForEach-Object {$_.pgPort;$_.httpPort})
$taskListeners=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue|Where-Object {$_.LocalPort -in $taskPorts}|Select-Object LocalAddress,LocalPort,OwningProcess)
$taskPidFiles=@($taskReport.clusters|Where-Object {Test-Path -LiteralPath (Join-Path $_.dataDirectory 'postmaster.pid')}|ForEach-Object {$_.directory})
$taskResult=@{checkedAt=[DateTime]::UtcNow.ToString('o');scope='Only new clean-rehearsal cluster/client directories and ports';processes=$taskProcesses;listeners=$taskListeners;pidFiles=$taskPidFiles;closed=($taskProcesses.Count -eq 0 -and $taskListeners.Count -eq 0 -and $taskPidFiles.Count -eq 0)}
$taskResult|ConvertTo-Json -Depth 7|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'closure.json') -Encoding utf8
$taskResult|ConvertTo-Json -Depth 7
if(-not $taskResult.closed){throw 'CLEAN_REHEARSAL_PROCESSES_REMAIN'}
