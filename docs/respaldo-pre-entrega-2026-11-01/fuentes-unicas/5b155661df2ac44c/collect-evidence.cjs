'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const folder=__dirname,parse=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const runs=[
    ...[1,2,3,4].map(n=>({log:'http-attempt'+n+'.log',file:'admin-api-verification.json',copy:n===4?'http-verification.json':null})),
    {log:'schema022-regression.log',file:'admin-audit-verification.json',copy:'schema022-regression.json'},
    {log:'api020-regression.log',file:'command-api-verification.json',copy:'api020-regression.json'},
    {log:'api021-regression.log',file:'audit-api-verification.json',copy:'api021-regression.json'},
    {log:'operational-regression.log',file:'operational-verification.json',copy:'operational-regression.json'},
    {log:'frontend021-regression.log',file:'audit-frontend-verification.json',copy:'frontend021-regression.json'},
    {log:'daily-pdf-regression.log',file:'daily-frontend-verification.json',copy:'daily-pdf-regression.json'}
];
const labs=[];
for(const run of runs){
    const text=fs.readFileSync(path.join(folder,run.log),'utf8'),match=text.match(/(?:[A-Z_]+LAB) (C:\\[^\r\n]*ctsk-standalone-[a-f0-9]{12})/);
    assert.ok(match,'LAB_DIRECTORY_REQUIRED '+run.log);const directory=match[1];
    assert.equal(path.dirname(directory),fs.realpathSync(process.env.LOCALAPPDATA));assert.equal(fs.realpathSync(directory),directory);
    const file=path.join(directory,run.file),report=fs.existsSync(file)?parse(file):null;
    if(run.copy){assert.ok(report,'REPORT_REQUIRED '+run.log);assert.equal(report.completed,true,run.log);assert.deepEqual(report.failures,[],run.log);assert.equal(report.postgresStopped,true,run.log);fs.copyFileSync(file,path.join(folder,run.copy));}
    const manifest=['admin-api-manifest.json','admin-audit-manifest.json','manifest.json'].map(f=>path.join(directory,f)).find(f=>fs.existsSync(f)),m=parse(manifest);
    labs.push({run:run.log,directory,database:m.database,cluster:m.cluster,dataGeneration:m.dataGeneration,pgPort:m.pgPort,httpPort:m.httpPort,completed:report?.completed===true,checks:Array.isArray(report?.checks)?report.checks.length:null,postgresStopped:!fs.existsSync(path.join(directory,'data/postmaster.pid'))});
}
assert.equal(new Set(labs.map(l=>l.directory)).size,labs.length);assert.equal(new Set(labs.map(l=>l.cluster)).size,labs.length);assert.equal(new Set(labs.map(l=>l.dataGeneration)).size,labs.length);assert.ok(labs.every(l=>l.postgresStopped));
fs.writeFileSync(path.join(folder,'labs.json'),JSON.stringify(labs,null,2));
const scope={phase:'2D.9B.2A',deviation:'El corredor original CommandApiLab ejecutado como regresion incluyo alta y cambio de password de una cuenta sintetica nueva; excede la restriccion de no cambiar passwords de esta fase.',run:'api020-regression.log',syntheticCluster:labs.find(l=>l.run==='api020-regression.log').database,credentialWasReal:false,productionAccess:false,new022ProfilePasswordWritesBlocked:true,new022ProfilePasswordsUnchanged:true,correctiveAction:'No repetir ese corredor general en esta fase; documentar el caso y conservar su laboratorio detenido y la evidencia. Los corredores posteriores se inspeccionaron antes de ejecutar.',humanNotified:true};
fs.writeFileSync(path.join(folder,'scope-deviation.json'),JSON.stringify(scope,null,2));
const jest=parse(path.join(folder,'jest-final.json'));assert.equal(jest.numFailedTests,0);assert.equal(jest.numFailedTestSuites,0);
console.log(JSON.stringify({labs:labs.length,allStopped:true,regressions:labs.filter(l=>l.completed).map(l=>({run:l.run,checks:l.checks})),jest:{tests:jest.numPassedTests,suites:jest.numPassedTestSuites}},null,2));
