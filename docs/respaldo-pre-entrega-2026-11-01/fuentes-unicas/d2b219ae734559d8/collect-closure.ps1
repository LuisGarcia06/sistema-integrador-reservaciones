$ErrorActionPreference = 'Stop'
$evidenceDirectory = $PSScriptRoot
$labs = Get-Content -LiteralPath (Join-Path $evidenceDirectory 'labs.json') -Raw | ConvertFrom-Json
$ports = @($labs | ForEach-Object { $_.pgPort; $_.httpPort; $_.uiPort } | Where-Object { $_ } | Sort-Object -Unique)
$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ports -contains $_.LocalPort } | Select-Object LocalAddress,LocalPort,OwningProcess)
$ownProcesses = @(Get-CimInstance Win32_Process | Where-Object {
    $process = $_
    $process.Name -in @('node.exe','postgres.exe','electron.exe') -and
    @($labs | Where-Object { $process.CommandLine -and $process.CommandLine.Contains($_.directory) }).Count -gt 0
} | Select-Object ProcessId,Name,CommandLine)
$workspacePath = Split-Path (Split-Path $evidenceDirectory -Parent) -Parent
$electronProcesses = @(Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'electron.exe' -and $_.ExecutablePath -and $_.ExecutablePath.StartsWith($workspacePath + '\', [System.StringComparison]::OrdinalIgnoreCase)
} | Select-Object ProcessId,Name,ExecutablePath)
$pidFiles = @($labs | Where-Object { Test-Path -LiteralPath (Join-Path $_.directory 'data\postmaster.pid') })
$result = [ordered]@{
    checkedAt = (Get-Date).ToString('o')
    directories = $labs.Count
    clusters = @($labs | Where-Object { $_.provisioned }).Count
    labsStopped = $pidFiles.Count -eq 0
    ports = $ports
    listeners = $listeners
    processes = $ownProcesses
    electronProcesses = $electronProcesses
}
$result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $evidenceDirectory 'closure.json') -Encoding utf8
if ($pidFiles.Count -or $listeners.Count -or $ownProcesses.Count -or $electronProcesses.Count) {
    throw 'LAB_CLOSURE_NOT_COMPLETE'
}
[pscustomobject]@{ closed = $true; clusters = $result.clusters; ports = $ports.Count; remainingProcesses = 0 } | ConvertTo-Json -Compress
