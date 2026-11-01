const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const old=JSON.parse(fs.readFileSync('docs/local-fase-2d9b3/jest-final.json','utf8'));
const files=old.testResults.map(x=>'backend/__tests__/'+path.basename(x.name));files.push('backend/__tests__/firstAccess.test.js','backend/__tests__/unifiedBackend.test.js','backend/__tests__/unifiedFirstLogin.test.js','backend/__tests__/reservationCapacity023.test.js','backend/__tests__/unifiedFrontend.test.js','backend/__tests__/preproduction.test.js');
files.push('backend/__tests__/controlledIntegrations.test.js');
files.push(...['fareharbor.client.test.js','fareharbor.mapper.test.js','fareharborApplication.service.test.js','fareharborCancellationApplication.service.test.js','fareharborModificationApplication.service.test.js','getyourguideContinuous.service.test.js','getyourguidePrioritySync.service.test.js'].map(n=>'backend/__tests__/'+n));
files.push('backend/__tests__/centroAvisos.test.js','backend/__tests__/centroAvisosTiming.test.js');
files.push('backend/__tests__/manualReferences025.test.js');
const result=cp.spawnSync(process.execPath,['node_modules/jest/bin/jest.js','--config','backend/__tests__/standalone.jest.config.cjs','--runInBand','--runTestsByPath',...files,'--json','--outputFile=docs/local-fase-2e5/jest-verified.json'],{env:require('../../backend/config/desktopPolicy').cleanEnvironment(),windowsHide:true,encoding:'utf8',timeout:300000});
fs.writeFileSync('docs/local-fase-2e5/jest-verified.log',(result.stdout||'')+(result.stderr||''));console.log(JSON.stringify({status:result.status,error:result.error?.code}));process.exitCode=result.status??1;
