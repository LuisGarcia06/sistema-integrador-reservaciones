// Arranque normal de API verificada: sin mutar servicios ni fabricar auditoría.
async function main(){const service=await require('../backend/commandApi').start(process.argv[2]);process.once('SIGTERM',()=>void service.close());process.once('SIGINT',()=>void service.close());console.log('COMMAND_API_READY');}
main().catch(error=>{console.error('CONSULTATION_API_FAILED '+(error.code||error.message));process.exitCode=1;});
