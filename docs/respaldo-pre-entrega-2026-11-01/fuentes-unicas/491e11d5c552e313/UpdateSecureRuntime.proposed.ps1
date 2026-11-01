# RELEASE-03D: PROPUESTA PARA REVISION. No habilitada ni ejecutada.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$ApprovedManifest,
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ApprovedManifestSha256,
 [Parameter(Mandatory=$true)][ValidatePattern('^r-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$')][string]$ReleaseId
)
throw 'RELEASE03D_SOLO_DISENO: requiere una fase autorizada de implementacion y ensayo; no retirar automaticamente esta guardia.'

# Diseño del procedimiento posterior. La guardia anterior permanece incondicional.
$ErrorActionPreference='Stop'
$srdSource=[IO.Path]::GetFullPath('A:\sistema-integrador-reservaciones')
$srdBase=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'CommunityTours\secure-runtime'))
$srdManifestDir=Join-Path $srdBase 'admin\approved-manifests'
$srdSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$srdTrusted=@($srdSid,'S-1-5-18','S-1-5-32-544','S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464')
function Assert-PlainChain([string]$srdPath) {
 $srdItem=Get-Item -LiteralPath $srdPath -Force
 if(!$srdItem.PSIsContainer){$srdItem=$srdItem.Directory}
 while($null -ne $srdItem){
  if(($srdItem.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne0){throw 'REPARSE_POINT'}
  $srdItem=$srdItem.Parent
 }
 if(((Get-Item -LiteralPath $srdPath -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)-ne0){throw 'REPARSE_FILE'}
}
function Assert-Private([string]$srdPath) {
 Assert-PlainChain $srdPath
 $srdAcl=Get-Acl -LiteralPath $srdPath
 if($srdAcl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin $srdTrusted){throw 'OWNER'}
 foreach($srdRule in $srdAcl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
  if($srdRule.AccessControlType -eq 'Allow' -and $srdRule.IdentityReference.Value -notin @($srdSid,'S-1-5-18')){throw 'PRIVATE_ACL'}
 }
 if($srdAcl.Access.Count -eq 0){throw 'EMPTY_ACL'}
}
function Assert-Ancestors([string]$srdPath) {
 # Mismo criterio conservador de sustitución de windowsConfigAcl; solo lectura.
 $srdItem=(Get-Item -LiteralPath $srdPath -Force).Parent
 while($null -ne $srdItem){
  $srdAcl=Get-Acl -LiteralPath $srdItem.FullName
  if($srdAcl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin $srdTrusted){throw 'ANCESTOR_OWNER'}
  foreach($srdRule in $srdAcl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
   if($srdRule.AccessControlType -ne 'Allow' -or $srdRule.IdentityReference.Value -in $srdTrusted -or
      ($srdRule.PropagationFlags-band[Security.AccessControl.PropagationFlags]::InheritOnly)-ne0){continue}
   if(([int64]$srdRule.FileSystemRights-band852032)-ne0){throw 'ANCESTOR_CAN_REPLACE'}
  }
  $srdItem=$srdItem.Parent
 }
}
function Assert-Closed {
 # Conservador: no mata procesos, no imprime CommandLine y no consulta HTTP.
 if(@(Get-CimInstance Win32_Process -Filter "Name='electron.exe'").Count){throw 'ELECTRON_ABIERTO_O_NO_IDENTIFICADO'}
 if(@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue|Where-Object{$_.LocalPort-eq3000}).Count){throw 'PUERTO_3000_OCUPADO'}
 foreach($srdProcess in Get-CimInstance Win32_Process -Filter "Name='node.exe'"){
  if($srdProcess.CommandLine -and ($srdProcess.CommandLine.Contains($srdBase)-or$srdProcess.CommandLine.Contains($srdSource))){throw 'PROCESO_PROYECTO_ABIERTO'}
 }
}
function Get-SrdHash([IO.Stream]$srdStream){
 $srdHasher=[Security.Cryptography.SHA256]::Create()
 try{return ([BitConverter]::ToString($srdHasher.ComputeHash($srdStream))).Replace('-','').ToLowerInvariant()}finally{$srdHasher.Dispose()}
}
function Resolve-Contained([string]$srdRoot,[string]$srdRelative){
 if([IO.Path]::IsPathRooted($srdRelative)-or$srdRelative.Contains(':')-or$srdRelative.Contains('\')-or$srdRelative-match'(^|/)\.\.(/|$)'){throw 'PATH_ESCAPE'}
 $srdFull=[IO.Path]::GetFullPath((Join-Path $srdRoot $srdRelative))
 if(!$srdFull.StartsWith($srdRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'PATH_ESCAPE'}
 return $srdFull
}
function Get-PlainFiles([string]$srdDirectory){
 Assert-PlainChain $srdDirectory
 foreach($srdEntry in Get-ChildItem -LiteralPath $srdDirectory -Force){
  if(($srdEntry.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne0){throw 'REPARSE_IN_RELEASE'}
  if($srdEntry.PSIsContainer){Get-PlainFiles $srdEntry.FullName}else{$srdEntry}
 }
}

# La carpeta privada y admin se preparan/validan en una autorización previa distinta.
Assert-Private $srdBase
Assert-Ancestors $srdBase
Assert-Private $srdManifestDir
$srdManifest=[IO.Path]::GetFullPath($ApprovedManifest)
if([IO.Path]::GetDirectoryName($srdManifest)-ne$srdManifestDir){throw 'MANIFIESTO_FUERA_DE_CUSTODIA'}
Assert-Private $srdManifest
$srdHandle=[IO.File]::Open($srdManifest,'Open','Read','Read')
try{
 if((Get-SrdHash $srdHandle)-ne$ApprovedManifestSha256.ToLowerInvariant()){throw 'MANIFEST_HASH'}
 $srdHandle.Position=0
 $srdReader=New-Object IO.StreamReader($srdHandle)
 $srdPlan=$srdReader.ReadToEnd()|ConvertFrom-Json
}finally{if($srdReader){$srdReader.Dispose()}else{$srdHandle.Dispose()}}
if($srdPlan.schema-ne'ctsk-secure-runtime-manifest-v1'-or$srdPlan.status-ne'APPROVED'-or!$srdPlan.approvalReference-or
   $srdPlan.source-ne$srdSource-or$srdPlan.platform-ne'win32'-or$srdPlan.arch-ne'x64'-or!$srdPlan.configExcluded){throw 'MANIFEST_POLICY'}
$srdSeen=New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
foreach($srdFile in $srdPlan.files){
 if(!$srdSeen.Add([string]$srdFile.path)-or$srdFile.sha256-notmatch'^[a-f0-9]{64}$'-or[long]$srdFile.bytes-lt0){throw 'MANIFEST_ENTRY'}
 if($srdFile.path-notmatch'^(package\.json|package-lock\.json|(?:electron|backend|frontend|node_modules)/.+)$'-or
    $srdFile.path-match'(^|/)(?:\.git|secrets|\.access-scope-lab|__tests__)(/|$)' -or
    $srdFile.path-match'(^|/)(?:\.env(?:\.|$)|\.npmrc$|config\.env$)' -or
    $srdFile.path-match'\.(dpapi|backup|dump|log)$'){throw 'PRIVATE_OR_UNAPPROVED_FILE'}
 [void](Resolve-Contained $srdSource $srdFile.path)
}
if(!$srdSeen.Contains('node_modules/electron/dist/electron.exe')-or!$srdSeen.Contains('node_modules/.bin/electron.cmd')){throw 'ELECTRON_INCOMPLETE'}
Assert-Closed
$srdReleases=Join-Path $srdBase 'releases'
Assert-Private $srdReleases
$srdDestination=Join-Path $srdReleases $ReleaseId
if(Test-Path -LiteralPath $srdDestination){throw 'RELEASE_ALREADY_EXISTS_NO_OVERWRITE'}
$srdBytes=($srdPlan.files|Measure-Object -Property bytes -Sum).Sum
$srdDrive=New-Object IO.DriveInfo([IO.Path]::GetPathRoot($srdBase))
if($srdDrive.AvailableFreeSpace-lt(3*$srdBytes+1GB)){throw 'INSUFFICIENT_SPACE'}
[void][IO.Directory]::CreateDirectory($srdDestination) # Solo una release nueva bajo raíz ya privada.
Assert-Private $srdDestination
foreach($srdFile in $srdPlan.files){
 $srdFrom=Resolve-Contained $srdSource $srdFile.path
 $srdTo=Resolve-Contained $srdDestination $srdFile.path
 Assert-PlainChain $srdFrom
 $srdInput=[IO.File]::Open($srdFrom,'Open','Read','Read') # Mismo handle: impide escritura/borrado durante hash/copia.
 try{
  if($srdInput.Length-ne[long]$srdFile.bytes-or(Get-SrdHash $srdInput)-ne$srdFile.sha256){throw 'SOURCE_CHANGED'}
  $srdInput.Position=0
  [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($srdTo))
  Assert-Private ([IO.Path]::GetDirectoryName($srdTo))
  $srdOutput=[IO.File]::Open($srdTo,'CreateNew','Write','None')
  try{$srdInput.CopyTo($srdOutput)}finally{$srdOutput.Dispose()}
 }finally{$srdInput.Dispose()}
 Assert-Private $srdTo
 if((Get-FileHash -LiteralPath $srdTo -Algorithm SHA256).Hash.ToLowerInvariant()-ne$srdFile.sha256){throw 'DESTINATION_HASH'}
}
$srdActual=@(Get-PlainFiles $srdDestination)
if($srdActual.Count-ne$srdPlan.files.Count){throw 'UNEXPECTED_DESTINATION_FILES'}
foreach($srdFile in $srdPlan.files){
 $srdTo=Resolve-Contained $srdDestination $srdFile.path
 Assert-Private $srdTo
 if((Get-FileHash -LiteralPath $srdTo -Algorithm SHA256).Hash.ToLowerInvariant()-ne$srdFile.sha256){throw 'FINAL_HASH'}
}
Assert-Ancestors $srdDestination
Assert-Closed
Write-Output ('RELEASE_STAGED_NOT_ACTIVATED: '+$ReleaseId)
# No copia .env, no cambia current.json/atajos, no ejecuta npm/Electron ni conecta PG.
# Ante fallo: conservar release incompleta, no activarla ni borrarla; usar otro ID autorizado.
