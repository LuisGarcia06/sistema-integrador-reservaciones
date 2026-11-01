'use strict';
const http=require('node:http'),crypto=require('node:crypto'),P=require('./config/preproductionPolicy'),B=require('./config/standalonePolicy');
async function start(filename){
 if(!process.send)P.fail('PREPRODUCTION_LOCAL_LAUNCHER_REQUIRED');process.env=require('./config/desktopPolicy').cleanEnvironment();delete process.env.ELECTRON_RUN_AS_NODE;
 const plan=P.readPlan(filename);B.verifyLocalCluster(plan.manifest);B.blockNetwork(plan.manifest.pgPort);const nonce=crypto.randomBytes(32).toString('hex');
 const proof=await new Promise((yes,no)=>{const timer=setTimeout(()=>done(Error('PREPRODUCTION_START_TIMEOUT')),60000);function done(e,value){clearTimeout(timer);process.off('message',receive);e?no(e):yes(value);}function receive(m){if(m.type==='preproduction-attestation')m.proof?done(null,m.proof):done(Error('PREPRODUCTION_START_REJECTED'));}process.on('message',receive);process.send({type:'preproduction-challenge',nonce});});P.verifyAttestation(plan,nonce,proof);
 require('./config/desktopConfiguration').initialize(plan.config);const pool=require('./config/database');require('./services/credentialAuth.service').initialize(plan,pool);
 try{await P.verify(pool,plan);const app=require('express')(),instance=crypto.randomUUID();app.disable('x-powered-by');
 app.get('/api/installation',(req,res)=>{const n=req.query.nonce;if(req.headers.host!=='127.0.0.1:'+plan.manifest.httpPort||!/^[a-f0-9]{64}$/.test(n||'')||Object.keys(req.query).length!==1)return res.status(403).end();const m=plan.manifest;res.set('Cache-Control','no-store').json(P.sign(plan.signingKey,{purpose:'ctsk-preproduction-server-identity023-v1',nonce:n,installationId:m.installationId,authEpoch:m.authEpoch,generation:m.dataGeneration,origin:'http://127.0.0.1:'+m.httpPort,code:m.code,instance,issuedAt:Date.now()}));});
 app.use((req,res,next)=>{if(req.headers.origin&&req.headers.origin!=='http://127.0.0.1:'+plan.manifest.httpPort)return res.status(403).end();next();});app.use(require('./revisionApiApp').createApp(plan,pool));
 const server=http.createServer(app);server.requestTimeout=15000;server.headersTimeout=10000;await new Promise((yes,no)=>{server.once('error',no);server.listen({host:'127.0.0.1',port:plan.manifest.httpPort,exclusive:true},yes);});let closing;const close=()=>closing||=new Promise(r=>{server.close(r);server.closeAllConnections();}).then(()=>pool.end());process.once('disconnect',()=>void close());return {server,pool,plan,close};
 }catch(e){await pool.end();throw e;}
}
if(require.main===module)start(process.argv[2]).then(s=>{console.log('PREPRODUCTION_READY');process.once('SIGTERM',()=>void s.close());}).catch(e=>{console.error('PREPRODUCTION_REJECTED '+(e.code||'START'));process.exitCode=1;});module.exports={start};
