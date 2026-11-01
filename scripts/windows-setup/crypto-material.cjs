'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
function generate({directory,openssl,env,checkAcl,now=Date.now(),run=cp.execFileSync}){
 const names=['authority026.json','authority-key.pem','ca.pem','ca-key.pem','certificate.pem','tls-key.pem','tls.csr','tls.ext'];
 for(const name of names)if(fs.existsSync(path.join(directory,name)))throw Error('DIRECTORY_EXISTS');
 const kp=crypto.generateKeyPairSync('ed25519'),authority={protocol:'ctsk-authority026-v1',authorityId:crypto.randomUUID(),scope:'synthetic-acceptance-only',productionAuthorized:false,publicKey:kp.publicKey.export({type:'spki',format:'pem'}),expiresAt:now+2*86400000};
 fs.writeFileSync(path.join(directory,'authority026.json'),JSON.stringify(authority),{flag:'wx'});
 checkAcl(path.join(directory,'authority026.json'));
 fs.writeFileSync(path.join(directory,'authority-key.pem'),kp.privateKey.export({type:'pkcs8',format:'pem'}),{flag:'wx'});
 const call=args=>run(openssl,args,{cwd:directory,env:{...env,OPENSSL_CONF:'NUL'},windowsHide:true,stdio:'pipe',timeout:30000});
 call(['req','-x509','-newkey','rsa:2048','-noenc','-keyout','ca-key.pem','-out','ca.pem','-days','3','-subj','/CN=CTSK Experimental 026 CA','-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign']);
 call(['req','-new','-newkey','rsa:2048','-noenc','-keyout','tls-key.pem','-out','tls.csr','-subj','/CN=CTSK Experimental 026 Server']);
 fs.writeFileSync(path.join(directory,'tls.ext'),'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:127.0.0.1\n',{flag:'wx'});
 call(['x509','-req','-in','tls.csr','-CA','ca.pem','-CAkey','ca-key.pem','-set_serial','0x'+crypto.randomBytes(16).toString('hex'),'-out','certificate.pem','-days','2','-extfile','tls.ext']);
 const ca=new crypto.X509Certificate(fs.readFileSync(path.join(directory,'ca.pem'))),leaf=new crypto.X509Certificate(fs.readFileSync(path.join(directory,'certificate.pem')));
 const checkedAt=Date.now();
 if(!ca.ca||leaf.ca||leaf.checkIP('127.0.0.1')!=='127.0.0.1'||!leaf.verify(ca.publicKey)||!leaf.checkPrivateKey(crypto.createPrivateKey(fs.readFileSync(path.join(directory,'tls-key.pem'))))||Date.parse(leaf.validFrom)>checkedAt||Date.parse(leaf.validTo)<=checkedAt||Date.parse(leaf.validTo)>checkedAt+7*86400000)throw Error('CRYPTO_REJECTED');
 for(const name of names)checkAcl(path.join(directory,name));
 return {expiresAt:authority.expiresAt};
}
module.exports={generate};
