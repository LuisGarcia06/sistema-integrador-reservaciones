// Extrae el payload NSIS para auditarlo y ejecutarlo; no instala ni modifica registro.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(process.argv[2]||fs.readFileSync('.access-scope-lab/05a-build-path.txt','utf8').trim());
if(!root.startsWith(path.resolve(__dirname,'../.access-scope-lab')+path.sep))throw Error('Salida fuera del laboratorio');
const exe=path.join(root,'Sistema-Integrador-Reservaciones-1.0.0-x64.exe');
const seven=process.env.ACCESS_SCOPE_7ZA||'C:/Users/luisg/AppData/Local/electron-builder/Cache/7zip@1.0.0/7zip-win-x64-a34pt/bin/7za.exe';
const outer=path.join(root,'installer-extracted'),payload=path.join(root,'payload-extracted');fs.mkdirSync(outer,{recursive:true});fs.mkdirSync(payload,{recursive:true});
function run(args){const r=cp.spawnSync(seven,args,{windowsHide:true,encoding:'utf8',timeout:60000});if(r.status!==0)throw Error(r.stderr||r.stdout);return r.stdout;}
fs.writeFileSync(path.join(root,'installer-list.txt'),run(['l',exe]));run(['x','-y','-o'+outer,exe]);
function walk(dir){const files=[];for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())files.push(...walk(p));else files.push(p);}return files;}
const archive=walk(outer).find(f=>/app-64\.(?:7z|zip)$/.test(f));let actualPayload=payload;if(archive){run(['x','-y','-o'+payload,archive]);}else if(fs.existsSync(path.join(outer,'resources/app.asar'))){actualPayload=outer;}else throw Error('Payload x64 ausente');
const extracted=path.join(actualPayload,'resources/app.asar'),built=path.join(root,'win-unpacked/resources/app.asar');
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');if(hash(extracted)!==hash(built))throw Error('Payload difiere del build');
const info={installer:exe,installer_sha256:hash(exe),payload_root:actualPayload,asar_sha256:hash(extracted),matches_build:true,installed:false};fs.writeFileSync(path.join(root,'payload-verification.json'),JSON.stringify(info,null,2));console.log(JSON.stringify(info));
