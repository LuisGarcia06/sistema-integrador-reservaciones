const crypto=require('node:crypto');
function error(status,code){return Object.assign(Error(code),{statusCode:status,code});}
function canonical(value){
    if(value===null||typeof value!=='object'){
        if(typeof value==='number'&&!Number.isSafeInteger(value)&&(!Number.isFinite(value)||Number.isInteger(value)))throw error(400,'VALOR_NO_REPRESENTABLE');
        if(value===undefined)throw error(400,'VALOR_NO_REPRESENTABLE');
        return JSON.stringify(value);
    }
    if(value instanceof Date)return JSON.stringify(value.toISOString());
    if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
    return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
function tokens(key,generation){
    const hash=(domain,v)=>crypto.createHmac('sha256',Buffer.from(key,'hex')).update(domain+'\0'+canonical(v)).digest('hex');
    const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
    function sign(prefix,parts){const raw=[prefix,...parts];return '"'+[...raw,hash('signature',raw)].join('-')+'"';}
    function parse(value,prefix,count){
        if(value===undefined)throw error(428,'PRECONDICION_REQUERIDA');
        const re=new RegExp('^"'+prefix+'-'+Array(count).fill('([a-f0-9]{64})').join('-')+'"$');
        const found=typeof value==='string'&&re.exec(value);
        if(!found||!equal(found[count],hash('signature',[prefix,...found.slice(1,count)])))throw error(400,'PRECONDICION_INVALIDA');
        return found.slice(1,count);
    }
    function record(subject,state,representation){return sign('r1',[hash('subject',subject),hash('primary',[generation,state]),hash('representation',representation)]);}
    function context(subject,state){return sign('c1',[hash('action',subject),hash('context',[generation,state])]);}
    function verifyRecord(value,expected){
        const old=parse(value,'r1',4),now=parse(expected,'r1',4);
        if(!equal(old[0],now[0]))throw error(400,'PRECONDICION_INVALIDA');
        if(!equal(old[1],now[1]))throw error(412,'PRECONDICION_OBSOLETA');
        if(!equal(old[2],now[2]))throw error(409,'CONTEXTO_OPERATIVO_CAMBIO');
    }
    function verifyContext(value,expected){
        const old=parse(value,'c1',3),now=parse(expected,'c1',3);
        if(!equal(old[0],now[0]))throw error(400,'PRECONDICION_INVALIDA');
        if(!equal(old[1],now[1]))throw error(409,'CONTEXTO_OPERATIVO_CAMBIO');
    }
    return {record,context,verifyRecord,verifyContext,hash};
}
module.exports={canonical,tokens,error};
