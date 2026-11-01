const https=require('node:https');
const P=require('./config/standalonePolicy'),H=require('./config/httpsLabPolicy');
const {createResponder}=require('./security/serverIdentity');
async function main(argv=process.argv.slice(2)){
    if(argv.length!==2||argv[0]!=='--server')P.fail('HTTPS_SERVER_CONFIG');
    const env=require('./config/desktopPolicy').cleanEnvironment();delete env.ELECTRON_RUN_AS_NODE;process.env=env;
    const plan=H.readServer(argv[1]);
    const signer=createResponder({privateKey:plan.identityKey,serverId:plan.serverId,release:plan.manifest.code,origin:plan.origin});
    let healthy=true;
    const service=await require('./standalone').startStandalone(plan,{
        readPlan:H.readServer,createServer:handler=>https.createServer(plan.tls,handler),
        respondIdentity:async({nonce,res,pool})=>{
            let response;
            try{response=signer.respond(nonce);}catch{res.writeHead(409);return res.end();}
            try{
                if(!healthy)await require('./config/desktopPostgres').verifyPostgresWithIdentity(pool,plan.config,(r,c)=>P.validateIdentity(r,c,plan.manifest));
                await pool.query('SELECT 1');healthy=true;
            }catch{healthy=false;throw Error('DATABASE_UNAVAILABLE');}
            res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(response));
        }
    });
    let stopping=false;
    const stop=()=>{if(stopping)return;stopping=true;void service.close().then(()=>process.exit(0),()=>process.exit(1));};
    process.once('SIGINT',stop);process.once('SIGTERM',stop);
    console.log(JSON.stringify({code:'HTTPS_LAB_READY',host:P.HOST,port:plan.manifest.httpPort,pid:process.pid}));
}
if(require.main===module)main().catch(()=>{console.error('HTTPS_LAB_START_REJECTED');process.exitCode=1;});
module.exports={main};
