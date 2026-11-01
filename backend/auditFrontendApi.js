'use strict';
// Entrada explícita de 2D.8B.3. Nunca importada por server.js o Electron principal.
async function start(filename) { return require('./auditApi').start(filename,{auditFrontend:true}); }
if (require.main===module) {
    const args=process.argv.slice(2);
    if(args.length!==2 || args[0]!=='--manifest') throw Error('AUDIT_FRONTEND_ARGUMENTS');
    start(args[1]).then(service=>{
        console.log('AUDIT_FRONTEND_API_READY');
        process.once('SIGTERM',()=>void service.close());process.once('SIGINT',()=>void service.close());
    }).catch(error=>{console.error('AUDIT_FRONTEND_API_FAILED '+(error.code||error.message));process.exitCode=1;});
}
module.exports={start};
