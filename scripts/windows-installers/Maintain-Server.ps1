param([Parameter(Mandatory=$true)][string]$Request, [switch]$IsolatedLab)
$ErrorActionPreference = 'Stop'
if (-not $IsolatedLab -or [Environment]::OSVersion.Version.Build -lt 22000) { throw 'WINDOWS11_ISOLATED_LAB_REQUIRED' }
& (Join-Path $PSScriptRoot 'runtime/node.exe') (Join-Path $PSScriptRoot 'tools/maintenance.cjs') '--isolated-lab' $Request
exit $LASTEXITCODE
