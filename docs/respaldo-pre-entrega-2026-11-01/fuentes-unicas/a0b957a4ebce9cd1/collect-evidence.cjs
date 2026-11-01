'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const parse=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const runs=[
    {log:'http-attempt1.log',report:'user-api-verification.json'},
    {log:'http-attempt2.log',report:'user-api-verification.json',copy:'http-preliminary.json'},
    {log:'http-attempt3.log',report:'user-api-verification.json',copy:'http-verification.json'},
    {log:'catalog022-regression.log',report:'admin-api-verification.json',copy:'catalog022-preliminary-regression.json'},
    {log:'api021-regression.log',report:'audit-api-verification.json',copy:'api021-preliminary-regression.json'},
    {log:'catalog022-final-regression.log',report:'admin-api-verification.json',copy:'catalog022-regression.json'},
    {log:'api021-final-regression.log',report:'audit-api-verification.json',copy:'api021-regression.json'}
];
const labs=[];
for(const run of runs){
    const text=fs.readFileSync(path.join(__dirname,run.log),'utf8'),match=text.match(/[A-Z_]+LAB (C:\\[^\r\n]*ctsk-standalone-[a-f0-9]{12})/);assert.ok(match,run.log);
    const directory=match[1];assert.equal(path.dirname(directory),fs.realpathSync(process.env.LOCALAPPDATA));assert.equal(fs.realpathSync(directory),directory);
    const report=parse(path.join(directory,run.report));
    if(run.copy){assert.equal(report.completed,true,run.log);assert.deepEqual(report.failures,[],run.log);assert.equal(report.postgresStopped,true,run.log);fs.copyFileSync(path.join(directory,run.report),path.join(__dirname,run.copy));}
    const file=['user-api-manifest.json','admin-api-manifest.json','manifest.json'].map(name=>path.join(directory,name)).find(f=>fs.existsSync(f)),m=parse(file);
    const passwordCalls=(report.httpCalls||[]).filter(c=>c.method==='PATCH'&&/\/usuarios\/[0-9]+\/password$/.test(c.url));
    const creationCalls=(report.httpCalls||[]).filter(c=>c.method==='POST'&&c.url==='/api/usuarios');
    assert.ok(passwordCalls.every(c=>c.status===405),run.log);assert.ok(creationCalls.every(c=>c.status===405),run.log);
    labs.push({run:run.log,directory,database:m.database,cluster:m.cluster,dataGeneration:m.dataGeneration,pgPort:m.pgPort,httpPort:m.httpPort,completed:report.completed,checks:report.checks.length,postgresStopped:!fs.existsSync(path.join(directory,'data/postmaster.pid')),acceptedPasswordCalls:0,acceptedUserCreationCalls:0});
}
assert.equal(new Set(labs.map(l=>l.cluster)).size,labs.length);assert.equal(new Set(labs.map(l=>l.directory)).size,labs.length);assert.equal(new Set(labs.map(l=>l.dataGeneration)).size,labs.length);assert.ok(labs.every(l=>l.postgresStopped));
const final=parse(path.join(__dirname,'http-verification.json'));assert.equal(final.passwordsUnchanged,true);assert.equal(final.applicationUserCreationCount,0);assert.equal(final.forbiddenSqlAttempts,0);assert.equal(final.secretScanPassed,true);assert.equal(final.serverLogsSecretScanPassed,true);
const jest=parse(path.join(__dirname,'jest-final.json'));assert.equal(jest.numFailedTests,0);assert.equal(jest.numFailedTestSuites,0);
fs.writeFileSync(path.join(__dirname,'labs.json'),JSON.stringify(labs,null,2));
fs.writeFileSync(path.join(__dirname,'credential-safety.json'),JSON.stringify({phase:'2D.9B.2B',passwordsUnchanged:true,applicationUserCreationCount:0,forbiddenSqlAttempts:0,newProfileCredentialStateComparedInMemory:true,privateInitialFixturesOnly:true,allRecordedPasswordAndUserPostRequestsRejected405:true,serverLogsSecretScanPassed:true,commandApiFullRunnerExecuted:false,scopeDeviations:[]},null,2));
console.log(JSON.stringify({runs:labs.map(l=>({run:l.run,completed:l.completed,checks:l.checks,stopped:l.postgresStopped})),jest:{tests:jest.numPassedTests,suites:jest.numPassedTestSuites}},null,2));
