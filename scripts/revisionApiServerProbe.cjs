// Proceso exclusivo de ensayo. La entrada normal NO instala este fallo sintético.
async function main(){
    const service=await require('../backend/revisionApi').start(process.argv[2]);
    const audit=require('../backend/services/bitacora.service'),original=audit.crearEntradaBitacora;
    audit.crearEntradaBitacora=async function(data,db){
        if(String(data.descripcion).includes('SYN-FAIL-AUDIT'))throw Error('SYNTHETIC_API_AUDIT_FAILURE');
        return original(data,db);
    };
    process.once('SIGTERM',()=>void service.close());process.once('SIGINT',()=>void service.close());
    console.log('REVISION_API_PROBE_READY');
}
main().catch(e=>{console.error('REVISION_API_PROBE_FAILED '+(e.code||e.message));process.exitCode=1;});
