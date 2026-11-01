'use strict';
const jwt=require('jsonwebtoken'),bcrypt=require('bcryptjs'),P=require('../security/credentialPolicy');
const tx=require('../config/revisionApiTransactions');let service;
const USER_SQL=`SELECT u.id_usuario,u.nombre,u.correo,u.id_rol,r.nombre rol,u.estado,u.alcance_plataformas,
    u.version_credenciales::text version_credenciales,
    ARRAY(SELECT p.id_plataforma FROM public.usuario_plataformas_visibles p WHERE p.id_usuario=u.id_usuario ORDER BY p.id_plataforma) platform_ids
    FROM public.usuarios u JOIN public.roles r ON r.id_rol=u.id_rol`;
function create({pool,plan}){
    const generation=plan.manifest.dataGeneration,secret=plan.config.JWT_SECRET;
    const issuer=plan.authContract?.issuer||P.ISSUER,audience=plan.authContract?.audience||P.AUDIENCE;
    function decode(token){
        let claims;try{claims=jwt.verify(token,secret,{algorithms:['HS256'],issuer,audience});}catch{P.fail(401,'SESION_INVALIDA');}
        const now=Math.floor(Date.now()/1000);
        if(!claims||typeof claims!=='object'||typeof claims.sub!=='string'||! /^[1-9][0-9]{0,9}$/.test(claims.sub)||Number(claims.sub)>2147483647
            ||!P.canonicalVersion(claims.cv)||claims.dg!==generation||claims.token_use!=='access'||!Number.isInteger(claims.iat)||!Number.isInteger(claims.exp)
            ||claims.iat>now||claims.exp<=claims.iat||claims.exp-claims.iat>28800)P.fail(401,'SESION_INVALIDA');
        return Object.freeze({id:Number(claims.sub),cv:claims.cv,iat:claims.iat});
    }
    function assertCurrent(row,auth){
        if(!row||!row.estado||row.id_usuario!==auth?.id||row.version_credenciales!==auth.cv||!['Administrador','Consulta'].includes(row.rol))P.fail(401,'SESION_REVOCADA');
        return row;
    }
    const safe=row=>({id_usuario:row.id_usuario,nombre:row.nombre,correo:row.correo,id_rol:row.id_rol,rol:row.rol});
    const session=row=>({...safe(row),alcance_plataformas:row.rol==='Administrador'?'all':row.alcance_plataformas,
        platform_ids:row.rol==='Administrador'||row.alcance_plataformas==='all'?[]:row.platform_ids});
    async function authenticate(token){const auth=decode(token),row=(await pool.query(USER_SQL+' WHERE u.id_usuario=$1',[auth.id])).rows[0];assertCurrent(row,auth);return {usuario:safe(row),auth};}
    async function login(input){
        const credentials=P.login(input);let first;
        try{
            const rows=(await pool.query(USER_SQL.replace('SELECT u.id_usuario','SELECT u.password,u.id_usuario')+' WHERE public.ctsk_correo_clave_023(u.correo)=public.ctsk_correo_clave_023($1)',[credentials.correo])).rows;
            if(rows.length!==1)P.fail(401,'CREDENCIALES_INVALIDAS');first=rows[0];
            if(!await bcrypt.compare(credentials.password,first.password))P.fail(401,'CREDENCIALES_INVALIDAS');
            return await tx.transaction(pool,async db=>{
                const row=(await db.query(USER_SQL+' WHERE u.id_usuario=$1 AND public.ctsk_correo_clave_023(u.correo)=public.ctsk_correo_clave_023($2)',[first.id_usuario,credentials.correo])).rows[0];
                if(!row||!row.estado||row.version_credenciales!==first.version_credenciales||!['Administrador','Consulta'].includes(row.rol))P.fail(401,'CREDENCIALES_INVALIDAS');
                return {token:jwt.sign({cv:row.version_credenciales,dg:generation,token_use:'access'},secret,{algorithm:'HS256',issuer,audience,subject:String(row.id_usuario),expiresIn:28800}),usuario:session(row)};
            });
        }finally{credentials.password=null;if(first)first.password=null;}
    }
    return {decode,assertCurrent,authenticate,login,USER_SQL};
}
function initialize(plan,pool){if(service)throw Error('CREDENTIAL_AUTH_ALREADY_INITIALIZED');service=create({plan,pool});}
function get(){if(!service)throw Error('CREDENTIAL_AUTH_NOT_INITIALIZED');return service;}
async function middleware(req,res,next){
    const match=/^Bearer ([^\s]+)$/.exec(req.headers.authorization||'');if(!match)return res.status(401).json({codigo:'SESION_INVALIDA'});
    try{const result=await get().authenticate(match[1]);req.usuario=result.usuario;req.credentialAuth=result.auth;return next();}
    catch(e){return res.status(e.statusCode||500).json({codigo:e.statusCode?e.code:'AUTH_UNAVAILABLE'});}
}
module.exports={create,initialize,get,middleware,USER_SQL};
