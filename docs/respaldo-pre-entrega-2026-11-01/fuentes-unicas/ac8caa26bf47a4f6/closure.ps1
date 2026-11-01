$ErrorActionPreference='Stop'
$taskInventory=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'inventory.json') -Raw | ConvertFrom-Json
$taskPaths=@($taskInventory.laboratories|ForEach-Object {$_.directory})+@($taskInventory.clients)
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskPaths+=@(Join-Path $taskRoot 'scripts/integration024Worker.cjs')
$taskPaths+=@(Join-Path $taskRoot 'docs/local-fase-2e4/client-harness.cjs')
$taskProcesses=@(Get-CimInstance Win32_Process | Where-Object { $taskCommand=$_.CommandLine; $taskCommand -and @($taskPaths|Where-Object {$taskCommand.IndexOf($_,[StringComparison]::OrdinalIgnoreCase) -ge 0}).Count -gt 0 } | Select-Object ProcessId,ParentProcessId,Name)
$taskPorts=@($taskInventory.ports|ForEach-Object {[int]$_})
$taskListeners=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object {$_.LocalPort -in $taskPorts} | Select-Object LocalAddress,LocalPort,OwningProcess)
$taskPidFiles=@($taskInventory.laboratories|Where-Object {$_.dataDirectory -and (Test-Path -LiteralPath (Join-Path $_.dataDirectory 'postmaster.pid'))}|ForEach-Object {$_.directory})
$taskResult=[ordered]@{checkedAt=[DateTime]::UtcNow.ToString('o');scope='Only directories and ports recorded by phase 2E.4';processes=$taskProcesses;listeners=$taskListeners;pidFiles=$taskPidFiles;closed=($taskProcesses.Count -eq 0 -and $taskListeners.Count -eq 0 -and $taskPidFiles.Count -eq 0)}
$taskResult|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'closure.json') -Encoding utf8
$taskResult|ConvertTo-Json -Depth 8
if(-not $taskResult.closed){throw 'PHASE_PROCESSES_REMAIN'}
