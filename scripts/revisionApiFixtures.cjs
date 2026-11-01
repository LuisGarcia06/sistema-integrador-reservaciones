const fs=require('node:fs'),path=require('node:path');
async function seed({admin:db,plan,fixtures:f}){
    const one=async(sql,args)=>(await db.query(sql,args)).rows[0];
    await db.query("INSERT INTO usuarios(id_rol,nombre,correo,password,estado,alcance_plataformas) SELECT id_rol,'Segundo administrador sintético','segundo@standalone.example.test',password,true,'all' FROM usuarios WHERE correo='administrador@standalone.example.test'");
    const hidden=(await one("INSERT INTO plataformas(nombre) VALUES ('Oculta sintética') RETURNING id_plataforma")).id_plataforma;
    const consulta=(await one("UPDATE usuarios SET alcance_plataformas='selected' WHERE correo='consulta@standalone.example.test' RETURNING id_usuario")).id_usuario;
    await db.query('INSERT INTO usuario_plataformas_visibles(id_usuario,id_plataforma) VALUES ($1,$2)',[consulta,f.platform]);
    const reservations=[];
    for(let i=0;i<9;i++){
        const r=await one("INSERT INTO reservaciones(codigo,fecha,id_tour,id_pais,id_plataforma,nombre_cliente,pax,ninos,pickup_place,pickup_time,turno,precio_total,deposito,saldo,estado,fecha_registro,ultima_actualizacion) VALUES ($1,'2098-01-01',$2,$3,$4,'Cliente API sintético',2,0,'Punto sintético','07:00','Mañana',1000,200,800,'Programada',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id_reservacion",['SYN-API-'+i,f.tour,f.country,i===8?hidden:f.platform]);reservations.push(r.id_reservacion);
    }
    const vehicles=[];for(let i=0;i<2;i++)vehicles.push((await one('INSERT INTO vehiculos(identificador,capacidad) VALUES ($1,$2) RETURNING id_vehiculo',['SYN-API-V'+i,i===0?12:3])).id_vehiculo);
    await db.query("INSERT INTO guias(nombre) VALUES ('Guía API sintético')");await db.query("INSERT INTO operadores(nombre) VALUES ('Operador API sintético')");
    const events={};
    for(const [provider,index,status]of [['getyourguide',4,'approved'],['fareharbor',5,'pending_review']]){
        const booking='SYN-API-'+provider;
        await db.query('INSERT INTO reservas_integracion_link(provider,external_booking_id,id_reservacion) VALUES ($1,$2,$3)',[provider,booking,reservations[index]]);
        events[provider]=(await one("INSERT INTO eventos_integracion(provider,external_event_id,external_booking_id,event_type,review_status,application_status,normalized_data,source_received_at) VALUES ($1,$2,$2,'cancellation',$3,'not_applied',$4,CURRENT_TIMESTAMP) RETURNING id_evento_integracion",[provider,booking,status,JSON.stringify({date:'2098-01-01',customer_name:'Evento API sintético',external_booking_id:booking,booking:{status:'cancelled'}})])).id_evento_integracion;
    }
    events.archive=(await one("INSERT INTO eventos_integracion(provider,external_event_id,external_booking_id,event_type,review_status,application_status,normalized_data,source_received_at) VALUES ('fareharbor','SYN-API-ARCHIVE','SYN-API-ARCHIVE','cancellation','pending_review','not_applied','{}',CURRENT_TIMESTAMP) RETURNING id_evento_integracion")).id_evento_integracion;
    const result={...f,reservations,vehicles,events};fs.writeFileSync(path.join(plan.manifest.directory,'api-fixtures.json'),JSON.stringify(result,null,2),{flag:'wx'});
}
module.exports={seed};
