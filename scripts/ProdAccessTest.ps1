param([ValidateSet('Electron','Probar','MostrarClavesPrueba')][string]$Modo='Electron')
$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$taskLab=Join-Path $taskRoot '.access-scope-lab/prod-access-02b'
$taskVault=Join-Path $taskLab 'synthetic-users.credentials.clixml'
$taskProcess=$null
try {
 if($Modo -eq 'MostrarClavesPrueba'){
  $taskCredentials=@(Import-Clixml -LiteralPath $taskVault)
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $taskForm=New-Object Windows.Forms.Form
  $taskForm.Text='Credenciales ficticias PROD-ACCESS-02B'
  $taskForm.ClientSize=New-Object Drawing.Size(720,240)
  $taskForm.StartPosition='CenterScreen'
  $taskBox=New-Object Windows.Forms.TextBox
  $taskBox.Multiline=$true;$taskBox.ReadOnly=$true;$taskBox.Dock='Fill'
  $taskBox.Text='Solo cuentas ficticias creadas en esta fase. No publicar estas claves.'+[Environment]::NewLine+[Environment]::NewLine
  foreach($taskCredential in $taskCredentials){$taskBox.AppendText($taskCredential.UserName+[Environment]::NewLine+$taskCredential.GetNetworkCredential().Password+[Environment]::NewLine+[Environment]::NewLine)}
  $taskForm.Controls.Add($taskBox);$taskForm.ShowDialog()|Out-Null;$taskBox.Clear();$taskForm.Dispose();return
 }
 $taskPayload=@{}
 if($Modo -eq 'Probar'){
  $taskExisting=@(Import-Clixml -LiteralPath (Join-Path $taskLab 'existing-users.credentials.clixml'))
  if($taskExisting.Count -ne 2){throw 'EXISTING_APP_CREDENTIALS_REQUIRED'}
  if(-not (Test-Path -LiteralPath $taskVault)){
   $taskSynthetic=@();$taskRng=[Security.Cryptography.RandomNumberGenerator]::Create()
   try{foreach($taskEmail in @('consulta.selected.prod02b@example.test','consulta.empty.prod02b@example.test')){$taskBytes=New-Object byte[] 32;$taskRng.GetBytes($taskBytes);$taskPlain=[Convert]::ToBase64String($taskBytes);$taskSynthetic+=New-Object Management.Automation.PSCredential($taskEmail,(ConvertTo-SecureString $taskPlain -AsPlainText -Force));[Array]::Clear($taskBytes,0,$taskBytes.Length)}}finally{$taskRng.Dispose();$taskPlain=$null}
   $taskSynthetic | Export-Clixml -LiteralPath $taskVault -NoClobber
  }
  $taskSynthetic=@(Import-Clixml -LiteralPath $taskVault)
  if($taskSynthetic.Count -ne 2){throw 'SYNTHETIC_APP_CREDENTIALS_REQUIRED'}
  $taskPayload.users=@()
  foreach($taskCredential in @($taskExisting)+@($taskSynthetic)){$taskPayload.users+=@{correo=$taskCredential.UserName;password=$taskCredential.GetNetworkCredential().Password}}
  $taskScript=Join-Path $PSScriptRoot 'probarProdAccess02b.cjs'
 }else{$taskScript=Join-Path $PSScriptRoot 'arrancarProdAccessTest.cjs'}
 $taskInfo=New-Object Diagnostics.ProcessStartInfo
 $taskInfo.FileName=(Get-Command node.exe).Source
 $taskInfo.Arguments='"'+$taskScript+'"'
 $taskInfo.WorkingDirectory=$taskRoot;$taskInfo.UseShellExecute=$false;$taskInfo.RedirectStandardInput=$true
 foreach($taskKey in @($taskInfo.EnvironmentVariables.Keys)){if($taskKey -match '^(DB_|PG|JWT_|APP_|GYG_|GOOGLE_|GETYOURGUIDE_|FAREHARBOR_|WHATSAPP_|NODE_OPTIONS$|ELECTRON_RUN_AS_NODE$)'){$taskInfo.EnvironmentVariables.Remove($taskKey)}}
 $taskProcess=[Diagnostics.Process]::Start($taskInfo)
 $taskWriter=New-Object IO.StreamWriter($taskProcess.StandardInput.BaseStream,(New-Object Text.UTF8Encoding($false)))
 try{$taskWriter.WriteLine(($taskPayload|ConvertTo-Json -Depth 6 -Compress))}finally{$taskWriter.Dispose()}
 $taskPayload=$null;$taskExisting=$null;$taskSynthetic=$null;$taskCredential=$null
 $taskProcess.WaitForExit();if($taskProcess.ExitCode -ne 0){throw 'PROD_TEST_PROCESS_FAILED_REVIEW_SANITIZED_REPORT'}
}catch{Write-Host ('PROD-ACCESS-02B: '+$_.Exception.Message);exit 1}finally{$taskPayload=$null;$taskCredential=$null;$taskExisting=$null;$taskSynthetic=$null;if($taskProcess){$taskProcess.Dispose()}}
