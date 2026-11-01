param([Parameter(Mandatory=$true)][string]$Job)
$ErrorActionPreference='Stop'
$verified=$false
$j=$null
try {
 if ([Environment]::OSVersion.Version.Build -lt 22000) { throw 'VM_REQUIRED' }
 $j=Get-Content -LiteralPath $Job -Raw | ConvertFrom-Json
 & (Join-Path $PSScriptRoot '../../node.exe') (Join-Path $PSScriptRoot 'worker.cjs') 'console-check' $Job
 if ($LASTEXITCODE -ne 0) { throw 'CHECK_REJECTED' }
 $verified=$true
 if ($j.action -eq 'bootstrap') {
  $host.UI.RawUI.WindowTitle='CTSK 026 - Primer Administrador de ensayo'
  & (Join-Path $j.server 'Maintain-Server.ps1') -IsolatedLab -Request $j.request
 } elseif ($j.action -eq 'server') {
  $host.UI.RawUI.WindowTitle='CTSK 026 - Servidor experimental - Ctrl+C para detener'
  & (Join-Path $j.server 'Start-Server.ps1') -ServerConfig $j.plan -Authority $j.authority
 } else { throw 'ACTION_REJECTED' }
 $result=$LASTEXITCODE
 if ($null -eq $result) { $result=1 }
} catch { $result=1; Write-Host 'La etapa no termino correctamente. Conserva el estado y revisa el asistente.' }
if ($verified -and $null -ne $j) {
 $receipt=@{jobId=$j.jobId;action=$j.action;exitCode=[int]$result}|ConvertTo-Json -Compress
 $stream=[IO.File]::Open($j.receipt,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try { $bytes=[Text.Encoding]::UTF8.GetBytes($receipt);$stream.Write($bytes,0,$bytes.Length) } finally { $stream.Dispose() }
}
Write-Host 'Operacion finalizada. Vuelve al asistente para consultar el resultado.'
[void](Read-Host 'Pulsa Enter para cerrar esta consola')
exit $result
