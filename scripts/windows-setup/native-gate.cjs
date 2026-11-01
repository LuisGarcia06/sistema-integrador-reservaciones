'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function requireComponent(root,kind,{validation=JSON.parse(fs.readFileSync(path.join(root,'resources/app/native-approval.json'),'utf8')),filename,allowValidationTrial=false}={}){
 if(allowValidationTrial&&kind!=='privateDirectories')throw Error('NATIVE_APPROVAL_INVALID');
 if(validation?.protocol!=='ctsk-native-approval-v1'||validation.scope!=='synthetic-acceptance-only'||validation.productionAuthorized!==false)throw Error('NATIVE_APPROVAL_INVALID');
 if(validation.writeOperationsAuthorized!==true)throw Error('NATIVE_WRITE_NOT_AUTHORIZED');
 const component=validation[kind];
 if(!component||!/^[a-f0-9]{64}$/.test(component.sha256||'')||(!allowValidationTrial&&(component.windows11Validated!==true||typeof component.evidence!=='string'||!component.evidence.trim())))throw Error('NATIVE_VALIDATION_REQUIRED');
 const files={reader:'SetupIdentityAcl.exe',privateDirectories:'SetupPrivateDirectories.exe',initdb:'SetupPostgres.exe',service:'SetupPostgres.exe'};
 const file=filename||path.join(root,'native',files[kind]||'');
 if(!files[kind]||sha(fs.readFileSync(file))!==component.sha256)throw Error('NATIVE_COMPONENT_INTEGRITY');
 return {file,sha256:component.sha256};
}
module.exports={requireComponent};
