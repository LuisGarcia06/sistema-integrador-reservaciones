'use strict';
// Ensayo del creador real en un namespace desechable; no aprovisiona la aplicación.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const I=require('./integrity.cjs'),P=require('./policy.cjs'),N=require('./native-readiness.cjs');
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
function pathsFor(local,operationId){
 if(!uuid(operationId)||!path.isAbsolute(local)||local.startsWith('\\\\'))throw Error('F02_REQUEST');
 const root=path.join(local,'ctsk-f02-'+operationId);
 return {root,children:[path.join(root,'ctsk-setup026-2e7-candidate-05'),path.join(root,'ctsk-server026-'+operationId),path.join(root,'ctsk-client026-2e7-candidate-05')]};
}
function withinDeadline(deadline){if(!Number.isSafeInteger(deadline)||Date.now()+35000>=deadline)throw Error('F02_TIMEOUT_REVIEW');}
function inspect(root,operationId,{run=cp.spawnSync,deadline=Date.now()+300000}={}){
 withinDeadline(deadline);
 const manifest=I.verify(root);if(manifest.name!=='026-directory-validation-01'||manifest.scope!==P.SCOPE||manifest.writeAuthorizationFromF01!==false)throw Error('F02_INTEGRITY');
 const env=P.environment(process.env);if(!env.LOCALAPPDATA)throw Error('F02_CONTEXT');
 const local=fs.realpathSync(env.LOCALAPPDATA),plan=pathsFor(local,operationId),reader=path.join(root,'native/SetupIdentityAcl.exe'),creator=path.join(root,'native/SetupPrivateDirectories.exe');
 withinDeadline(deadline);const report=N.inspectPaths(reader,{local},env,[{path:reader,policy:'program-file'},{path:creator,policy:'program-file'},{path:plan.root,policy:'private-directory'}],{run});
 if(report.paths[2].status!=='missing')throw Error('DIRECTORY_EXISTS');
 return {root,local,env,plan,reader,creator,machine:report.machine,operationId,deadline};
}
function create(context,ack,{run=cp.spawnSync}={}){
 if(ack!=='AUTORIZO SOLO F02')throw Error('F02_WRITE_NOT_AUTHORIZED');
 // Releer las condiciones propias de F-02, no reutilizar identidad de F-01.
 const c=inspect(context.root,context.operationId,{run,deadline:context.deadline});
 if(c.machine.sid!==context.machine.sid||c.machine.uuid!==context.machine.uuid)throw Error('F02_IDENTITY_CHANGED');
 const request={protocol:'ctsk-private-directories-v1',scope:P.SCOPE,productionAuthorized:false,operationId:c.operationId,release:'2e7-candidate-05',sid:c.machine.sid,uuid:c.machine.uuid,local:c.local,paths:c.plan.children,validationRoot:c.plan.root};
 const call=()=>{withinDeadline(c.deadline);return run(c.creator,['--create-private'],{input:JSON.stringify(request),env:c.env,encoding:'utf8',windowsHide:true,shell:false,timeout:30000,maxBuffer:65536});};
 const result=call();let report;try{report=JSON.parse(result.stdout);}catch{throw Error('F02_CREATE_REVIEW');}
 const dirs=[c.plan.root,...c.plan.children];
 if(result.status!==0||result.error||result.signal||String(result.stderr||'').trim()||report.protocol!==request.protocol||report.scope!==P.SCOPE||report.productionAuthorized!==false||report.operationId!==request.operationId||report.complete!==true||report.sid!==c.machine.sid||report.uuid!==c.machine.uuid||JSON.stringify(report.created)!==JSON.stringify(dirs))throw Error('F02_CREATE_REVIEW');
 const check=paths=>{withinDeadline(c.deadline);const v=N.inspectPaths(c.reader,{local:c.local},c.env,paths,{run});if(v.machine.sid!==c.machine.sid||v.machine.uuid!==c.machine.uuid||v.paths.some(row=>row.status!=='safe'))throw Error('F02_ACL_REVIEW');};
 check(dirs.map(p=>({path:p,policy:'private-directory'})));
 const markers=dirs.map(p=>path.join(p,'f02-inheritance-check.txt'));
 for(const marker of markers){withinDeadline(c.deadline);fs.writeFileSync(marker,'F02 synthetic inheritance check\n',{flag:'wx'});}
 check(markers.map(p=>({path:p,policy:'private-file'})));
 const before=I.tree(c.plan.root),negative=call();let rejected;try{rejected=JSON.parse(negative.stdout);}catch{throw Error('F02_NEGATIVE_REVIEW');}
 if(negative.status!==1||negative.error||negative.signal||String(negative.stderr||'').trim()||rejected.protocol!==request.protocol||rejected.scope!==P.SCOPE||rejected.productionAuthorized!==false||rejected.operationId!==request.operationId||rejected.complete!==false||rejected.code!=='DIRECTORY_EXISTS'||JSON.stringify(rejected.created)!=='[]'||JSON.stringify(I.tree(c.plan.root))!==JSON.stringify(before))throw Error('F02_NEGATIVE_REVIEW');
 check(dirs.map(p=>({path:p,policy:'private-directory'})));
 const value={test:'F-02',scope:P.SCOPE,productionAuthorized:false,operationId:c.operationId,uuid:c.machine.uuid,sid:c.machine.sid,created:dirs,aclPostchecked:true,inheritancePostchecked:true,existingDestinationRejected:true,postgresExecuted:false,installerWritesAuthorized:false,readerSha256:I.sha(fs.readFileSync(c.reader)),creatorSha256:I.sha(fs.readFileSync(c.creator)),files:before};
 withinDeadline(c.deadline);const file=path.join(c.plan.root,'F02-result.json'),fd=fs.openSync(file,'wx');try{fs.writeFileSync(fd,JSON.stringify(value,null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}check([{path:file,policy:'private-file'}]);
 return {code:'F02_PRIVATE_DIRECTORIES_AND_NEGATIVE_VERIFIED',root:c.plan.root,receipt:file,scope:P.SCOPE,productionAuthorized:false};
}
module.exports={inspect,create,pathsFor};
