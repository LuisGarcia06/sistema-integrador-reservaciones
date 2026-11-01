# Intervención Windows autorizada: recuperar la tarea FH existente e instalar GYG.
# No modifica configuración, webhook, KEY, dominio, puerto ni fuentes de FareHarbor.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$base=Join-Path $env:LOCALAPPDATA 'CommunityTours\integrations'
$report=Join-Path $base 'controls018-tasks-result.json'
$checks=@()
try {
    $identity=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
    if(-not $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'WINDOWS_ADMIN_REQUIRED'}
    $fhDir=Join-Path $base 'fareharbor';$configFile=Join-Path $fhDir 'continuous.json'
    $config=Get-Content -LiteralPath $configFile -Raw|ConvertFrom-Json
    $hash=(Get-FileHash -LiteralPath $configFile -Algorithm SHA256).Hash
    if($config.autoApplyUserId -ne $null -or $config.ngrokDomain -ne 'fleshed-patchy-cassette.ngrok-free.dev' -or
       $config.maxRuntimeMinutes -ne $null -or $config.maxNewEvents -ne $null -or $config.bookingUuid -ne $null -or $config.trialMarker -ne $null){throw 'FH_CONFIGURATION_MISMATCH'}
    $xmlBefore=Export-ScheduledTask -TaskName 'CommunityTours-FareHarborContinuous'
    $listeners=@(Get-NetTCPConnection -LocalPort 3443 -State Listen -ErrorAction SilentlyContinue)
    $task=Get-ScheduledTask -TaskName 'CommunityTours-FareHarborContinuous'
    $tunnels=@(Get-CimInstance Win32_Process -Filter "Name='ngrok.exe'")
    if($listeners.Count -eq 0 -and [string]$task.State -ne 'Running') {
        if($tunnels.Count -gt 1){throw 'FH_MULTIPLE_NGROK_REQUIRES_REVIEW'}
        if($tunnels.Count -eq 1) {
            $orphan=$tunnels[0]
            $parent=Get-CimInstance Win32_Process -Filter ('ProcessId='+$orphan.ParentProcessId) -ErrorAction SilentlyContinue
            # Solo el remanente observado de la ejecución anterior; nunca matar otro túnel.
            if($orphan.ProcessId -ne 9992 -or $null -ne $parent -or
               -not $orphan.CommandLine.Contains($config.ngrokConfigPath) -or
               -not $orphan.CommandLine.Contains($config.ngrokDomain) -or
               $orphan.CreationDate.ToUniversalTime().ToString('yyyyMMddTHHmmss') -ne '20261021T015400'){throw 'FH_ORPHAN_IDENTITY_MISMATCH'}
            Stop-Process -Id $orphan.ProcessId -ErrorAction Stop
            $checks+='Se retiró únicamente ngrok huérfano verificado de la tarea anterior'
        }
        if(@(Get-NetTCPConnection -LocalPort 3443 -State Listen -ErrorAction SilentlyContinue).Count -or
           @(Get-Process -Name ngrok -ErrorAction SilentlyContinue).Count){throw 'FH_CONCURRENT_START_BLOCKED'}
        Start-ScheduledTask -TaskName 'CommunityTours-FareHarborContinuous'
        $checks+='Inicio solicitado a la misma tarea FareHarbor'
    } else { $checks+='FareHarbor ya activo o iniciándose; no se inició otra instancia' }
    if((Get-FileHash -LiteralPath $configFile -Algorithm SHA256).Hash -ne $hash -or
       (Export-ScheduledTask -TaskName 'CommunityTours-FareHarborContinuous') -ne $xmlBefore){throw 'FH_CONFIGURATION_CHANGED'}
    $gygTask=Get-ScheduledTask -TaskName 'CommunityTours-GetYourGuideContinuous' -ErrorAction SilentlyContinue
    if($null -eq $gygTask) {
        & (Join-Path $base 'getyourguide\runtime\scripts\Start-GetYourGuideContinuous.ps1') -Install
        if($LASTEXITCODE -ne 0){throw 'GYG_INSTALL_FAILED'}
        $checks+='Tarea Gmail independiente instalada e iniciada'
    } else { $checks+='Tarea Gmail ya existente; no se sustituyó ni duplicó' }
    [pscustomobject]@{status='TASKS_REQUESTED';at=[DateTime]::UtcNow.ToString('o');checks=$checks;fareharborConfigUnchanged=$true;fareharborTaskDefinitionUnchanged=$true;automaticApplication=$false;fullCaptureCloud='NO CONFIRMADO'}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $report -Encoding UTF8
} catch {
    [pscustomobject]@{status='FAILED';at=[DateTime]::UtcNow.ToString('o');code=$_.Exception.Message;checks=$checks}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath $report -Encoding UTF8
    exit 1
}
