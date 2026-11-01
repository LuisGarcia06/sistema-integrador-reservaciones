const fs=require('node:fs'),path=require('node:path');
async function seed(input){
  await require('./dailyFrontendFixtures.cjs').seed(input);const db=input.admin,file=path.join(input.plan.manifest.directory,'api-fixtures.json'),f=JSON.parse(fs.readFileSync(file)),one=async(sql,args)=>(await db.query(sql,args)).rows[0];
  const c={past:[],events:[],today:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Cancun',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())};
  c.hidden=(await one("SELECT id_plataforma id FROM plataformas WHERE nombre='Oculta sintética'")).id;
  for(let i=0;i<32;i++)c.past.push((await one("INSERT INTO reservaciones(codigo,fecha,id_tour,id_pais,id_plataforma,nombre_cliente,telefono_cliente,habitacion,pax,ninos,pickup_place,pickup_time,turno,precio_total,deposito,saldo,observaciones,estado,fecha_registro,ultima_actualizacion) VALUES ($1,$2,$3,$4,$5,$6,'SYN-TEL','ANTERIOR',2,0,'Hotel historial','07:05',$7,1000,200,800,'Observación histórica',$8,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id_reservacion id",['SYN-HISTORY-'+String(i).padStart(2,'0'),'2025-06-0'+(i%3+1),i%2?f.daily.otherTour:f.tour,f.country,i>=30?c.hidden:f.platform,i>=30?'OCULTO HISTORIAL '+i:'Cliente historial '+String(i).padStart(2,'0'),i%2?'Tarde':'Mañana',i%2?'Activa':'Confirmada'])).id);
  for(const [key,mail,role,scope]of [['noneUser','consulta-vacia@standalone.example.test','Consulta','selected'],['lateUser','consulta-tardia@standalone.example.test','Administrador','all']])c[key]=(await one("INSERT INTO usuarios(id_rol,nombre,correo,password,estado,alcance_plataformas) SELECT (SELECT id_rol FROM roles WHERE nombre=$2),'Usuario consulta sintético', $1,password,true,$3 FROM usuarios WHERE correo='administrador@standalone.example.test' RETURNING id_usuario id",[mail,role,scope])).id;
  for(let i=0;i<28;i++){
    const shared=i>=26,booking=shared?'GYGHISTORY1':'GYGNOTICE'+String(i).padStart(5,'0'),date=i===25?'2020-01-05':'2039-05-20';
    const data={date,customer_name:shared?'Cliente grupo historial':'Cliente aviso '+i,pax:2,id_tour:f.tour,turno:'Mañana',pickup_place:'Hotel aviso',pickup_time:'07:10',start_time:'08:00'};
    c.events.push((await one("INSERT INTO eventos_integracion(provider,external_event_id,external_booking_id,event_type,review_status,application_status,normalized_data,source_received_at,created_at,updated_at) VALUES ('getyourguide',$1,$2,'new_booking',$3,'not_applied',$4,CURRENT_TIMESTAMP-($5::int*INTERVAL '1 minute'),CURRENT_TIMESTAMP-($5::int*INTERVAL '1 minute'),CURRENT_TIMESTAMP) RETURNING id_evento_integracion id",['SYN-CONSULT-'+i,booking,i===24?'approved':'pending_review',JSON.stringify(data),28-i])).id);
  }
  c.future=c.events[0];c.group=c.events[27];c.historical=c.events[25];f.consultations=c;fs.writeFileSync(file,JSON.stringify(f,null,2));
}
module.exports={seed};
