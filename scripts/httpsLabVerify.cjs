const fs=require('node:fs'),path=require('node:path'),https=require('node:https'),crypto=require('node:crypto'),cp=require('node:child_process');
const assert=require('node:assert/strict'),P=require('../backend/config/standalonePolicy'),H=require('../backend/config/httpsLabPolicy');
const B=require('../electron/httpsBackend'),{createVerifier}=require('../backend/security/serverIdentity');
function api(c,pathname,body,token,method){return new Promise((resolve,reject)=>{
    const req=https.request({...B.options(c),path:pathname,method:method||(body===undefined?'GET':'POST'),agent:false,timeout:5000,
        headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{})}},res=>{
        let text='';res.on('data',x=>text+=x);res.on('end',()=>{let value;try{value=JSON.parse(text);}catch{value=text;}resolve({status:res.statusCode,body:value});});
    });req.on('error',reject);req.on('timeout',()=>req.destroy(Error('HTTPS_TIMEOUT')));req.end(body===undefined?null:JSON.stringify(body));
});}
async function run({m,root,clean,start,stop}){
    const report={completed:false,realPostgres:true,realElectron:true,loopbackOnly:true,globalTrustChanged:false,checks:[],failures:[]};
    const file=path.join(m.directory,'https-verification.json'),clientFile=path.join(m.directory,'client/client.json');
    let service,driver;const witnesses=[];
    // El coordinador no puede abrir sockets a proveedores ni a otras bases.
    const net=require('node:net'),connect=net.Socket.prototype.connect,allowed=new Set([m.pgPort,m.httpPort]);
    net.Socket.prototype.connect=function(...args){const a=Array.isArray(args[0])?args[0]:args,t=a[0];
        const host=t&&typeof t==='object'?t.host:a[1],port=t&&typeof t==='object'?t.port:t;
        if(host!==P.HOST||!allowed.has(Number(port)))throw Error('HTTPS_LAB_NETWORK');return connect.apply(this,args);};
    const passed=name=>{report.checks.push(name);console.log('HTTPS_OK '+name);};
    try{
        service=start(m);await service.ready;
        const c=H.readClient(clientFile);await B.validatePeer(c);passed('Node valida cadena, vigencia, SAN y pin TLS');
        const logo=await new Promise((resolve,reject)=>{
            const req=https.get({...B.options(c),path:'/app/assets/branding/community-tours-sian-kaan-logo.jpeg',agent:false,timeout:5000},res=>{
                const parts=[];res.on('data',x=>parts.push(x));res.on('error',reject);res.on('end',()=>resolve(Buffer.concat(parts)));
            });req.on('error',reject);req.on('timeout',()=>req.destroy(Error('LOGO_TRANSFER_TIMEOUT')));
        });
        assert.equal(P.sha(logo),P.sha(fs.readFileSync(path.join(root,'frontend/assets/branding/community-tours-sian-kaan-logo.jpeg'))));passed('Logotipo HTTPS íntegro byte a byte');
        const nonce=crypto.randomBytes(32).toString('hex'),proof=await B.request(c,'/api/local-service/challenge?nonce='+nonce);
        assert.equal(proof.statusCode,200);const verify=createVerifier(c),response=JSON.parse(proof.body);
        verify(response,nonce);assert.throws(()=>verify(response,nonce));
        assert.equal((await B.request(c,'/api/local-service/challenge?nonce='+nonce)).statusCode,409);
        assert.throws(()=>createVerifier(c)({...response,signature:Buffer.alloc(64).toString('base64')},nonce));
        passed('Firma asimétrica válida; firma falsa y replay rechazados por cliente y servidor');
        const credentials=JSON.parse(fs.readFileSync(path.join(m.directory,'test-user.json')));
        assert.equal((await api(c,'/api/reservaciones')).status,401);
        const admin=await api(c,'/api/auth/login',credentials);assert.equal(admin.status,200);
        assert.equal((await api(c,'/api/reservaciones',undefined,admin.body.token)).status,200);
        const consultation=await api(c,'/api/auth/login',{...credentials,correo:'consulta@standalone.example.test'});assert.equal(consultation.status,200);
        assert.equal((await api(c,'/api/reservaciones',{},consultation.body.token)).status,403);
        const selected=await api(c,'/api/auth/login',{...credentials,correo:'selected@standalone.example.test'});assert.equal(selected.status,200);
        assert.equal((await api(c,'/api/eventos-integracion/centro',undefined,selected.body.token)).status,403);
        assert.equal((await api(c,'/api/daily/operativo?fecha=2099-01-05',undefined,selected.body.token)).status,403);
        assert.equal((await api(c,'/api/integraciones')).status,503);passed('JWT, Administrador/Consulta/alcance y bloqueo de integraciones');
        const centre=await api(c,'/api/eventos-integracion/centro?tab=pendientes',undefined,admin.body.token);
        assert.equal(centre.status,200);assert.equal(centre.body.data.length,1);passed('Centro de Avisos real con evento sintético');
        // Dos sesiones HTTPS independientes sobre datos nuevos; no equivale a dos equipos físicos.
        await require('./lanWriteChecks.cjs').run({c,admin:admin.body.token,credentials,api,passed});
        const tlsCases=[];
        for(const [name,prefix] of [['valid','tls'],['unknown','unknown'],['expired','expired'],['wrong-name','wrong-name']]){
            const key=fs.readFileSync(path.join(m.directory,'server',prefix+'-key.pem')),cert=fs.readFileSync(path.join(m.directory,'server',prefix+'-cert.pem'));
            const witness=https.createServer({key,cert,minVersion:'TLSv1.2'},(_req,res)=>res.end('<!doctype html><p id="tls-witness">TLS witness</p>'));
            await new Promise((yes,no)=>{witness.once('error',no);witness.listen(0,P.HOST,yes);});witnesses.push(witness);
            const port=witness.address().port;assert(P.validPort(port));assert.equal(witness.address().address,P.HOST);allowed.add(port);
            const test={...c,port,origin:`https://${P.HOST}:${port}`,tlsSpki:H.spki(cert)};
            if(name==='valid')await B.validatePeer(test);
            else await assert.rejects(B.validatePeer(test),error=>name==='expired'?error.code==='CERT_HAS_EXPIRED':name==='wrong-name'?error.code==='ERR_TLS_CERT_ALTNAME_INVALID':/SELF_SIGNED|ISSUER|LEAF/.test(error.code));
            tlsCases.push({name,port,tlsSpki:test.tlsSpki});
        }
        passed('Node rechaza CA desconocida, certificado vencido y SAN incorrecto');
        driver=cp.spawn(require('electron'),[path.join(__dirname,'httpsElectronDriver.cjs'),clientFile],
            {cwd:root,env:clean(),windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
        let out='',err='',restartError;driver.stdout.on('data',x=>out+=x);driver.stderr.on('data',x=>err+=x);
        driver.on('message',message=>{
            if(message.type==='input-ready')driver.send({type:'input',credentials,tlsCases});
            if(message.type==='restart-needed')void (async()=>{await stop(service.child);driver.send({type:'server-stopped'});})().catch(e=>{restartError=e;driver.kill();});
            if(message.type==='offline-seen')void (async()=>{service=start(m);await service.ready;driver.send({type:'server-restarted'});})().catch(e=>{restartError=e;driver.kill();});
            if(message.type==='checks')report.checks.push(...message.checks);
        });
        const exit=await new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>{driver.kill();reject(Error('HTTPS_ELECTRON_TIMEOUT'));},120000);
            driver.once('error',e=>{clearTimeout(timer);reject(e);});driver.once('exit',code=>{clearTimeout(timer);resolve(code);});
        });
        if(restartError)throw restartError;
        if(exit!==0||!out.includes('HTTPS_ELECTRON_OK')){
            fs.writeFileSync(path.join(m.directory,'electron-failure.log'),err);
            fs.writeFileSync(path.join(m.directory,'electron-context.log'),out);
            throw Error('HTTPS_ELECTRON_FAILED '+err.slice(0,250)+' '+out.slice(-800));
        }
        driver=null;
        assert.equal(service.child.exitCode,null);assert.equal((await api(c,'/api/reservaciones',undefined,admin.body.token)).status,200);
        passed('Backend independiente continúa después de cerrar Electron');
        report.completed=true;
    }catch(error){report.failures.push({code:error.code||error.message||error.name});throw error;}
    finally{
        await stop(driver);await stop(service?.child);
        for(const witness of witnesses){witness.closeAllConnections();await new Promise(r=>witness.close(r));}
        net.Socket.prototype.connect=connect;
        fs.writeFileSync(file,JSON.stringify(report,null,2));
    }
    console.log(JSON.stringify(report));return report;
}
module.exports={run,api};
