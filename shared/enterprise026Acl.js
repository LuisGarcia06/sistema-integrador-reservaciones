'use strict';
// Exclusivo enterprise026. No cambia el lector de ACL del entorno principal.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),R=require('./release026');
function checkAcl(filename,{root=path.resolve(__dirname,'..'),run=cp.spawnSync,platform=process.platform}={}){
 const fail=code=>{throw Object.assign(Error(code),{code});};
 if(platform!=='win32'||!path.isAbsolute(filename)||filename.startsWith('\\\\'))fail('CONFIG_ACL');
 R.inventory(root);
 const approval=JSON.parse(fs.readFileSync(path.join(root,'native/native-approval.json'),'utf8'));
 const exe=path.join(root,'native/SetupIdentityAcl.exe');
 if(approval?.protocol!=='ctsk-native-approval-v1'||approval.scope!=='synthetic-acceptance-only'||approval.productionAuthorized!==false||approval.reader?.windows11Validated!==true||!approval.reader.evidence)fail('NATIVE_VALIDATION_REQUIRED');
 if(crypto.createHash('sha256').update(fs.readFileSync(exe)).digest('hex')!==approval.reader.sha256)fail('CONFIG_ACL');
 const allowed=new Set('SYSTEMROOT WINDIR USERPROFILE LOCALAPPDATA APPDATA TEMP TMP SYSTEMDRIVE'.split(' '));
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>allowed.has(key.toUpperCase())));
 const result=run(exe,['--inspect'],{input:JSON.stringify({protocol:'ctsk-setup-acl-read-v1',paths:[{path:filename,policy:'private-file'}]}),env,encoding:'utf8',windowsHide:true,shell:false,timeout:30000,maxBuffer:65536});
 if(!result||result.status!==0||result.error!=null||result.signal!=null||String(result.stderr||'').trim())fail('CONFIG_ACL');
 let v;try{v=JSON.parse(result.stdout);}catch{fail('CONFIG_ACL');}
 const fields='protocol scope productionAuthorized complete code platform arch release manufacturer model uuid sid localAppData paths firstTokenVerified containmentVerified'.split(' ');
 const local=Object.entries(env).find(([key])=>key.toUpperCase()==='LOCALAPPDATA')?.[1];
 if(!v||Object.keys(v).length!==fields.length||fields.some(key=>!Object.hasOwn(v,key))||v.protocol!=='ctsk-setup-acl-read-v1'||v.scope!=='synthetic-acceptance-only'||v.productionAuthorized!==false||v.complete!==true||v.code!=='READ_COMPLETE'||v.platform!=='win32'||v.arch!=='x64'||!/^10\.0\.\d+$/.test(v.release||'')||Number(v.release.split('.')[2])<22000||!['Oracle Corporation','innotek GmbH'].includes(v.manufacturer)||v.model!=='VirtualBox'||!/^S-1-5-21-(?:\d+-){2}\d+-\d+$/.test(v.sid||'')||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(v.uuid||'')||!local||typeof v.localAppData!=='string'||path.resolve(v.localAppData).toLowerCase()!==path.resolve(local).toLowerCase()||v.firstTokenVerified!==false||v.containmentVerified!==false||v.paths?.length!==1||Object.keys(v.paths[0]||{}).sort().join(',')!=='path,policy,status'||v.paths[0].path!==filename||v.paths[0].policy!=='private-file')fail('CONFIG_ACL');
 if(v.paths[0].status==='missing')fail('CONFIG_MISSING');
 if(v.paths[0].status!=='safe')fail('CONFIG_ACL');
}
module.exports={checkAcl};
