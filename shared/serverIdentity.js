const crypto = require('node:crypto');
const TAG = 'CTSK-HTTPS-LOOPBACK-IDENTITY';
const PROTOCOL = 1;
const ENVIRONMENT = 'https-loopback-lab';
const fail = () => { throw Object.assign(Error('HTTPS_IDENTITY_REJECTED'), { code: 'HTTPS_IDENTITY_REJECTED' }); };
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const LAN_ENVIRONMENT = 'https-private-lan-lab';
function protocol(environment) {
    if (environment === ENVIRONMENT) return PROTOCOL;
    if (environment === LAN_ENVIRONMENT) return 2;
    return fail();
}
function canonical(p) { return Buffer.from(JSON.stringify([p.environment === LAN_ENVIRONMENT ? 'CTSK-HTTPS-PRIVATE-LAN-IDENTITY' : TAG,p.protocol,p.nonce,p.serverId,p.environment,p.release,p.instance,p.origin,p.ready])); }
function createResponder({ privateKey, serverId, release, origin, environment = ENVIRONMENT, now = Date.now }) {
    const version = protocol(environment);
    const key=crypto.createPrivateKey(privateKey);
    if(key.asymmetricKeyType!=='ed25519'||!uuid(serverId))fail();
    const instance=crypto.randomUUID(), seen=new Map();
    return { instance, respond(nonce) {
        for(const [n,time] of seen)if(now()-time>120000)seen.delete(n);
        if(!/^[a-f0-9]{64}$/.test(nonce||'')||seen.has(nonce)||seen.size>=4096)fail();
        seen.set(nonce,now());
        const payload={protocol:version,nonce,serverId,environment,release,instance,origin,ready:true};
        return {payload,signature:crypto.sign(null,canonical(payload),key).toString('base64')};
    }};
}
function createVerifier(config) {
    const environment = config.environment || ENVIRONMENT, version = protocol(environment);
    if (config.protocol !== undefined && config.protocol !== version) fail();
    const key=crypto.createPublicKey(config.publicKey), consumed=new Set();
    if(key.asymmetricKeyType!=='ed25519')fail();
    return (response,nonce)=>{
        const p=response?.payload;
        if(!p||consumed.has(nonce)||!/^[a-f0-9]{64}$/.test(nonce||'')||p.nonce!==nonce||p.protocol!==version||
            p.serverId!==config.serverId||p.environment!==environment||p.release!==config.code||p.origin!==config.origin||
            p.ready!==true||!uuid(p.instance)||typeof response.signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(response.signature))fail();
        if(!crypto.verify(null,canonical(p),key,Buffer.from(response.signature,'base64')))fail();
        consumed.add(nonce);if(consumed.size>4096)consumed.delete(consumed.values().next().value);
        return p.instance;
    };
}
module.exports={PROTOCOL,ENVIRONMENT,LAN_ENVIRONMENT,createResponder,createVerifier};
