'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const W=require('../../shared/windowsProcess');
const out=path.resolve('dist/windows-setup-path-tests',crypto.randomUUID());fs.mkdirSync(out,{recursive:true});
const recorder=path.join(out,'recorder.cjs');
fs.writeFileSync(recorder,"require('node:fs').writeFileSync(process.argv[2],JSON.stringify({args:process.argv.slice(3),cwd:process.cwd(),pgdata:process.env.PGDATA}),{flag:'wx'})");
test('rechaza entradas de línea o NUL antes de iniciar un proceso',()=>{
 for(const x of ['a\nb','a\rb','a\0b',null,3])assert.throws(()=>W.quoteArgument(x),/WINDOWS_ARGUMENT/);
 assert.throws(()=>W.runHidden('relative.exe',[]),/WINDOWS_PROCESS_PATH/);
 assert.throws(()=>W.commandLine(null),/WINDOWS_ARGUMENTS/);
});
for(const [i,profile] of ['VMUser','VM User','VM Usuario Prueba','María Álvarez','A&B (Prueba)','O\'Connor ^ $ ` ;','%USERNAME% ! %PATH%'].entries()){
 test('CreateProcess preserva argumentos y entorno: '+profile,{skip:process.platform!=='win32'},()=>{
  const cwd=path.join(out,profile);fs.mkdirSync(cwd);
  const output=path.join(cwd,'args.json'),pgdata=path.join(cwd,'data');
  const args=['',profile,'C:\\ruta con espacio\\','literal"quoted','a\\\\"b','& whoami > should-not-exist',pgdata];
  W.runHidden(process.execPath,[recorder,output,...args],{cwd,environment:{PGDATA:pgdata}});
  const value=JSON.parse(fs.readFileSync(output));assert.deepEqual(value.args,args);assert.equal(value.cwd,cwd);assert.equal(value.pgdata,pgdata);
 });
}
for(const action of ['start','stop'])test('control '+action+' usa PGDATA y log fijo conservando identidad',()=>{
 const directory=path.win32.join('C:\\Users\\VM User %PATH% & Á','AppData\\Local\\ctsk-unit'),dataDirectory=path.win32.join(directory,'data');
 const marker={provisionId:'test',cluster:'test',database:'test',dataDirectory};let called;
 const mod={exports:{}},source=fs.readFileSync(path.resolve('scripts/enterprise026Provision.cjs'),'utf8');
 const fake={realpathSync:x=>x,readFileSync:f=>f.endsWith('postmaster.pid')?['123',dataDirectory,'0','23456'].join('\n'):JSON.stringify(marker)};
 vm.runInNewContext(source,{module:mod,Buffer,process:{env:{SystemRoot:'C:\\Windows'}},require:id=>{
  if(id==='node:fs')return fake;if(id==='../shared/windowsProcess')return {runHidden:(exe,args,options)=>{called={exe,args,options};}};
  if(id==='../shared/release026')return {fail:code=>{throw Error(code)}};
  if(id==='../backend/config/desktopPolicy')return {cleanEnvironment:()=>({})};
  if(id.startsWith('.'))throw Error('UNEXPECTED_IMPORT');return require(id);
 }});
 mod.exports.control({...marker,directory,pgPort:23456},action);
 assert.equal(called.options.environment.PGDATA,dataDirectory);assert.equal(called.options.cwd,directory);
 assert.ok(!called.args.includes('-D'));assert.ok(!called.args.some(x=>x.includes(directory)));
 if(action==='start')assert.equal(called.args.at(-1),'postgres.log');
 called=null;assert.throws(()=>mod.exports.control({...marker,directory,pgPort:999},'stop'),/PROVISION_PROCESS/);assert.equal(called,null);
 assert.throws(()=>mod.exports.control({...marker,directory,cluster:'other'},action),/PROVISION_MARKER/);
 assert.throws(()=>mod.exports.control({...marker,directory},'destroy'),/PROVISION_ACTION/);
});
test('no se desactiva sandbox, TLS ni políticas de ejecución',()=>{
 assert.ok(!/ExecutionPolicy|Bypass|cmd\.exe\s+\/c|Invoke-Expression/.test(W.PROCESS_SCRIPT));
 assert.ok(W.PROCESS_SCRIPT.includes('UseShellExecute=$false'));
});
test('PowerShell -File conserva solicitudes JSON y rutas con símbolos',{skip:process.platform!=='win32'},()=>{
 const cp=require('node:child_process'),d=path.join(out,'María & %USERNAME% (prueba)');fs.mkdirSync(d);
 const file=path.join(d,'recibir solicitud.ps1'),output=path.join(d,'salida.json');
 fs.writeFileSync(file,"param([string]$Request,[string]$Output)\n[IO.File]::WriteAllText($Output,$Request,[Text.Encoding]::UTF8)");
 const request={paths:["C:\\Users\\O'Connor & Á %PATH%\\AppData\\Local\\nuevo"]};
 const result=cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',file,'-Request',JSON.stringify(request),'-Output',output],{windowsHide:true,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(fs.readFileSync(output,'utf8').replace(/^\uFEFF/,'')),request);
});
process.on('exit',()=>console.log('Path evidence: '+out));
