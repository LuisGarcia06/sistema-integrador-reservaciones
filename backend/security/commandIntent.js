const crypto=require('node:crypto'),{canonical,error}=require('./revisionTokens');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function identity(req,generation,protocol){
    const keys=['idempotency-key','x-ctsk-data-generation','x-ctsk-protocol'];
    for(const name of keys){
        if(req.rawHeaders&&req.rawHeaders.filter((v,i)=>i%2===0&&v.toLowerCase()===name).length!==1)throw error(400,'COMANDO_CABECERA_INVALIDA');
    }
    const key=req.headers['idempotency-key'];
    if(typeof key!=='string'||!UUID.test(key))throw error(400,'CLAVE_IDEMPOTENCIA_INVALIDA');
    if(req.headers['x-ctsk-data-generation']!==generation)throw error(409,'GENERACION_INCOMPATIBLE');
    if(req.headers['x-ctsk-protocol']!==protocol)throw error(400,'CLIENTE_INCOMPATIBLE');
    return key;
}
function fingerprint(key,generation,user,spec,headers){
    const preconditions=['if-match','if-operational-match'].map(name=>{
        const value=headers[name];if(value===undefined)throw error(428,'PRECONDICION_REQUERIDA');
        if(typeof value!=='string'||value.length>1024)throw error(400,'PRECONDICION_INVALIDA');return value;
    });
    return crypto.createHmac('sha256',Buffer.from(key,'hex')).update('ctsk-command-intent-v1\0'+canonical({version:1,generation,actor:user,method:spec.method,url:spec.url,body:spec.body,preconditions})).digest('hex');
}
function equal(a,b){return typeof a==='string'&&typeof b==='string'&&a.length===64&&b.length===64&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));}
module.exports={UUID,identity,fingerprint,equal};
