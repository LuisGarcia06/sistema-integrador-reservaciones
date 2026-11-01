// Entrada de ensayo con IPC privado. Arranca la API normal sin modificar servicios o esquema.
async function main(){
  if(!process.send||process.argv.length!==3)throw Error('TRANSPORT_PROBE_REQUIRES_HARNESS');
  const service=await require('../backend/commandApi').start(process.argv[2]);
  const tx=require('../backend/config/revisionApiTransactions'),attempt=tx.attemptCommand,record=tx.recordCommand,proofs=new Map();
  const diagnose=async()=> (await service.pool.query('SELECT pg_current_xact_id()::text xid,pg_backend_pid() pid')).rows[0];
  let fail=false;
  tx.attemptCommand=work=>attempt(async()=>{const business=await diagnose();proofs.set(business.xid,business);return work();});
  tx.recordCommand=async entry=>{
    const result=await record(entry),command=await diagnose(),business=proofs.get(command.xid);proofs.delete(command.xid);
    if(entry.recurso==='transportes'){
      const rolledBack=fail;fail=false;process.send({type:'transaction-proof',key:entry.clave,business,command,rolledBack});
      if(rolledBack)throw Error('SYNTHETIC_TRANSPORT_AFTER_COMMAND_FAILURE');
    }
    return result;
  };
  process.on('message',message=>{if(message.type==='transport-fault'){fail=true;process.send({type:'transport-fault-ready'});}});
  process.once('SIGTERM',()=>void service.close());process.once('SIGINT',()=>void service.close());console.log('COMMAND_API_READY');
}
main().catch(error=>{console.error('TRANSPORT_PROBE_FAILED '+(error.code||error.message));process.exitCode=1;});
