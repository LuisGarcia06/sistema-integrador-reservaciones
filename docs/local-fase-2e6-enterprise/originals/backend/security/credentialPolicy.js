'use strict';
const ENVIRONMENT='credential-security-api-lab',ISSUER='ctsk-lab-023',AUDIENCE='ctsk-desktop-023';
const INTEGRATED='administrative-frontend023-lab';
const integrated=()=>[INTEGRATED,'unified023-lab','preproduction023-local'].includes(require('../config/desktopConfiguration').get()?.APP_ENVIRONMENT);
const active=()=>[ENVIRONMENT,INTEGRATED,'first-access023-lab','unified023-lab','preproduction023-local'].includes(require('../config/desktopConfiguration').get()?.APP_ENVIRONMENT);
const fail=(statusCode,code)=>{throw Object.assign(Error(code),{statusCode,code});};
function password(value,{assignment=true}={}){
    if(typeof value!=='string'||!value.isWellFormed()||value.includes('\0')||/^[\p{White_Space}\uFEFF]*$/u.test(value)
        ||Buffer.byteLength(value,'utf8')>72||(assignment&&[...value].length<8))fail(400,'PASSWORD_INVALIDO');
    return value;
}
function email(value){
    if(typeof value!=='string')fail(400,'CORREO_INVALIDO');
    const text=value.replace(/^[\p{White_Space}\uFEFF]+|[\p{White_Space}\uFEFF]+$/gu,'');
    if(text.length>100||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))fail(400,'CORREO_INVALIDO');return text;
}
function login(body){
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).sort().join(',')!=='correo,password')fail(400,'SOLICITUD_INVALIDA');
    return {correo:email(body.correo),password:password(body.password,{assignment:false})};
}
function canonicalVersion(value){return typeof value==='string'&&/^[1-9][0-9]{0,18}$/.test(value)&&BigInt(value)<=9223372036854775807n;}
function recent(auth,now=Math.floor(Date.now()/1000)){
    if(!auth||!Number.isInteger(auth.iat)||auth.iat>now||now-auth.iat>300)fail(401,'REAUTENTICACION_REQUERIDA');
}
async function emailPreflight(db){
    const rows=(await db.query(`SELECT id_usuario,correo,lower(btrim(correo,
        U&'\\0009\\000A\\000B\\000C\\000D\\0020\\0085\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF') COLLATE "C") clave FROM public.usuarios ORDER BY id_usuario`)).rows;
    const seen=new Set();for(const row of rows){if(seen.has(row.clave))fail(409,'EMAIL_IDENTITY_AMBIGUOUS');seen.add(row.clave);if(row.correo.trim().toLowerCase()!==row.clave)fail(409,'EMAIL_NORMALIZATION_REVIEW_REQUIRED');}
    return {checked:rows.length,ambiguous:false,javascriptDifference:false};
}
module.exports={ENVIRONMENT,INTEGRATED,ISSUER,AUDIENCE,active,integrated,fail,password,email,login,canonicalVersion,recent,emailPreflight};
