param([Parameter(Mandatory=$true)][string]$Request)
$ErrorActionPreference='Stop'
[Console]::InputEncoding=New-Object Text.UTF8Encoding($false)
try {
 if ([Environment]::OSVersion.Version.Build -lt 22000 -or -not [Environment]::Is64BitOperatingSystem) { throw 'VM_REQUIRED' }
 $machine=Get-CimInstance Win32_ComputerSystem
 if ($machine.Model -ne 'VirtualBox' -or $machine.Manufacturer -notmatch '^(Oracle Corporation|innotek GmbH)$') { throw 'VIRTUALBOX_REQUIRED' }
 $v=ConvertFrom-Json $Request
 $local=[IO.Path]::GetFullPath($env:LOCALAPPDATA)
 $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 if ($v.paths.Count -ne 3 -or @($v.paths|Select-Object -Unique).Count -ne 3) { throw 'REQUEST_REJECTED' }
 foreach ($p in $v.paths) {
  if ([IO.Path]::GetFileName($p) -notmatch '^ctsk-(setup026-2e7-candidate-04|client026-2e7-candidate-04|server026-[a-f0-9-]{36})$') { throw 'REQUEST_REJECTED' }
  if ([IO.Path]::GetDirectoryName($p) -cne $local -or (Test-Path -LiteralPath $p)) { throw 'NEW_DIRECTORY_REQUIRED' }
 }
 foreach ($p in $v.paths) {
  $acl=New-Object Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true,$false)
  $acl.SetOwner([Security.Principal.SecurityIdentifier]::new($sid))
  foreach ($trusted in @($sid,'S-1-5-18','S-1-5-32-544')) {
   $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($trusted),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
  }
  $dir=New-Object IO.DirectoryInfo($p)
  $dir.Create($acl)
 }
 [Console]::WriteLine('PRIVATE_DIRECTORIES_CREATED')
} catch { [Console]::Error.WriteLine('PRIVATE_DIRECTORIES_REJECTED'); exit 1 }
