# Actualiza solo la supervision FareHarbor. Una parada breve, respaldo y rollback.
param([switch]$StartImmediately)
$ErrorActionPreference='Stop'
$privateDir=Join-Path $env:LOCALAPPDATA 'CommunityTours\integrations\fareharbor'
$configFile=Join-Path $privateDir 'continuous.json'
$reportFile=Join-Path $privateDir 'recovery-deployment-20261021.json'
$taskName='CommunityTours-FareHarborContinuous'
$report=[ordered]@{startedAt=[datetime]::UtcNow.ToString('o');phase='PREPARING';result='PENDING'}
$stopped=$false;$backup=$null
function Save-Report {
 [IO.File]::WriteAllText($reportFile,($report|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
}
function Private-Fingerprints($Config){
 $result=[ordered]@{}
 foreach($name in @('postgresConfigPath','ngrokConfigPath','webhookSecretFile')){$result[$name]=(Get-FileHash -LiteralPath $Config.$name -Algorithm SHA256).Hash}
 foreach($name in @('keyFile','certFile','caCertFile')){$result[$name]=(Get-FileHash -LiteralPath $Config.tls.$name -Algorithm SHA256).Hash}
 return ($result|ConvertTo-Json -Compress)
}
function Wait-Stopped {
 for($i=0;$i -lt 40;$i++){
  if((Get-ScheduledTask -TaskName $taskName).State -ne 'Running' -and -not @(Get-NetTCPConnection -LocalPort 3443 -State Listen -ErrorAction SilentlyContinue).Count){return}
  Start-Sleep -Milliseconds 250
 }
 throw 'FH_STOP_TIMEOUT'
}
try {
 $config=Get-Content -LiteralPath $configFile -Raw | ConvertFrom-Json
 $expectedRoot=Join-Path $privateDir 'runtime'
 if($config.runtimeRoot -cne $expectedRoot -or $null -ne $config.autoApplyUserId -or -not $config.enabled -or -not $config.executionAuthorized){throw 'FH_DEPLOY_CONFIG_INVALID'}
 $task=Get-ScheduledTask -TaskName $taskName
 if($task.State -ne 'Running' -or $task.Actions.Count -ne 1 -or $task.Actions[0].Arguments -cne ('-NoProfile -NonInteractive -WindowStyle Hidden -File "'+$expectedRoot+'\scripts\Start-FareHarborContinuous.ps1" -Run')){throw 'FH_TASK_ACTION_MISMATCH'}
 foreach($property in $config.sourceHashes.PSObject.Properties){
  $file=[IO.Path]::GetFullPath((Join-Path $expectedRoot $property.Name))
  if(-not $file.StartsWith($expectedRoot+'\',[StringComparison]::OrdinalIgnoreCase) -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -cne $property.Value){throw 'FH_SOURCE_CHANGED'}
 }
 $privateBefore=Private-Fingerprints $config
 $taskBefore=Export-ScheduledTask -TaskName $taskName
 $gygBefore=Export-ScheduledTask -TaskName 'CommunityTours-GetYourGuideContinuous'
 $backup=Join-Path $privateDir ('recovery-backups\'+[datetime]::UtcNow.ToString('yyyyMMddTHHmmssZ'))
 [void](New-Item -Path $backup -ItemType Directory)
 Copy-Item -LiteralPath $configFile -Destination (Join-Path $backup 'continuous.json')
 $files=@('Start-FareHarborContinuous.ps1','FareHarborProcessRecovery.ps1')
 foreach($name in $files){
  $source=Join-Path $PSScriptRoot $name
  $current=Join-Path $expectedRoot ('scripts\'+$name)
  if(Test-Path -LiteralPath $current){Copy-Item -LiteralPath $current -Destination (Join-Path $backup ($name+'.previous'))}
  Copy-Item -LiteralPath $source -Destination (Join-Path $backup ($name+'.next'))
  $tokens=$null;$errors=$null
  [void][Management.Automation.Language.Parser]::ParseFile((Join-Path $backup ($name+'.next')),[ref]$tokens,[ref]$errors)
  if($errors.Count){throw 'FH_DEPLOY_PARSE_FAILED'}
  $config.sourceHashes | Add-Member -MemberType NoteProperty -Name ('scripts/'+$name) -Value ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()) -Force
 }
 [IO.File]::WriteAllText((Join-Path $backup 'continuous.next.json'),($config|ConvertTo-Json -Depth 40),[Text.UTF8Encoding]::new($false))
 $report.backup=$backup
 # El proveedor CIM de este Windows devuelve segundos incorrectos. Consultar
 # el calendario nativo COM: coincide con StartBoundary del XML de la tarea.
 $scheduler=New-Object -ComObject Schedule.Service
 $scheduler.Connect()
 $next=$scheduler.GetFolder('\').GetTask($taskName).NextRunTime
 if($StartImmediately){$next=Get-Date}
 elseif($next -le (Get-Date).AddSeconds(20) -or $next -gt (Get-Date).AddMinutes(6)){throw 'FH_AUTOMATIC_TRIGGER_WINDOW_UNAVAILABLE'}
 $report.expectedAutomaticStart=$next.ToUniversalTime().ToString('o')
 $report.phase='WAITING_WHILE_RECEIVER_RUNNING';Save-Report
 # Mantener la recepcion hasta 10 segundos antes del siguiente disparador existente.
 while((Get-Date) -lt $next.AddSeconds(-10)){Start-Sleep -Milliseconds 500}
 $report.phase='DEPLOYING';Save-Report
 Stop-ScheduledTask -TaskName $taskName
 $stopped=$true;Wait-Stopped
 foreach($name in $files){Copy-Item -LiteralPath (Join-Path $backup ($name+'.next')) -Destination (Join-Path $expectedRoot ('scripts\'+$name))}
 Copy-Item -LiteralPath (Join-Path $backup 'continuous.next.json') -Destination $configFile
 $report.deployedAt=[datetime]::UtcNow.ToString('o')
 if($StartImmediately){Start-ScheduledTask -TaskName $taskName}
 $report.phase='WAITING_FOR_EXISTING_WINDOWS_TRIGGER';Save-Report
 $deadline=$next.AddSeconds(65)
 $ready=$false
 while((Get-Date) -lt $deadline){
  Start-Sleep -Milliseconds 500
  try {
   $status=Get-Content -LiteralPath (Join-Path $privateDir 'continuous-status.json') -Raw|ConvertFrom-Json
   $launcher=Get-Content -LiteralPath (Join-Path $privateDir 'launcher-status.json') -Raw|ConvertFrom-Json
   $listeners=@(Get-NetTCPConnection -LocalPort 3443 -State Listen -ErrorAction SilentlyContinue)
   $agents=@(Get-CimInstance Win32_Process -Filter "Name='ngrok.exe'")
   if($status.state -eq 'FH_CONTINUOUS_READY' -and [datetime]$status.updatedAt -gt [datetime]$report.deployedAt -and
      $launcher.code -eq 'FH_LAUNCHER_RUNNING' -and $launcher.ngrokPid -and
      $listeners.Count -eq 1 -and $agents.Count -eq 1 -and $agents[0].ProcessId -eq $launcher.ngrokPid -and
      $listeners[0].OwningProcess -eq $launcher.receiverPid -and $agents[0].ParentProcessId -eq $launcher.receiverPid){$ready=$true;break}
  }catch{}
 }
 if(-not $ready){throw 'FH_AUTOMATIC_RECOVERY_NOT_READY'}
 $report.automaticWindowsTriggerVerified=(-not $StartImmediately)
 $report.ready=$status;$report.launcher=$launcher
 $report.privateFilesUnchanged=((Private-Fingerprints $config) -ceq $privateBefore)
 $report.fareharborTaskDefinitionUnchanged=((Export-ScheduledTask -TaskName $taskName) -ceq $taskBefore)
 $report.getyourguideTaskDefinitionUnchanged=((Export-ScheduledTask -TaskName 'CommunityTours-GetYourGuideContinuous') -ceq $gygBefore)
 if(-not $report.privateFilesUnchanged -or -not $report.fareharborTaskDefinitionUnchanged -or -not $report.getyourguideTaskDefinitionUnchanged){throw 'FH_DEPLOY_INVARIANT_CHANGED'}
 $report.result=if($StartImmediately){'FH_RECOVERY_DEPLOYED'}else{'FH_AUTOMATIC_RECOVERY_VERIFIED'}
 $report.phase='COMPLETE'
}catch{
 $message=$_.Exception.Message
 $report.result=if($message -match '^FH_[A-Z_]+$'){$message}else{'FH_DEPLOYMENT_FAILED'}
 if($stopped -and $backup){
  try {
   if((Get-ScheduledTask -TaskName $taskName).State -eq 'Running'){Stop-ScheduledTask -TaskName $taskName}
   Wait-Stopped
   . (Join-Path $PSScriptRoot 'FareHarborProcessRecovery.ps1')
   Initialize-FareHarborArgv
   $current=Get-Content -LiteralPath $configFile -Raw|ConvertFrom-Json
   $report.rollbackOrphanPid=Remove-FareHarborVerifiedOrphan -Config $current -PrivateDirectory $privateDir -ExpectedSessionId 0
   Copy-Item -LiteralPath (Join-Path $backup 'Start-FareHarborContinuous.ps1.previous') -Destination (Join-Path $expectedRoot 'scripts\Start-FareHarborContinuous.ps1')
   Copy-Item -LiteralPath (Join-Path $backup 'continuous.json') -Destination $configFile
   Start-ScheduledTask -TaskName $taskName
   $report.rollback='PREVIOUS_RUNTIME_RESTARTED'
  }catch{$report.rollback='FH_ROLLBACK_REQUIRES_INSPECTION'}
 }
}finally{$report.finishedAt=[datetime]::UtcNow.ToString('o');Save-Report}
