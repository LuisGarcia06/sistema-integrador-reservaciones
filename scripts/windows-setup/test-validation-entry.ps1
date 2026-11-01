# Executes only the pure C# entry selector, with in-memory callbacks. No host/service/GUI launch.
param([Parameter(Mandatory=$true)][string]$Source,[Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference='Stop'
Add-Type -Path $Source -CompilerOptions '/define:NATIVE_VALIDATION_ONLY'
$checks=[Collections.Generic.List[object]]::new()
function Assert-Route([string[]]$Arguments,[string]$Expected,[int]$ReturnValue) {
    $trace=[Collections.Generic.List[string]]::new()
    [Action]$context={ $trace.Add('context') }
    [Func[int]]$gui={ $trace.Add('graphical'); return 31 }
    [Func[int]]$request={ $trace.Add('request'); return 32 }
    [Func[int]]$elevated={ $trace.Add('elevated'); return 33 }
    [Func[int]]$child={ $trace.Add('child'); return 34 }
    $actual=[CommunityTours.Setup026.ValidationEntry]::Dispatch($Arguments,$context,$gui,$request,$elevated,$child)
    if ($actual -ne $ReturnValue -or ($trace -join ',') -ne "context,$Expected") { throw "WRONG_ROUTE: $Expected" }
    $checks.Add([pscustomobject]@{ arguments=$Arguments; selected=$Expected; trace=$trace.ToArray(); passed=$true })
}
Assert-Route -Arguments @() -Expected graphical -ReturnValue 31
Assert-Route -Arguments @('--request') -Expected request -ReturnValue 32
Assert-Route -Arguments @('--elevated-request','bound-request.json','bound-hash') -Expected elevated -ReturnValue 33
Assert-Route -Arguments @('--trial-child','bound-uuid','wait') -Expected child -ReturnValue 34
$invalid=@(@('--request','extra'),@('--elevated-request'),@('--elevated-request','file'),@('--trial-child','uuid'),@('--service-instance','uuid'),@('--unknown'),@('unexpected'),@('--request','extra','extra'))
foreach ($arguments in $invalid) {
    $trace=[Collections.Generic.List[string]]::new();[Action]$ctx={ $trace.Add('context') };[Func[int]]$callback={ $trace.Add('unexpected'); return 99 };$rejected=$false
    try { [void][CommunityTours.Setup026.ValidationEntry]::Dispatch([string[]]$arguments,$ctx,$callback,$callback,$callback,$callback) }
    catch { if ($_.Exception.InnerException.Message -ne 'VALIDATION_ARGUMENTS') { throw };$rejected=$true }
    if (-not $rejected -or $trace.Count -ne 0) { throw 'INVALID_ROUTE_HAD_SIDE_EFFECT' }
    $checks.Add([pscustomobject]@{ arguments=$arguments; rejected=$true; callbacks=0; passed=$true })
}
[pscustomobject]@{ scope='synthetic-acceptance-only'; productionAuthorized=$false; tests=$checks.Count; passed=$checks.Count; checks=$checks.ToArray(); realSelectorCompiledAndExecuted=$true; callbacksSimulated=$true; nativeHostExecuted=$false; actualGuiOpened=$false; scmCalled=$false; uacCalled=$false } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $Output -Encoding utf8
"Managed entry routes passed: $($checks.Count)"
