'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const G=require('./native-gate.cjs'),N=require('./native-readiness.cjs'),P=require('./policy.cjs');
function create(context,{run=cp.spawnSync}={}){
 const {root,env,loc,machine}=context;
 const reader=G.requireComponent(root,'reader');
 const creator=G.requireComponent(root,'privateDirectories',{allowValidationTrial:true});
 const serverData=path.join(loc.local,'ctsk-server026-'+crypto.randomUUID()),paths=[loc.session,serverData,loc.clientData],operationId=crypto.randomUUID();
 if(paths.some(p=>fs.existsSync(p)))throw Error('DIRECTORY_EXISTS');
 const request={protocol:'ctsk-private-directories-v1',scope:P.SCOPE,productionAuthorized:false,operationId,release:P.RELEASE,sid:machine.sid,uuid:machine.uuid,local:loc.local,paths};
 const result=run(creator.file,['--create-private'],{input:JSON.stringify(request),env,encoding:'utf8',shell:false,windowsHide:true,timeout:30000,maxBuffer:65536});
 if(!result||result.status!==0||result.error!=null||result.signal!=null||String(result.stderr||'').trim())throw Error('DIRECTORY_CREATION_REVIEW');
 let report;try{report=JSON.parse(result.stdout);}catch{throw Error('DIRECTORY_CREATION_REVIEW');}
 if(report?.protocol!==request.protocol||report.scope!==P.SCOPE||report.productionAuthorized!==false||report.complete!==true||report.operationId!==operationId||report.sid!==machine.sid||report.uuid!==machine.uuid||JSON.stringify(report.created)!==JSON.stringify(paths))throw Error('DIRECTORY_CREATION_REVIEW');
 // Postvalidación independiente por el lector previamente validado; no confiar
 // en la sola declaración del ejecutable que acaba de crear las carpetas.
 const checked=N.inspectPaths(reader.file,loc,env,paths.map(p=>({path:p,policy:'private-directory'})),{run});
 if(checked.machine.sid!==machine.sid||checked.machine.uuid!==machine.uuid||checked.paths.some(p=>p.status!=='safe'))throw Error('DIRECTORY_CREATION_REVIEW');
 return {serverData,operationId,creatorSha256:creator.sha256,readerSha256:reader.sha256,postchecked:true};
}
module.exports={create};
