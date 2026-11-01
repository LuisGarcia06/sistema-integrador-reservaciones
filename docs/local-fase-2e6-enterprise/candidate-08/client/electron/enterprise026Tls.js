const tls=require('node:tls'),https=require('node:https'),crypto=require('node:crypto');
const spki=cert=>crypto.createHash('sha256').update(new crypto.X509Certificate(cert).publicKey.export({type:'spki',format:'der'})).digest('hex');
function options(c){return {host:c.address||'127.0.0.1',port:c.port,ca:c.ca,rejectUnauthorized:true,minVersion:'TLSv1.2',
    checkServerIdentity(host,cert){
        const error=tls.checkServerIdentity(host,cert);if(error)return error;
        if(spki(cert.raw)!==c.tlsSpki)return Object.assign(Error('HTTPS_PIN_MISMATCH'),{code:'HTTPS_PIN_MISMATCH'});
    }};}
function validatePeer(c,presented){
    return new Promise((resolve,reject)=>{
        const socket=tls.connect(options(c));socket.setTimeout(3000,()=>socket.destroy(Error('HTTPS_TIMEOUT')));
        socket.once('error',reject);socket.once('secureConnect',()=>{
            try{
                if(!socket.authorized)throw Error('HTTPS_UNAUTHORIZED');
                const peer=socket.getPeerCertificate(true);
                if(presented&&!new crypto.X509Certificate(presented).raw.equals(peer.raw))throw Error('HTTPS_CERTIFICATE_CHANGED');
                socket.end();resolve(peer.raw);
            }catch(error){socket.destroy();reject(error);}
        });
    });
}
function installTrust(session,c){
    // Confianza SOLO de esta sesión. No se acepta por nombre/pin a ciegas:
    // OpenSSL verifica cadena + vigencia + SAN y debe presentar la MISMA hoja que Chromium.
    session.setCertificateVerifyProc((request,callback)=>{
        if(request.hostname!==(c.address||'127.0.0.1'))return callback(-2);
        validatePeer(c,request.certificate.data).then(()=>callback(0),()=>callback(-2));
    });
    session.setPermissionRequestHandler((_w,_p,callback)=>callback(false));session.setPermissionCheckHandler(()=>false);
}
function request(c,pathname,timeout=5000,token){
    if(!pathname.startsWith('/api/')||pathname.startsWith('//'))return Promise.reject(Error('HTTPS_PATH_REJECTED'));
    return new Promise((resolve,reject)=>{
        const req=https.get({...options(c),path:pathname,agent:false,timeout,
            headers:token?{Authorization:'Bearer '+token}:{}},res=>{
            let body='';res.setEncoding('utf8');res.on('error',reject);
            res.on('data',chunk=>{body+=chunk;if(body.length>4*1024*1024)req.destroy(Error('HTTPS_RESPONSE_TOO_LARGE'));});
            res.on('end',()=>{if(res.statusCode>=300&&res.statusCode<400)return reject(Error('HTTPS_REDIRECT_REJECTED'));
                resolve({statusCode:res.statusCode,body});});
        });req.on('timeout',()=>req.destroy(Error('HTTPS_TIMEOUT')));req.on('error',reject);
    });
}
module.exports={options,validatePeer,installTrust,request};
