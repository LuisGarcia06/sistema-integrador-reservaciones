'use strict';
// Aprovisionamiento privado inicial; ninguna cuenta se crea mediante HTTP.
const fs=require('node:fs'),path=require('node:path');
async function seed({admin:db,plan,fixtures}){
    const users={};
    for(const [key,role,mode,assigned]of [
        ['target','Consulta','selected',true],['secondTarget','Consulta','all',false],
        ['promoted','Consulta','selected',true],['adminTarget','Administrador','all',false],
        ['legacy','Consulta','all',true],['raceA','Administrador','all',false],['raceB','Administrador','all',false]
    ]){
        const row=(await db.query(`INSERT INTO usuarios(id_rol,nombre,correo,password,estado,alcance_plataformas)
            SELECT r.id_rol,$1,$2,u.password,true,$3 FROM roles r CROSS JOIN usuarios u
            WHERE r.nombre=$4 AND u.correo='administrador@standalone.example.test' RETURNING id_usuario`,
            ['Usuario sintetico '+key,key.toLowerCase()+'@user-audit.example.test',mode,role])).rows[0];
        users[key]=row.id_usuario;
        if(assigned)await db.query('INSERT INTO usuario_plataformas_visibles(id_usuario,id_plataforma) VALUES ($1,$2)',[row.id_usuario,fixtures.platform]);
    }
    const roles=Object.fromEntries((await db.query('SELECT nombre,id_rol FROM roles')).rows.map(r=>[r.nombre,r.id_rol]));
    const hidden=(await db.query('SELECT id_plataforma FROM plataformas WHERE id_plataforma<>$1 ORDER BY id_plataforma LIMIT 1',[fixtures.platform])).rows[0].id_plataforma;
    const result={...fixtures,users,roles,hidden};
    fs.writeFileSync(path.join(plan.manifest.directory,'user-api-fixtures.json'),JSON.stringify(result,null,2),{flag:'wx'});
    return result;
}
module.exports={seed};
