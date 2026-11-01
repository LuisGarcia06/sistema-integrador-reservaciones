'use strict';
// Flujo de lectura corregido; el flujo histórico está conservado en evidencia.
const path=require('node:path'),P=require('./policy.cjs'),Readiness=require('./readiness.cjs');
const ROOT=path.resolve(__dirname,'../..');
function context(){P.fail('NATIVE_SECURITY_REQUIRED');}
function validateJob(){P.fail('NATIVE_SECURITY_REQUIRED');}
async function dispatch(action,ack=false){
 if(action==='verify'){
  if(ack!==true)P.fail('SESSION_REJECTED');
  return Readiness.inspect(ROOT);
 }
 if(action==='status'){
  const readiness=Readiness.inspect(ROOT);
  return {...readiness,steps:Array(8).fill('pending'),stateNotRead:true,release:P.RELEASE};
 }
 if(!P.STEPS.includes(action))P.fail('UNKNOWN_ACTION');
 // Ninguna etapa de escritura puede ejecutar los mecanismos heredados.
 P.fail('NATIVE_SECURITY_REQUIRED');
}
module.exports={dispatch,context,validateJob};
