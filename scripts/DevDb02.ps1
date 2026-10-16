param([ValidateSet('Usuarios','Verificar','Electron','GenerarUsuarios','VerificarGuardadas','MostrarClaves')][string]$Modo='Electron')
$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
function Read-DevelopmentSecret([string]$Label) {
    $taskSecure=Read-Host $Label -AsSecureString
    $taskPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPointer); $taskSecure.Dispose() }
}
$taskProcess=$null
$taskStage='entry'
$taskStatus=Join-Path $taskRoot '.access-scope-lab/dev-db-02/interactive-status.json'
function Write-InteractiveStatus([string]$Stage,[string]$ErrorType='') {
    @{stage=$Stage;mode=$Modo;pid=$PID;error_type=$ErrorType} | ConvertTo-Json | Set-Content -LiteralPath $taskStatus -Encoding UTF8
}
try {
    Write-InteractiveStatus 'started'

    $taskVault=Join-Path $taskRoot '.access-scope-lab/dev-db-02/usuarios-dev.credentials.clixml'
    if ($Modo -eq 'MostrarClaves') {
        $taskCredentials=@(Import-Clixml -LiteralPath $taskVault)
        if ($taskCredentials.Count -ne 4) { throw 'El archivo cifrado no contiene las cuatro cuentas esperadas.' }
        Write-Host 'Credenciales FICTICIAS de sian_kaan_reservaciones_dev. Cierra esta ventana al terminar.'
        foreach ($taskCredential in $taskCredentials) {
            Write-Host ''
            Write-Host ('Correo: '+$taskCredential.UserName)
            Write-Host ('Clave:  '+$taskCredential.GetNetworkCredential().Password)
        }
        Write-InteractiveStatus 'credentials_displayed_locally'
        return
    }
    if ($Modo -in @('GenerarUsuarios','VerificarGuardadas')) {
        $taskEmails=@('admin.dev@example.test','consulta.all.dev@example.test','consulta.selected.dev@example.test','consulta.empty.dev@example.test')
        if ($Modo -eq 'GenerarUsuarios') {
            if (Test-Path -LiteralPath $taskVault) { throw 'Ya existe el archivo cifrado. No se sobrescribiran las claves.' }
            $taskGenerator=[Security.Cryptography.RandomNumberGenerator]::Create()
            $taskGenerated=@()
            try {
                foreach ($taskEmail in $taskEmails) {
                    $taskBytes=New-Object byte[] 24
                    $taskGenerator.GetBytes($taskBytes)
                    $taskPlain=[Convert]::ToBase64String($taskBytes)
                    $taskSecure=ConvertTo-SecureString -String $taskPlain -AsPlainText -Force
                    $taskGenerated+=New-Object Management.Automation.PSCredential($taskEmail,$taskSecure)
                    [Array]::Clear($taskBytes,0,$taskBytes.Length)
                    $taskPlain=$null
                }
                $taskGenerated | Export-Clixml -LiteralPath $taskVault -Depth 5 -NoClobber
                $taskRestored=@(Import-Clixml -LiteralPath $taskVault)
                if ($taskRestored.Count -ne 4) { throw 'No se pudo verificar la recuperacion del archivo cifrado.' }
                for ($taskIndex=0;$taskIndex -lt 4;$taskIndex++) {
                    if ($taskRestored[$taskIndex].UserName -ne $taskEmails[$taskIndex] -or
                        $taskRestored[$taskIndex].GetNetworkCredential().Password -cne $taskGenerated[$taskIndex].GetNetworkCredential().Password) {
                        throw 'La recuperacion cifrada no coincide. No se crearon usuarios.'
                    }
                }
            } finally { $taskGenerator.Dispose(); $taskGenerated=$null }
        }
        $taskCredentials=@(Import-Clixml -LiteralPath $taskVault)
        if ($taskCredentials.Count -ne 4) { throw 'El archivo cifrado no contiene cuatro cuentas.' }
        $taskPasswords=@()
        for ($taskIndex=0;$taskIndex -lt 4;$taskIndex++) {
            if ($taskCredentials[$taskIndex].UserName -ne $taskEmails[$taskIndex]) { throw 'Orden o identidad de cuentas incorrectos.' }
            $taskPasswords+=$taskCredentials[$taskIndex].GetNetworkCredential().Password
        }
        $taskCiphertext=[IO.File]::ReadAllText($taskVault)
        foreach ($taskPassword in $taskPasswords) {
            if ($taskCiphertext.Contains($taskPassword)) { throw 'El archivo no protege las claves; no se continuara.' }
        }
        $taskCiphertext=$null; $taskPassword=$null
        $taskPayload=@{passwords=$taskPasswords;credential_delivery='windows_dpapi_current_user'}
        $taskScript=Join-Path $PSScriptRoot 'usuariosDevDb02.cjs'
        $taskArguments=@()
        if ($Modo -eq 'VerificarGuardadas') { $taskArguments=@('--verify') }
    } elseif ($Modo -eq 'Electron') {
        $taskUser=Read-Host 'Usuario PostgreSQL limitado autorizado (no postgres)'
        if ($taskUser -eq 'postgres') { throw 'El arranque rechaza postgres. Se requiere una cuenta limitada autorizada; este script no crea roles.' }
        $taskPayload=@{username=$taskUser;password=(Read-DevelopmentSecret 'Contrasena PostgreSQL de desarrollo')}
        $taskScript=Join-Path $PSScriptRoot 'arrancarDevDb02.cjs'
        $taskArguments=@()
    } else {
        Write-Host 'Introduce cuatro contrasenas NUEVAS y FICTICIAS, diferentes entre si. No reutilices claves reales.'
        $taskStage='password_prompt'
        Write-InteractiveStatus $taskStage
        $taskPasswords=@()
        foreach ($taskLabel in @('Administrador','Consulta all','Consulta selected','Consulta selected vacio')) {
            $taskPasswords+=Read-DevelopmentSecret ('Contrasena ficticia para '+$taskLabel+' (8 a 72 bytes UTF-8)')
        }
        $taskPayload=@{passwords=$taskPasswords}
        $taskScript=Join-Path $PSScriptRoot 'usuariosDevDb02.cjs'
        $taskArguments=@()
        if ($Modo -eq 'Verificar') { $taskArguments=@('--verify') }
    }
    $taskStage='starting_node'
    Write-InteractiveStatus $taskStage
    $taskInfo=New-Object System.Diagnostics.ProcessStartInfo
    $taskInfo.FileName=(Get-Command node.exe).Source
    $taskInfo.Arguments='"'+$taskScript+'" '+($taskArguments -join ' ')
    $taskInfo.WorkingDirectory=$taskRoot
    $taskInfo.UseShellExecute=$false
    $taskInfo.RedirectStandardInput=$true
    $taskInfo.StandardInputEncoding=New-Object System.Text.UTF8Encoding($false)
    foreach ($taskKey in @($taskInfo.EnvironmentVariables.Keys)) {
        if ($taskKey -match '^(DB_|PG|JWT_|APP_|GYG_|GETYOURGUIDE_|GOOGLE_|FAREHARBOR_|WHATSAPP_|NODE_OPTIONS$|ELECTRON_RUN_AS_NODE$)') { $taskInfo.EnvironmentVariables.Remove($taskKey) }
    }
    $taskProcess=[System.Diagnostics.Process]::Start($taskInfo)
    $taskProcess.StandardInput.WriteLine(($taskPayload | ConvertTo-Json -Compress))
    $taskProcess.StandardInput.Close()
    $taskPayload=$null; $taskPasswords=$null
    $taskStage='node_running'
    Write-InteractiveStatus $taskStage
    $taskProcess.WaitForExit()
    if ($taskProcess.ExitCode -ne 0) { throw 'El proceso se detuvo. Revisa el codigo seguro mostrado; no vuelvas a inicializar la base.' }
    Write-InteractiveStatus 'completed'
} catch {
    Write-InteractiveStatus ('failed_at_'+$taskStage) $_.Exception.GetType().FullName
    Write-Host ('DEV-DB-02: '+$_.Exception.Message)
    try { Read-Host 'Pulsa Enter para cerrar despues de revisar el error (no escribas contrasenas)' | Out-Null } catch {}
    exit 1
} finally {
    $taskPayload=$null; $taskPasswords=$null; $taskCredentials=$null; $taskRestored=$null; $taskGenerated=$null; $taskPlain=$null
    if ($taskProcess) { $taskProcess.Dispose() }
}

