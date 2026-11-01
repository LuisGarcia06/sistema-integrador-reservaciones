// Herramienta de desarrollo ya incluida con Git; no instala CA ni dependencias.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const openssl='C:/Program Files/Git/usr/bin/openssl.exe';
function generate(directory, endpoint){
    let san = 'IP:127.0.0.1';
    if(endpoint){
        if(!require('../shared/lanContract').privateAddress(endpoint.address)||!/^([a-z][a-z0-9-]{0,40})\.ctsk-lab\.test$/.test(endpoint.name||''))throw Error('LAN_CERTIFICATE_ENDPOINT');
        san='IP:'+endpoint.address+',DNS:'+endpoint.name;
    }
    const issuer=path.join(directory,'issuer'),server=path.join(directory,'server'),client=path.join(directory,'client');
    for(const dir of [issuer,server,client])fs.mkdirSync(dir);
    function run(args){cp.execFileSync(openssl,args,{windowsHide:true,stdio:'pipe',timeout:30000});}
    const rootKey=path.join(issuer,'ca-key.pem'),rootCert=path.join(issuer,'ca.pem');
    run(['req','-x509','-newkey','rsa:2048','-nodes','-keyout',rootKey,'-out',rootCert,'-days','3','-subj','/CN=CTSK Disposable Lab CA',
        '-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign']);
    function leaf(name,san,days='2'){
        const key=path.join(server,name+'-key.pem'),csr=path.join(server,name+'.csr'),cert=path.join(server,name+'-cert.pem'),ext=path.join(server,name+'.ext');
        fs.writeFileSync(ext,'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName='+san+'\n');
        run(['req','-new','-newkey','rsa:2048','-nodes','-keyout',key,'-out',csr,'-subj','/CN=CTSK Disposable Lab Server']);
        if(days==='expired'){
            const posix=p=>p.replace(/\\/g,'/');
            fs.writeFileSync(path.join(issuer,'index.txt'),'');fs.writeFileSync(path.join(issuer,'serial.txt'),'1000\n');
            const config=path.join(issuer,'expired-ca.cnf');
            fs.writeFileSync(config,'[ca]\ndefault_ca=lab\n[lab]\ndatabase='+posix(path.join(issuer,'index.txt'))+'\nserial='+posix(path.join(issuer,'serial.txt'))+
                '\nnew_certs_dir='+posix(issuer)+'\ncertificate='+posix(rootCert)+'\nprivate_key='+posix(rootKey)+'\ndefault_md=sha256\npolicy=policy\n[policy]\ncommonName=supplied\n[leaf]\n'+fs.readFileSync(ext,'utf8'));
            run(['ca','-config',config,'-batch','-notext','-in',csr,'-out',cert,'-startdate','20200101000000Z','-enddate','20200102000000Z','-extensions','leaf']);
        }else run(['x509','-req','-in',csr,'-CA',rootCert,'-CAkey',rootKey,'-set_serial','0x'+crypto.randomBytes(16).toString('hex'),'-out',cert,'-days',days,'-extfile',ext]);
        return {key,cert};
    }
    const valid=leaf('tls',san),wrong=leaf('wrong-name','DNS:wrong.ctsk.test'),expired=leaf('expired',san,'expired');
    // Autoridad desconocida: certificado de servidor autofirmado, nunca añadido al cliente.
    const unknown={key:path.join(server,'unknown-key.pem'),cert:path.join(server,'unknown-cert.pem')};
    run(['req','-x509','-newkey','rsa:2048','-nodes','-keyout',unknown.key,'-out',unknown.cert,'-days','2','-subj','/CN=Unknown Disposable Server',
        '-addext','subjectAltName='+san,'-addext','basicConstraints=critical,CA:FALSE','-addext','extendedKeyUsage=serverAuth']);
    fs.copyFileSync(rootCert,path.join(client,'ca.pem'));
    const pair=crypto.generateKeyPairSync('ed25519');
    fs.writeFileSync(path.join(server,'identity-private.pem'),pair.privateKey.export({type:'pkcs8',format:'pem'}));
    fs.writeFileSync(path.join(client,'identity-public.pem'),pair.publicKey.export({type:'spki',format:'pem'}));
    return {valid,wrong,expired,unknown};
}
module.exports={generate};
