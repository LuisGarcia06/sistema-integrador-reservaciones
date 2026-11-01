'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/local-fase-2e1');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function files(dir=root){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name),r=path.relative(root,p).replaceAll('\\','/');if(e.isSymbolicLink()||['node_modules','.git','dist','.access-scope-lab'].includes(e.name)||r.startsWith('docs/local-fase-2e1'))return [];return e.isDirectory()?files(p):[r];});}
function snapshot(){return files().filter(r=>!/(^|\/)\.env(?:\.|$)/.test(r)).map(file=>({file,sha256:sha(fs.readFileSync(path.join(root,file)))}));}
if(process.argv[2]==='before'){
 if(fs.existsSync(path.join(out,'source-before.json')))throw Error('BASELINE_EXISTS');
 fs.writeFileSync(path.join(out,'source-before.json'),JSON.stringify(snapshot(),null,2));
 fs.writeFileSync(path.join(out,'git-status-before.txt'),cp.execFileSync('git',['status','--short'],{cwd:root,encoding:'utf8'}));
 const reports=files().filter(f=>/^docs\/LOCAL-FASE-2D(?:[1-7]|8B[1-3]|9A|9B1|9B2[A-D]|9B3)\.md$/i.test(f));
 const reviewed=reports.map(file=>({file,sha256:sha(fs.readFileSync(path.join(root,file))),text:fs.readFileSync(path.join(root,file),'utf8')}));
 fs.writeFileSync(path.join(out,'prior-reports.json'),JSON.stringify(reviewed,null,2));
 console.log(JSON.stringify({files:snapshot().length,reports:reports.length}));
}else if(process.argv[2]==='backup'){
 const baseline=JSON.parse(fs.readFileSync(path.join(out,'source-before.json')));
 for(const file of process.argv.slice(3)){const b=fs.readFileSync(path.join(root,file)),expected=baseline.find(e=>e.file===file);if(!expected||expected.sha256!==sha(b))throw Error('BACKUP_BASELINE_MISMATCH '+file);const dst=path.join(out,'originals',file);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.writeFileSync(dst,b,{flag:'wx'});}
}else if(process.argv[2]==='after'){
 const before=JSON.parse(fs.readFileSync(path.join(out,'source-before.json'))),after=snapshot(),map=new Map(after.map(e=>[e.file,e.sha256]));
 const changes=before.filter(e=>map.get(e.file)!==e.sha256).map(e=>({...e,after:map.get(e.file)||null,backup:fs.existsSync(path.join(out,'originals',e.file))&&sha(fs.readFileSync(path.join(out,'originals',e.file)))===e.sha256}));
 fs.writeFileSync(path.join(out,'source-verification.json'),JSON.stringify({prior:before.length,unchanged:before.length-changes.length,changes,created:after.filter(e=>!before.some(b=>b.file===e.file))},null,2));
 fs.writeFileSync(path.join(out,'git-status-after.txt'),cp.execFileSync('git',['status','--short'],{cwd:root,encoding:'utf8'}));
 console.log(JSON.stringify({prior:before.length,changed:changes.length,allBackedUp:changes.every(e=>e.backup)}));
}
module.exports={root,out,sha,snapshot};
