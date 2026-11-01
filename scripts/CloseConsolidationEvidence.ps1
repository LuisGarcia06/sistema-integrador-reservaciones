[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskEvidence=Join-Path $taskRoot 'docs/local-fase-2e1'
$taskLabs=Get-Content -LiteralPath (Join-Path $taskEvidence 'labs.json') -Raw | ConvertFrom-Json
$taskProcesses=@(Get-CimInstance Win32_Process)
$taskListeners=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue)
$taskResults=@(foreach($taskLab in $taskLabs){
 $taskPath=[IO.Path]::GetFullPath($taskLab.directory)
 if($taskPath -notmatch '^C:\\Users\\luisg\\AppData\\Local\\ctsk-standalone-[a-f0-9]{12}$'){throw 'CLOSURE_DIRECTORY_NOT_OWN_LAB'}
 $taskMatches=@($taskProcesses | Where-Object {$_.CommandLine -and $_.CommandLine.Contains($taskPath)} | ForEach-Object {@{pid=$_.ProcessId;name=$_.Name}})
 $taskPorts=@($taskLab.ports)+@($taskLab.pgPort,$taskLab.httpPort) | Where-Object {$_}
 $taskOpen=@($taskListeners | Where-Object {$_.LocalPort -in $taskPorts} | ForEach-Object {@{port=$_.LocalPort;address=$_.LocalAddress;pid=$_.OwningProcess}})
 [PSCustomObject]@{directory=$taskPath;cluster=$taskLab.cluster;database=$taskLab.database;postgresStopped=!(Test-Path -LiteralPath (Join-Path $taskPath 'data/postmaster.pid'));processes=$taskMatches;listeners=$taskOpen}
})
$taskPassed=@($taskResults | Where-Object {!$_.postgresStopped -or $_.processes.Count -or $_.listeners.Count}).Count -eq 0
@{completed=$taskPassed;checkedAt=[DateTime]::UtcNow.ToString('o');labs=$taskResults} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $taskEvidence 'closure.json') -Encoding utf8
if(!$taskPassed){throw 'OWN_LAB_CLOSURE_NOT_COMPLETE'}
Write-Output ('CLOSURE_OK '+$taskResults.Count)
