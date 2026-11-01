'use strict';
// Entrada optativa exclusiva de Catálogos 022. Nunca importa la entrada principal.
const P=require('./config/adminAuditApiPolicy'),B=require('./config/standalonePolicy');
async function start(filename){
    const env=require('./config/desktopPolicy').cleanEnvironment();delete env.ELECTRON_RUN_AS_NODE;process.env=env;
    const plan=P.readPlan(filename);B.verifyLocalCluster(plan.manifest);B.blockNetwork(plan.manifest.pgPort);
    require('./config/desktopConfiguration').initialize(plan.config);
    const pool=require('./config/database');let server;
    try{
        await P.verify(pool,plan);if(P.readPlan(filename).digest!==plan.digest)B.fail('CONFIG_CHANGED');
        server=require('node:http').createServer(require('./revisionApiApp').createApp(plan,pool));
        server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=1000;
        await new Promise((yes,no)=>{server.once('error',no);server.listen({host:B.HOST,port:plan.manifest.httpPort,exclusive:true},yes);});
        let closing;const close=()=>closing||=new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}).then(()=>pool.end());
        return {server,pool,plan,close};
    }catch(e){server?.close();await pool.end();throw e;}
}
async function main(){const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--manifest')throw Error('ADMIN_AUDIT_API_ARGUMENTS');const service=await start(args[1]);console.log('ADMIN_AUDIT_API_READY');process.once('SIGTERM',()=>void service.close());process.once('SIGINT',()=>void service.close());}
if(require.main===module)main().catch(e=>{console.error('ADMIN_AUDIT_API_FAILED '+(e.code||e.message));process.exitCode=1;});
module.exports={start};
