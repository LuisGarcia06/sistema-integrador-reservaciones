// Perfil HTTP separado: no frontend, Electron, admisión previa ni workers.
const P=require('./config/commandApiPolicy'),base=require('./config/standalonePolicy');
async function start(filename){
    const env=require('./config/desktopPolicy').cleanEnvironment();delete env.ELECTRON_RUN_AS_NODE;process.env=env;
    const plan=P.readPlan(filename);base.verifyLocalCluster(plan.manifest);base.blockNetwork(plan.manifest.pgPort);
    require('./config/desktopConfiguration').initialize(plan.config);
    const pool=require('./config/database');let server;
    try{
        await P.verify(pool,plan);
        if(P.readPlan(filename).digest!==plan.digest)base.fail('CONFIG_CHANGED');
        server=require('node:http').createServer(require('./revisionApiApp').createApp(plan,pool));
        server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=1000;
        await new Promise((yes,no)=>{server.once('error',no);server.listen({host:'127.0.0.1',port:plan.manifest.httpPort,exclusive:true},yes);});
        let closing;const close=()=>closing||=new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}).then(()=>pool.end());
        return {server,pool,plan,close};
    }catch(e){server?.close();await pool.end();throw e;}
}
async function main(){
    const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--manifest')throw Error('COMMAND_API_ARGUMENTS');
    const service=await start(args[1]);console.log('COMMAND_API_READY');
    process.once('SIGTERM',()=>void service.close());process.once('SIGINT',()=>void service.close());
}
if(require.main===module)main().catch(e=>{console.error('COMMAND_API_FAILED '+(e.code||e.message));process.exitCode=1;});
module.exports={start};
