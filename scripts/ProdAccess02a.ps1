param()
$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$taskRun=[Guid]::NewGuid().ToString('N').Substring(0,12)
$taskLab=Join-Path $taskRoot ('.access-scope-lab/prod-access-02a-'+$taskRun)
$taskProcess=$null
try {
    if(Test-Path -LiteralPath $taskLab){throw 'LAB_ALREADY_EXISTS'}
    New-Item -ItemType Directory -Path $taskLab | Out-Null
    $taskSid=[Security.Principal.WindowsIdentity]::GetCurrent().User
    $taskAcl=New-Object Security.AccessControl.DirectorySecurity
    $taskAcl.SetAccessRuleProtection($true,$false)
    foreach($taskAllowed in @($taskSid,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))) {
        $taskRule=New-Object Security.AccessControl.FileSystemAccessRule($taskAllowed,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
        $taskAcl.AddAccessRule($taskRule)
    }
    Set-Acl -LiteralPath $taskLab -AclObject $taskAcl
    $taskActual=Get-Acl -LiteralPath $taskLab
    $taskRules=@($taskActual.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
    if(-not $taskActual.AreAccessRulesProtected -or $taskRules.Count -ne 2 -or @($taskRules | Where-Object {$_.IdentityReference.Value -notin @($taskSid.Value,'S-1-5-18') -or $_.AccessControlType -ne 'Allow'}).Count){throw 'LAB_ACL_NOT_PRIVATE'}
    $taskRng=[Security.Cryptography.RandomNumberGenerator]::Create()
    try{$taskBytes=New-Object byte[] 32;$taskRng.GetBytes($taskBytes);$taskPlain=[Convert]::ToBase64String($taskBytes)}finally{$taskRng.Dispose()}
    $taskSecure=ConvertTo-SecureString -String $taskPlain -AsPlainText -Force
    $taskCredential=New-Object Management.Automation.PSCredential('prod_access_lab',$taskSecure)
    $taskVault=Join-Path $taskLab 'lab.credentials.clixml'
    $taskCredential | Export-Clixml -LiteralPath $taskVault -NoClobber
    if((Import-Clixml -LiteralPath $taskVault).GetNetworkCredential().Password -cne $taskPlain -or [IO.File]::ReadAllText($taskVault).Contains($taskPlain)){throw 'LAB_VAULT_VERIFICATION_FAILED'}
    $taskPayload=@{lab=$taskLab;run=$taskRun;username=$taskCredential.UserName;password=$taskPlain;private_acl_verified=$true}
    [Array]::Clear($taskBytes,0,$taskBytes.Length)
    $taskPlain=$null;$taskSecure=$null;$taskCredential=$null
    Write-Host ('PROD-ACCESS-02A: laboratorio privado '+$taskLab)
    $taskInfo=New-Object Diagnostics.ProcessStartInfo
    $taskInfo.FileName=(Get-Command node.exe).Source
    $taskInfo.Arguments='"'+(Join-Path $PSScriptRoot 'prodAccess02a.cjs')+'"'
    $taskInfo.WorkingDirectory=$taskRoot
    $taskInfo.UseShellExecute=$false
    $taskInfo.RedirectStandardInput=$true
    foreach($taskKey in @($taskInfo.EnvironmentVariables.Keys)) {
        if($taskKey -match '^(DB_|PG|JWT_|APP_|GYG_|GETYOURGUIDE_|GOOGLE_|FAREHARBOR_|WHATSAPP_|NODE_OPTIONS$|ELECTRON_RUN_AS_NODE$)'){$taskInfo.EnvironmentVariables.Remove($taskKey)}
    }
    $taskProcess=[Diagnostics.Process]::Start($taskInfo)
    $taskWriter=New-Object IO.StreamWriter($taskProcess.StandardInput.BaseStream,(New-Object Text.UTF8Encoding($false)))
    try{$taskWriter.WriteLine(($taskPayload | ConvertTo-Json -Compress))}finally{$taskWriter.Dispose()}
    $taskPayload=$null
    $taskProcess.WaitForExit()
    if($taskProcess.ExitCode -ne 0){throw 'LAB_REHEARSAL_FAILED_SEE_SANITIZED_REPORT'}
} catch {
    Write-Host ('PROD-ACCESS-02A: '+$_.Exception.Message)
    exit 1
} finally {
    $taskPayload=$null;$taskPlain=$null;$taskCredential=$null;$taskSecure=$null
    if($taskProcess){$taskProcess.Dispose()}
}
