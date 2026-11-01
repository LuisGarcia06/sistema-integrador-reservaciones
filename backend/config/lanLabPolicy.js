const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const P = require('./standalonePolicy'), C = require('../../shared/lanContract');
const {checkAcl} = require('./windowsConfigAcl');
const {KEYS} = require('../../electron/lanClientPolicy');
function readServer(filename, root = path.resolve(__dirname,'../..')) {
    if (!path.isAbsolute(filename || '') || path.basename(filename) !== 'lan-server.json' || path.basename(path.dirname(filename)) !== 'lan-server') C.fail('LAN_SERVER_CONFIG');
    checkAcl(filename);
    const raw = fs.readFileSync(filename), s = JSON.parse(raw), dir = path.dirname(filename), lab = path.dirname(dir);
    C.exactKeys(s,KEYS); C.validateEndpoint(s);
    // Antes de bind o de cualquier conexión PostgreSQL. No alcanza con que la IP sea RFC1918.
    C.verifyLocal(s.network,'server');
    const base = P.readDatabasePlan(path.join(lab,'manifest.json'),root);
    if (s.code !== base.manifest.code || s.port !== base.manifest.httpPort) C.fail('LAN_SERVER_CODE_CHANGED');
    const read = file => { const p = path.join(dir,file); checkAcl(p); return fs.readFileSync(p); };
    const key = read('tls-key.pem'), cert = read('tls-cert.pem'), identityKey = read('identity-private.pem');
    const ca = read('ca.pem'), publicKey = read('identity-public.pem');
    const x = new crypto.X509Certificate(cert), authority = new crypto.X509Certificate(ca);
    if (!authority.ca || !x.verify(authority.publicKey) || Date.parse(authority.validFrom) > Date.now() || Date.parse(authority.validTo) <= Date.now() ||
        !x.checkPrivateKey(crypto.createPrivateKey(key)) || x.checkIP(s.address) !== s.address || x.checkHost(s.name) !== s.name ||
        Date.parse(x.validFrom) > Date.now() || Date.parse(x.validTo) <= Date.now() ||
        C.sha(x.publicKey.export({type:'spki',format:'der'})) !== s.tlsSpki || C.sha(ca) !== s.caDigest || C.sha(publicKey) !== s.publicKeyDigest ||
        crypto.createPrivateKey(identityKey).asymmetricKeyType !== 'ed25519' ||
        !crypto.createPublicKey(identityKey).export({type:'spki',format:'der'}).equals(crypto.createPublicKey(publicKey).export({type:'spki',format:'der'}))) C.fail('LAN_SERVER_CERTIFICATE');
    return {...base,filename,endpoint:Object.freeze(s),origin:s.origin,serverId:s.serverId,identityKey,
        digest:C.sha(Buffer.concat([Buffer.from(base.digest),raw,key,cert,identityKey,ca,publicKey])),tls:{key,cert,minVersion:'TLSv1.2'}};
}
module.exports = {readServer};
