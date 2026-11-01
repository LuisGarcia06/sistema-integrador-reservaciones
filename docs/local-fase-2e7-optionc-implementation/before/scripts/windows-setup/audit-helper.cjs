'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),vm=require('node:vm'),assert=require('node:assert/strict');
const I=require('./integrity.cjs'),H=require('../windows-installers/payload.cjs');
const root=path.resolve(__dirname,'../..');
function audit(name){
 if(!/^026-setup-\d{2}$/.test(name))throw Error('HELPER_NAME');
 const base=path.join(root,'dist/windows-setup'),file=path.join(base,name+'.zip'),report=JSON.parse(fs.readFileSync(path.join(base,name+'-report.json'))),dest=path.join(base,name+'-extracted');
 assert.equal(I.sha(fs.readFileSync(file)),report.sha256);fs.mkdirSync(dest);
 cp.execFileSync(path.join(root,'dist/windows-2e7/audit-tools/7zip-26.05/7z.exe'),['x',file,'-o'+dest,'-y'],{windowsHide:true,stdio:'pipe'});
 const manifest=I.verify(dest),app=path.join(dest,'resources/app');
 assert.ok(manifest.files.every(x=>!/(^|\/)(?:node_modules|__tests__|__fixtures__|\.git)(\/|$)|\.(?:pem|key|dump|backup|test\.cjs|log)$/.test(x.file)));
 const shipped=['main.js','preload.js','worker.cjs','policy.cjs','integrity.cjs','state.cjs','coordinator.cjs','crypto-material.cjs','private-directories.ps1','console-stage.ps1','ui/index.html','ui/style.css','ui/app.js'];
 for(const rel of shipped)assert.equal(I.sha(fs.readFileSync(path.join(app,rel))),I.sha(fs.readFileSync(path.join(__dirname,rel))),rel);
 assert.equal(I.sha(fs.readFileSync(path.join(app,'windowsProcess.js'))),I.sha(fs.readFileSync(path.join(root,'shared/windowsProcess.js'))));
 assert.equal(I.sha(fs.readFileSync(path.join(dest,'Configuracion-026.exe'))),I.sha(fs.readFileSync(path.join(root,'node_modules/electron/dist/electron.exe'))));
 assert.equal(H.machine(path.join(dest,'Configuracion-026.exe')),0x8664);assert.equal(H.machine(path.join(dest,'node.exe')),0x8664);
 for(const row of manifest.files)if(/\.(?:js|cjs)$/.test(row.file))new vm.Script(fs.readFileSync(path.join(dest,row.file),'utf8'),{filename:row.file});
 const version=cp.execFileSync(path.join(dest,'crypto/openssl.exe'),['version'],{env:{SystemRoot:process.env.SystemRoot,PATH:path.join(process.env.SystemRoot,'System32'),OPENSSL_CONF:'NUL'},windowsHide:true,encoding:'utf8',timeout:10000}).trim();assert.equal(version,report.opensslVersion);
 const guards=[];
 if(process.platform==='win32'&&Number(require('node:os').release().split('.')[2])<22000){
  const r=cp.spawnSync(path.join(dest,'node.exe'),[path.join(app,'worker.cjs')],{input:JSON.stringify({action:'init',ack:true}),encoding:'utf8',windowsHide:true,timeout:10000});
  assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).error.code,'VM_WINDOWS11_REQUIRED');guards.push('Windows10-rejected-before-provisioning');
 }
 const result={name,sha256:report.sha256,files:manifest.files.length,completeExtractionMatch:true,shippedSourcesMatch:true,noPrivateMaterialIncluded:true,opensslVersion:version,runtimeMachine:'AMD64',guards,installersExecuted:false,postgresProvisioningExecuted:false,windows11Acceptance:'pending',productionAuthorized:false};
 fs.writeFileSync(path.join(root,'docs/local-fase-2e7-setup',name+'-audit.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result,null,2));return result;
}
if(require.main===module)audit(process.argv[2]);module.exports={audit};
