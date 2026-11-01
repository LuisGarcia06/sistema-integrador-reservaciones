$ErrorActionPreference='Stop'
$machine=(Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Cryptography' -Name MachineGuid).MachineGuid
$hash=[Security.Cryptography.SHA256]::Create()
$id=([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($machine)))).Replace('-','').ToLowerInvariant()
$adapters=@(Get-NetAdapter | Where-Object Status -eq 'Up')
if($adapters.Count -ne 1){throw 'LAN_SINGLE_ADAPTER_REQUIRED'}
$adapter=$adapters[0]
$ip=@(Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 | Where-Object AddressState -eq 'Preferred')
if($ip.Count -ne 1){throw 'LAN_SINGLE_IPV4_REQUIRED'}
$profile=Get-NetConnectionProfile -InterfaceIndex $adapter.ifIndex
$gateway=@(Get-NetRoute -InterfaceIndex $adapter.ifIndex | Where-Object {$_.DestinationPrefix -in @('0.0.0.0/0','::/0')} | ForEach-Object NextHop)
$dns=@(Get-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex | ForEach-Object ServerAddresses)
[ordered]@{machine=$id;adapter=([string]$adapter.InterfaceGuid).Trim('{}').ToLowerInvariant();address=$ip[0].IPAddress;prefix=[int]$ip[0].PrefixLength;category=[string]$profile.NetworkCategory;gateways=$gateway;dns=$dns;activeAdapters=$adapters.Count}|ConvertTo-Json -Compress
