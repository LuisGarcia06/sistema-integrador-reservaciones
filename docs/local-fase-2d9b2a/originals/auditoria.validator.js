'use strict';
const active=()=>require('../config/desktopConfiguration').get()?.APP_ENVIRONMENT==='audit-api-lab';
function motivo(value,required=false,present=value!==undefined){
    if(!present){if(required)throw Object.assign(Error('El motivo es obligatorio para modificar'),{statusCode:400});return null;}
    if(typeof value!=='string'||!value.trim()||[...value.trim()].length>500)throw Object.assign(Error('El motivo debe ser texto no blanco de hasta 500 caracteres Unicode'),{statusCode:400});
    return value.trim();
}
function validate(validator,body,partial=false){
    if(!active())return validator(body);
    const {motivo:reason,...business}=body;
    const result=validator(business,{permitirVacio:partial&&Object.hasOwn(body,'motivo')});
    try{motivo(reason,false,Object.hasOwn(body,'motivo'));}catch(e){result.errores.push(e.message);}
    return result;
}
module.exports={active,motivo,validate};
