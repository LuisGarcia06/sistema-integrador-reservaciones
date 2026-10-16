param([switch]$VentanaConfirmada)
$ErrorActionPreference='Stop'
if(-not $VentanaConfirmada){throw 'Se requiere confirmar la ventana sin clientes ni escritores.'}
$taskRoot=Split-Path -Parent $PSScriptRoot
$taskRun=[Guid]::NewGuid().ToString('N').Substring(0,12)
$taskLab=Join-Path $taskRoot ('.access-scope-lab/prod-access-02b/run-'+$taskRun)
if(Test-Path -LiteralPath $taskLab){throw 'NEW_LAB_REQUIRED'}
New-Item -ItemType Directory -Path $taskLab | Out-Null
$taskRng=[Security.Cryptography.RandomNumberGenerator]::Create()
try{$taskBytes=New-Object byte[] 32;$taskRng.GetBytes($taskBytes);$taskPlain=[Convert]::ToBase64String($taskBytes)}finally{$taskRng.Dispose()}
$taskCredential=New-Object Management.Automation.PSCredential('prod_access_02b_lab',(ConvertTo-SecureString $taskPlain -AsPlainText -Force))
$taskCredential | Export-Clixml -LiteralPath (Join-Path $taskLab 'lab.credentials.clixml') -NoClobber
$taskPayload=@{run=$taskRun;lab=$taskLab;username=$taskCredential.UserName;password=$taskPlain;maintenance_confirmed=$true}
[Array]::Clear($taskBytes,0,$taskBytes.Length);$taskPlain=$null;$taskCredential=$null
$taskInfo=New-Object Diagnostics.ProcessStartInfo
$taskInfo.FileName=(Get-Command node.exe).Source
$taskInfo.Arguments='"'+(Join-Path $PSScriptRoot 'prepararProdAccess02b.cjs')+'"'
$taskInfo.WorkingDirectory=$taskRoot;$taskInfo.UseShellExecute=$false;$taskInfo.RedirectStandardInput=$true
foreach($taskKey in @($taskInfo.EnvironmentVariables.Keys)){if($taskKey -match '^(DB_|PG|JWT_|APP_|GYG_|GOOGLE_|GETYOURGUIDE_|FAREHARBOR_|WHATSAPP_|NODE_OPTIONS$|ELECTRON_RUN_AS_NODE$)'){$taskInfo.EnvironmentVariables.Remove($taskKey)}}
$taskProcess=[Diagnostics.Process]::Start($taskInfo)
$taskWriter=New-Object IO.StreamWriter($taskProcess.StandardInput.BaseStream,(New-Object Text.UTF8Encoding($false)))
try{$taskWriter.WriteLine(($taskPayload|ConvertTo-Json -Compress))}finally{$taskWriter.Dispose()}
$taskPayload=$null;$taskProcess.WaitForExit();$taskExit=$taskProcess.ExitCode;$taskProcess.Dispose()
exit $taskExit
