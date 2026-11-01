const fs=require('node:fs'),path=require('node:path');
async function seed(input){
  await require('./reservationActionsFixtures.cjs').seed(input);
  const db=input.admin,file=path.join(input.plan.manifest.directory,'api-fixtures.json');
  const fixtures=JSON.parse(fs.readFileSync(file));
  await db.query("INSERT INTO usuarios(id_rol,nombre,correo,password,estado,alcance_plataformas) SELECT id_rol,'Administrador de altas sintético','alta@standalone.example.test',password,true,'all' FROM usuarios WHERE correo='administrador@standalone.example.test'");
  const user=(await db.query("SELECT id_usuario FROM usuarios WHERE correo='alta@standalone.example.test'")).rows[0].id_usuario;
  const hidden=(await db.query('SELECT id_plataforma FROM reservaciones WHERE id_reservacion=$1',[fixtures.reservations[8]])).rows[0].id_plataforma;
  fixtures.creation={user,hidden};fs.writeFileSync(file,JSON.stringify(fixtures,null,2));
}
module.exports={seed};
