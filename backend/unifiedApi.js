'use strict';
const crypto=require('node:crypto'),http=require('node:http'),B=require('./config/standalonePolicy'),P=require('./config/unifiedPolicy');
async function start(filename){
 if(!process.send)B.fail('UNIFIED_PRIVATE_PARENT_REQUIRED');
 process.env=require('./config/desktopPolicy').cleanEnvironment();delete process.env.ELECTRON_RUN_AS_NODE;
 const plan=P.readPlan(filename);B.verifyLocalCluster(plan.manifest);B.blockNetwork(plan.manifest.pgPort);
 const challenge=crypto.randomBytes(32).toString('hex');
 const proof=await new Promise((yes,no)=>{const onMessage=m=>{if(m?.type!=='unified-attestation')return;cleanup();m.proof?yes(m.proof):no(Error('UNIFIED_LOCAL_VERIFICATION_FAILED'));};const onDisconnect=()=>{cleanup();no(Error('UNIFIED_PARENT_LOST'));};const timer=setTimeout(()=>{cleanup();no(Error('UNIFIED_VERIFICATION_TIMEOUT'));},60000);function cleanup(){clearTimeout(timer);process.off('message',onMessage);process.off('disconnect',onDisconnect);}process.on('message',onMessage);process.once('disconnect',onDisconnect);process.send({type:'unified-challenge',challenge});});
 P.verifyAttestation(plan,challenge,proof);
 require('./config/desktopConfiguration').initialize(plan.config);
 const pool=require('./config/database');require('./services/credentialAuth.service').initialize(plan,pool);let server;
 try{await P.verify(pool,plan,proof,challenge);server=http.createServer(require('./revisionApiApp').createApp(plan,pool));server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=1000;
 await new Promise((yes,no)=>{server.once('error',no);server.listen({host:B.HOST,port:plan.manifest.httpPort,exclusive:true},yes);});
 let closing;const close=()=>closing||=new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}).then(()=>pool.end());process.once('disconnect',()=>void close());process.on('message',m=>{if(m?.type==='backend-identity'&&/^[a-f0-9]{64}$/.test(m.nonce||'')){const identity=B.publicIdentity(plan);process.send({type:'backend-identity',id:m.id,nonce:m.nonce,identity,proof:B.proof(plan.key,m.nonce,identity)});}});return {server,pool,plan,close};
 }catch(e){server?.close();await pool.end();throw e;}
}
if(require.main===module){const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--manifest')process.exitCode=1;else start(args[1]).then(s=>{console.log('UNIFIED_READY');process.once('SIGTERM',()=>void s.close());process.once('SIGINT',()=>void s.close());}).catch(e=>{console.error('UNIFIED_FAILED '+(/^[A-Z0-9_]{1,80}$/.test(e.code||e.message)?e.code||e.message:'START_REJECTED'));process.exitCode=1;});}
module.exports={start};
