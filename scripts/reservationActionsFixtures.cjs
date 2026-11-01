// Se ejecuta exclusivamente en el clúster NUEVO verificado por standaloneDev.
const fs=require('node:fs'),path=require('node:path');
async function seed(input){
  await require('./revisionApiFixtures.cjs').seed(input);
  const db=input.admin,one=async(sql,args)=>(await db.query(sql,args)).rows[0];
  const file=path.join(input.plan.manifest.directory,'api-fixtures.json'),f=JSON.parse(fs.readFileSync(file));
  await db.query("INSERT INTO usuarios(id_rol,nombre,correo,password,estado,alcance_plataformas) SELECT id_rol,'Tercer administrador sintético','tercero@standalone.example.test',password,true,'all' FROM usuarios WHERE correo='administrador@standalone.example.test'");
  const actions={user:(await one("SELECT id_usuario id FROM usuarios WHERE correo='tercero@standalone.example.test'")).id};let seq=0;
  async function group(name,{pax=2,ninos=0,vehicle=false,existing=0,assigned=false,cancelled=false,twoFull=false}={}){
    const n=++seq,date='2097-04-'+String(n).padStart(2,'0');
    const tour=(await one("INSERT INTO tours(nombre,descripcion,activo) VALUES ($1,'Solo laboratorio sintético',true) RETURNING id_tour id",['SYN-ACC-'+name])).id;
    const transports=[],operations=[];
    for(let g=1;g<=2;g++){
      const op=(await one("INSERT INTO operaciones_tour(fecha,id_tour,hora_inicio,turno,numero_grupo,estado) VALUES ($1,$2,'07:00','Mañana',$3,'Preparada') RETURNING id_operacion_tour id",[date,tour,g])).id;operations.push(op);
      const v=vehicle&&(g===1||vehicle==='both')?(await one("INSERT INTO vehiculos(identificador,capacidad) VALUES ($1,3) RETURNING id_vehiculo id",['SYN-ACC-V'+n+'-'+g])).id:null;
      transports.push((await one("INSERT INTO transportes_operacion(id_operacion_tour,id_vehiculo,estado) VALUES ($1,$2,'Preparado') RETURNING id_transporte_operacion id",[op,v])).id);
    }
    async function reservation(code,pax,transport,estado='Programada',ninos=0){return (await one("INSERT INTO reservaciones(codigo,fecha,id_tour,id_pais,id_plataforma,nombre_cliente,pax,ninos,pickup_place,pickup_time,turno,precio_total,deposito,saldo,estado,id_transporte_operacion,fecha_registro,ultima_actualizacion) VALUES ($1,$2,$3,$4,$5,'Cliente acción sintético',$6,$7,'Punto sintético','07:00','Mañana',1000,200,800,$8,$9,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id_reservacion id",[code,date,tour,f.country,f.platform,pax,ninos,estado,transport])).id;}
    const id=await reservation('SYN-ACC-'+name,pax,assigned?transports[0]:null,cancelled?'Cancelada':'Programada',ninos);
    if(existing)await reservation('SYN-BASE-'+name,existing,transports[0]);
    const value=actions[name]={id,date,tour,transports,operations,pax};
    if(twoFull){value.peer=await reservation('SYN-PEER-'+name,12,null);value.extra=await reservation('SYN-EXTRA-'+name,1,null);}
    return value;
  }
  for(const name of ['cancelValid','cancelConcurrent','cancelStale','cancelLost','cancelUnknown','transportLost','transportUnknown','permissions'])await group(name);
  await group('assignConcurrent',{vehicle:'both'});await group('tourMaximum',{pax:12,twoFull:true});
  await group('cancelMinimum',{vehicle:true,assigned:true});await group('assignValid',{vehicle:true,ninos:1});
  await group('moveValid',{assigned:true});await group('capacity',{vehicle:true,existing:2});await group('groupMaximum',{existing:11});
  await group('originMinimum',{vehicle:true,assigned:true});await group('destinationMinimum',{vehicle:true,pax:1});await group('cancelled',{pax:8,ninos:3,cancelled:true});
  const a=await group('incompatible'),b=await group('otherTour');a.mismatch=[];
  for(const [date,tour,turno]of [[b.date,a.tour,'Mañana'],[a.date,b.tour,'Mañana'],[a.date,a.tour,'Tarde']]){
    const op=(await one("INSERT INTO operaciones_tour(fecha,id_tour,hora_inicio,turno,numero_grupo,estado) VALUES ($1,$2,'07:00',$3,1,'Preparada') RETURNING id_operacion_tour id",[date,tour,turno])).id;
    a.mismatch.push((await one("INSERT INTO transportes_operacion(id_operacion_tour,estado) VALUES ($1,'Preparado') RETURNING id_transporte_operacion id",[op])).id);
  }
  f.actions=actions;fs.writeFileSync(file,JSON.stringify(f,null,2));
}
module.exports={seed};
