'use strict';
// Sólo material público. Este módulo no importa pg ni lee configuración del servidor.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const fields=['version','purpose','installationId','authEpoch','generation','origin','verificationKey','code','directory'];
const fail=()=>{throw Error('PREPRODUCTION_CLIENT_REJECTED');};
function signed(key,p){try{return crypto.verify(null,Buffer.from(JSON.stringify(p.body)),key,Buffer.from(p.signature,'base64'));}catch{return false;}}
function readClient(filename,root){require('./windowsConfigAcl').checkAcl(filename);const doc=JSON.parse(fs.readFileSync(filename)),c=doc.body;
 if(!c||Object.keys(c).sort().join()!==[...fields].sort().join()||c.version!==1||c.purpose!=='synthetic-client023-only'||!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{3,4}$/.test(c.origin)||![c.installationId,c.authEpoch,c.generation].every(x=>/^[a-f0-9-]{36}$/.test(x))||!signed(c.verificationKey,doc)||filename!==path.join(c.directory,'preproduction-client.json')||!/^ctsk-client-[a-f0-9]{12}$/.test(path.basename(c.directory))||!fs.existsSync(path.join(c.directory,'synthetic-client.marker')))fail();
 const port=Number(new URL(c.origin).port);if(port<1024||port>65535||[5432,3000,3443].includes(port)||path.dirname(c.directory)!==process.env.LOCALAPPDATA||fs.realpathSync(c.directory)!==c.directory||fs.readFileSync(path.join(c.directory,'synthetic-client.marker'),'utf8')!=='SYNTHETIC_CLIENT_ONLY')fail();
 // La huella se compara con la identidad remota, sin cargar módulos ni secretos del servidor.
 return Object.freeze(c);
}
function verify(c,nonce,p){const b=p?.body,now=Date.now();const checks={SIGNATURE:signed(c.verificationKey,p),PURPOSE:b?.purpose==='ctsk-preproduction-server-identity023-v1',NONCE:b?.nonce===nonce,IDENTITY:!!b&&['installationId','authEpoch','generation','origin','code'].every(k=>b[k]===c[k]),INSTANCE:typeof b?.instance==='string',TIME:Number.isInteger(b?.issuedAt)&&b.issuedAt<=now+1000&&now-b.issuedAt<=30000};for(const [name,ok]of Object.entries(checks))if(!ok){if(name==='TIME')console.error('CLIENT_TIME_METADATA '+JSON.stringify({issuedAt:b?.issuedAt,now:Date.now()}));throw Error('PREPRODUCTION_CLIENT_'+name);}return b.instance;}

module.exports={readClient,verify,fields};
