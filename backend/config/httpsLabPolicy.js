const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const P=require('./standalonePolicy'),{checkAcl}=require('./windowsConfigAcl');
const {PROTOCOL,ENVIRONMENT}=require('../security/serverIdentity');
function readPrivate(filename){checkAcl(filename);return fs.readFileSync(filename);}
function spki(cert){return P.sha(new crypto.X509Certificate(cert).publicKey.export({type:'spki',format:'der'}));}
function readClient(filename,root=path.resolve(__dirname,'../..')){
    if(!path.isAbsolute(filename||''))P.fail('HTTPS_CLIENT_CONFIG');
    const bytes=readPrivate(filename),c=JSON.parse(bytes),dir=path.dirname(filename),lab=path.dirname(dir);
    if(path.basename(dir)!=='client'||filename!==path.join(dir,'client.json')||
        path.dirname(lab)!==fs.realpathSync(process.env.LOCALAPPDATA||'invalid')||!/^ctsk-standalone-[a-f0-9]{12}$/.test(path.basename(lab))||
        fs.realpathSync(dir)!==dir||c.version!==1||c.protocol!==PROTOCOL||c.environment!==ENVIRONMENT||
        !/^[a-f0-9-]{36}$/.test(c.serverId||'')||!/^[a-f0-9]{64}$/.test(c.code||'')||!/^[a-f0-9]{64}$/.test(c.tlsSpki||'')||
        !/^[a-f0-9]{64}$/.test(c.caDigest||'')||!/^[a-f0-9]{64}$/.test(c.publicKeyDigest||''))P.fail('HTTPS_CLIENT_CONFIG');
    const u=new URL(c.origin);
    if(u.protocol!=='https:'||u.hostname!==P.HOST||!P.validPort(Number(u.port))||u.origin!==c.origin||u.username||u.password)P.fail('HTTPS_CLIENT_CONFIG');
    if(P.codeFingerprint(root)!==c.code)P.fail('CODE_CHANGED');
    const ca=readPrivate(path.join(dir,'ca.pem')),publicKey=readPrivate(path.join(dir,'identity-public.pem'));
    if(P.sha(ca)!==c.caDigest||P.sha(publicKey)!==c.publicKeyDigest||!new crypto.X509Certificate(ca).ca)P.fail('HTTPS_CLIENT_CONFIG');
    return Object.freeze({...c,port:Number(u.port),ca,publicKey,directory:dir,filename,digest:P.sha(bytes)});
}
function readServer(filename,root=path.resolve(__dirname,'../..')){
    if(!path.isAbsolute(filename||''))P.fail('HTTPS_SERVER_CONFIG');
    const raw=readPrivate(filename),s=JSON.parse(raw),dir=path.dirname(filename),lab=path.dirname(dir);
    if(filename!==path.join(lab,'server','server.json')||s.version!==1||s.environment!==ENVIRONMENT)P.fail('HTTPS_SERVER_CONFIG');
    const base=P.readDatabasePlan(path.join(lab,'manifest.json'),root);
    if(s.serverId?.length!==36||s.code!==base.manifest.code||s.origin!==`https://${P.HOST}:${base.manifest.httpPort}`)P.fail('HTTPS_SERVER_CONFIG');
    const key=readPrivate(path.join(dir,'tls-key.pem')),cert=readPrivate(path.join(dir,'tls-cert.pem'));
    const identityKey=readPrivate(path.join(dir,'identity-private.pem'));
    const x=new crypto.X509Certificate(cert);
    if(!x.checkPrivateKey(crypto.createPrivateKey(key))||x.checkIP(P.HOST)!==P.HOST||
        Date.parse(x.validFrom)>Date.now()||Date.parse(x.validTo)<=Date.now())P.fail('HTTPS_SERVER_CERTIFICATE');
    return {...base,filename,digest:P.sha(Buffer.concat([Buffer.from(base.digest),raw,key,cert,identityKey])),
        tls:{key,cert,minVersion:'TLSv1.2'},identityKey,serverId:s.serverId,origin:s.origin};
}
module.exports={readClient,readServer,spki};
