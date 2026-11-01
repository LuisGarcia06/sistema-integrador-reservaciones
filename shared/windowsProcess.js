'use strict';
const path = require('node:path');
const cp = require('node:child_process');

// Reglas CRT/CreateProcess; nunca componer una orden cmd.exe con estos valores.
function quoteArgument(value) {
  if (typeof value !== 'string' || /[\0\r\n]/.test(value)) throw Error('WINDOWS_ARGUMENT');
  return '"' + value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1') + '"';
}
function commandLine(args) {
  if (!Array.isArray(args)) throw Error('WINDOWS_ARGUMENTS');
  return args.map(quoteArgument).join(' ');
}
// Script constante; parámetros, cwd y entorno via JSON por stdin. Sin evaluación.
const PROCESS_SCRIPT = `$ErrorActionPreference='Stop'
[Console]::InputEncoding=New-Object Text.UTF8Encoding($false)
try {
 $v=ConvertFrom-Json ([Console]::In.ReadToEnd())
 $s=New-Object System.Diagnostics.ProcessStartInfo
 $s.FileName=$v.exe; $s.Arguments=$v.commandLine
 $s.UseShellExecute=$false; $s.CreateNoWindow=$true
 if ($v.cwd) { $s.WorkingDirectory=$v.cwd }
 foreach ($entry in $v.environment.PSObject.Properties) { $s.EnvironmentVariables[$entry.Name]=[string]$entry.Value }
 $p=[Diagnostics.Process]::Start($s)
 $p.WaitForExit(); exit $p.ExitCode
} catch { [Console]::Error.WriteLine('WINDOWS_PROCESS_FAILED'); exit 1 }`;
function runHidden(exe, args, { env, cwd, environment = {}, timeout = 45000,
  run = cp.execFileSync, systemRoot = process.env.SystemRoot || 'C:\\Windows' } = {}) {
  if (!path.win32.isAbsolute(exe) || (cwd && !path.win32.isAbsolute(cwd))) throw Error('WINDOWS_PROCESS_PATH');
  if (Object.entries(environment).some(([k,v]) => !/^[A-Z_]+$/.test(k) || typeof v !== 'string' || /[\0\r\n]/.test(v))) throw Error('WINDOWS_PROCESS_ENV');
  return run(path.join(systemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(PROCESS_SCRIPT, 'utf16le').toString('base64')],
    { input: JSON.stringify({ exe, commandLine: commandLine(args), cwd, environment }),
      env, windowsHide: true, timeout, stdio: 'pipe' });
}
module.exports = { quoteArgument, commandLine, PROCESS_SCRIPT, runHidden };
