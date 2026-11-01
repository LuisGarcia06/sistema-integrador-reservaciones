'use strict';
// Adaptador del cliente privado de pruebas. Ninguna persistencia ni reenvio.
// La interfaz original se integrara en C; esta entrega solo prueba el contrato.
function create({request,generation,protocol}){
    const references=new Map();
    async function dispatch(command,{confirmed=false}={}){
        if(!confirmed)throw Error('CONFIRMACION_REQUERIDA');
        const reference=Object.freeze({generation,actorId:command.actorId,key:command.key,kind:command.kind});
        references.set(command.key,reference);
        try{return await request(command.method,command.url,command.body,command.token,{...command.headers,'Idempotency-Key':command.key});}
        finally{if(command.body)delete command.body.password;command.body=null;command.token=null;command.headers=null;}
    }
    async function recover(key,{actorId,token}){
        const ref=references.get(key);if(!ref||ref.actorId!==actorId)throw Error('REFERENCIA_NO_DISPONIBLE');
        return request('GET','/api/comandos/'+key,undefined,token,{'X-CTSK-Protocol':protocol,'X-CTSK-Data-Generation':generation});
    }
    return {dispatch,recover,reference:key=>references.get(key)};
}
module.exports={create};
