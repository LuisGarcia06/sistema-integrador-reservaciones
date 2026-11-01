# Executes pure token/stop/SMBIOS contracts. Native sizes were obtained in a separate read-only own-token diagnostic.
param([Parameter(Mandatory=$true)][string]$Base)
$ErrorActionPreference='Stop'
Add-Type -Path scripts/windows-setup-native/OptionCQueryContracts.cs,scripts/windows-setup-native/OptionCSmbiosContract.cs
$checks=[Collections.Generic.List[object]]::new()
$native=Get-Content -LiteralPath (Join-Path $Base 'own-token-query-readonly.json') -Raw | ConvertFrom-Json
foreach ($row in $native.results) {
  $size=[CommunityTours.Setup026.TokenQueryPolicy]::SizeViolation($row.informationClass,$row.sizingSucceeded,$row.sizingWin32Error,$row.requiredBytes)
  $read=[CommunityTours.Setup026.TokenQueryPolicy]::ReadViolation($row.informationClass,$row.readSucceeded,$row.returnedBytes,$row.requiredBytes)
  if ($size -or $read) { throw 'NATIVE_RECORDED_SIZE_REJECTED' }
  $checks.Add([pscustomobject]@{case='recorded-own-token-class-'+$row.informationClass;passed=$true})
}
foreach ($row in @(@(20,$false,24,8),@(8,$false,24,4),@(20,$false,5,4),@(20,$false,0,4),@(20,$false,122,0),@(20,$true,0,4),@(1,$false,122,1048577),@(99,$false,122,4))) {
  if (-not [CommunityTours.Setup026.TokenQueryPolicy]::SizeViolation($row[0],$row[1],$row[2],$row[3])) { throw 'BAD_SIZE_ACCEPTED' }
  $checks.Add([pscustomobject]@{case='reject-size-'+($row -join '-');passed=$true})
}
foreach ($row in @(@(20,$false,0,4),@(20,$true,8,8),@(1,$true,16,44),@(20,$true,0,4))) {
  if (-not [CommunityTours.Setup026.TokenQueryPolicy]::ReadViolation($row[0],$row[1],$row[2],$row[3])) { throw 'BAD_READ_ACCEPTED' }
  $checks.Add([pscustomobject]@{case='reject-read-'+($row -join '-');passed=$true})
}
function Check-Stop([uint[]]$States,[uint[]]$Pids,[bool]$ExpectPass,[int]$ExpectRequests) {
  $state=@{index=0;clock=0;requests=0}
  [Func[CommunityTours.Setup026.StopSample]]$query={ $i=[Math]::Min($state.index,$States.Length-1);$state.index++;return [CommunityTours.Setup026.StopSample]::new($States[$i],$Pids[$i]) }
  [Action]$stop={ $state.requests++ };[Action]$pause={ $state.clock+=100 };[Func[long]]$elapsed={ return [long]$state.clock }
  $passed=$false;try{[CommunityTours.Setup026.StopWaitPolicy]::Verify($query,$stop,$pause,$elapsed,500);$passed=$true}catch{if($_.Exception.InnerException.Message -ne 'VALIDATION_SERVICE_STOP_UNPROVEN'){throw}}
  if ($passed -ne $ExpectPass -or $state.requests -ne $ExpectRequests) { throw 'STOP_PROOF_WRONG' }
  $checks.Add([pscustomobject]@{case='stop-'+($States -join '-');passed=$true;fixture=$true;requests=$state.requests})
}
Check-Stop @(4,3,1) @(5696,5696,0) $true 1
Check-Stop @(3,1) @(5696,0) $true 0
Check-Stop @(1) @(0) $true 0
Check-Stop @(4) @(5696) $false 1
Check-Stop @(1) @(5696) $false 0
function Make-Smbios([byte]$Minor=5,[byte]$UuidFirst=1,[string]$Vendor='Oracle Corporation') {
  $body=[Collections.Generic.List[byte]]::new();$record=[byte[]]::new(24);$record[0]=1;$record[1]=24;$record[4]=1;$record[5]=2;for($i=0;$i -lt 16;$i++){$record[8+$i]=[byte]($i+1)};$record[8]=$UuidFirst;$body.AddRange($record)
  $body.AddRange([Text.Encoding]::ASCII.GetBytes($Vendor+[char]0+'VirtualBox'+[char]0+[char]0));$body.AddRange([byte[]]@(127,4,0,0,0,0));$raw=[byte[]]::new(8+$body.Count);$raw[1]=2;$raw[2]=$Minor;[BitConverter]::GetBytes([uint32]$body.Count).CopyTo($raw,4);$body.ToArray().CopyTo($raw,8);return ,$raw
}
[byte[]]$raw=Make-Smbios;$hash=[CommunityTours.Setup026.SmbiosContract]::Fingerprint($raw)
if ($hash.Length -ne 64 -or $hash -ne [CommunityTours.Setup026.SmbiosContract]::Fingerprint($raw)) { throw 'SMBIOS_NONDETERMINISTIC' }
$checks.Add([pscustomobject]@{case='SMBIOS-legacy-opaque-raw-UUID-binding';passed=$true;fixture=$true})
if ($hash -eq [CommunityTours.Setup026.SmbiosContract]::Fingerprint((Make-Smbios -UuidFirst 9))) { throw 'UUID_CHANGE_NOT_BOUND' }
$checks.Add([pscustomobject]@{case='SMBIOS-other-UUID-changes-binding';passed=$true;fixture=$true})
foreach ($bad in @((Make-Smbios -Vendor 'Not-VirtualBox'),([byte[]]@(0,2,5)),([byte[]]$raw[0..($raw.Length-3)]))) {
  $rejected=$false;try{[void][CommunityTours.Setup026.SmbiosContract]::Fingerprint([byte[]]$bad)}catch{$rejected=$true};if(-not $rejected){throw 'BAD_SMBIOS_ACCEPTED'}
  $checks.Add([pscustomobject]@{case='SMBIOS-malformed-or-foreign-rejected';passed=$true;fixture=$true})
}
$extraBad=[Collections.Generic.List[byte[]]]::new()
foreach($value in @(0,255)){[byte[]]$bad=Make-Smbios;for($i=0;$i -lt 16;$i++){$bad[16+$i]=[byte]$value};$extraBad.Add($bad)}
[byte[]]$bad=Make-Smbios;$bad[12]=99;$extraBad.Add($bad)
[byte[]]$bad=Make-Smbios;$bad[9]=3;$extraBad.Add($bad)
[byte[]]$bad=Make-Smbios;$bad=$bad[0..($bad.Length-7)];[BitConverter]::GetBytes([uint32]($bad.Length-8)).CopyTo($bad,4);$extraBad.Add($bad)
[byte[]]$one=Make-Smbios;$payload=$one[8..($one.Length-7)];[byte[]]$bad=[byte[]]::new(8+2*$payload.Length+6);$bad[1]=2;$bad[2]=5;[BitConverter]::GetBytes([uint32]($bad.Length-8)).CopyTo($bad,4);$payload.CopyTo($bad,8);$payload.CopyTo($bad,8+$payload.Length);([byte[]]@(127,4,0,0,0,0)).CopyTo($bad,$bad.Length-6);$extraBad.Add($bad)
foreach($bad in $extraBad){$rejected=$false;try{[void][CommunityTours.Setup026.SmbiosContract]::Fingerprint($bad)}catch{$rejected=$true};if(-not $rejected){throw 'MALFORMED_SMBIOS_ACCEPTED'};$checks.Add([pscustomobject]@{case='SMBIOS-zero-foreign-duplicate-or-invalid-record';passed=$true;fixture=$true})}
[pscustomobject]@{scope='synthetic-acceptance-only';productionAuthorized=$false;tests=$checks.Count;passed=$checks.Count;checks=$checks.ToArray();contractsCompiledAndExecuted=$true;stopScmCallbacksSimulated=$true;serviceCalled=$false;jobCreated=$false;childTokenValidated=$false;vmFirmwareValidated=$false} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $Base 'query-stop-contract-tests.json') -Encoding utf8
"Query/stop/SMBIOS contract cases passed: $($checks.Count)"
