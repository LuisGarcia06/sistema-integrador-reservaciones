# Reads PE/CLI metadata and IL without Assembly.Load or execution of the target.
param([Parameter(Mandatory=$true)][string]$File,[Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Reflection.Metadata
if (-not ('EntryMetadataBridge' -as [type])) {
Add-Type -ReferencedAssemblies ([Reflection.Metadata.EntityHandle].Assembly.Location) -TypeDefinition @"
using System.Reflection.Metadata;
using System.Reflection.Metadata.Ecma335;
public static class EntryMetadataBridge {
    public static int EntityToken(EntityHandle h) { return MetadataTokens.GetToken(h); }
    public static int MethodToken(MethodDefinitionHandle h) { return MetadataTokens.GetToken(h); }
}
"@
}
$stream=[IO.File]::OpenRead([IO.Path]::GetFullPath($File))
$pe=[Reflection.PortableExecutable.PEReader]::new($stream)
try {
    $md=[Reflection.Metadata.PEReaderExtensions]::GetMetadataReader($pe)
    $opcodes=@{}
    foreach ($field in [Reflection.Emit.OpCodes].GetFields([Reflection.BindingFlags]'Public,Static')) { $op=$field.GetValue($null);$opcodes[([int]$op.Value -band 65535)]=$op }
    function Type-Name($Handle) {
        $type=$md.GetTypeDefinition($Handle);$name=$md.GetString($type.Name);$parent=$type.GetDeclaringType()
        if (-not $parent.IsNil) { return (Type-Name $parent)+'+'+$name }
        $namespace=$md.GetString($type.Namespace);if ($namespace) { return $namespace+'.'+$name };return $name
    }
    function Method-Name([int]$Token) {
        $row=$Token -band 16777215
        switch (($Token -shr 24) -band 255) {
            6 { $m=$md.GetMethodDefinition([Reflection.Metadata.Ecma335.MetadataTokens]::MethodDefinitionHandle($row));return (Type-Name $m.GetDeclaringType())+'.'+$md.GetString($m.Name) }
            10 {
                $m=$md.GetMemberReference([Reflection.Metadata.Ecma335.MetadataTokens]::MemberReferenceHandle($row));$parentToken=[EntryMetadataBridge]::EntityToken($m.Parent);$parentRow=$parentToken -band 16777215
                switch (($parentToken -shr 24) -band 255) {
                    1 { $t=$md.GetTypeReference([Reflection.Metadata.Ecma335.MetadataTokens]::TypeReferenceHandle($parentRow));$name=$md.GetString($t.Namespace)+'.'+$md.GetString($t.Name) }
                    2 { $name=Type-Name ([Reflection.Metadata.Ecma335.MetadataTokens]::TypeDefinitionHandle($parentRow)) }
                    default { $name='type-token:'+('{0:X8}' -f $parentToken) }
                }
                return $name+'.'+$md.GetString($m.Name)
            }
            default { return 'method-token:'+('{0:X8}' -f $Token) }
        }
    }
    $types=[Collections.Generic.List[string]]::new();$methods=[Collections.Generic.List[object]]::new()
    foreach ($handle in $md.TypeDefinitions) {
        $t=$md.GetTypeDefinition($handle);$typeName=Type-Name $handle;$types.Add($typeName)
        foreach ($mh in $t.GetMethods()) {
            $m=$md.GetMethodDefinition($mh);$name=$md.GetString($m.Name)
            if ($m.RelativeVirtualAddress -eq 0) { continue }
            if ($name -notin @('Main','Entry','OpenGraphical','ReadRequest','Dispatch','Run','Initialize','Existing') -and $name -notlike '*Entry*' -and -not ($typeName -like '*ValidationWindow' -and $name -eq '.ctor')) { continue }
            $body=[Reflection.Metadata.PEReaderExtensions]::GetMethodBody($pe,$m.RelativeVirtualAddress)
            [byte[]]$il=$body.GetILBytes();$calls=[Collections.Generic.List[object]]::new();$strings=[Collections.Generic.List[string]]::new();$offset=0
            while ($offset -lt $il.Length) {
                $instructionOffset=$offset;[int]$key=$il[$offset];$offset++
                if ($key -eq 254) { $key=65024+[int]$il[$offset];$offset++ }
                if (-not $opcodes.ContainsKey($key)) { throw "UNKNOWN_IL_OPCODE: $typeName.$name key=$key offset=$instructionOffset" }
                $op=$opcodes[$key];$size=switch ($op.OperandType.ToString()) {
                    InlineNone { 0 }
                    { $_ -in @('ShortInlineI','ShortInlineVar','ShortInlineBrTarget') } { 1 }
                    InlineVar { 2 }
                    { $_ -in @('InlineI','InlineBrTarget','InlineField','InlineMethod','InlineSig','InlineString','InlineTok','InlineType','ShortInlineR') } { 4 }
                    { $_ -in @('InlineI8','InlineR') } { 8 }
                    InlineSwitch { 4+4*[BitConverter]::ToInt32($il,$offset) }
                    default { throw 'UNKNOWN_IL_OPERAND' }
                }
                if ($op.OperandType.ToString() -eq 'InlineMethod') {
                    $token=[BitConverter]::ToInt32($il,$offset);$calls.Add([pscustomobject]@{ offset=$instructionOffset; opcode=$op.Name; target=(Method-Name $token) })
                }
                if ($op.OperandType.ToString() -eq 'InlineString') { $token=[BitConverter]::ToInt32($il,$offset);$strings.Add($md.GetUserString([Reflection.Metadata.Ecma335.MetadataTokens]::UserStringHandle($token -band 16777215))) }
                $offset+=$size
            }
            $attributes=@($m.GetCustomAttributes() | ForEach-Object { $a=$md.GetCustomAttribute($_);Method-Name ([EntryMetadataBridge]::EntityToken($a.Constructor)) })
            $methods.Add([pscustomobject]@{ type=$typeName; name=$name; token=[EntryMetadataBridge]::MethodToken($mh); calls=$calls.ToArray(); strings=$strings.ToArray(); attributes=$attributes; ilSha256=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($il)).ToLowerInvariant() })
        }
    }
    $entry=$pe.PEHeaders.CorHeader.EntryPointTokenOrRelativeVirtualAddress
    [pscustomobject]@{ file=[IO.Path]::GetFullPath($File); sha256=(Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant(); targetExecuted=$false; loadedByOsLoader=$pe.IsLoadedImage; machine=$pe.PEHeaders.CoffHeader.Machine.ToString(); subsystem=$pe.PEHeaders.PEHeader.Subsystem.ToString(); entryPointToken=$entry; entryPointName=$(if($entry -ne 0){Method-Name $entry}else{$null}); types=$types.ToArray(); methods=$methods.ToArray() } | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $Output -Encoding utf8
    "PE/IL metadata inspected without target execution: $File"
} finally { $pe.Dispose();$stream.Dispose() }
