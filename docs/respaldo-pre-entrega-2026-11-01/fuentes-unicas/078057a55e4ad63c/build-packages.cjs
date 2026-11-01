'use strict';
// Paquetes de ingeniería sin configuración ni instalador empresarial.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=path.join(__dirname,'packages'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
if(fs.existsSync(out))throw Error('PACKAGE_OUTPUT_EXISTS');fs.mkdirSync(out);
const inventory=[],dependencies={};
function write(side,rel,bytes,origin=null){const dest=path.join(out,side,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes,{flag:'wx'});inventory.push({side,file:rel,sha256:sha(bytes),bytes:Buffer.byteLength(bytes),source:origin});}
function copy(side,rel,dest=rel){write(side,dest,fs.readFileSync(path.join(root,rel)),rel);}
function walk(dir){return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>{const rel=dir+'/'+e.name;if(e.isSymbolicLink()||rel==='frontend/lab'||/^(?:__tests__|__fixtures__|test|tests|coverage|\.git)$/.test(e.name)||/\.test\.|\.log$|\.dump$|^\.env/.test(e.name))return [];return e.isDirectory()?walk(rel):[rel];});}
const original=fs.readFileSync(path.join(root,'electron/main.js'),'utf8');
const piece=(a,b)=>{assert.ok(original.includes(a)&&original.includes(b));return original.slice(original.indexOf(a),original.indexOf(b));};
const utilities=piece('function isAllowedAppUrl','function showConnectionState');
let windowCode=piece('function createMainWindow','function showStartupError');
windowCode=windowCode.split('\n').filter(l=>!l.includes("require('../scripts/")&&!l.includes('if(explicitUnified')&&!l.includes('if(explicitPreproduction')).join('\n');
windowCode=windowCode.replaceAll('!unifiedDriver','true');
const entry=`'use strict';
// Candidato experimental: ventana/preload/exportador originales; sólo descriptor externo local verificado.
const {app,BrowserWindow,dialog,ipcMain}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const EXPORT_DAILY_PDF_CHANNEL='daily:export-pdf',secureClient=false,PRINCIPAL_TEST=false,DEV_DB02=false,httpsSession=null;
let APP_ORIGIN,APP_URL,BACKEND_PORT,mainWindow=null,backendVerified=false,isQuitting=false,isExportingDailyPdf=false,connection;
app.setPath('userData',path.join(app.getPath('temp'),'ctsk-pilot-client-rejected'));
if(process.argv.some(a=>/^--(?:no-sandbox|ignore-certificate-errors|disable-web-security|remote-debugging|inspect|js-flags)/.test(a)))throw Error('UNSAFE_FLAGS');
for(const key of Object.keys(process.env))if(/^(DB_|PG|APP_|NODE_OPTIONS$|NODE_PATH$|NODE_EXTRA_CA_CERTS$|FAREHARBOR_|GETYOURGUIDE_|GYG_|JWT_|HTTP_PROXY$|HTTPS_PROXY$|ALL_PROXY$)/i.test(key))throw Error('ENV_CONFLICT');
const args=process.argv.filter(a=>a.startsWith('--ctsk-preproduction-client='));
function requestLocalPath(url,timeoutMs=1200,token=null){return new Promise(resolve=>{const r=http.get(APP_ORIGIN+url,{agent:false,timeout:timeoutMs,headers:token?{Authorization:'Bearer '+token}:{}},res=>{let body='';res.on('data',c=>{body+=c;if(body.length>2097152)r.destroy();});res.on('end',()=>resolve({body,statusCode:res.statusCode}));});r.on('error',()=>resolve(null));r.on('timeout',()=>r.destroy());});}
${utilities}
${windowCode}
app.whenReady().then(async()=>{if(args.length!==1)throw Error('PUBLIC_DESCRIPTOR_REQUIRED');const c=require('./preproductionClientPolicy').readClient(args[0].slice('--ctsk-preproduction-client='.length));app.setPath('userData',path.join(c.directory,'pilot-candidate-profile'));if(!app.requestSingleInstanceLock()){app.quit();return;}app.commandLine.appendSwitch('disable-background-networking');APP_ORIGIN=c.origin;APP_URL=c.origin+'/app/';BACKEND_PORT=Number(new URL(c.origin).port);connection=await require('./preproductionBackend').connect({config:c,onUnavailable:async()=>{backendVerified=false;if(mainWindow&&!mainWindow.isDestroyed())await mainWindow.webContents.executeJavaScript('App.auth.cerrarSesion();true').catch(()=>{});},onReady:()=>{backendVerified=true;}});createMainWindow();console.log('PILOT_CLIENT_READY');}).catch(()=>{console.error('PILOT_CLIENT_REJECTED');app.quit();});
app.on('window-all-closed',()=>app.quit());app.on('before-quit',()=>{isQuitting=true;backendVerified=false;connection?.stop();});
`;
assert.ok(!/scripts\/|Driver|fixtures|require\(['"]pg/.test(entry));
write('client','electron/main.js',entry,'derived: electron/main.js (window, IPC/PDF unchanged; startup separated)');
copy('client','electron/preload.js');copy('client','electron/preproductionBackend.js');copy('client','backend/config/windowsConfigAcl.js','electron/windowsConfigAcl.js');
write('client','electron/preproductionClientPolicy.js',fs.readFileSync(path.join(root,'electron/preproductionClientPolicy.js'),'utf8').replace('../backend/config/windowsConfigAcl','./windowsConfigAcl'),'derived: local ACL import only');
write('client','package.json',JSON.stringify({name:'ctsk-pilot-client-experimental',version:'0.0.0',private:true,main:'electron/main.js',description:'Candidato local con Electron original, sin PostgreSQL ni configuración incluida',engines:{electron:require(path.join(root,'node_modules/electron/package.json')).version}},null,2));
// Los recursos originales se sirven por Express; copia inspeccionable idéntica, sin datos/fixtures.
for(const rel of walk('frontend'))copy('client',rel);
for(const dir of ['backend','frontend','database','shared'])for(const rel of walk(dir))copy('server',rel);
for(const rel of walk('frontend/lab'))copy('server',rel);
for(const rel of ['scripts/preproductionBackup.cjs','scripts/preproductionSchemaRestore.cjs','scripts/preproductionSetup.cjs','scripts/preproductionProbe.cjs','scripts/pilot025Supervisor.cjs','scripts/integration024Lab.cjs','scripts/integration024Probe.cjs','scripts/integration024Worker.cjs','scripts/integration024ElectronDriver.cjs','scripts/preproductionServer.cjs','scripts/preproductionLab.cjs','scripts/preproductionFirstDriver.cjs','scripts/unifiedProbe.cjs','scripts/unifiedElectronDriver.cjs'])copy('server',rel);
for(const rel of walk('electron'))copy('server',rel);
const requested=require(path.join(root,'package.json')).dependencies;
const done=new Set();function dependency(name,from=root){let pkg;try{pkg=require.resolve(name+'/package.json',{paths:[from]});}catch{let d=path.dirname(require.resolve(name,{paths:[from]}));while(d!==path.dirname(d)){const f=path.join(d,'package.json');if(fs.existsSync(f)&&JSON.parse(fs.readFileSync(f)).name===name){pkg=f;break;}d=path.dirname(d);}if(!pkg)throw Error('DEPENDENCY_PACKAGE');}const dir=path.dirname(pkg),p=JSON.parse(fs.readFileSync(pkg)),key=p.name+'@'+p.version;if(done.has(dir))return;done.add(dir);dependencies[key]={license:p.license||null};const prefix=path.relative(root,dir).replaceAll('\\','/');assert.ok(prefix.startsWith('node_modules/'));for(const rel of fs.readdirSync(dir,{recursive:true})){const f=path.join(dir,rel),st=fs.lstatSync(f);if(st.isFile()&&!/(^|[\\/])(?:node_modules|test|tests|__tests__|__fixtures__|\.git)(?:[\\/]|$)/.test(rel)&&!/(^|[\\/])\.env(?:\.|$)|\.test\./.test(rel))write('server',prefix+'/'+rel.replaceAll('\\','/'),fs.readFileSync(f),'dependency:'+key);}for(const dep of Object.keys(p.dependencies||{}))dependency(dep,dir);}
// Sólo dependencias runtime directas; ninguna instalación npm, descarga ni scripts postinstall.
for(const name of Object.keys(requested))dependency(name);
write('server','package.json',JSON.stringify({name:'ctsk-pilot-server-components',version:'0.0.0',private:true,dependencies:requested,description:'Candidato local con supervisor025; instalación empresarial bloqueada'},null,2));
write('server','start.cjs',"'use strict';require('./scripts/pilot025Supervisor.cjs').start(process.argv[2],process.argv[3]).catch(e=>{console.error('PILOT025_START_REJECTED '+(/^[A-Z0-9_]+$/.test(e.message)?e.message:'START_FAILED'));process.exitCode=1;});\n");
const note='Paquete experimental de componentes, no instalador empresarial. Sin secretos ni manifiestos. No ejecutar npm install ni aprovisionar bases reales. Cliente: requiere Electron 43.4.1 confiable por separado y descriptor sintético externo para prueba local; sólo loopback. Servidor: supervisor025 exige inscripción externa propia y sólo admite clúster sintético nuevo. Mantiene bloqueado uso empresarial y conserva los verificadores023/024/025. PostgreSQL 18.3/Node 22.20 y herramientas oficiales se suministrarán por canal aprobado, no embebidos. Ver ../PAQUETES.md.\n';
write('client','README.txt',note);write('server','README.txt',note);
for(const x of inventory){assert.ok(!/(?:^|\/)(?:\.env(?:\.|$)|fixtures|__fixtures__|secrets|preproduction-server\.json|preproduction-client\.json)/.test(x.file));if(x.side==='client')assert.ok(!/node_modules|^backend\/|^scripts\//.test(x.file));}
for(const side of ['client','server']){const result=cp.spawnSync(process.execPath,['--check',path.join(out,side,side==='client'?'electron/main.js':'start.cjs')],{encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);}
write('server','candidate-inventory.json',JSON.stringify(inventory.filter(x=>x.side==='server').map(x=>({file:x.file,sha256:x.sha256})),null,2));
fs.writeFileSync(path.join(__dirname,'package-inventory.json'),JSON.stringify({createdAt:new Date().toISOString(),experimental:true,nativeInstaller:false,clientDependencies:{electron:'43.4.1 external; no npm runtime modules'},serverDependencies:dependencies,files:inventory},null,2));
console.log(JSON.stringify({clientFiles:inventory.filter(x=>x.side==='client').length,serverFiles:inventory.filter(x=>x.side==='server').length,dependencies:done.size}));
