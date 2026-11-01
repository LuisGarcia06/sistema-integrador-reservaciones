// Entrada independiente exclusiva de laboratorio HTTP loopback; sin Electron/workers.
const P=require('./config/revisionApiPolicy'),base=require('./config/standalonePolicy');
async function start(filename){
    const env=require('./config/desktopPolicy').cleanEnvironment();delete env.ELECTRON_RUN_AS_NODE;process.env=env;
    const plan=P.readPlan(filename);base.verifyLocalCluster(plan.manifest);base.blockNetwork(plan.manifest.pgPort);
    require('./config/desktopConfiguration').initialize(plan.config);
    const pool=require('./config/database');let server;
    try{
        await P.verify(pool,plan);
        if(P.readPlan(filename).digest!==plan.digest)base.fail('CONFIG_CHANGED');
        const app=require('./revisionApiApp').createApp(plan,pool);
        server=require('node:http').createServer(app);server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=1000;
        await new Promise((yes,no)=>{server.once('error',no);server.listen({host:'127.0.0.1',port:plan.manifest.httpPort,exclusive:true},yes);});
        let closing;
        const close=()=>closing||=new Promise(resolve=>{server.close(()=>resolve());server.closeAllConnections();}).then(()=>pool.end());
        return {server,pool,plan,close};
    }catch(e){server?.close();await pool.end();throw e;}
}
async function main(){
    const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--manifest')throw Error('REVISION_API_ARGUMENTS');
    const service=await start(args[1]);console.log('REVISION_API_READY');
    process.once('SIGTERM',()=>void service.close());process.once('SIGINT',()=>void service.close());
}
if(require.main===module)main().catch(e=>{console.error('REVISION_API_FAILED '+(e.code||e.message));process.exitCode=1;});
module.exports={start};
