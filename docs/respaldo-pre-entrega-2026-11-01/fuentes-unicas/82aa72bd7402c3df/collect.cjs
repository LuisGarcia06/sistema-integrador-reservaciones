'use strict';
// Inventario de sólo lectura: únicamente directorios nombrados por estos ensayos.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const out=__dirname,dirs=new Set(),clients=new Set(),ports=new Set(),reports=[];
const add=x=>{if(typeof x==='string'&&/^ctsk-standalone-[a-f0-9]{12}$/.test(path.basename(x))&&path.dirname(x)===process.env.LOCALAPPDATA)dirs.add(x);};
for(const name of fs.readdirSync(out).filter(n=>/^(attempt-.*\.(?:log|json)|verification\.json|regression-.*\.log)$/.test(n))){
 const s=fs.readFileSync(path.join(out,name),'utf8');
 for(const line of s.split(/\r?\n/)){const m=line.match(/^(?:PREPRODUCTION_SOURCE|PREPRODUCTION_TARGET|[A-Z_]+_LAB) (C:\\.*ctsk-standalone-[a-f0-9]{12})$/);if(m)add(m[1]);}
 try{const j=JSON.parse(s);for(const m of j.clusters||[])add(m.directory);for(const d of j.clients||[])clients.add(d);}catch{}
 if(name.startsWith('regression-')){const j=s.split(/\r?\n/).filter(l=>l.startsWith('{')).map(l=>{try{return JSON.parse(l);}catch{return null;}}).filter(Boolean).at(-1);if(j)add(j.directory);}
}
const inventory=[],installations=new Map();
for(const directory of dirs){
 const files=fs.readdirSync(directory),meta={directory,provisioned:false,postmasterPidPresent:false,ports:[],reports:[]};
 for(const name of files.filter(n=>/^(manifest|admin-api-manifest|security-a-manifest|administrative-frontend-manifest|preproduction-server)\.json$/.test(n))){const j=JSON.parse(fs.readFileSync(path.join(directory,name))),m=j.manifest||j; // Never export config or secret keys.
  if(m.directory!==directory)throw Error('INVENTORY_IDENTITY');
  if(m.installationId&&m.verificationKey)installations.set(m.installationId,m.verificationKey);
  meta.provisioned=true;meta.cluster=m.cluster;meta.database=m.database;meta.dataDirectory=m.dataDirectory;
  for(const n of ['pgPort','httpPort','uiPort'])if(Number.isInteger(m[n]))ports.add(m[n]),meta.ports.push(m[n]);
 }
 if(!meta.dataDirectory&&fs.existsSync(path.join(directory,'data'))){meta.dataDirectory=path.join(directory,'data');const conf=fs.readFileSync(path.join(meta.dataDirectory,'postgresql.conf'),'utf8'),port=Number(conf.match(/^port=([0-9]+)$/m)?.[1]);if(port>=1024&&port<=65535){ports.add(port);meta.ports.push(port);}meta.partialProvisioning=true;}
 if(meta.dataDirectory)meta.postmasterPidPresent=fs.existsSync(path.join(meta.dataDirectory,'postmaster.pid'));
 for(const name of files.filter(n=>/^(audit-api|admin-api|security|administrative-frontend)-verification\.json$/.test(n))){const src=path.join(directory,name),j=JSON.parse(fs.readFileSync(src)),dest=path.basename(directory)+'-'+name;fs.copyFileSync(src,path.join(out,dest));const summary={file:dest,completed:j.completed,checks:Array.isArray(j.checks)?j.checks.length:j.checks,postgresStopped:j.postgresStopped};for(const n of ['uiPort','port'])if(Number.isInteger(j[n]))ports.add(j[n]);reports.push(summary);meta.reports.push(dest);}
 meta.ports=[...new Set(meta.ports)];inventory.push(meta);
}
// Recuperar el cliente efectivamente usado por un intento interrumpido sin informe final.
for(const name of fs.readdirSync(process.env.LOCALAPPDATA).filter(n=>/^ctsk-client-[a-f0-9]{12}$/.test(n))){const dir=path.join(process.env.LOCALAPPDATA,name),f=path.join(dir,'preproduction-client.json');if(!fs.existsSync(f))continue;const doc=JSON.parse(fs.readFileSync(f)),key=installations.get(doc.body?.installationId);if(key&&doc.body.directory===dir&&crypto.verify(null,Buffer.from(JSON.stringify(doc.body)),key,Buffer.from(doc.signature,'base64')))clients.add(dir);}
const latest=JSON.parse(fs.readFileSync(path.join(out,'verification.json')));
if(latest.completed){for(let i=0;i<latest.clusters.length;i++){const dir=latest.clusters[i].directory;for(const f of fs.readdirSync(dir).filter(n=>/\.(?:png|pdf)$/.test(n))){const target=path.join(out,'artifacts',i===0?'source':'restored',f);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(dir,f),target);}}}
const result={createdAt:new Date().toISOString(),laboratories:inventory,clients:[...clients],ports:[...ports].sort((a,b)=>a-b),reports};
fs.writeFileSync(path.join(out,'inventory.json'),JSON.stringify(result,null,2));
const hashes=fs.readdirSync(out).filter(n=>/\.json$/.test(n)&&n!=='jest-final.json').map(n=>({file:n,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(out,n))).digest('hex')}));
fs.writeFileSync(path.join(out,'evidence-hashes.json'),JSON.stringify(hashes,null,2));
console.log(JSON.stringify({laboratories:inventory.length,pidFiles:inventory.filter(x=>x.postmasterPidPresent).length,clients:clients.size,ports:result.ports.length,reports}));
