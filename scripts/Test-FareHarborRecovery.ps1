# Pruebas aisladas: no inicia tuneles, no abre puertos y no conecta PostgreSQL.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'FareHarborProcessRecovery.ps1')
Initialize-FareHarborArgv
$checks=[Collections.Generic.List[string]]::new()
function Assert-Check([bool]$Condition,[string]$Name){if(-not $Condition){throw ('TEST_FAILED: '+$Name)};$checks.Add($Name)}
$settings=[pscustomobject]@{ngrokConfigPath='C:\private\ngrok.yml';ngrokDomain='example.ngrok-free.dev';tls=[pscustomobject]@{caCertFile='C:\private\cert.pem'}}
$arguments='"C:\Program Files\ngrok.exe" http https://127.0.0.1:3443 --config C:\private\ngrok.yml --upstream-tls-verify --upstream-tls-verify-cas C:\private\cert.pem --inspect=false --log=false --url https://example.ngrok-free.dev'
function New-Agent([string]$CommandLine=$arguments){[pscustomobject]@{Name='ngrok.exe';SessionId=[Diagnostics.Process]::GetCurrentProcess().SessionId;ExecutablePath='C:\Program Files\ngrok.exe';CommandLine=$CommandLine;CreationDate=[datetime]::UtcNow}}
function Test-Agent($Agent,[bool]$ParentAbsent=$true,[bool]$PortFree=$true,[string]$Owner='S-1-5-21-1'){
 Test-FareHarborOrphanIdentity -Agent $Agent -Config $settings -OwnerSid $Owner -ExpectedSid 'S-1-5-21-1' -ParentAbsent $ParentAbsent -PortFree $PortFree
}
Assert-Check (Test-Agent (New-Agent)) 'huérfano exclusivo reconocido'
Assert-Check (-not (Test-Agent (New-Agent) -ParentAbsent $false)) 'padre vivo protegido'
Assert-Check (-not (Test-Agent (New-Agent) -PortFree $false)) 'receptor activo protegido'
Assert-Check (-not (Test-Agent (New-Agent) -Owner 'S-1-5-21-2')) 'otro propietario protegido'
Assert-Check (-not (Test-Agent (New-Agent ($arguments+' --label other')))) 'argumentos adicionales rechazados'
foreach($replacement in @(@('3443','3000'),@('example.ngrok-free.dev','other.ngrok-free.dev'),@('C:\private\ngrok.yml','C:\other\ngrok.yml'))){
 Assert-Check (-not (Test-Agent (New-Agent ($arguments.Replace($replacement[0],$replacement[1]))))) ('destino ajeno rechazado: '+$replacement[0])
}
$agent=New-Agent; $agent.CommandLine=$null
Assert-Check (-not (Test-Agent $agent)) 'sin evidencia de argumentos no hay cierre'
$agent=New-Agent; $agent.SessionId++
Assert-Check (-not (Test-Agent $agent)) 'otra sesión protegida'

# Dobles de comandos solo en este proceso de prueba: nunca pueden cerrar un PID real.
$script:stopped=$false;$script:stopCount=0;$script:reuse=$false;$script:foreign=$false
$script:testSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$script:testAgent=New-Agent
$script:testAgent|Add-Member NoteProperty ProcessId 42
$script:testAgent|Add-Member NoteProperty ParentProcessId 7
$settings|Add-Member NoteProperty nodeExecutable 'Invoke-FareHarborTestValidator'
$settings|Add-Member NoteProperty dependencyRoot $PSScriptRoot
function Invoke-FareHarborTestValidator {process{$global:LASTEXITCODE=0}}
function Get-CimInstance {
 param($ClassName,$Filter)
 if($script:stopped){return}
 if($Filter -eq "Name='ngrok.exe'" -or $Filter -eq 'ProcessId=42'){
  $copy=$script:testAgent|Select-Object *
  if($script:reuse -and $Filter -eq 'ProcessId=42'){$copy.CreationDate=$copy.CreationDate.AddSeconds(1)}
  if($script:foreign){$copy.CommandLine+=' --other-service'}
  return $copy
 }
}
function Invoke-CimMethod {param($InputObject,$MethodName) return [pscustomobject]@{ReturnValue=0;Sid=$script:testSid}}
function Get-NetTCPConnection {param($LocalPort,$State,$ErrorAction)}
function Stop-Process {param($Id,$ErrorAction) if($Id -ne 42){throw 'REAL_PROCESS_FORBIDDEN'};$script:stopped=$true;$script:stopCount++}
function Wait-Process {param($Id,$Timeout,$ErrorAction)}
$removed=Remove-FareHarborVerifiedOrphan -Config $settings -PrivateDirectory $PSScriptRoot
Assert-Check ($removed -eq 42 -and $script:stopCount -eq 1) 'recuperacion cierra solo el PID verificado'
$script:stopped=$false;$script:stopCount=0;$script:reuse=$true
$rejected=$false
try{Remove-FareHarborVerifiedOrphan -Config $settings -PrivateDirectory $PSScriptRoot|Out-Null}catch{$rejected=$_.Exception.Message -eq 'FH_ORPHAN_STATE_CHANGED'}
Assert-Check ($rejected -and $script:stopCount -eq 0) 'PID reutilizado antes del cierre queda protegido'
$script:reuse=$false;$script:foreign=$true;$rejected=$false
try{Remove-FareHarborVerifiedOrphan -Config $settings -PrivateDirectory $PSScriptRoot|Out-Null}catch{$rejected=$_.Exception.Message -eq 'EXISTING_NGROK_PROCESS'}
Assert-Check ($rejected -and $script:stopCount -eq 0) 'ngrok ajeno nunca se cierra'

# Usar exactamente el tipo C# del lanzador que se va a desplegar.
$launcher=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'Start-FareHarborContinuous.ps1') -Raw
$code=[regex]::Match($launcher,"(?s)Add-Type -TypeDefinition @'\r?\n(.*?)\r?\n'@").Groups[1].Value
if(-not $code){throw 'JOB_SOURCE_MISSING'}
Add-Type -TypeDefinition $code
$job=[FareHarborContinuousJob]::new()
$child=$null;$descendant=$null
try {
 $info=[Diagnostics.ProcessStartInfo]::new()
 $info.FileName=(Get-Command node.exe).Source
 $program="const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});process.stdout.write(String(c.pid)+'\n');setInterval(()=>{},1000);"
 # No hay datos externos en esta cadena constante de prueba.
 $info.Arguments='-e "'+$program+'"'
 $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true
 $child=[Diagnostics.Process]::new();$child.StartInfo=$info;[void]$child.Start()
 $job.Assign($child.Handle)
 $lineTask=$child.StandardOutput.ReadLineAsync()
 if(-not $lineTask.Wait(5000)){throw 'TEST_CHILD_TIMEOUT'}
 $descendant=Get-Process -Id ([int]$lineTask.Result)
 Assert-Check ($job.Contains($child.Handle)) 'receptor dentro del job propio'
 if(-not $job.Contains($descendant.Handle)){$job.Assign($descendant.Handle)}
 Assert-Check ($job.Contains($descendant.Handle)) 'descendiente dentro del mismo job'
 $job.Dispose()
 Assert-Check ($child.WaitForExit(5000)) 'cierre del job termina receptor'
 Assert-Check ($descendant.WaitForExit(5000)) 'cierre del job termina descendiente'
}finally{
 $job.Dispose()
 foreach($process in @($child,$descendant)){if($null -ne $process){if(-not $process.HasExited){$process.Kill()};$process.Dispose()}}
}
[pscustomobject]@{result='FH_RECOVERY_TESTS_PASSED';checks=$checks;count=$checks.Count;productionTouched=$false}|ConvertTo-Json -Depth 4
