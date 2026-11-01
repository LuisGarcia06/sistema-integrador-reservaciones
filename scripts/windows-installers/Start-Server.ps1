param(
    [Parameter(Mandatory=$true)][string]$ServerConfig,
    [Parameter(Mandatory=$true)][string]$Authority,
    [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
$action = if ($CheckOnly) { 'check' } else { 'run' }
& (Join-Path $PSScriptRoot 'runtime/node.exe') (Join-Path $PSScriptRoot 'tools/server-control.cjs') $action $ServerConfig $Authority
exit $LASTEXITCODE
