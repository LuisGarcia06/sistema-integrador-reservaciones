'use strict';
// Cuentas iniciales privadas, nunca alta/reset HTTP. Secretos adicionales solo RAM.
const bcrypt=require('bcryptjs'),crypto=require('node:crypto');
async function seed({admin:db,fixtures}){
    const ids={},secrets={};
    for(const [key,role]of [['target','Consulta'],['loginRace','Consulta'],['big','Consulta'],['overflow','Consulta'],['legacyShort','Consulta'],['legacyLong','Consulta']]){
        let hash;
        if(key==='legacyShort'){secrets[key]=Array.from({length:4},()=>String.fromCodePoint(0x1f980+crypto.randomInt(32))).join('');hash=await bcrypt.hash(secrets[key],12);}
        if(key==='legacyLong'){secrets[key]=crypto.randomBytes(40).toString('hex');hash=await bcrypt.hash(secrets[key],12);}
        ids[key]=(await db.query(`INSERT INTO usuarios(id_rol,nombre,correo,password,estado,alcance_plataformas)
            SELECT r.id_rol,$1,$2,COALESCE($3,u.password),true,'selected' FROM roles r CROSS JOIN usuarios u
            WHERE r.nombre=$4 AND u.correo='administrador@standalone.example.test' RETURNING id_usuario`,
            ['Usuario seguridad '+key,key.toLowerCase()+'@security.example.test',hash||null,role])).rows[0].id_usuario;
    }
    const roles=Object.fromEntries((await db.query('SELECT nombre,id_rol FROM roles')).rows.map(r=>[r.nombre,r.id_rol]));
    const hidden=(await db.query("SELECT id_plataforma FROM plataformas WHERE nombre='Oculta sintética'")).rows[0].id_plataforma;
    return {...fixtures,hidden,ids,secrets,roles};
}
module.exports={seed};
