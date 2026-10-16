$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$taskLab=Join-Path $taskRoot '.access-scope-lab/prod-access-02b'
$taskVault=Join-Path $taskLab 'existing-users.credentials.clixml'
$taskState=Join-Path $taskLab 'capture-state.json'
function Set-CaptureState([string]$Stage){@{stage=$Stage;utc=[DateTime]::UtcNow.ToString('o');pid=$PID}|ConvertTo-Json|Set-Content -LiteralPath $taskState -Encoding UTF8}
function Invoke-CaptureNode([string]$Name,[string]$Payload){
 $taskInfo=New-Object Diagnostics.ProcessStartInfo
 $taskInfo.FileName=(Get-Command node.exe).Source
 $taskInfo.Arguments='"'+(Join-Path $PSScriptRoot $Name)+'"'
 $taskInfo.WorkingDirectory=$taskRoot;$taskInfo.UseShellExecute=$false;$taskInfo.CreateNoWindow=$true
 $taskInfo.RedirectStandardOutput=$true;$taskInfo.RedirectStandardError=$true;$taskInfo.RedirectStandardInput=$true
 $taskChild=[Diagnostics.Process]::Start($taskInfo)
 try{
  $taskWriter=New-Object IO.StreamWriter($taskChild.StandardInput.BaseStream,(New-Object Text.UTF8Encoding($false)))
  try{if($Payload){$taskWriter.WriteLine($Payload)}}finally{$taskWriter.Dispose()}
  $taskOutput=$taskChild.StandardOutput.ReadToEnd();$null=$taskChild.StandardError.ReadToEnd();$taskChild.WaitForExit()
  if($taskChild.ExitCode -ne 0){throw 'CAPTURE_NODE_FAILED'}
  return ($taskOutput|ConvertFrom-Json)
 }finally{$taskChild.Dispose();$Payload=$null}
}
$taskForm=$null;$taskCredentials=$null;$taskInputs=@()
try{
 if(Test-Path -LiteralPath $taskVault){throw 'EXISTING_CREDENTIAL_VAULT_ALREADY_CAPTURED'}
 Set-CaptureState 'starting'
 Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
 Add-Type -AssemblyName System.Windows.Forms
 Add-Type -AssemblyName System.Drawing
 $taskIdentities=@(Invoke-CaptureNode 'identidadesProdAccess.cjs' '')
 if($taskIdentities.Count -ne 2){throw 'EXISTING_IDENTITIES_INVALID'}
 $taskForm=New-Object Windows.Forms.Form
 $taskForm.Text='PROD-ACCESS-02B: verificar cuentas existentes'
 $taskForm.ClientSize=New-Object Drawing.Size(650,350)
 $taskForm.StartPosition='CenterScreen';$taskForm.TopMost=$true
 $taskForm.FormBorderStyle='FixedDialog';$taskForm.MaximizeBox=$false
 $taskLabel=New-Object Windows.Forms.Label
 $taskLabel.Text='Escribe la clave de cada correo mostrado (cuentas de la base principal). Se verificaran sin cambiarlas y se guardaran cifradas para las pruebas.'
 $taskLabel.Location=New-Object Drawing.Point(18,12);$taskLabel.Size=New-Object Drawing.Size(610,43)
 $taskForm.Controls.Add($taskLabel)
 for($taskIndex=0;$taskIndex -lt 2;$taskIndex++){
  $taskY=65+$taskIndex*85
  $taskRole=New-Object Windows.Forms.Label
  $taskRole.Text=@('Administrador existente - contrasena a la derecha','Consulta existente - contrasena a la derecha')[$taskIndex]
  $taskRole.Location=New-Object Drawing.Point(18,$taskY);$taskRole.Size=New-Object Drawing.Size(600,22)
  $taskForm.Controls.Add($taskRole)
  $taskEmail=New-Object Windows.Forms.TextBox
  $taskEmail.Location=New-Object Drawing.Point(18,($taskY+25));$taskEmail.Size=New-Object Drawing.Size(355,25)
  $taskEmail.Text=$taskIdentities[$taskIndex].correo;$taskEmail.ReadOnly=$true;$taskEmail.TabStop=$false
  $taskPass=New-Object Windows.Forms.TextBox
  $taskPass.Location=New-Object Drawing.Point(390,($taskY+25));$taskPass.Size=New-Object Drawing.Size(235,25)
  $taskPass.UseSystemPasswordChar=$true;$taskPass.TabIndex=$taskIndex
  $taskForm.Controls.Add($taskEmail);$taskForm.Controls.Add($taskPass)
  $taskInputs+=@{email=$taskEmail;password=$taskPass}
 }
 $taskStatus=New-Object Windows.Forms.Label
 $taskStatus.Text='Escribe ambas claves y pulsa Verificar y guardar. No se cambian contrasenas.'
 $taskStatus.Location=New-Object Drawing.Point(18,240);$taskStatus.Size=New-Object Drawing.Size(610,48)
 $taskForm.Controls.Add($taskStatus)
 $taskSave=New-Object Windows.Forms.Button
 $taskSave.Text='Verificar y guardar';$taskSave.Location=New-Object Drawing.Point(410,300)
 $taskSave.Size=New-Object Drawing.Size(215,32);$taskSave.TabIndex=2
 # El evento solo finaliza el dialogo. Validacion, DPAPI y archivos se ejecutan fuera del evento.
 $taskSave.DialogResult=[Windows.Forms.DialogResult]::OK
 $taskForm.Controls.Add($taskSave);$taskForm.AcceptButton=$taskSave
 $taskComplete=$false
 while(-not $taskComplete){
  Set-CaptureState 'waiting_for_input'
  $taskForm.DialogResult=[Windows.Forms.DialogResult]::None
  $taskForm.ActiveControl=$taskInputs[0].password
  $taskResult=$taskForm.ShowDialog()
  if($taskResult -ne [Windows.Forms.DialogResult]::OK){Set-CaptureState 'cancelled';break}
  if(@($taskInputs|Where-Object{[string]::IsNullOrEmpty($_.password.Text)}).Count){$taskStatus.Text='Falta una contrasena. Completa las dos casillas de la derecha.';Set-CaptureState 'missing_password';continue}
  Set-CaptureState 'validating'
  $taskPayload=@{users=@()};foreach($taskInput in $taskInputs){$taskPayload.users+=@{correo=$taskInput.email.Text;password=$taskInput.password.Text}}
  try{$taskValidation=Invoke-CaptureNode 'validarProdAccessCredenciales.cjs' ($taskPayload|ConvertTo-Json -Depth 5 -Compress)}finally{$taskPayload=$null}
  if(@($taskValidation.checks).Count -ne 2){throw 'CREDENTIAL_VALIDATION_FAILED'}
  if(-not ($taskValidation.checks[0] -and $taskValidation.checks[1])){
   $taskRejected=@();for($taskIndex=0;$taskIndex -lt 2;$taskIndex++){if(-not $taskValidation.checks[$taskIndex]){$taskRejected+=@('Administrador','Consulta')[$taskIndex];$taskInputs[$taskIndex].password.Clear()}}
   $taskStatus.Text='Clave no aceptada para: '+($taskRejected -join ', ')+'. Usa la clave del correo mostrado; no se cambio ninguna cuenta.'
   Set-CaptureState 'password_rejected';continue
  }
  $taskCredentials=@()
  foreach($taskInput in $taskInputs){
   $taskSecure=New-Object Security.SecureString
   foreach($taskChar in $taskInput.password.Text.ToCharArray()){$taskSecure.AppendChar($taskChar)}
   $taskSecure.MakeReadOnly()
   $taskCredentials+=New-Object Management.Automation.PSCredential($taskInput.email.Text,$taskSecure)
  }
  try{
   Set-CaptureState 'saving_encrypted'
   $taskCredentials|Export-Clixml -LiteralPath $taskVault -NoClobber
   $taskRestored=@(Import-Clixml -LiteralPath $taskVault)
   if($taskRestored.Count -ne 2){throw 'CREDENTIAL_SAVE_VERIFICATION_FAILED'}
   for($taskIndex=0;$taskIndex -lt 2;$taskIndex++){if($taskRestored[$taskIndex].UserName -ne $taskCredentials[$taskIndex].UserName -or $taskRestored[$taskIndex].GetNetworkCredential().Password -cne $taskCredentials[$taskIndex].GetNetworkCredential().Password){throw 'CREDENTIAL_SAVE_VERIFICATION_FAILED'}}
   $taskComplete=$true;Set-CaptureState 'saved_and_verified'
   [Windows.Forms.MessageBox]::Show('Las dos claves son correctas y quedaron guardadas cifradas. Puedes avisar en el chat: listo.','Captura completada',[Windows.Forms.MessageBoxButtons]::OK,[Windows.Forms.MessageBoxIcon]::Information)|Out-Null
  }finally{$taskCredentials=$null;$taskRestored=$null;$taskSecure=$null;foreach($taskInput in $taskInputs){$taskInput.password.Clear()}}
 }
}catch{
 Set-CaptureState 'failed'
 @{utc=[DateTime]::UtcNow.ToString('o');type=$_.Exception.GetType().Name;code=$_.FullyQualifiedErrorId;line=$_.InvocationInfo.ScriptLineNumber}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $taskLab 'capture-error-current.json') -Encoding UTF8
 if($taskForm){[Windows.Forms.MessageBox]::Show('No se completo la captura. Se registro un diagnostico sin claves. Avisa en el chat para revisarlo.','Captura no completada')|Out-Null}
 exit 1
}finally{$taskCredentials=$null;$taskPayload=$null;foreach($taskInput in $taskInputs){$taskInput.password.Clear()};if($taskForm){$taskForm.Dispose()}}
