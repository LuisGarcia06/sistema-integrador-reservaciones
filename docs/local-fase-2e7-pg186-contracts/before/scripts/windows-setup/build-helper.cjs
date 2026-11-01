'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const I=require('./integrity.cjs'),P=require('./policy.cjs');
const root=path.resolve(__dirname,'../..');
function build(name){
 if(!/^026-setup-\d{2}$/.test(name))throw Error('NEW_HELPER_VERSION');
 const out=path.join(root,'dist/windows-setup',name);fs.mkdirSync(out,{recursive:false});
 const app=path.join(out,'resources/app');fs.mkdirSync(app,{recursive:true});
 const electron=path.join(root,'node_modules/electron/dist');assert.equal(fs.readFileSync(path.join(electron,'version'),'utf8').trim(),'43.4.1');
 for(const entry of fs.readdirSync(electron)){
  if(entry==='resources'||entry==='electron.exe')continue;
  fs.cpSync(path.join(electron,entry),path.join(out,entry),{recursive:true,errorOnExist:true,force:false});
 }
 for(const entry of fs.readdirSync(path.join(electron,'resources')))if(entry!=='default_app.asar')fs.cpSync(path.join(electron,'resources',entry),path.join(out,'resources',entry),{recursive:true,errorOnExist:true,force:false});
 fs.copyFileSync(path.join(electron,'electron.exe'),path.join(out,'Configuracion-026.exe'));
 fs.copyFileSync(process.execPath,path.join(out,'node.exe'));
 fs.copyFileSync(path.join(root,'docs/local-fase-2e7/node-v22.20.0-LICENSE.txt'),path.join(out,'LICENSE-node.txt'));
 const files=['main.js','preload.js','worker.cjs','policy.cjs','integrity.cjs','state.cjs','coordinator.cjs','crypto-material.cjs','private-directories.ps1','console-stage.ps1'];
 for(const file of files)fs.copyFileSync(path.join(__dirname,file),path.join(app,file));
 fs.cpSync(path.join(__dirname,'ui'),path.join(app,'ui'),{recursive:true});
 fs.copyFileSync(path.join(root,'shared/windowsProcess.js'),path.join(app,'windowsProcess.js'));
 fs.copyFileSync(path.join(root,'scripts/windows-installers/payload.cjs'),path.join(app,'payload.cjs'));
 fs.writeFileSync(path.join(app,'package.json'),JSON.stringify({name:'ctsk-setup026-vm',version:'0.0.1',private:true,main:'main.js'}));
 const report=JSON.parse(fs.readFileSync(path.join(root,'docs/local-fase-2e7',P.RELEASE+'-build-report.json')));
 fs.writeFileSync(path.join(app,'candidate-reference.json'),JSON.stringify(Object.fromEntries(['server','client'].map(side=>[side,{inventorySha256:report.payloads[side].inventorySha256,installerSha256:report.installers[side].sha256}]))));
 const origin='C:/Program Files/Git/mingw64/bin',cryptoDir=path.join(out,'crypto');fs.mkdirSync(cryptoDir);const copied=new Set();
 function dependency(name){
  name=name.toLowerCase();if(copied.has(name))return;copied.add(name);
  const original=path.join(origin,name),dest=path.join(cryptoDir,name);fs.copyFileSync(original,dest);
  for(const imported of I.imports(dest)){
   if(fs.existsSync(path.join(origin,imported)))dependency(imported);
   else if(!/^api-ms-win-|^ext-ms-win-/i.test(imported)&&!fs.existsSync(path.join(process.env.SystemRoot,'System32',imported)))throw Error('UNRESOLVED_DLL:'+imported);
  }
 }
 dependency('openssl.exe');
 const licenses=path.join(out,'licenses');fs.mkdirSync(licenses);
 for(const name of ['openssl','zlib','libwinpthread','gcc-libs']){
  const original=path.join('C:/Program Files/Git/mingw64/share/licenses',name);
  if(fs.existsSync(original))fs.cpSync(original,path.join(licenses,name),{recursive:true});
 }
 const env={SystemRoot:process.env.SystemRoot,PATH:path.join(process.env.SystemRoot,'System32'),OPENSSL_CONF:'NUL'};
 const opensslVersion=cp.execFileSync(path.join(cryptoDir,'openssl.exe'),['version'],{env,encoding:'utf8',windowsHide:true,timeout:10000}).trim();
 fs.copyFileSync(path.join(root,'docs/ASISTENTE-CONFIGURACION-026.md'),path.join(out,'LEEME.md'));
 const inventory={protocol:'ctsk-setup-integrity-v1',name,candidate:P.RELEASE,productionAuthorized:false,scope:P.SCOPE,node:process.version,electron:'43.4.1',opensslVersion,nativeCryptoFiles:[...copied],files:I.tree(out)};
 fs.writeFileSync(path.join(out,'helper-inventory.json'),JSON.stringify(inventory,null,2),{flag:'wx'});I.verify(out);
 const zip=out+'.zip',extractor=path.join(root,'dist/windows-2e7/audit-tools/7zip-26.05/7z.exe');
 cp.execFileSync(extractor,['a','-tzip',zip,'.'],{cwd:out,windowsHide:true,stdio:'pipe'});cp.execFileSync(extractor,['t',zip],{windowsHide:true,stdio:'pipe'});
 const result={name,candidate:P.RELEASE,directory:out,file:zip,bytes:fs.statSync(zip).size,sha256:I.sha(fs.readFileSync(zip)),opensslVersion,nativeCryptoFiles:[...copied],windows11Acceptance:'pending',productionAuthorized:false};
 fs.writeFileSync(out+'-report.json',JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result,null,2));return result;
}
if(require.main===module)build(process.argv[2]);
module.exports={build};
