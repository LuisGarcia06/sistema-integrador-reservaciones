const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const C = require('../shared/lanContract'), {checkAcl} = require('../shared/windowsConfigAcl');
// Lista cerrada: un paquete remoto no necesita backend, PostgreSQL, workers, .env ni service.key.
const FILES = ['electron/main.js','electron/preload.js','electron/connection.html','electron/httpsBackend.js',
    'electron/lanClientPolicy.js','electron/lanEntry.js','shared/serverIdentity.js','shared/windowsConfigAcl.js','shared/lanContract.js','scripts/ImportLanClient.ps1','scripts/InspectLanNetwork.ps1'];
const KEYS = ['version','protocol','environment','serverId','origin','address','port','name','code','clientCode','tlsSpki','caDigest','publicKeyDigest','network'];
function fingerprint(root) {
    const h = crypto.createHash('sha256');
    for (const file of FILES) h.update(file).update(fs.readFileSync(path.join(root,file)));
    return h.digest('hex');
}
function readClient(filename, root = path.resolve(__dirname,'..')) {
    C.cleanClientEnvironment();
    if (filename !== path.join(root,'client/client.json') || path.dirname(root) !== fs.realpathSync(process.env.LOCALAPPDATA || 'invalid') ||
        !/^ctsk-lan-client-[a-f0-9]{12}$/.test(path.basename(root)) || fs.realpathSync(root) !== root) C.fail('LAN_CLIENT_DIRECTORY');
    const read = file => { checkAcl(file); return fs.readFileSync(file); };
    const bytes = read(filename), c = JSON.parse(bytes);
    C.exactKeys(c,KEYS); C.validateEndpoint(c);
    if (c.clientCode !== fingerprint(root)) C.fail('LAN_CLIENT_CODE_CHANGED');
    const ca = read(path.join(root,'client/ca.pem')), publicKey = read(path.join(root,'client/identity-public.pem'));
    const x = new crypto.X509Certificate(ca);
    if (C.sha(ca) !== c.caDigest || C.sha(publicKey) !== c.publicKeyDigest || /PRIVATE KEY/.test(ca.toString()+publicKey.toString()) || !x.ca || Date.parse(x.validFrom) > Date.now() ||
        Date.parse(x.validTo) <= Date.now() || crypto.createPublicKey(publicKey).asymmetricKeyType !== 'ed25519') C.fail('LAN_CLIENT_TRUST');
    C.verifyLocal(c.network,'client');
    return Object.freeze({...c,ca,publicKey,filename,directory:path.dirname(filename)});
}
module.exports = {FILES,KEYS,fingerprint,readClient};
