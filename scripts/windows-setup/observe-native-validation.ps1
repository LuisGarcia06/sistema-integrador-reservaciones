# Read-only observer for the guest VM. Does not start, stop, kill, configure or remove anything.
param([Parameter(Mandatory=$true)][string]$PlanFile)
$ErrorActionPreference = 'Stop'
$plan = Get-Content -LiteralPath $PlanFile -Raw | ConvertFrom-Json
if ($plan.request.protocol -ne 'ctsk-optionc-validation-v1' -or $plan.request.scope -ne 'synthetic-acceptance-only' -or $plan.request.productionAuthorized -ne $false) { throw 'PLAN_SCOPE' }
$trialId = [guid]::ParseExact($plan.request.installationId, 'D')
if ($trialId -eq [guid]::Empty -or $trialId.ToString('D') -ne $plan.request.installationId) { throw 'PLAN_UUID' }
$serviceName = 'CTSK026-' + $trialId.ToString('D')
$instance = 'C:\ProgramData\CommunityTours\Acceptance026\' + $trialId.ToString('D')
$image = $instance + '\control\SetupPostgres.exe'
if ($plan.serviceName -ne $serviceName -or $plan.instanceDirectory -ne $instance) { throw 'PLAN_BINDING' }
$service = Get-CimInstance Win32_Service -Filter "Name='$serviceName'"
$processes = @(Get-CimInstance Win32_Process -Filter "Name='SetupPostgres.exe'" | ForEach-Object {
    $owner = Invoke-CimMethod -InputObject $_ -MethodName GetOwnerSid
    if ($owner.ReturnValue -ne 0) { throw 'PROCESS_OWNER_QUERY_INCOMPLETE' }
    if ($_.ExecutablePath -eq $image -or ($service -and $owner.Sid -eq ([System.Security.Principal.NTAccount]::new('NT SERVICE\' + $serviceName)).Translate([System.Security.Principal.SecurityIdentifier]).Value)) {
        [pscustomobject]@{ pid=$_.ProcessId; created=$_.CreationDate; image=$_.ExecutablePath; sid=$owner.Sid }
    }
})
$dataItems = @(Get-ChildItem -LiteralPath ($instance + '\data') -Force)
[pscustomobject]@{
    scope='synthetic-acceptance-only'; productionAuthorized=$false; observedAt=(Get-Date).ToUniversalTime().ToString('o'); installationId=$trialId.ToString('D')
    serviceState=$service.State; startMode=$service.StartMode; servicePid=$service.ProcessId; serviceAccount=$service.StartName; serviceImage=$service.PathName
    ownedProcesses=$processes; dataDirectoryEmpty=($dataItems.Count -eq 0)
    receiptPresent=(Test-Path -LiteralPath ($instance + '\work\bootstrap-result.json')); deathReadyPresent=(Test-Path -LiteralPath ($instance + '\work\death-ready.json'))
    observationOnly=$true; nativeValidationCertified=$false
} | ConvertTo-Json -Depth 8
