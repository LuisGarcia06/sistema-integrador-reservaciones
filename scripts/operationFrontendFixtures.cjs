const fs=require('node:fs'),path=require('node:path');
async function seed(input){
  await require('./revisionApiFixtures.cjs').seed(input);
  const db=input.admin,file=path.join(input.plan.manifest.directory,'api-fixtures.json'),f=JSON.parse(fs.readFileSync(file));
  const one=async(sql,args)=>(await db.query(sql,args)).rows[0];
  await db.query("INSERT INTO usuarios(id_rol,nombre,correo,password,estado,alcance_plataformas) SELECT id_rol,'Administrador operaciones sintético','operacion@standalone.example.test',password,true,'all' FROM usuarios WHERE correo='administrador@standalone.example.test'");
  await db.query("INSERT INTO usuarios(id_rol,nombre,correo,password,estado,alcance_plataformas) SELECT (SELECT id_rol FROM roles WHERE nombre='Consulta'),'Consulta operaciones sintético','consulta-operaciones@standalone.example.test',password,true,'all' FROM usuarios WHERE correo='administrador@standalone.example.test'");
  const ops={guide:(await one('SELECT id_guia id FROM guias LIMIT 1')).id,operator:(await one('SELECT id_operador id FROM operadores LIMIT 1')).id};
  let index=0;
  for(const name of ['linked','lost','unknown','rollback','revoked','response','capacity']){
    const date='2094-06-'+String(++index).padStart(2,'0');
    const id=(await one("INSERT INTO operaciones_tour(fecha,id_tour,hora_inicio,turno,numero_grupo,estado) VALUES ($1,$2,'07:00','Mañana',1,'Preparada') RETURNING id_operacion_tour id",[date,f.tour])).id;
    ops[name]={id,date};
    if(['linked','capacity'].includes(name)){
      const vehicle=name==='linked'?f.vehicles[0]:null;
      const tr=(await one("INSERT INTO transportes_operacion(id_operacion_tour,id_vehiculo,id_operador,estado) VALUES ($1,$2,$3,'Preparado') RETURNING id_transporte_operacion id",[id,vehicle,ops.operator])).id;
      // capacity representa historia sintética fuera de capacidad para comprobar su rechazo, no una asignación por API.
      const res=(await one("INSERT INTO reservaciones(codigo,fecha,id_tour,id_pais,id_plataforma,nombre_cliente,pax,ninos,pickup_place,pickup_time,turno,precio_total,deposito,saldo,estado,id_transporte_operacion,fecha_registro,ultima_actualizacion) VALUES ($1,$2,$3,$4,$5,'Cliente operación sintético',$6,1,'Punto sintético','07:00','Mañana',1000,200,800,'Programada',$7,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id_reservacion id",['SYN-OP-'+name,date,f.tour,f.country,f.platform,name==='capacity'?13:2,tr])).id;
      Object.assign(ops[name],{transport:tr,reservation:res,vehicle});
    }
  }
  ops.suggestion={date:'2094-07-01'};
  ops.suggestion.reservation=(await one("INSERT INTO reservaciones(codigo,fecha,id_tour,id_pais,id_plataforma,nombre_cliente,pax,ninos,pickup_place,pickup_time,turno,precio_total,deposito,saldo,estado,fecha_registro,ultima_actualizacion) VALUES ('SYN-OP-SUGGEST','2094-07-01',$1,$2,$3,'Cliente sugerencia sintético',2,1,'Punto sintético','07:00','Mañana',1000,200,800,'Pendiente',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id_reservacion id",[f.tour,f.country,f.platform])).id;
  for(const [key,mail]of [['otherUser','segundo@standalone.example.test'],['responseUser','operacion@standalone.example.test']])ops[key]=(await one('SELECT id_usuario id FROM usuarios WHERE correo=$1',[mail])).id;
  f.operations=ops;fs.writeFileSync(file,JSON.stringify(f,null,2));
}
module.exports={seed};
