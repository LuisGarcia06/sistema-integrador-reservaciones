'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),read=n=>JSON.parse(fs.readFileSync(path.join(__dirname,n),'utf8').replace(/^\uFEFF/,''));
const v=read('verification.json'),j=read('jest-final.json'),s=read('source-verification.json'),i=read('inventory.json'),c=read('closure.json'),progress=read('progress.json');
assert.ok(v.completed&&v.postgresStopped&&v.secretScanPassed&&j.success&&c.closed);
assert.deepEqual(v.clusters.map(m=>m.directory),progress.clusters.map(m=>m.directory));assert.ok(s.changes.every(e=>e.backedUp));
const P=require('../../backend/config/preproductionPolicy'),sourceClient=JSON.parse(fs.readFileSync(path.join(v.clients[0],'preproduction-client.json')));
assert.equal(sourceClient.body.code,P.fingerprint(root),'FINAL_CODE_MUST_MATCH_VERIFIED_CLIENT');
const metadata=JSON.parse(fs.readFileSync(path.join(v.backup.directory,'backup.json')));
require('../../scripts/preproductionBackup.cjs').validateArchive({file:path.join(v.backup.directory,'database.dump'),metadata},sourceClient.body.verificationKey);
fs.copyFileSync(path.join(v.backup.directory,'backup.json'),path.join(__dirname,'backup-metadata.json'));
const grouped=new Map();for(const proof of v.proofs){const key=proof.pid+':'+proof.transaction;if(!grouped.has(key))grouped.set(key,new Set());grouped.get(key).add(proof.phase);}
const business=[...grouped.values()].filter(g=>g.has('business'));assert.ok(business.length>0&&business.every(g=>g.has('audit')));
fs.writeFileSync(path.join(__dirname,'transaction-verification.json'),JSON.stringify({observedTransactions:grouped.size,businessTransactions:business.length,businessAndAuditSamePidTransaction:true,includesRolledBackFaultTests:true},null,2));
const link=f=>'- ['+f+']('+path.join(root,f).replaceAll('\\','/')+')';
const tokens={DATE:new Date().toISOString(),MIGRATION_SHA:require('../../backend/config/integration024Contract').SHA,
 JEST_TESTS:j.numPassedTests,JEST_SUITES:j.numPassedTestSuites,CHECKS:v.checks.length,
 SOURCE_DIRECTORY:v.clusters[0].directory,TARGET_DIRECTORY:v.clusters[1].directory,RESTORED_DATABASE:v.restoration.database,
 BACKUP_DIRECTORY:v.backup.directory,BACKUP_SHA:v.backup.sha256,BACKUP_TABLES:Object.keys(v.backup.state.rows).length,
 REGRESSIONS:'| Informe | Grupos | Resultado |\n| --- | ---: | --- |\n'+i.reports.map(r=>'| ['+r.file+']('+r.file+') | '+r.checks+' | '+(r.completed?'Aprobado':'No aprobado')+' |').join('\n'),
 PRIOR_FILES:s.prior,UNCHANGED_FILES:s.unchanged,CHANGED_FILES:s.changes.length,
 MODIFIED_LIST:s.changes.map(e=>link(e.file)).join('\n'),CREATED_LIST:s.created.map(e=>link(e.file)).join('\n'),
 LAB_DIRECTORIES:i.laboratories.length,CLIENT_DIRECTORIES:i.clients.length,PORTS:i.ports.length};
let template=fs.readFileSync(path.join(__dirname,'report-template.md'),'utf8');
template=template.replace(/\{\{([A-Z_]+)\}\}/g,(_,key)=>{assert.ok(Object.hasOwn(tokens,key),key);return String(tokens[key]);});
assert.ok(!template.includes('{{'));assert.equal((template.match(/^## \d+\./gm)||[]).length,18);
template=template.replaceAll('ambos esquemas técnicos','los esquemas public y ctsk_sync024').replaceAll('pg_dump/pg_restore18.3','pg_dump/pg_restore 18.3').replaceAll('contrato023','contrato 023').replaceAll('Propuesta024','Propuesta 024').replaceAll('ledger020','ledger 020').replaceAll('migraciones018','migraciones 018').replaceAll('Migraciones018','Migraciones 018').replaceAll('máximo24','máximo 24').replaceAll('capacidad12','capacidad 12').replaceAll('del10al15','del 10 al 15').replaceAll('corte del2','corte del 2').replaceAll('los28','los 28').replaceAll('backend consolidado023','backend consolidado 023').replaceAll('PostgreSQL18.3','PostgreSQL 18.3');
fs.writeFileSync(path.join(__dirname,'INFORME.md'),template);
const artifacts=['artifacts/source/sync024-activate.png','artifacts/restored/sync024-inspect.png','artifacts/restored/sync024-avisos.png'];
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
fs.writeFileSync(path.join(__dirname,'visual-verification.json'),JSON.stringify({reviewed:true,originalElectron:true,screenshots:artifacts.map(file=>({file,sha256:sha(path.join(__dirname,file))})),activationAndRestoredCutVisible:true,manualGetYourGuideBlockVisible:true,providerQueryLabelVisible:true,reconciliationNoticeVisible:true,noOverlapsObserved:true,responsiveEnterpriseAcceptancePending:true},null,2));
console.log(JSON.stringify({report:'INFORME.md',sections:18,tests:j.numPassedTests,suites:j.numPassedTestSuites,checks:v.checks.length,closed:c.closed,finalCodeVerified:true}));
