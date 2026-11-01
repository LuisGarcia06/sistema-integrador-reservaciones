param([Parameter(Mandatory=$true)][ValidateSet('server','client')][string]$Side)
$ErrorActionPreference = 'Stop'
# Auditoría independiente antes de ejecutar el runtime. No cambia ACL ni certificados.
$base = [IO.Path]::GetFullPath($PSScriptRoot)
$inventory = Get-Content -LiteralPath (Join-Path $base 'distribution-inventory.json') -Raw | ConvertFrom-Json
if ($inventory.protocol -ne 'ctsk-windows-candidate-2e7-v1' -or $inventory.side -ne $Side -or $inventory.productionAuthorized -ne $false -or $inventory.scope -ne 'synthetic-acceptance-only') { throw 'PAYLOAD_MANIFEST' }
$expected = @{}
foreach ($item in $inventory.files) {
    if ($item.file -match '(^/|\\|(^|/)\.\.(/|$)|:)' -or $expected.ContainsKey($item.file)) { throw 'PAYLOAD_PATH' }
    $expected[$item.file] = $item
}
if (((Get-Item -LiteralPath $base -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'PAYLOAD_REPARSE_POINT' }
$files = New-Object System.Collections.Generic.List[object]
function Read-Tree([string]$directory) {
    foreach ($entry in Get-ChildItem -LiteralPath $directory -Force) {
        if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'PAYLOAD_REPARSE_POINT' }
        if ($entry.PSIsContainer) { Read-Tree $entry.FullName } else { $files.Add($entry) }
    }
}
Read-Tree $base
$count = 0
foreach ($file in $files) {
    $relative = $file.FullName.Substring($base.Length+1).Replace('\','/')
    if ($relative -eq 'distribution-inventory.json') { continue }
    if (-not $expected.ContainsKey($relative)) { throw 'PAYLOAD_EXTRA_FILE' }
    $item = $expected[$relative]
    if ($file.Length -ne $item.bytes -or (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.sha256) { throw 'PAYLOAD_HASH' }
    $count++
}
if ($count -ne $expected.Count) { throw 'PAYLOAD_MISSING_FILE' }
Write-Output 'PAYLOAD_VERIFIED_UNSIGNED_CANDIDATE'
