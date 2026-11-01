'use strict';
// Copia datos/binarios existentes y el lector nuevo ya compilado. No ejecuta
// Electron, el lector, OpenSSL, PowerShell ni PostgreSQL; no crea instaladores.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const I=require('./integrity.cjs'),P=require('./policy.cjs');
const root=path.resolve(__dirname,'../..'),base=path.join(root,'docs/local-fase-2e7-enrollment-fix');
const out=path.join(base,'026-flow-review-01');
assert.equal(process.version,'v22.20.0');
assert.equal(fs.readFileSync(path.join(root,'node_modules/electron/dist/version'),'utf8').trim(),'43.4.1');
const native=path.join(base,'native-read-only/SetupIdentityAcl.exe');
assert.equal(I.sha(fs.readFileSync(native)),'951dc1a45c290beaff74771e111d9cf99a616200f2429c27212522b15564a6df');
fs.mkdirSync(out,{recursive:false});
const vendor=path.join(root,'node_modules/electron/dist');
function copyVendor(dir,relative=''){
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  assert.equal(entry.isSymbolicLink(),false);const rel=path.posix.join(relative,entry.name);
  if(rel==='resources/default_app.asar')continue;
  const destination=path.join(out,rel==='electron.exe'?'Revision-Configuracion-026.exe':rel);
  if(entry.isDirectory()){fs.mkdirSync(destination,{recursive:true});copyVendor(path.join(dir,entry.name),rel);}
  else fs.copyFileSync(path.join(dir,entry.name),destination,fs.constants.COPYFILE_EXCL);
 }
}
copyVendor(vendor);
fs.copyFileSync(process.execPath,path.join(out,'node.exe'),fs.constants.COPYFILE_EXCL);
fs.copyFileSync(path.join(root,'docs/local-fase-2e7/node-v22.20.0-LICENSE.txt'),path.join(out,'LICENSE-node.txt'),fs.constants.COPYFILE_EXCL);
const app=path.join(out,'resources/app');fs.mkdirSync(app,{recursive:true});
for(const file of ['main.js','preload.js','worker.cjs','policy.cjs','coordinator.cjs','integrity.cjs','readiness.cjs','native-readiness.cjs'])fs.copyFileSync(path.join(__dirname,file),path.join(app,file),fs.constants.COPYFILE_EXCL);
fs.copyFileSync(path.join(root,'scripts/windows-installers/payload.cjs'),path.join(app,'payload.cjs'),fs.constants.COPYFILE_EXCL);
fs.cpSync(path.join(__dirname,'ui'),path.join(app,'ui'),{recursive:true,errorOnExist:true,force:false});
fs.mkdirSync(path.join(out,'native'));fs.copyFileSync(native,path.join(out,'native/SetupIdentityAcl.exe'),fs.constants.COPYFILE_EXCL);
fs.writeFileSync(path.join(app,'package.json'),JSON.stringify({name:'ctsk026-flow-review',version:'0.0.1',private:true,main:'main.js'}),{flag:'wx'});
const report=JSON.parse(fs.readFileSync(path.join(root,'docs/local-fase-2e7',P.RELEASE+'-build-report.json')));
fs.writeFileSync(path.join(app,'candidate-reference.json'),JSON.stringify(Object.fromEntries(['server','client'].map(side=>[side,{inventorySha256:report.payloads[side].inventorySha256}]))),{flag:'wx'});
fs.copyFileSync(path.join(root,'docs/PRUEBA-FLUJO-026-IDENTIDAD-ACL.md'),path.join(out,'LEEME.md'),fs.constants.COPYFILE_EXCL);
const inventory={protocol:'ctsk-setup-integrity-v1',name:'026-flow-review-01',candidate:P.RELEASE,scope:P.SCOPE,productionAuthorized:false,
 provisioningAllowed:false,nativeComponentValidation:'pending-manual-Windows11',nativeFirstTokenVerified:false,files:I.tree(out)};
fs.writeFileSync(path.join(out,'helper-inventory.json'),JSON.stringify(inventory,null,2),{flag:'wx'});I.verify(out);
console.log('READ_ONLY_FLOW_REVIEW_PREPARED_NO_NATIVE_EXECUTION');
