const fs=require('node:fs'),path=require('node:path');
async function seed(input){
  await require('./operationFrontendFixtures.cjs').seed(input);
  const db=input.admin,file=path.join(input.plan.manifest.directory,'api-fixtures.json'),f=JSON.parse(fs.readFileSync(file));
  const one=async(sql,args)=>(await db.query(sql,args)).rows[0];
  const fixtures={operator:f.operations.operator,guide:f.operations.guide};
  fixtures.otherOperator=(await one("INSERT INTO operadores(nombre) VALUES ('Otro operador sintético') RETURNING id_operador id")).id;
  fixtures.wideVehicle=(await one("INSERT INTO vehiculos(identificador,capacidad) VALUES ('SYN-TRANSPORT-12',12) RETURNING id_vehiculo id")).id;
  let index=0;
  for(const [name,pax]of Object.entries({create:null,createLost:null,createUnknown:null,createRollback:null,createTamper:null,createCompeting:null,edit:2,concurrent:2,context:2,lost:2,unknown:2,rollback:2,revoked:2,response:2,realCapacity:4,max12:13,min1:1,cancelled:1,children:3,full12:12,secondGroup:12})){
    const date='2092-08-'+String(++index).padStart(2,'0');
    const id=(await one("INSERT INTO operaciones_tour(fecha,id_tour,hora_inicio,turno,numero_grupo,estado) VALUES ($1,$2,'07:00','Mañana',1,'Preparada') RETURNING id_operacion_tour id",[date,f.tour])).id;
    const item=fixtures[name]={id,date};
    if(pax===null)continue;
    item.transport=(await one("INSERT INTO transportes_operacion(id_operacion_tour,id_operador,estado) VALUES ($1,$2,'Preparado') RETURNING id_transporte_operacion id",[id,fixtures.operator])).id;
    // max12 es historia sintética inconsistente deliberada; no se asigna por API ni debilita validaciones.
    item.reservation=(await one("INSERT INTO reservaciones(codigo,fecha,id_tour,id_pais,id_plataforma,nombre_cliente,pax,ninos,pickup_place,pickup_time,turno,precio_total,deposito,saldo,estado,id_transporte_operacion,fecha_registro,ultima_actualizacion) VALUES ($1,$2,$3,$4,$5,'Cliente transporte sintético',$6,$7,'Punto sintético','07:00','Mañana',1000,200,800,'Programada',$8,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id_reservacion id",['SYN-TR-'+name,date,f.tour,f.country,f.platform,pax,name==='children'?1:0,item.transport])).id;
    if(name==='cancelled')await db.query("INSERT INTO reservaciones(codigo,fecha,id_tour,id_pais,id_plataforma,nombre_cliente,pax,ninos,pickup_place,pickup_time,turno,precio_total,deposito,saldo,estado,id_transporte_operacion,fecha_registro,ultima_actualizacion) SELECT 'SYN-TR-CANCELLED',fecha,id_tour,id_pais,id_plataforma,nombre_cliente,10,0,pickup_place,pickup_time,turno,precio_total,deposito,saldo,'Cancelada',id_transporte_operacion,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM reservaciones WHERE id_reservacion=$1",[item.reservation]);
  }
  // Reutilizar el historial BIGINT instalado antes de los triggers por revisionFixtures.
  fixtures.edit={id:f.records[1].operaciones_tour,date:'2098-01-01',group:2,transport:f.records[1].transportes_operacion,reservation:f.records[1].reservaciones};
  await db.query('UPDATE reservaciones SET id_transporte_operacion=$1 WHERE id_reservacion=$2',[fixtures.edit.transport,fixtures.edit.reservation]);
  fixtures.secondGroup.other=(await one("INSERT INTO operaciones_tour(fecha,id_tour,hora_inicio,turno,numero_grupo,estado) VALUES ($1,$2,'07:00','Mañana',2,'Preparada') RETURNING id_operacion_tour id",[fixtures.secondGroup.date,f.tour])).id;
  const other=(await one("INSERT INTO transportes_operacion(id_operacion_tour,estado) VALUES ($1,'Preparado') RETURNING id_transporte_operacion id",[fixtures.secondGroup.other])).id;
  await db.query("INSERT INTO reservaciones(codigo,fecha,id_tour,id_pais,id_plataforma,nombre_cliente,pax,ninos,pickup_place,pickup_time,turno,precio_total,deposito,saldo,estado,id_transporte_operacion,fecha_registro,ultima_actualizacion) SELECT 'SYN-TR-FULL24',fecha,id_tour,id_pais,id_plataforma,nombre_cliente,12,0,pickup_place,pickup_time,turno,precio_total,deposito,saldo,estado,$2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM reservaciones WHERE id_reservacion=$1",[fixtures.secondGroup.reservation,other]);
  f.transports=fixtures;fs.writeFileSync(file,JSON.stringify(f,null,2));
}
module.exports={seed};
