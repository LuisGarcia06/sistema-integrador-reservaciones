// Exclusivo del harness privado: API normal y verificaciones intactas; fallos solo por IPC.
async function main(){
  if(!process.send||process.argv.length!==3)throw Error('CREATION_PROBE_REQUIRES_HARNESS');
  const service=await require('../backend/commandApi').start(process.argv[2]);
  const crypto=require('node:crypto'),randomBytes=crypto.randomBytes;
  const audit=require('../backend/services/bitacora.service'),writeAudit=audit.crearEntradaBitacora;
  let collisionRemaining=0,forcedCalls=0,codeAttempts=0,auditFailure=false,auditFailures=0;
  crypto.randomBytes=function(size,...args){
    if(size===5&&new Error().stack.includes('generarCodigoReservacion')){
      codeAttempts++;
      if(collisionRemaining>0){collisionRemaining--;forcedCalls++;return Buffer.from('c3c3c3c3c3','hex');}
    }
    return randomBytes.call(this,size,...args);
  };
  audit.crearEntradaBitacora=async function(data,db){
    const value=await writeAudit(data,db);
    if(auditFailure&&String(data.descripcion).startsWith('Reservación creada con código ')){
      auditFailure=false;auditFailures++;throw Error('SYNTHETIC_CREATION_AUDIT_FAILURE');
    }
    return value;
  };
  process.on('message',message=>{
    if(message.type==='creation-fault'&&message.mode==='code-collision'){collisionRemaining=2;forcedCalls=codeAttempts=0;process.send({type:'creation-fault-ready'});}
    if(message.type==='creation-fault'&&message.mode==='audit-failure'){auditFailure=true;process.send({type:'creation-fault-ready'});}
    if(message.type==='creation-fault-status')process.send({type:'creation-fault-status',forcedCalls,codeAttempts,collisionRemaining,auditFailures});
  });
  process.once('SIGTERM',()=>void service.close());process.once('SIGINT',()=>void service.close());
  console.log('COMMAND_API_READY');
}
main().catch(error=>{console.error('CREATION_PROBE_FAILED '+(error.code||error.message));process.exitCode=1;});
