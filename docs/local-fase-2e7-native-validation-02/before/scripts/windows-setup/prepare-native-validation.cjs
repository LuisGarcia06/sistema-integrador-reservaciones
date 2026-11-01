'use strict';
// Build/package only. Never runs SetupPostgres, PostgreSQL, UAC or SCM.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),native=path.join(root,'scripts/windows-setup-native');
const base=path.join(root,'docs/local-fase-2e7-native-validation-01');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const scenarios=['suspended','reject-sid','reject-privilege','reject-job','timeout','cancel','job-tree','caller-death','controller-death','host-death'];
function pe(bytes){const offset=bytes.readUInt32LE(60);assert.equal(bytes.readUInt32LE(offset),0x4550);assert.equal(bytes.readUInt16LE(offset+4),0x8664);assert.equal(bytes.readUInt16LE(offset+24),0x20b);return {machine:'AMD64',optionalHeader:'PE32+',isDll:!!(bytes.readUInt16LE(offset+22)&0x2000)};}
function build(){
 assert.equal(process.platform,'win32');assert.equal(process.arch,'x64');
 const out=path.join(base,'026-native-validation-01');assert.equal(fs.existsSync(out),false,'Do not replace a delivered kit. Use a new version.');
 const compiler='C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';assert.ok(fs.existsSync(compiler));
 const files=fs.readdirSync(native).filter(f=>/^OptionC.*\.cs$/.test(f)||f==='SetupPostgres.cs').sort();
 const sources=files.map(file=>({file:'scripts/windows-setup-native/'+file,sha256:sha(fs.readFileSync(path.join(native,file)))}));
 fs.mkdirSync(out);const exe=path.join(out,'SetupPostgres.exe');
 const common=['/nologo','/platform:x64','/optimize+','/warnaserror+','/reference:System.Management.dll','/reference:System.ServiceProcess.dll','/reference:System.Web.Extensions.dll','/reference:System.Security.dll'];
 function compile(args,log){const result=cp.spawnSync(compiler,[...common,...args,...files.map(f=>path.join(native,f))],{shell:false,windowsHide:true,encoding:'utf8',timeout:60000});fs.writeFileSync(path.join(base,log),(result.stdout||'')+(result.stderr||''),{flag:'wx'});assert.ifError(result.error);assert.equal(result.status,0,'Compiler failed; preserve output and inspect compile log.');}
 compile(['/target:exe','/define:NATIVE_VALIDATION_ONLY','/main:CommunityTours.Setup026.SetupPostgres','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/win32manifest:'+path.join(native,'SetupPostgres.manifest'),'/out:'+exe],'compile-validation.log');
 compile(['/target:library','/out:'+path.join(base,'OptionCExecutor.delivery-review.dll')],'compile-production-library.log');
 const host=fs.readFileSync(exe),hostSha256=sha(host);assert.equal(pe(host).isDll,false);
 fs.writeFileSync(path.join(out,'validation-approval.json'),JSON.stringify({protocol:'ctsk-optionc-validation-v1',scope:'synthetic-acceptance-only',productionAuthorized:false,validationOnly:true,writeOperationsAuthorized:false,hostSha256,scenarios},null,2),{flag:'wx'});
 fs.copyFileSync(path.join(root,'docs/PRUEBA-NATIVA-OPCION-C-VIRTUALBOX-01.md'),path.join(out,'LEEME.md'),fs.constants.COPYFILE_EXCL);
 fs.copyFileSync(path.join(__dirname,'observe-native-validation.ps1'),path.join(out,'Observar-Prueba.ps1'),fs.constants.COPYFILE_EXCL);
 // Ship reviewable source and manifest. No binary or source from quarantine is read.
 const sourceDir=path.join(out,'fuentes');fs.mkdirSync(sourceDir);
 for(const file of [...files,'SetupPostgres.manifest'])fs.copyFileSync(path.join(native,file),path.join(sourceDir,file),fs.constants.COPYFILE_EXCL);
 for(const record of sources)assert.equal(sha(fs.readFileSync(path.join(root,record.file))),record.sha256);
 const inventory={protocol:'ctsk-optionc-validation-kit-v1',scope:'synthetic-acceptance-only',productionAuthorized:false,validationOnly:true,postgresIncluded:false,installer:false,windows11Validated:false,hostSha256,PE:pe(host),sources,selfExcluded:['kit-inventory.json','SHA256SUMS.txt'],files:[]};
 function tree(dir,relative=''){for(const e of fs.readdirSync(dir,{withFileTypes:true})){assert.equal(e.isSymbolicLink(),false);const rel=path.posix.join(relative,e.name);if(e.isDirectory())tree(path.join(dir,e.name),rel);else inventory.files.push({file:rel,sha256:sha(fs.readFileSync(path.join(dir,e.name)))});}}tree(out);
 fs.writeFileSync(path.join(out,'kit-inventory.json'),JSON.stringify(inventory,null,2),{flag:'wx'});
 fs.writeFileSync(path.join(out,'SHA256SUMS.txt'),[...inventory.files,{file:'kit-inventory.json',sha256:sha(fs.readFileSync(path.join(out,'kit-inventory.json')))}].map(v=>v.sha256+'  '+v.file).join('\n')+'\n',{flag:'wx'});
 fs.writeFileSync(path.join(base,'build-report.json'),JSON.stringify({scope:inventory.scope,productionAuthorized:false,validationOnly:true,hostSha256,PE:pe(host),compiled:true,nativeExecuted:false,servicesCreated:false,postgresExecuted:false,windows11Validated:false,compiler,sourceCount:sources.length,sources,productionLibrarySha256:sha(fs.readFileSync(path.join(base,'OptionCExecutor.delivery-review.dll')))},null,2),{flag:'wx'});
 console.log(JSON.stringify({out,hostSha256,files:inventory.files.length,nativeExecuted:false}));return inventory;
}
if(require.main===module)build();module.exports={pe,scenarios};
