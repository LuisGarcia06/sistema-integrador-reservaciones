'use strict';
// Compiles both profiles, tests pure C# dispatch and inspects PE/IL. Never executes the host.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function verifyBinary(exe,library){
 assert.equal(exe.loadedByOsLoader,false);assert.equal(exe.targetExecuted,false);assert.equal(exe.machine,'Amd64');assert.equal(exe.subsystem,'WindowsGui');
 assert.equal(exe.entryPointName,'CommunityTours.Setup026.SetupPostgres.Main');
 const method=(type,name)=>exe.methods.find(m=>m.type===type&&m.name===name),calls=m=>(m?.calls||[]).map(x=>x.target);
 const main=method('CommunityTours.Setup026.SetupPostgres','Main'),entry=method('CommunityTours.Setup026.NativeValidation','Entry'),graphical=method('CommunityTours.Setup026.NativeValidation','OpenGraphical'),request=method('CommunityTours.Setup026.NativeValidation','ReadRequest');
 assert.ok(main.attributes.includes('System.STAThreadAttribute..ctor'));
 assert.ok(calls(main).includes('CommunityTours.Setup026.BootstrapService.Dispatch'));
 assert.ok(calls(main).indexOf('CommunityTours.Setup026.BootstrapService.Dispatch')<calls(main).indexOf('CommunityTours.Setup026.NativeValidation.Entry'));
 assert.ok(calls(main).includes('CommunityTours.Setup026.NativeValidation.Entry'));
 assert.ok(calls(entry).includes('CommunityTours.Setup026.ValidationEntry.Dispatch'));
 assert.ok(entry.calls.some(c=>c.opcode==='ldftn'&&c.target==='CommunityTours.Setup026.NativeValidation.OpenGraphical'));
 assert.ok(calls(graphical).includes('CommunityTours.Setup026.NativeValidation.Permit'));
 assert.ok(calls(graphical).indexOf('CommunityTours.Setup026.NativeValidation.Permit')<calls(graphical).indexOf('System.Windows.Forms.Application.Run'));
 assert.ok(calls(graphical).includes('System.Windows.Forms.Application.Run'));
 assert.ok(calls(graphical).includes('CommunityTours.Setup026.NativeValidation+ValidationWindow..ctor'));
 assert.ok(calls(request).includes('CommunityTours.Setup026.NativeValidation.Permit'));
 assert.ok(exe.methods.some(m=>m.name.includes('Entry')&&calls(m).includes('CommunityTours.Setup026.Elevation.Elevated')));
 const ctor=method('CommunityTours.Setup026.NativeValidation+ValidationWindow','.ctor');assert.ok(ctor);assert.ok(calls(ctor).every(c=>!c.includes('ServiceRegistration.')&&!c.includes('Elevation.Launch')&&!c.endsWith('NativeValidation.Run')));
 assert.ok(exe.types.includes('CommunityTours.Setup026.ValidationEntry'));
 assert.ok(!exe.methods.some(m=>m.type==='CommunityTours.Setup026.SetupPostgres'&&m.name==='Run'));
 assert.equal(library.entryPointToken,0);assert.ok(!library.types.includes('CommunityTours.Setup026.NativeValidation'));assert.ok(!library.types.includes('CommunityTours.Setup026.ValidationEntry'));
 return true;
}
function build(options={}){
 const version=options.version||'03';assert.ok(['03','04'].includes(version));const base=path.join(root,'docs/local-fase-2e7-native-validation-'+version);
 assert.equal(process.platform,'win32');const out=path.join(base,'026-native-validation-'+version);assert.equal(fs.existsSync(out),false,'Never overwrite a delivered kit.');
 const compiler='C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',pwsh='C:\\Users\\luisg\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\pwsh.exe';
 assert.ok(fs.existsSync(compiler));assert.ok(fs.existsSync(pwsh));
 const native=path.join(root,'scripts/windows-setup-native'),sources=fs.readdirSync(native).filter(n=>/^OptionC.*\.cs$/.test(n)||n==='SetupPostgres.cs').sort().map(n=>({file:'scripts/windows-setup-native/'+n,sha256:sha(fs.readFileSync(path.join(native,n)))}));
 fs.mkdirSync(out);const exe=path.join(out,'SetupPostgres.exe'),library=path.join(base,'OptionCExecutor.production-review.dll'),commands=[];
 function run(file,args,log){commands.push({file,args});const r=cp.spawnSync(file,args,{cwd:root,shell:false,windowsHide:true,encoding:'utf8',timeout:60000});fs.writeFileSync(path.join(base,log),(r.stdout||'')+(r.stderr||''),{flag:'wx'});assert.ifError(r.error);assert.equal(r.status,0,log+': '+r.stdout+r.stderr);}
 const common=['/nologo','/platform:x64','/optimize+','/warnaserror+','/reference:System.Management.dll','/reference:System.ServiceProcess.dll','/reference:System.Web.Extensions.dll','/reference:System.Security.dll'];
 run(compiler,[...common,'/target:winexe','/define:NATIVE_VALIDATION_ONLY','/main:CommunityTours.Setup026.SetupPostgres','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/win32manifest:'+path.join(native,'SetupPostgres.manifest'),'/out:'+exe,...sources.map(s=>path.join(root,s.file))],'compile-validation.log');assert.ok(fs.existsSync(exe));
 run(compiler,[...common,'/target:library','/out:'+library,...sources.map(s=>path.join(root,s.file))],'compile-production.log');assert.ok(fs.existsSync(library));
 const inspect=path.join(root,'scripts/windows-setup/inspect-validation-entry.ps1');
 run(pwsh,['-NoProfile','-File',inspect,'-File',exe,'-Output',path.join(base,'V'+version+'-binary-entry.json')],'inspect-validation.log');
 run(pwsh,['-NoProfile','-File',inspect,'-File',library,'-Output',path.join(base,'production-binary-entry.json')],'inspect-production.log');
 run(pwsh,['-NoProfile','-File',path.join(root,'scripts/windows-setup/test-validation-entry.ps1'),'-Source',path.join(native,'OptionCValidationEntry.cs'),'-Output',path.join(base,'managed-entry-build-tests.json')],'managed-entry-tests.log');
 const exeReport=JSON.parse(fs.readFileSync(path.join(base,'V'+version+'-binary-entry.json'))),libReport=JSON.parse(fs.readFileSync(path.join(base,'production-binary-entry.json')));verifyBinary(exeReport,libReport);
 if(version==='04')run(pwsh,['-NoProfile','-File',path.join(root,'scripts/windows-setup/test-token-stop-contracts.ps1'),'-Base',base],'query-stop-tests.log');
 const tests=JSON.parse(fs.readFileSync(path.join(base,'managed-entry-build-tests.json')));assert.equal(tests.tests,12);assert.equal(tests.passed,12);assert.equal(tests.actualGuiOpened,false);assert.equal(tests.scmCalled,false);
 for(const row of sources)assert.equal(sha(fs.readFileSync(path.join(root,row.file))),row.sha256);
 const hostHash=sha(fs.readFileSync(exe));assert.equal(exeReport.sha256,hostHash);
 fs.writeFileSync(path.join(out,'validation-approval.json'),JSON.stringify({protocol:'ctsk-optionc-validation-v1',scope:'synthetic-acceptance-only',productionAuthorized:false,validationOnly:true,writeOperationsAuthorized:false,hostSha256:hostHash,scenarios:['suspended']},null,2),{flag:'wx'});
 fs.copyFileSync(path.join(root,version==='04'?'docs/PRUEBA-TOKEN-PARADA-SETUPPOSTGRES-V04.md':'docs/PRUEBA-APERTURA-SETUPPOSTGRES-V03.md'),path.join(out,'LEEME.md'),fs.constants.COPYFILE_EXCL);
 fs.copyFileSync(path.join(root,'scripts/windows-setup/export-scm-start-evidence.ps1'),path.join(out,'Exportar-Evidencia-SCM.ps1'),fs.constants.COPYFILE_EXCL);
 fs.mkdirSync(path.join(out,'fuentes'));for(const row of sources)fs.copyFileSync(path.join(root,row.file),path.join(out,'fuentes',path.basename(row.file)),fs.constants.COPYFILE_EXCL);
 fs.copyFileSync(path.join(native,'SetupPostgres.manifest'),path.join(out,'fuentes/SetupPostgres.manifest'),fs.constants.COPYFILE_EXCL);
 const files=[];function walk(dir,relative=''){for(const e of fs.readdirSync(dir,{withFileTypes:true})){assert.equal(e.isSymbolicLink(),false);const rel=path.posix.join(relative,e.name);if(e.isDirectory())walk(path.join(dir,e.name),rel);else files.push({file:rel,sha256:sha(fs.readFileSync(path.join(dir,e.name)))});}}walk(out);
 const inventory={protocol:'ctsk-optionc-validation-kit-v1',revision:version==='04'?'04-token-query-stop':'03-graphical-entry',buildProfile:version==='04'?'native-validation-only-v04-token-query-stop':'native-validation-only-v03-graphical-entry',scope:'synthetic-acceptance-only',productionAuthorized:false,validationOnly:true,installer:false,postgresIncluded:false,scenarios:['suspended'],windows11GuiValidated:false,scmValidated:false,firstTokenValidated:false,jobValidated:false,hostSha256:hostHash,binaryEntryVerified:true,subsystem:'WindowsGui',sources,selfExcluded:['kit-inventory.json','SHA256SUMS.txt'],files};
 const inv=JSON.stringify(inventory,null,2);fs.writeFileSync(path.join(out,'kit-inventory.json'),inv,{flag:'wx'});fs.writeFileSync(path.join(out,'SHA256SUMS.txt'),[...files,{file:'kit-inventory.json',sha256:sha(inv)}].map(r=>r.sha256+'  '+r.file).join('\n')+'\n',{flag:'wx'});
 fs.writeFileSync(path.join(base,'build-report.json'),JSON.stringify({scope:inventory.scope,productionAuthorized:false,hostSha256:hostHash,commands,sources,nativeHostExecuted:false,actualGuiOpened:false,managedEntryTests:12,binaryEntryVerified:true,subsystem:'WindowsGui',productionLibrarySha256:sha(fs.readFileSync(library))},null,2),{flag:'wx'});
 console.log(JSON.stringify({out,hostSha256:hostHash,binaryEntryVerified:true,managedEntryTests:12,nativeHostExecuted:false}));return inventory;
}
if(require.main===module)build();module.exports={build,verifyBinary};
