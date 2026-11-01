const fs=require('node:fs');let s=fs.readFileSync('backend/config/unifiedPolicy.js','utf8');s=s.replace("m.activation!=='backend-only'", "!['backend-only','electron-original'].includes(m.activation)");
s=s.replace("'scripts/UnifiedLab.ps1'", "'scripts/UnifiedLab.ps1','electron/unifiedBackend.js','scripts/consolidationLab.cjs','scripts/unifiedElectronDriver.cjs','scripts/ConsolidationLab.ps1'");
s=s.replace("return {manifest:Object.freeze(m),config:loaded.config,key:preconditions", `if(m.activation==='backend-only'&&m.backendGateDigest!=='0'.repeat(64))B.fail('UNIFIED_BACKEND_GATE');
 if(m.activation==='electron-original'){
  const bFile=path.join(m.directory,'unified-backend-manifest.json'),reportFile=path.join(m.directory,'unified-backend-gate-report.json'),gateFile=path.join(m.directory,'unified-backend-proof.json');
  for(const f of [bFile,reportFile,gateFile])checkAcl(f);
  const originalBytes=fs.readFileSync(bFile),original=validateManifest(JSON.parse(originalBytes),root),reportBytes=fs.readFileSync(reportFile),report=JSON.parse(reportBytes),gateBytes=fs.readFileSync(gateFile),gate=JSON.parse(gateBytes),g=gate.body;
  if(original.activation!=='backend-only'||Object.keys(original).some(k=>!['activation','backendGateDigest'].includes(k)&&JSON.stringify(original[k])!==JSON.stringify(m[k]))||B.sha(gateBytes)!==m.backendGateDigest||!signed(m.verificationKey,gate)||g?.purpose!=='ctsk-unified-backend-verified023-v1'||g.completed!==true||g.code!==m.code||g.cluster!==m.cluster||g.generation!==m.dataGeneration||g.schema!==require('./credentialSchemaContract').CATALOG_SHA||g.manifest!==B.sha(originalBytes)||g.report!==B.sha(reportBytes)||report.completed!==true||report.capacityDecisionPending!==false||report.checks?.length<24)B.fail('UNIFIED_BACKEND_GATE');
 }
 return {manifest:Object.freeze(m),config:loaded.config,key:preconditions`);
fs.writeFileSync('backend/config/unifiedPolicy.js',s);
s=fs.readFileSync('scripts/unifiedAdmin.cjs','utf8').replace("activation:'backend-only',firstAccessDigest", "activation:'backend-only',backendGateDigest:'0'.repeat(64),firstAccessDigest");
s=s.replace('module.exports={createProfile,start,verifyLogin};', `function promote(profile,report){
 if(report.completed!==true||report.capacityDecisionPending!==false||report.checks.length<24)throw Error('UNIFIED_BACKEND_GATE');const plan=profile.plan,dir=plan.manifest.directory,original=fs.readFileSync(plan.filename),reportBytes=JSON.stringify(report,null,2);
 fs.writeFileSync(path.join(dir,'unified-backend-manifest.json'),original,{flag:'wx'});fs.writeFileSync(path.join(dir,'unified-backend-gate-report.json'),reportBytes,{flag:'wx'});
 const body={purpose:'ctsk-unified-backend-verified023-v1',completed:true,code:plan.manifest.code,cluster:plan.manifest.cluster,generation:plan.manifest.dataGeneration,schema:require('../backend/config/credentialSchemaContract').CATALOG_SHA,manifest:B.sha(original),report:B.sha(reportBytes)};
 const proof={body,signature:crypto.sign(null,Buffer.from(JSON.stringify(body)),profile.privateKey).toString('base64')},bytes=JSON.stringify(proof,null,2);fs.writeFileSync(path.join(dir,'unified-backend-proof.json'),bytes,{flag:'wx'});
 fs.writeFileSync(plan.filename,JSON.stringify({...plan.manifest,activation:'electron-original',backendGateDigest:B.sha(bytes)},null,2));return {...profile,plan:P.readPlan(plan.filename)};
}
module.exports={createProfile,start,verifyLogin,promote};`);fs.writeFileSync('scripts/unifiedAdmin.cjs',s);
s=fs.readFileSync('electron/main.js','utf8');s=s.replace("const explicitDev =", "const explicitUnified = process.argv.includes('--ctsk-mode=unified023-lab');\nconst unifiedDriver = process.argv.includes('--ctsk-unified-test-driver');\nconst unifiedArgs = process.argv.filter(value=>value.startsWith('--ctsk-unified-manifest='));\nconst explicitDev =");s=s.replace("const modeConflict =", "const unifiedConflict = (explicitUnified && (explicitDev || explicitPrincipalTest || explicitIndependent || explicitHttps || explicitLan || unifiedArgs.length !== 1 || !process.send)) || (!explicitUnified && (unifiedArgs.length || unifiedDriver));\nconst modeConflict = unifiedConflict ||");
s=s.replace("let independentStartupError = null;", `let independentStartupError = null;
if (explicitUnified) app.setPath('userData',path.join(app.getPath('temp'),'ctsk-unified-rejected-'+require('node:crypto').randomUUID()));
if (explicitUnified && !modeConflict) {
 try {
  if (app.isPackaged || process.argv.some(a=>/^--(?:no-sandbox|ignore-certificate-errors|disable-web-security|remote-debugging-port|remote-debugging-pipe|inspect|inspect-brk|js-flags)(?:=|$)/.test(a))) throw Error('UNIFIED_SOURCE_FLAGS_REQUIRED');
  require('../backend/config/desktopPolicy').cleanEnvironment();const plan=require('../backend/config/unifiedPolicy').readPlan(unifiedArgs[0].slice('--ctsk-unified-manifest='.length),getRuntimeRoot());
  if(plan.manifest.activation!=='electron-original')throw Error('UNIFIED_BACKEND_GATE');app.setPath('userData',path.join(plan.manifest.directory,'electron-original-profile'));
  app.commandLine.appendSwitch('disable-background-networking');if(unifiedDriver){app.disableHardwareAcceleration();app.commandLine.appendSwitch('in-process-gpu');}
 } catch(error){ independentStartupError=error; }
}`);
s=s.replace("if (secureClient) {\r\n        if (independentStartupError)", "if (secureClient) {\r\n        if (independentStartupError)");
s=s.replace("if (explicitIndependent) {\r\n        if (independentStartupError)", `if (explicitUnified) {
        if(independentStartupError)throw independentStartupError;
        const invalidate=()=>{backendVerified=false;if(mainWindow&&!mainWindow.isDestroyed())void mainWindow.webContents.executeJavaScript("App.auth.cerrarSesion();true").catch(()=>{});};
        independentBackend=await require('./unifiedBackend').connect({manifestPath:unifiedArgs[0].slice('--ctsk-unified-manifest='.length),root:getRuntimeRoot(),onUnavailable:invalidate,onRestart:invalidate,onReady:()=>{backendVerified=true;}});
        BACKEND_PORT=independentBackend.port;APP_ORIGIN=independentBackend.origin;APP_URL=APP_ORIGIN+'/app/';return;
    }
    if (explicitIndependent) {\r\n        if (independentStartupError)`);
if(!s.includes('unifiedBackend\').connect'))throw Error('MAIN_UNIFIED_INSERT_FAILED');
s=s.replace('mainWindow.maximize();', 'if (!unifiedDriver) mainWindow.maximize();');s=s.replace('if (mainWindow) {\r\n            mainWindow.show();', 'if (mainWindow && !unifiedDriver) {\r\n            mainWindow.show();');s=s.replace('mainWindow.loadURL(APP_URL);', `if(explicitUnified&&unifiedDriver){mainWindow.setSize(1440,1000);mainWindow.webContents.setBackgroundThrottling(false);mainWindow.webContents.once('did-finish-load',()=>require('../scripts/unifiedElectronDriver.cjs').attach(mainWindow));}
    mainWindow.loadURL(APP_URL);`);
fs.writeFileSync('electron/main.js',s);
s=fs.readFileSync('frontend/js/unifiedAssignments.js','utf8').replace("await model.prepare(choice,()=>window.confirm('¿Utilizar la asignación actual?'));paint();", "const prepared=await model.prepare(choice,()=>window.confirm('¿Utilizar la asignación actual?'));if(prepared&&choice==='current')model.setProposal({id_transporte_operacion:App.revisionConflict.view(model.original).id_transporte_operacion??null});paint();");fs.writeFileSync('frontend/js/unifiedAssignments.js',s);
s=fs.readFileSync('frontend/pages/operaciones.js','utf8').replace('function toggleOrganizacionReservaciones() {','function toggleOrganizacionReservaciones() {\n    if (App.unified?.active && !App.unifiedAssignments.canLeave()) return;');for(const name of ['openForm','openTransporteForm']){const re=new RegExp('((?:async )?function '+name+'\\([^\\n]*\\) \\{)');s=s.replace(re,'$1\n    if (App.unified?.active && !App.unifiedAssignments.canLeave()) return;');}fs.writeFileSync('frontend/pages/operaciones.js',s);
