param([ValidateSet('Preparar','PrepararSCRAM','Completar','EstadoFinal','VerificarAislamiento','ProbarElectron','Electron')][string]$Modo='Electron')
$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$taskVault=Join-Path $taskRoot '.access-scope-lab/dev-db-02/postgres-dev.credentials.clixml'
$taskProcess=$null
try {
    if ($Modo -in @('Preparar','PrepararSCRAM') -and -not (Test-Path -LiteralPath $taskVault)) {
        $taskRng=[Security.Cryptography.RandomNumberGenerator]::Create()
        try {
            $taskBytes=New-Object byte[] 32
            $taskRng.GetBytes($taskBytes)
            $taskPlain=[Convert]::ToBase64String($taskBytes)
            $taskSecure=ConvertTo-SecureString -String $taskPlain -AsPlainText -Force
            $taskCredential=New-Object Management.Automation.PSCredential('sian_kaan_dev_app',$taskSecure)
            $taskCredential | Export-Clixml -LiteralPath $taskVault -NoClobber
            $taskRoundtrip=Import-Clixml -LiteralPath $taskVault
            if ($taskRoundtrip.GetNetworkCredential().Password -cne $taskPlain) { throw 'DEV_DB03_VAULT_RECOVERY_FAILED' }
            if ([IO.File]::ReadAllText($taskVault).Contains($taskPlain)) { throw 'DEV_DB03_VAULT_NOT_ENCRYPTED' }
            [Array]::Clear($taskBytes,0,$taskBytes.Length)
        } finally { $taskRng.Dispose(); $taskPlain=$null; $taskSecure=$null; $taskRoundtrip=$null }
    }
    $taskCredential=Import-Clixml -LiteralPath $taskVault
    if ($taskCredential.UserName -ne 'sian_kaan_dev_app') { throw 'DEV_DB03_CREDENTIAL_USER_MISMATCH' }
    $taskPayload=@{username=$taskCredential.UserName;password=$taskCredential.GetNetworkCredential().Password}
    $taskArguments=@()
    if ($Modo -eq 'EstadoFinal') {
        $taskScript=Join-Path $PSScriptRoot 'devDb03.cjs'; $taskArguments=@('final-state')
    } elseif ($Modo -eq 'Completar') {
        $taskScript=Join-Path $PSScriptRoot 'devDb03.cjs'; $taskArguments=@('complete')
    } elseif ($Modo -eq 'PrepararSCRAM') {
        $taskScript=Join-Path $PSScriptRoot 'devDb03.cjs'; $taskArguments=@('provision-scram')
    } elseif ($Modo -eq 'Preparar') {
        $taskScript=Join-Path $PSScriptRoot 'devDb03.cjs'; $taskArguments=@('provision')
    } elseif ($Modo -eq 'VerificarAislamiento') {
        $taskScript=Join-Path $PSScriptRoot 'devDb03.cjs'; $taskArguments=@('isolation')
    } elseif ($Modo -eq 'ProbarElectron') {
        $taskScript=Join-Path $PSScriptRoot 'probarElectronDevDb03.cjs'
        $taskAppCredentials=@(Import-Clixml -LiteralPath (Join-Path $taskRoot '.access-scope-lab/dev-db-02/usuarios-dev.credentials.clixml'))
        if ($taskAppCredentials.Count -ne 4) { throw 'DEV_DB03_APP_CREDENTIALS_MISSING' }
        $taskPayload.users=@()
        foreach ($taskItem in $taskAppCredentials) { $taskPayload.users+=@{correo=$taskItem.UserName;password=$taskItem.GetNetworkCredential().Password} }
    } else {
        $taskScript=Join-Path $PSScriptRoot 'arrancarDevDb02.cjs'
    }
    $taskInfo=New-Object Diagnostics.ProcessStartInfo
    $taskInfo.FileName=(Get-Command node.exe).Source
    $taskInfo.Arguments='"'+$taskScript+'" '+($taskArguments -join ' ')
    $taskInfo.WorkingDirectory=$taskRoot
    $taskInfo.UseShellExecute=$false
    $taskInfo.RedirectStandardInput=$true
    foreach ($taskKey in @($taskInfo.EnvironmentVariables.Keys)) {
        if ($taskKey -match '^(DB_|PG|JWT_|APP_|GYG_|GETYOURGUIDE_|GOOGLE_|FAREHARBOR_|WHATSAPP_|NODE_OPTIONS$|ELECTRON_RUN_AS_NODE$)') { $taskInfo.EnvironmentVariables.Remove($taskKey) }
    }
    if ($Modo -eq 'Preparar') {
        # Separar solo esta consola de automatizacion: psql debe usar su stdin privado,
        # no un CONIN$ heredado sin usuario. No cambia politicas ni servicios Windows.
        Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public static class DevDb03Console { [DllImport("kernel32.dll")] public static extern bool FreeConsole(); }'
        [DevDb03Console]::FreeConsole() | Out-Null
    }
    $taskProcess=[Diagnostics.Process]::Start($taskInfo)
    # .NET Framework / PowerShell 5.1: UTF-8 sin BOM sobre el pipe privado.
    $taskInputWriter=New-Object IO.StreamWriter($taskProcess.StandardInput.BaseStream,(New-Object Text.UTF8Encoding($false)))
    try {
        $taskInputWriter.WriteLine(($taskPayload | ConvertTo-Json -Depth 5 -Compress))
    } finally { $taskInputWriter.Dispose() }

    $taskPayload=$null; $taskAppCredentials=$null; $taskCredential=$null
    $taskProcess.WaitForExit()
    if ($taskProcess.ExitCode -ne 0) { throw 'DEV_DB03_PROCESS_FAILED: revisar el codigo seguro anterior; no repetir Preparar sobre un rol existente.' }
} catch {
    Write-Host ('DEV-DB-03: '+$_.Exception.Message)
    exit 1
} finally {
    $taskPayload=$null; $taskCredential=$null; $taskAppCredentials=$null; $taskItem=$null
    if ($taskProcess) { $taskProcess.Dispose() }
}

