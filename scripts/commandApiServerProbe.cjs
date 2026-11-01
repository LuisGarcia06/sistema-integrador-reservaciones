// Fallos sintéticos exclusivos del corredor; la entrada normal no los instala.
async function main(){
    const service=await require('../backend/commandApi').start(process.argv[2]);
    const trace=new Map(),diagnose=async db=>(await db.query('SELECT pg_current_xact_id()::text transaction,pg_backend_pid() pid')).rows[0];
    const tx=require('../backend/config/revisionApiTransactions'),attempt=tx.attemptCommand,record=tx.recordCommand;
    tx.attemptCommand=work=>attempt(async()=>{
        const proof=await diagnose(service.pool);trace.set(proof.transaction,{business:proof,audits:[]});return work();
    });
    const audit=require('../backend/services/bitacora.service'),original=audit.crearEntradaBitacora;
    audit.crearEntradaBitacora=async function(data,db){
        if(String(data.descripcion).includes('SYN-FAIL-AUDIT'))throw Error('SYNTHETIC_COMMAND_AUDIT_FAILURE');
        const proof=await diagnose(db);trace.get(proof.transaction)?.audits.push(proof);return original(data,db);
    };
    tx.recordCommand=async function(entry){
        let failAfter=false;
        if(entry.recurso==='reservaciones'&&entry.id_recurso){
            const row=(await service.pool.query('SELECT habitacion FROM reservaciones WHERE id_reservacion=$1',[entry.id_recurso])).rows[0];
            if(row?.habitacion==='SYN-FAIL-COMMAND')throw Error('SYNTHETIC_COMMAND_RECORD_FAILURE');
            failAfter=row?.habitacion==='SYN-FAIL-AFTER-RECORD';
        }
        const value=await record(entry);
        if(failAfter)throw Error('SYNTHETIC_COMMAND_BEFORE_COMMIT_FAILURE');
        const command=await diagnose(service.pool),proof=trace.get(command.transaction);
        if(proof){process.send?.({type:'transaction-proof',key:entry.clave,...proof,command});trace.delete(command.transaction);}
        return value;
    };
    process.once('SIGTERM',()=>void service.close());process.once('SIGINT',()=>void service.close());
    console.log('COMMAND_API_PROBE_READY');
}
main().catch(e=>{console.error('COMMAND_API_PROBE_FAILED '+(e.code||e.message));process.exitCode=1;});
