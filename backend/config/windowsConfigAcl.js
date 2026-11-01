const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Lectura exclusivamente. SIDs estables: usuario actual, SYSTEM y Administradores.
// Sin icacls /grant, Set-Acl, secretos en argumentos ni mensajes del subsistema.
const SCRIPT = `
$ErrorActionPreference='Stop'
[Console]::InputEncoding=New-Object Text.UTF8Encoding($false)
try {
 $p=[IO.Path]::GetFullPath([Console]::In.ReadToEnd())
 if (!(Test-Path -LiteralPath $p -PathType Leaf)) { exit 3 }
 $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 $trusted=@($sid,'S-1-5-18','S-1-5-32-544','S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464')
 if ($p.StartsWith('\\\\')) { exit 4 }
 $items=@(); $item=Get-Item -LiteralPath $p -Force
 while ($null -ne $item) { $items+=,$item; $item=$item.Parent; if ($null -eq $item -and $items.Count -eq 1) { $item=(Get-Item -LiteralPath $p -Force).Directory } }
 for ($i=0; $i -lt $items.Count; $i++) {
  $item=$items[$i]
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { exit 4 }
  $acl=Get-Acl -LiteralPath $item.FullName
  if ($acl.Access.Count -eq 0) { exit 4 }
  $owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
  if ($owner -notin $trusted) { exit 4 }
  foreach ($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
   if ($rule.AccessControlType -ne 'Allow') { continue }
   if (($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) -ne 0) { continue }
   if ($rule.IdentityReference.Value -in $trusted) { continue }
   $rights=[int64]$rule.FileSystemRights
   # Archivo: ninguna lectura/escritura ajena. Directorio contenedor: ninguna escritura.
   # Ancestros: impedir borrado/sustitución o cambio de propietario/DACL.
   $mask=if ($i -eq 0) { 2032127 } elseif ($i -eq 1) { 852310 } else { 852032 }
   if (($rights -band $mask) -ne 0) { exit 4 }
  }
 }
 exit 0
} catch { exit 4 }
`;
function checkAcl(filename, { platform = process.platform, run = spawnSync, systemRoot = process.env.SystemRoot || 'C:\\Windows' } = {}) {
    if (platform !== 'win32') throw Object.assign(Error('CONFIG_ACL'), { code: 'CONFIG_ACL' });
    const result = run(path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
        ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(SCRIPT, 'utf16le').toString('base64')],
        { input: filename, encoding: 'utf8', windowsHide: true, timeout: 15000, maxBuffer: 16384 });
    if (!result || result.status !== 0 || result.error != null || result.signal != null)
        throw Object.assign(Error('CONFIG_ACL'), { code: result?.status === 3 && result.error == null && result.signal == null ? 'CONFIG_MISSING' : 'CONFIG_ACL' });
}
module.exports = { checkAcl, SCRIPT };
