# Collects only the selected attempt and matching events. No service or security changes.
param(
    [Parameter(Mandatory=$true)][string]$InstallationId,
    [Parameter(Mandatory=$true)][string]$Destination,
    [string[]]$WindowsLocalStarts = @('2026-11-01T15:54:00','2026-11-01T09:54:00'),
    [ValidateRange(1,20)][int]$WindowMinutes = 10
)
$ErrorActionPreference = 'Stop'
$trialId = [guid]::ParseExact($InstallationId, 'D')
if ($trialId -eq [guid]::Empty -or $trialId.ToString('D') -ne $InstallationId) { throw 'UUID_REQUIRED' }
$serviceName = 'CTSK026-' + $trialId.ToString('D')
$instance = 'C:\ProgramData\CommunityTours\Acceptance026\' + $trialId.ToString('D')
if (Test-Path -LiteralPath $Destination) { throw 'DESTINATION_MUST_BE_NEW' }
$exportRoot = [IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Path $exportRoot | Out-Null
$queries = [Collections.Generic.List[object]]::new()
$matches = @{}
foreach ($startText in $WindowsLocalStarts) {
    $startLocal = [datetime]::ParseExact($startText, 'yyyy-MM-ddTHH:mm:ss', [Globalization.CultureInfo]::InvariantCulture)
    foreach ($log in @('System','Application')) {
        $filter = @{ LogName=$log; StartTime=$startLocal; EndTime=$startLocal.AddMinutes($WindowMinutes) }
        if ($log -eq 'System') { $filter.ProviderName='Service Control Manager' }
        try {
            $events = @(Get-WinEvent -FilterHashtable $filter)
            $queries.Add([pscustomobject]@{ log=$log; startLocal=$startText; minutes=$WindowMinutes; querySucceeded=$true })
        } catch {
            if ($_.FullyQualifiedErrorId -match 'NoMatchingEventsFound') { $events=@(); $queries.Add([pscustomobject]@{ log=$log; startLocal=$startText; minutes=$WindowMinutes; querySucceeded=$true; noEvents=$true }) }
            else { $events=@(); $queries.Add([pscustomobject]@{ log=$log; startLocal=$startText; querySucceeded=$false; errorType=$_.Exception.GetType().FullName; hresult=$_.Exception.HResult }) }
        }
        foreach ($event in $events) {
            $xml = $event.ToXml()
            $match = if ($log -eq 'System') { $xml.Contains($InstallationId) } else { $event.ProviderName -in @('.NET Runtime','Application Error','Windows Error Reporting') -and ($xml.Contains('SetupPostgres.exe') -or $xml.Contains($InstallationId)) }
            if ($match) {
                $key = $log + '-' + $event.RecordId
                $matches[$key] = [pscustomobject]@{ log=$log; provider=$event.ProviderName; id=$event.Id; recordId=$event.RecordId; displayedLocal=$event.TimeCreated.ToString('o'); derivedUtc=$event.TimeCreated.ToUniversalTime().ToString('o'); message=$event.Message; xml=$xml }
            }
        }
    }
}
$service = Get-CimInstance Win32_Service -Filter "Name='$serviceName'"
$paths = @($instance, ($instance+'\control'), ($instance+'\work'), ($instance+'\data'), ($instance+'\control\SetupPostgres.exe'))
$acls = foreach ($itemPath in $paths) {
    if (Test-Path -LiteralPath $itemPath) {
        $acl = Get-Acl -LiteralPath $itemPath
        [pscustomobject]@{ path=$itemPath; owner=$acl.Owner; sddl=$acl.Sddl; attributes=(Get-Item -LiteralPath $itemPath -Force).Attributes.ToString() }
    }
}
$files = @('control\intent.json','control\validation-case.json','control\scm-before-start.json','control\scm-start-call.json','work\bootstrap-result.json','work\service-startup-local-bound.json','work\service-startup-machine-bound.json','work\service-startup-controller-bound.json')
foreach ($relative in $files) {
    $source = Join-Path $instance $relative
    if (Test-Path -LiteralPath $source -PathType Leaf) { Copy-Item -LiteralPath $source -Destination (Join-Path $exportRoot ($relative.Replace('\','-'))) }
}
$plans = @(Get-ChildItem -LiteralPath $env:LOCALAPPDATA -Filter 'ctsk-native-validation-*' -Directory | ForEach-Object {
    $planFile = Join-Path $_.FullName 'trial-plan.json'
    if (Test-Path -LiteralPath $planFile) {
        $plan = Get-Content -LiteralPath $planFile -Raw | ConvertFrom-Json
        if ($plan.request.installationId -eq $InstallationId) {
            Copy-Item -LiteralPath $planFile -Destination (Join-Path $exportRoot 'trial-plan.json')
            $resultFile = Join-Path $_.FullName 'result.json'
            if (Test-Path -LiteralPath $resultFile) { Copy-Item -LiteralPath $resultFile -Destination (Join-Path $exportRoot 'result.json') }
            [pscustomobject]@{ operationId=$plan.request.operationId; directory=$_.FullName }
        }
    }
})
$hostPath = $instance + '\control\SetupPostgres.exe'
$hostHash = if (Test-Path -LiteralPath $hostPath -PathType Leaf) { (Get-FileHash -LiteralPath $hostPath -Algorithm SHA256).Hash.ToLowerInvariant() } else { $null }
$resolvedSid = $null
$sidQueryError = $null
try { $resolvedSid = ([Security.Principal.NTAccount]::new('NT SERVICE\'+$serviceName)).Translate([Security.Principal.SecurityIdentifier]).Value } catch { $sidQueryError=$_.Exception.GetType().FullName }
$record = [pscustomobject]@{
    scope='synthetic-acceptance-only'; productionAuthorized=$false; observationOnly=$true; nativeValidationCertified=$false
    installationId=$InstallationId; capturedAtUtc=[datetime]::UtcNow.ToString('o'); guestTimeZone=[TimeZoneInfo]::Local.Id
    localWindows=$WindowsLocalStarts; queries=$queries.ToArray(); events=@($matches.Values); localPlans=$plans
    service=($service | Select-Object Name,DisplayName,PathName,StartName,State,StartMode,ProcessId,ExitCode,ServiceSpecificExitCode)
    resolvedAccountSid=$resolvedSid; sidQueryError=$sidQueryError
    hostSha256=$hostHash; acls=@($acls)
}
$record | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $exportRoot 'evidence.json') -Encoding utf8
Get-ChildItem -LiteralPath $exportRoot -File | Get-FileHash -Algorithm SHA256 | Select-Object Path,Hash | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $exportRoot 'SHA256.json') -Encoding utf8
