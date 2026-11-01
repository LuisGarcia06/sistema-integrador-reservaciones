'use strict';
// Publicación de archivos reales de inscripción, solo después de las verificaciones
// del mantenimiento. Sin shell, creación de claves, contraseñas ni aprovisionamiento.
const fs=require('node:fs'),path=require('node:path');
function verifyServerState(plan,{policy:P,privateBytes}){
 const m=plan.manifest,b=m.bootstrapOrigin;
 if(!['initialized','restored'].includes(m.state)||!b||!P.uuid(b.attempt)||!Number.isSafeInteger(b.user)||b.user<=0)throw Error('CLIENT_BOOTSTRAP_REQUIRED');
 if(m.state==='initialized'){
  const proof=JSON.parse(privateBytes(path.join(m.directory,'bootstrap-completed026.json'))),v=proof?.body;
  if(!P.signed(m.verificationKey,proof)||v?.purpose!=='ctsk-bootstrap-completed026-v1'||v.attempt!==b.attempt||v.user!==b.user||v.cluster!==m.cluster||b.cluster!==m.cluster||v.code!==m.code||b.code!==m.code||v.generation!==m.dataGeneration||v.installationId!==m.installationId)throw Error('CLIENT_BOOTSTRAP_PROOF');
 }else{
  const r=P.authorized(plan.authority,plan.restorationReceipt,'ctsk-restoration026-v1');
  if(r.installationId!==m.installationId||r.authEpoch!==m.authEpoch||r.targetCluster!==m.cluster||r.targetDatabase!==m.database||r.generation!==m.dataGeneration)throw Error('CLIENT_RESTORATION_PROOF');
 }
 return true;
}
function publish({directory,authority,envelope,checkAcl,validate,sign,sha,authorize}){
 if(!path.isAbsolute(directory)||directory.startsWith('\\\\')||fs.realpathSync(directory)!==directory||fs.readdirSync(directory).length)throw Error('CLIENT_ENROLLMENT_NEW_DIRECTORY');
 if(authority?.scope!=='synthetic-acceptance-only'||authority.productionAuthorized!==false||envelope?.body?.purpose!=='ctsk-client-descriptor026-v1'||envelope.body.scope!==authority.scope||envelope.body.authorityId!==authority.authorityId||envelope.body.directory!==directory)throw Error('CLIENT_ENROLLMENT_BINDING');
 if(typeof authorize!=='function'||JSON.stringify(authorize(authority,envelope,'ctsk-client-descriptor026-v1'))!==JSON.stringify(envelope.body))throw Error('CLIENT_ENROLLMENT_SIGNATURE');
 const authorityFile=path.join(directory,'authority026.json'),descriptorFile=path.join(directory,'client026.json');
 function durable(filename,value){const fd=fs.openSync(filename,'wx');try{fs.writeFileSync(fd,JSON.stringify(value,null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}checkAcl(filename);}
 // Esta constancia no contiene secretos. Cualquier fallo conserva evidencia y
 // deja el directorio no vacío: nunca se sobrescribe/reintenta automáticamente.
 durable(path.join(directory,'client-enrollment-intent.json'),{purpose:'ctsk-client-enrollment-intent-v1',scope:authority.scope,productionAuthorized:false,installationId:envelope.body.installationId});
 durable(authorityFile,authority);
 durable(descriptorFile,envelope);
 const verified=validate(descriptorFile,authorityFile);
 if(!verified||verified.installationId!==envelope.body.installationId||verified.authEpoch!==envelope.body.authEpoch||verified.clientDigest!==envelope.body.clientDigest||verified.generation!==envelope.body.generation||verified.code!==envelope.body.code||verified.origin!==envelope.body.origin||verified.tlsSpki!==envelope.body.tlsSpki)throw Error('CLIENT_ENROLLMENT_POSTCONDITION');
 const receipt={purpose:'ctsk-client-enrollment-completed-v1',scope:authority.scope,productionAuthorized:false,installationId:verified.installationId,
  clientDigest:verified.clientDigest,serverCode:verified.code,descriptorSha256:sha(fs.readFileSync(descriptorFile)),authoritySha256:sha(fs.readFileSync(authorityFile))};
 durable(path.join(directory,'client-enrollment-completed.json'),sign(receipt));
 // Revalidación final; el llamante solo anuncia éxito después de esta salida.
 validate(descriptorFile,authorityFile);
 if(sha(fs.readFileSync(descriptorFile))!==receipt.descriptorSha256||sha(fs.readFileSync(authorityFile))!==receipt.authoritySha256)throw Error('CLIENT_ENROLLMENT_CHANGED');
 return {descriptorFile,authorityFile,receipt};
}
module.exports={publish,verifyServerState};
