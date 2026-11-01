[CmdletBinding()]
param([string]$Source=([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))))
$ErrorActionPreference='Stop'
# Ejecutar solamente tras comparar por un canal físico confiable los hashes entregados por el servidor.
# No instala Electron, CA, servicios o reglas. Copia una lista positiva a una carpeta NUEVA del usuario local.
$importFiles=@('electron/main.js','electron/preload.js','electron/connection.html','electron/httpsBackend.js',
    'electron/lanClientPolicy.js','electron/lanEntry.js','shared/serverIdentity.js','shared/windowsConfigAcl.js','shared/lanContract.js','scripts/ImportLanClient.ps1','scripts/InspectLanNetwork.ps1')
$Source=[IO.Path]::GetFullPath($Source)
$importConfig=Get-Content -LiteralPath (Join-Path $Source 'client/client.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$importKeys=@('version','protocol','environment','serverId','origin','address','port','name','code','clientCode','tlsSpki','caDigest','publicKeyDigest','network')
if((Compare-Object @($importConfig.PSObject.Properties.Name|Sort-Object) @($importKeys|Sort-Object)) -or
    $importConfig.environment -ne 'https-private-lan-lab' -or $importConfig.protocol -ne 2){throw 'LAN_PUBLIC_CONFIG_REQUIRED'}
function Get-LanCodeDigest([string]$Root){
    $importMemory=[IO.MemoryStream]::new();$importHash=[Security.Cryptography.SHA256]::Create()
    try{
        foreach($importFile in $importFiles){
            $importBytes=[Text.Encoding]::UTF8.GetBytes($importFile);$importMemory.Write($importBytes,0,$importBytes.Length)
            $importBytes=[IO.File]::ReadAllBytes((Join-Path $Root $importFile));$importMemory.Write($importBytes,0,$importBytes.Length)
        }
        return ([BitConverter]::ToString($importHash.ComputeHash($importMemory.ToArray()))).Replace('-','').ToLowerInvariant()
    }finally{$importMemory.Dispose();$importHash.Dispose()}
}
if((Get-LanCodeDigest $Source) -ne $importConfig.clientCode){throw 'LAN_PUBLIC_CODE_CHANGED'}
foreach($importPem in @('ca.pem','identity-public.pem')){
    $importPath=Join-Path $Source ('client/'+$importPem)
    if((Get-Content -LiteralPath $importPath -Raw) -match 'PRIVATE KEY'){throw 'LAN_PRIVATE_MATERIAL_REJECTED'}
    $importExpected=if($importPem -eq 'ca.pem'){$importConfig.caDigest}else{$importConfig.publicKeyDigest}
    if((Get-FileHash -LiteralPath $importPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $importExpected){throw 'LAN_PUBLIC_TRUST_CHANGED'}
}
$importDestination=Join-Path $env:LOCALAPPDATA ('ctsk-lan-client-'+[Guid]::NewGuid().ToString('N').Substring(0,12))
if(Test-Path -LiteralPath $importDestination){throw 'LAN_NEW_DIRECTORY_REQUIRED'}
[void][IO.Directory]::CreateDirectory($importDestination)
$importSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$importAcl=[Security.AccessControl.DirectorySecurity]::new();$importAcl.SetAccessRuleProtection($true,$false)
$importAcl.SetOwner([Security.Principal.SecurityIdentifier]::new($importSid))
foreach($importTrusted in @($importSid,'S-1-5-18','S-1-5-32-544')){
    $importAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($importTrusted),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
}
Set-Acl -LiteralPath $importDestination -AclObject $importAcl
foreach($importFile in ($importFiles+@('client/client.json','client/ca.pem','client/identity-public.pem'))){
    $importTarget=Join-Path $importDestination $importFile
    [void][IO.Directory]::CreateDirectory((Split-Path -Parent $importTarget))
    [IO.File]::Copy((Join-Path $Source $importFile),$importTarget,$false)
}
if((Get-LanCodeDigest $importDestination) -ne $importConfig.clientCode){throw 'LAN_IMPORTED_CODE_CHANGED'}
Write-Output $importDestination
