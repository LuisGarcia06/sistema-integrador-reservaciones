const https = require('node:https');
const C = require('../shared/lanContract'), P = require('./config/standalonePolicy'), L = require('./config/lanLabPolicy');
const {createResponder} = require('./security/serverIdentity');
async function start(plan) {
    const endpoint = plan.endpoint;
    const signer = createResponder({privateKey:plan.identityKey,serverId:plan.serverId,release:plan.manifest.code,origin:plan.origin,environment:C.ENVIRONMENT});
    let healthy = true;
    const service = await require('./standalone').startStandalone(plan,{
        readPlan:L.readServer,bindHost:endpoint.address,authorizeRequest:req=>C.authorizeRequest(endpoint,req),
        createServer:handler=>{
            const server = https.createServer(plan.tls,handler);
            // Filtrar pares antes del handshake y de Express. Sin trust proxy ni X-Forwarded-For.
            server.on('connection',socket=>{if(socket.remoteAddress !== endpoint.network.client.address) socket.destroy();});
            return server;
        },
        respondIdentity:async({nonce,res,pool})=>{
            let proof; try { proof = signer.respond(nonce); } catch { res.writeHead(409); return res.end(); }
            try {
                if (!healthy) await require('./config/desktopPostgres').verifyPostgresWithIdentity(pool,plan.config,(r,c)=>P.validateIdentity(r,c,plan.manifest));
                await pool.query('SELECT 1'); healthy = true;
            } catch { healthy = false; throw Error('DATABASE_UNAVAILABLE'); }
            res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(proof));
        }
    });
    const guard = setInterval(()=>{
        try { C.verifyLocal(endpoint.network,'server'); }
        catch { clearInterval(guard); void service.close().finally(()=>process.exit(1)); }
    },3000); guard.unref();
    return {server:service.server,close:()=>{clearInterval(guard);return service.close();}};
}
async function main(argv=process.argv.slice(2)) {
    if (argv.length !== 2 || argv[0] !== '--server') C.fail('LAN_SERVER_CONFIG');
    C.cleanClientEnvironment();
    const env = require('./config/desktopPolicy').cleanEnvironment(); delete env.ELECTRON_RUN_AS_NODE; process.env = env;
    const plan = L.readServer(argv[1]), service = await start(plan);
    let stopping = false;
    const stop = ()=>{if(stopping)return;stopping=true;void service.close().then(()=>process.exit(0),()=>process.exit(1));};
    process.once('SIGINT',stop);process.once('SIGTERM',stop);
    console.log(JSON.stringify({code:'LAN_LAB_READY',host:plan.endpoint.address,port:plan.endpoint.port,pid:process.pid}));
}
if(require.main===module)main().catch(e=>{console.error('LAN_LAB_START_REJECTED '+(/^[A-Z_]+$/.test(e.code||'')?e.code:'INVALID_PLAN'));process.exitCode=1;});
module.exports={start,main};
