'use strict';
// Solo copia archivos y genera inventario; no ejecuta runtimes o nativos.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),I=require('./integrity.cjs');
const root=path.resolve(__dirname,'../..'),base=path.join(root,'docs/local-fase-2e7-f01-and-native-progress'),out=path.join(base,'026-directory-validation-01');
const creator=path.join(base,'native/SetupPrivateDirectories.exe'),reader=path.join(root,'docs/local-fase-2e7-enrollment-fix/native-read-only/SetupIdentityAcl.exe');
assert.equal(I.sha(fs.readFileSync(reader)),'951dc1a45c290beaff74771e111d9cf99a616200f2429c27212522b15564a6df');
const evidence=JSON.parse(fs.readFileSync(path.join(base,'F01-user-observation.json')));assert.equal(evidence.status,'passed-within-read-only-scope');assert.equal(evidence.writeAuthorization,false);
const vendor=path.join(root,'node_modules/electron/dist');assert.equal(fs.readFileSync(path.join(vendor,'version'),'utf8').trim(),'43.4.1');assert.equal(process.version,'v22.20.0');
fs.mkdirSync(out);
function copyVendor(dir,relative=''){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){assert.equal(entry.isSymbolicLink(),false);const rel=path.posix.join(relative,entry.name);if(rel==='resources/default_app.asar')continue;const target=path.join(out,rel==='electron.exe'?'Validacion-Directorios-026.exe':rel);if(entry.isDirectory()){fs.mkdirSync(target,{recursive:true});copyVendor(path.join(dir,entry.name),rel);}else fs.copyFileSync(path.join(dir,entry.name),target,fs.constants.COPYFILE_EXCL);}}
copyVendor(vendor);fs.copyFileSync(process.execPath,path.join(out,'node.exe'),fs.constants.COPYFILE_EXCL);
fs.copyFileSync(path.join(root,'docs/local-fase-2e7/node-v22.20.0-LICENSE.txt'),path.join(out,'LICENSE-node.txt'),fs.constants.COPYFILE_EXCL);
const app=path.join(out,'resources/app');fs.mkdirSync(app,{recursive:true});
for(const name of ['directory-validation.cjs','directory-validation-worker.cjs','directory-validation-main.js','directory-validation-preload.js','directory-validation.html','directory-validation-ui.js','integrity.cjs','native-readiness.cjs','policy.cjs'])fs.copyFileSync(path.join(__dirname,name),path.join(app,name),fs.constants.COPYFILE_EXCL);
fs.mkdirSync(path.join(app,'ui'));fs.copyFileSync(path.join(__dirname,'ui/style.css'),path.join(app,'ui/style.css'),fs.constants.COPYFILE_EXCL);
fs.writeFileSync(path.join(app,'package.json'),JSON.stringify({name:'ctsk026-directory-validation',version:'0.0.1',private:true,main:'directory-validation-main.js'}),{flag:'wx'});
fs.mkdirSync(path.join(out,'native'));fs.copyFileSync(reader,path.join(out,'native/SetupIdentityAcl.exe'),fs.constants.COPYFILE_EXCL);fs.copyFileSync(creator,path.join(out,'native/SetupPrivateDirectories.exe'),fs.constants.COPYFILE_EXCL);
fs.copyFileSync(path.join(root,'docs/PRUEBA-F02-DIRECTORIOS-PRIVADOS.md'),path.join(out,'LEEME.md'),fs.constants.COPYFILE_EXCL);
fs.copyFileSync(path.join(base,'F01-user-observation.json'),path.join(out,'F01-user-observation.json'),fs.constants.COPYFILE_EXCL);
const inventory={protocol:'ctsk-setup-integrity-v1',name:'026-directory-validation-01',scope:'synthetic-acceptance-only',productionAuthorized:false,writeAuthorizationFromF01:false,firstTokenValidated:false,containmentValidated:false,serviceValidated:false,installer:false,nativeCryptoOrPostgresExecution:false,readerSha256:I.sha(fs.readFileSync(reader)),creatorSha256:I.sha(fs.readFileSync(creator)),files:I.tree(out)};
fs.writeFileSync(path.join(out,'helper-inventory.json'),JSON.stringify(inventory,null,2),{flag:'wx'});I.verify(out);console.log(JSON.stringify({directory:out,files:inventory.files.length,creatorSha256:inventory.creatorSha256,nativeExecuted:false,installer:false}));
