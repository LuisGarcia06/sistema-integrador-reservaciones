'use strict';
const path=require('node:path');
const RELEASE='2e7-candidate-05',SCOPE='synthetic-acceptance-only';
const STEPS=['verify','directories','trust','init','bootstrap','client','server','open'];
function fail(code){throw Object.assign(Error(code),{code});}
function guardMachine(m){
 if(m.platform!=='win32'||m.arch!=='x64'||!/^10\.0\.\d+$/.test(m.release)||Number(m.release.split('.')[2])<22000)fail('VM_WINDOWS11_REQUIRED');
 if(!/^(Oracle Corporation|innotek GmbH)$/i.test(m.manufacturer||'')||!/^VirtualBox$/i.test(m.model||'')||!/^[a-f0-9-]{36}$/i.test(m.uuid||'')||!/^S-1-5-21-[0-9-]+$/.test(m.sid||''))fail('VIRTUALBOX_REQUIRED');
 return m;
}
function environment(source){
 for(const [key,value]of Object.entries(source))if(/^(DB_|PG|APP_|NODE_OPTIONS$|NODE_PATH$|NODE_EXTRA_CA_CERTS$|ELECTRON_RUN_AS_NODE$|GYG_|GETYOURGUIDE_|FAREHARBOR_|WHATSAPP_|GOOGLE_|JWT_|INTEGRATION_|HTTP_PROXY$|HTTPS_PROXY$|ALL_PROXY$)/i.test(key)||(key.toUpperCase()==='NODE_ENV'&&value!=='production'))fail('ENV_CONFLICT');
 const allowed=new Set('path systemroot windir comspec pathext temp tmp userprofile appdata localappdata programfiles programfiles(x86) programdata systemdrive allusersprofile username userdomain homedrive homepath'.split(' '));
 return {...Object.fromEntries(Object.entries(source).filter(([key])=>allowed.has(key.toLowerCase())).map(([key,value])=>[key.toUpperCase(),value])),NODE_ENV:'production'};
}
function locations(local){
 if(!path.isAbsolute(local)||local.startsWith('\\\\'))fail('LOCAL_PATH_REQUIRED');
 const programs=path.join(local,'CommunityTours/Candidates026',RELEASE);
 return {local,server:path.join(programs,'server'),client:path.join(programs,'client'),session:path.join(local,'ctsk-setup026-'+RELEASE),clientData:path.join(local,'ctsk-client026-'+RELEASE)};
}
function validateState(s,loc,m){
 if(s?.protocol!=='ctsk-setup026-v1'||s.release!==RELEASE||s.scope!==SCOPE||s.productionAuthorized!==false||s.uuid!==m.uuid||s.sid!==m.sid||s.session!==loc.session||s.clientData!==loc.clientData||!/^ctsk-server026-[a-f0-9-]{36}$/.test(path.basename(s.serverData||''))||path.dirname(s.serverData)!==loc.local||!Array.isArray(s.steps)||s.steps.length!==8||s.steps.some(x=>!['pending','running','done','review'].includes(x)))fail('SESSION_REJECTED');
 return s;
}
function canRun(s,action){
 const i=STEPS.indexOf(action);if(i<0)fail('UNKNOWN_ACTION');if(i===0)return i;
 if(s.steps.some(x=>x==='running'||x==='review'))fail('INTERRUPTED_REVIEW');
 if(s.steps.slice(0,i).some(x=>x!=='done'))fail('PREVIOUS_STEP_REQUIRED');
 if(s.steps[i]==='done'&&i<6)fail('ALREADY_COMPLETED');return i;
}
const MESSAGES={NATIVE_VALIDATION_REQUIRED:'Falta la validación nativa requerida en Windows 11. No se habilitan escrituras.',DIRECTORY_CREATION_REVIEW:'La preparación de carpetas requiere revisión. Se conservan posibles directorios parciales; no se repite automáticamente.',NATIVE_COMPONENT_INTEGRITY:'Un componente nativo no coincide con su aprobación e inventario.',NATIVE_SECURITY_REQUIRED:'Faltan verificaciones nativas de identidad y permisos compatibles con Restricted. No se ejecutó PowerShell ni se permite aprovisionar.',VM_WINDOWS11_REQUIRED:'Solo se permite Windows 11 x64 dentro de la VM. No se realizaron cambios.',VIRTUALBOX_REQUIRED:'No se pudo comprobar una VM VirtualBox autorizada.',ENV_CONFLICT:'Hay variables de entorno incompatibles. No se borraron ni se ignoraron.',INTEGRITY:'Los archivos no coinciden con el inventario esperado.',CONFIG_ACL:'Los permisos no cumplen el contrato 026.',DIRECTORY_EXISTS:'Un destino ya existe. No se sobrescribe ni se limpia.',SESSION_REJECTED:'La sesión no corresponde a esta VM, usuario o candidato.',INTERRUPTED_REVIEW:'Hay una operación interrumpida o fallida. Se conserva el estado; no se repite automáticamente.',PREVIOUS_STEP_REQUIRED:'Completa primero las etapas anteriores.',ALREADY_COMPLETED:'Esta etapa ya fue completada y no se repetirá.',POLICY_BLOCKED:'Windows no permitió ejecutar el script. Se conserva la política de ejecución.',MAINTENANCE_FAILED:'Mantenimiento no terminó correctamente. El estado requiere revisión; no vuelvas a inicializar.',T0_REJECTED:'No se comprobó un T0 limpio y coherente.',BOOTSTRAP_REVIEW:'No se pudo confirmar el bootstrap y su reinscripción. No lo repitas.',SERVER_UNAVAILABLE:'El servidor no presentó una identidad HTTPS válida. Revisa su consola.',CLIENT_REJECTED:'El cliente no confirmó su arranque. Revisa la configuración y el servidor.',BUSY:'Hay otra operación activa. No se inicia otra.',START_FAILED:'No se pudo completar esta etapa. Se conservó el estado para revisión.'};
function publicError(e){const original=e?.code||e?.message;if(original==='OPTION_C_PROVISIONING_UNVALIDATED')return {code:original,message:'El aprovisionador nativo de primer token, contención y servicio todavía no está implementado y validado. No se ejecuta PostgreSQL.'};if(original==='CONSOLE_START_FAILED')return {code:original,message:'No se pudo abrir la consola interactiva. No se repetirá el bootstrap automáticamente.'};if(original==='ENOENT')return {code:'INSTALLATION_MISSING',message:'No se encontró un archivo requerido de '+RELEASE+'. Comprueba la instalación de ese candidato y la extracción completa del ZIP.'};if(original==='CRYPTO_REJECTED')return {code:'CRYPTO_REJECTED',message:'El material HTTPS generado no superó la validación. Se conserva para revisión y no se repite la generación.'};const code=Object.hasOwn(MESSAGES,original)?original:'START_FAILED';return {code,message:MESSAGES[code]};}
module.exports={RELEASE,SCOPE,STEPS,fail,guardMachine,environment,locations,validateState,canRun,publicError};
