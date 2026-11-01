'use strict';
// Package the inspected offline compilation. No native process execution or SCM calls.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {pe}=require('./prepare-native-validation.cjs'),root=path.resolve(__dirname,'../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function prepare(){
 const base=path.join(root,'docs/local-fase-2e7-native-validation-02'),out=path.join(base,'026-native-validation-02');
 assert.equal(fs.existsSync(out),false,'New delivery only; never replace an existing kit.');
 const snapshot=JSON.parse(fs.readFileSync(path.join(base,'compile-source-snapshot.json')));
 for(const row of snapshot.sources)assert.equal(sha(fs.readFileSync(path.join(root,row.file))),row.sha256,'Source changed since offline compilation: '+row.file);
 const host=fs.readFileSync(path.join(base,snapshot.exe));assert.equal(sha(host),snapshot.hostSha256);assert.equal(pe(host).isDll,false);
 assert.ok(host.includes(Buffer.from('SCM_CALL_ACCEPTED_IS_NOT_FAILURE','utf16le')));
 assert.ok(host.includes(Buffer.from('scm-start-call.json','utf16le')));
 assert.ok(!host.includes(Buffer.from('NATIVE_ARGUMENTS','utf16le')));
 fs.mkdirSync(out);fs.writeFileSync(path.join(out,'SetupPostgres.exe'),host,{flag:'wx'});
 fs.writeFileSync(path.join(out,'validation-approval.json'),JSON.stringify({protocol:'ctsk-optionc-validation-v1',scope:'synthetic-acceptance-only',productionAuthorized:false,validationOnly:true,writeOperationsAuthorized:false,hostSha256:snapshot.hostSha256,scenarios:['suspended']},null,2),{flag:'wx'});
 const copies=[['docs/PRUEBA-SCM-SETUPPOSTGRES-VIRTUALBOX-02.md','LEEME.md'],['scripts/windows-setup/export-scm-start-evidence.ps1','Exportar-Evidencia-SCM.ps1'],['scripts/windows-setup/observe-native-validation.ps1','Observar-Prueba.ps1']];
 for(const [from,to]of copies)fs.copyFileSync(path.join(root,from),path.join(out,to),fs.constants.COPYFILE_EXCL);
 fs.mkdirSync(path.join(out,'fuentes'));for(const row of snapshot.sources)fs.copyFileSync(path.join(root,row.file),path.join(out,'fuentes',path.basename(row.file)),fs.constants.COPYFILE_EXCL);
 fs.copyFileSync(path.join(root,'scripts/windows-setup-native/SetupPostgres.manifest'),path.join(out,'fuentes/SetupPostgres.manifest'),fs.constants.COPYFILE_EXCL);
 const files=[];function walk(dir,relative=''){for(const e of fs.readdirSync(dir,{withFileTypes:true})){assert.equal(e.isSymbolicLink(),false);const rel=path.posix.join(relative,e.name);if(e.isDirectory())walk(path.join(dir,e.name),rel);else files.push({file:rel,sha256:sha(fs.readFileSync(path.join(dir,e.name)))});}}walk(out);
 const inventory={protocol:'ctsk-optionc-validation-kit-v1',scope:'synthetic-acceptance-only',productionAuthorized:false,validationOnly:true,scenarios:['suspended'],revision:'02-scm-start',postgresIncluded:false,installer:false,windows11Validated:false,hostSha256:snapshot.hostSha256,PE:pe(host),sources:snapshot.sources,selfExcluded:['kit-inventory.json','SHA256SUMS.txt'],files};
 const inv=JSON.stringify(inventory,null,2);fs.writeFileSync(path.join(out,'kit-inventory.json'),inv,{flag:'wx'});fs.writeFileSync(path.join(out,'SHA256SUMS.txt'),[...files,{file:'kit-inventory.json',sha256:sha(inv)}].map(r=>r.sha256+'  '+r.file).join('\n')+'\n',{flag:'wx'});
 console.log(JSON.stringify({out,hostSha256:snapshot.hostSha256,files:files.length,nativeHostExecuted:false,postgresExecuted:false,productionAuthorized:false}));return inventory;
}
if(require.main===module)prepare();module.exports={prepare};
