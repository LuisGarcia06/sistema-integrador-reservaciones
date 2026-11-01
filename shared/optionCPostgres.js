'use strict';
// Frontera de producción con el ejecutor nativo de opción C. Nunca ejecuta PG
// mediante spawn genérico ni acepta un resultado basado solo en exitCode.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),os=require('node:os'),R=require('./release026');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function servicePlan(installationId,pgPort){
 if(!R.uuid(installationId)||!Number.isInteger(pgPort)||pgPort<1024||pgPort>65535||pgPort===5432)throw Error('OPTION_C_PLAN');
 const serviceName='CTSK026-'+installationId,base=path.win32.join('C:\\ProgramData\\CommunityTours\\Acceptance026',installationId);
 return {installationId,pgPort,serviceName,serviceAccount:'NT SERVICE\\'+serviceName,dataDirectory:path.win32.join(base,'data'),serviceExecutable:'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_ctl.exe',serviceArgs:['runservice','-N',serviceName,'-D',path.win32.join(base,'data'),'-w','-t','60']};
}
function capabilities(root){
 if(process.platform!=='win32'||process.arch!=='x64'||!/^10\.0\.\d+$/.test(os.release())||Number(os.release().split('.')[2])<22000)throw Error('OPTION_C_PROVISIONING_UNVALIDATED');
 R.inventory(root);
 let approval;try{approval=JSON.parse(fs.readFileSync(path.join(root,'native/native-approval.json'),'utf8'));}catch{throw Error('OPTION_C_PROVISIONING_UNVALIDATED');}
 if(approval.protocol!=='ctsk-native-approval-v1'||approval.scope!=='synthetic-acceptance-only'||approval.productionAuthorized!==false||approval.writeOperationsAuthorized!==true||['reader','initdb','service'].some(kind=>approval[kind]?.windows11Validated!==true||!approval[kind].evidence||!hex(approval[kind].sha256))||approval.initdb.sha256!==approval.service.sha256)throw Error('OPTION_C_PROVISIONING_UNVALIDATED');
 const executable=path.join(root,'native/SetupPostgres.exe');
 if(hash(fs.readFileSync(executable))!==approval.initdb.sha256)throw Error('OPTION_C_NATIVE_INTEGRITY');
 const dependencyFile=path.join(root,'native/postgres-dependency.json'),dependencyBytes=fs.readFileSync(dependencyFile),dependency=JSON.parse(dependencyBytes);
 validateDependency(dependency);
 for(const entry of dependency.files){if(!hex(entry.sha256)||typeof entry.file!=='string'||!entry.file.startsWith('C:\\Program Files\\PostgreSQL\\18\\')||entry.file!==path.win32.resolve(entry.file)||hash(fs.readFileSync(entry.file))!==entry.sha256)throw Error('POSTGRES_DEPENDENCY_UNVERIFIED');}
 return {executable,dependencyInventorySha256:hash(dependencyBytes)};
}
function validateDependency(dependency){
 if(dependency?.scope!=='synthetic-acceptance-only'||dependency.productionAuthorized!==false||dependency.postgresVersion!=='18.6'||dependency.authenticated!==true||!Array.isArray(dependency.files)||!dependency.files.length)throw Error('POSTGRES_DEPENDENCY_UNVERIFIED');
 const files=dependency.files.map(row=>row.file);
 if(new Set(files.map(file=>String(file).toLowerCase())).size!==files.length)throw Error('POSTGRES_DEPENDENCY_UNVERIFIED');
 for(const name of require('./postgresExperimentalContract').TOOLS)if(!files.includes('C:\\Program Files\\PostgreSQL\\18\\bin\\'+name+'.exe'))throw Error('POSTGRES_DEPENDENCY_UNVERIFIED');
}
function binding(plan,v){
 if(v?.installationId!==plan.installationId||v.serviceName!==plan.serviceName||v.serviceAccount!==plan.serviceAccount||v.dataDirectory!==plan.dataDirectory||v.pgPort!==plan.pgPort||!/^S-1-5-80-(?:\d+-){4}\d+$/.test(v.serviceSid||'')||!hex(v.postgresImageSha256)||v.serviceExecutable!==plan.serviceExecutable||JSON.stringify(v.serviceArgs)!==JSON.stringify(plan.serviceArgs))throw Error('OPTION_C_SERVICE_IDENTITY');return v;
}
function initEvidence(plan,value,dependencyDigest){
 if(value?.validationOnly===true||value?.initdbResumed===false)throw Error('OPTION_C_VALIDATION_IS_NOT_PROVISIONING');
 if(value?.scope!=='synthetic-acceptance-only'||value.productionAuthorized!==false||value.complete!==true||value.dependencyInventorySha256!==dependencyDigest||value.postgresVersion!=='18.6'||value.serverVersionNum!=='180006')throw Error('OPTION_C_INIT_EVIDENCE');
 const service=binding(plan,value.binding),token=value.firstToken;
 const phases=['created-suspended','job-assigned','token-checked','resumed','exited','job-empty'];
 if(JSON.stringify(value.phases)!==JSON.stringify(phases)||value.exitCode!==0||value.jobEmpty!==true||value.cleanInitialization!==true||value.cmdContextVerified!==true||!/^\d{19,20}$/.test(value.systemIdentifier||'')||value.systemIdentifier==='7632825987452064788')throw Error('OPTION_C_INIT_EVIDENCE');
 if(token?.userSid!==service.serviceSid||token.restricted!==true||token.integrity!=='Medium'||token.elevated!==false||token.elevationType!==1||token.sessionId!==0||!token.groups||!token.privileges||!Array.isArray(token.restrictedSids)||!token.restrictedSids.includes(service.serviceSid)||new Set(token.restrictedSids).size!==token.restrictedSids.length||token.restrictedSids.some(sid=>typeof sid!=='string'||!/^S-1-(?:\d+-)*\d+$/.test(sid)))throw Error('OPTION_C_FIRST_TOKEN');
 for(const sid of ['S-1-5-32-544','S-1-5-32-547'])if(!Object.hasOwn(token.groups,sid)||!(token.groups[sid]===null||token.groups[sid]===16||token.groups[sid]===17))throw Error('OPTION_C_FIRST_TOKEN');
 if(!Object.keys(token.privileges).length||Object.entries(token.privileges).some(([name,enabled])=>!['SeChangeNotifyPrivilege','SeLockMemoryPrivilege'].includes(name)||typeof enabled!=='boolean'))throw Error('OPTION_C_FIRST_TOKEN');
 return {binding:service,systemIdentifier:value.systemIdentifier};
}
function enrollment(manifest,receipt,evidenceBytes,dependencyBytes){
 const plan=servicePlan(manifest.installationId,manifest.pgPort);
 binding(plan,manifest.nativeService);
 const dependency=JSON.parse(dependencyBytes);validateDependency(dependency);
 const digest=hash(dependencyBytes);
 if(manifest.dataDirectory!==plan.dataDirectory||receipt?.serviceBindingSha256!==hash(JSON.stringify(manifest.nativeService))||receipt.initEvidenceSha256!==hash(evidenceBytes)||receipt.dependencyInventorySha256!==digest)throw Error('OPTION_C_ENROLLMENT');
 const result=initEvidence(plan,JSON.parse(evidenceBytes),digest);
 if(result.systemIdentifier!==manifest.cluster||hash(JSON.stringify(result.binding))!==receipt.serviceBindingSha256)throw Error('OPTION_C_ENROLLMENT');
 return result;
}
function verifyReply(request,value){
 const {action,plan}=request;
 if(!['initialize','query','start','stop','credentials'].includes(action))throw Error('OPTION_C_ACTION');
 if(value?.protocol!==request.protocol||value.operationId!==request.operationId||value.scope!==request.scope||value.productionAuthorized!==false||value.complete!==true)throw Error('OPTION_C_OPERATION_REVIEW');
 if(action!=='credentials'&&Object.hasOwn(value,'secret'))throw Error('OPTION_C_UNEXPECTED_SECRET');
 if(action==='initialize')initEvidence(plan,value,request.dependencyInventorySha256);
 else{
  binding(plan,value.binding);
  if(value.systemIdentifier!==request.expectedSystemIdentifier)throw Error('OPTION_C_SERVICE_IDENTITY');
  if(action==='credentials'){if(value.credentialKind!==request.credentialKind||!hex(value.secret))throw Error('OPTION_C_CREDENTIAL_REJECTED');}
  else if(action==='stop'){if(value.serviceState!=='stopped'||['postmasterHandleSignaled','serviceHandleSignaled','ownedProcessTreeEmpty','portReleased','cleanShutdownRecorded','identityRechecked'].some(key=>value[key]!==true))throw Error('OPTION_C_STOP_UNPROVEN');}
  else if(action==='query'&&value.serviceState==='stopped'){if(value.ownedProcessTreeEmpty!==true||value.portReleased!==true||value.clusterIdentityVerified!==true)throw Error('OPTION_C_SERVICE_IDENTITY');}
  else if(value.serviceState!=='running'||!Number.isSafeInteger(value.postmasterPid)||value.postmasterPid<=0||value.postgresTokenSid!==value.binding.serviceSid||value.postgresTokenRestricted!==true||value.portOwned!==true||value.clusterIdentityVerified!==true)throw Error('OPTION_C_SERVICE_IDENTITY');
 }
 return value;
}
function invoke(root,action,plan,extra={}, {run=cp.spawnSync}={}){
 if(!['initialize','query','start','stop','credentials'].includes(action))throw Error('OPTION_C_ACTION');
 const keys=action==='credentials'?['expectedSystemIdentifier','credentialKind']:action==='initialize'?[]:['expectedSystemIdentifier'];
 if(!extra||Object.keys(extra).some(key=>!keys.includes(key))||(action!=='initialize'||Object.keys(extra).length)&&(!/^\d{19,20}$/.test(extra.expectedSystemIdentifier||'')||extra.expectedSystemIdentifier==='7632825987452064788')||(action==='credentials'&&!['maintenance','runtime'].includes(extra.credentialKind)))throw Error('OPTION_C_REQUEST');
 const cap=capabilities(root),operationId=crypto.randomUUID(),request={protocol:'ctsk-optionc-service-v1',scope:'synthetic-acceptance-only',productionAuthorized:false,operationId,action,plan,dependencyInventorySha256:cap.dependencyInventorySha256,...extra};
 const allowed=new Set('SYSTEMROOT WINDIR USERPROFILE LOCALAPPDATA APPDATA TEMP TMP PROGRAMDATA'.split(' ')),env=Object.fromEntries(Object.entries(process.env).filter(([k])=>allowed.has(k.toUpperCase())));
 const timeout=action==='initialize'?600000:['start','stop'].includes(action)?180000:90000;
 const result=run(cap.executable,['--request'],{input:JSON.stringify(request),env,encoding:'utf8',shell:false,windowsHide:true,timeout,maxBuffer:65536});
 if(!result||result.status!==0||result.error!=null||result.signal!=null||String(result.stderr||'').trim()){
  const error=Error('OPTION_C_OPERATION_REVIEW');
  try{const v=JSON.parse(result.stdout);if(result.status===1&&!result.error&&!result.signal&&!String(result.stderr||'').trim()&&v.protocol===request.protocol&&v.scope===request.scope&&v.productionAuthorized===false&&v.operationId===operationId&&v.complete===false&&/^[A-Z0-9_]{1,96}$/.test(v.code||'')&&Number.isInteger(v.win32Error)&&v.win32Error>=0&&v.win32Error<=65535){error.nativeCode=v.code;error.nativeWin32Error=v.win32Error;}}catch{}
  throw error;
 }
 let value;try{value=JSON.parse(result.stdout);}catch{throw Error('OPTION_C_OPERATION_REVIEW');}
 return verifyReply(request,value);
}
module.exports={servicePlan,capabilities,initEvidence,binding,invoke,validateDependency,enrollment,verifyReply};
