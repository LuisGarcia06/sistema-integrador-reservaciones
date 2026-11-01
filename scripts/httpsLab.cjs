const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const P=require('../backend/config/standalonePolicy'),H=require('../backend/config/httpsLabPolicy');
const base=require('./standaloneDev.cjs'),root=path.resolve(__dirname,'..');
function clean(){const e=require('../backend/config/desktopPolicy').cleanEnvironment();delete e.ELECTRON_RUN_AS_NODE;return e;}
async function seed(m){
    const plan=P.readDatabasePlan(path.join(m.directory,'manifest.json'));P.verifyLocalCluster(m);
    const c=new (require('pg').Client)({host:P.HOST,port:m.pgPort,database:m.database,user:plan.config.DB_USER,password:plan.config.DB_PASSWORD,connectionTimeoutMillis:5000,query_timeout:5000});
    let transaction=false;
    // Barrera antes de conectar: solo el puerto del clúster nuevo.
    const net=require('node:net'),connect=net.Socket.prototype.connect;
    net.Socket.prototype.connect=function(...args){const a=Array.isArray(args[0])?args[0]:args,t=a[0];
        const host=t&&typeof t==='object'?t.host:a[1],port=t&&typeof t==='object'?t.port:t;
        if(host!==P.HOST||Number(port)!==m.pgPort)throw Error('HTTPS_LAB_NETWORK');return connect.apply(this,args);};
    try{
        await c.connect();
        await require('../backend/config/desktopPostgres').verifyPostgresWithIdentity({connect:async()=>({query:c.query.bind(c),release(){}})},plan.config,(r,config)=>P.validateIdentity(r,config,m));
        await c.query('BEGIN');
        transaction=true;
        const one=async(sql,values)=>Number((await c.query(sql,values)).rows[0].id);
        const tour=await one("INSERT INTO tours(nombre,descripcion,activo) VALUES ('Tour HTTPS sintético','Laboratorio',true) RETURNING id_tour id");
        const country=await one("INSERT INTO paises(nombre) VALUES ('País sintético') RETURNING id_pais id");
        const platform=await one("INSERT INTO plataformas(nombre) VALUES ('Externa') RETURNING id_plataforma id");
        const vehicle=await one("INSERT INTO vehiculos(identificador,capacidad) VALUES ('SYN-HTTPS',12) RETURNING id_vehiculo id");
        const driver=await one("INSERT INTO operadores(nombre) VALUES ('Operador sintético') RETURNING id_operador id");
        const guide=await one("INSERT INTO guias(nombre) VALUES ('Guía sintético') RETURNING id_guia id");
        const operation=await one("INSERT INTO operaciones_tour(fecha,id_tour,hora_inicio,turno,numero_grupo,id_guia,estado) VALUES ('2099-01-05',$1,'07:00','Mañana',1,$2,'Preparada') RETURNING id_operacion_tour id",[tour,guide]);
        const transport=await one("INSERT INTO transportes_operacion(id_operacion_tour,id_vehiculo,id_operador,estado) VALUES ($1,$2,$3,'Preparado') RETURNING id_transporte_operacion id",[operation,vehicle,driver]);
        await c.query("INSERT INTO reservaciones(codigo,fecha,id_tour,id_pais,id_plataforma,nombre_cliente,pax,ninos,pickup_place,pickup_time,turno,precio_total,deposito,saldo,id_transporte_operacion,estado,fecha_registro,ultima_actualizacion) VALUES ('SYN-HTTPS-1','2099-01-05',$1,$2,$3,'Cliente sintético HTTPS',2,0,'Punto sintético','07:00','Mañana',1000,200,800,$4,'Programada',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",[tour,country,platform,transport]);
        await c.query("INSERT INTO eventos_integracion(provider,external_event_id,external_booking_id,event_type,urgent,review_status,application_status,normalized_data,source_received_at) VALUES ('getyourguide','synthetic-https-1','GYGHTTPS00001','new_booking',false,'pending_review','not_applied',$1,CURRENT_TIMESTAMP)",[JSON.stringify({customer_name:'Cliente sintético de aviso',date:'2099-01-05',pax:2})]);
        await c.query("INSERT INTO usuarios(id_rol,nombre,correo,password,estado,alcance_plataformas) SELECT id_rol,'Consulta restringida sintética','selected@standalone.example.test',password,true,'selected' FROM usuarios WHERE correo='consulta@standalone.example.test'");
        await c.query('COMMIT');transaction=false;
    }catch(error){if(transaction)await c.query('ROLLBACK').catch(()=>{});throw error;}
    finally{await c.end();net.Socket.prototype.connect=connect;}
}
async function prepare(dir){
    const m=await base.prepare(dir);
    try{
        require('./httpsCertificates.cjs').generate(dir);
        const serverId=crypto.randomUUID(),origin=`https://${P.HOST}:${m.httpPort}`;
        const clientDir=path.join(dir,'client'),serverDir=path.join(dir,'server');
        const client={version:1,protocol:1,environment:'https-loopback-lab',serverId,origin,code:m.code,
            tlsSpki:H.spki(fs.readFileSync(path.join(serverDir,'tls-cert.pem'))),caDigest:P.sha(fs.readFileSync(path.join(clientDir,'ca.pem'))),
            publicKeyDigest:P.sha(fs.readFileSync(path.join(clientDir,'identity-public.pem')))};
        fs.writeFileSync(path.join(clientDir,'client.json'),JSON.stringify(client,null,2),{flag:'wx'});
        fs.writeFileSync(path.join(serverDir,'server.json'),JSON.stringify({version:1,environment:client.environment,serverId,origin,code:m.code},null,2),{flag:'wx'});
        H.readServer(path.join(serverDir,'server.json'));H.readClient(path.join(clientDir,'client.json'));
        await seed(m);return m;
    }catch(error){base.control(m,'stop');throw error;}
}
function start(m){
    const child=cp.spawn(process.execPath,[path.join(root,'backend/httpsLab.js'),'--server',path.join(m.directory,'server/server.json')],
        {cwd:root,env:clean(),windowsHide:true,stdio:['ignore','pipe','pipe']});
    return {child,ready:new Promise((resolve,reject)=>{
        let out='',err='';const timer=setTimeout(()=>{child.kill();reject(Error('HTTPS_START_TIMEOUT'));},60000);
        child.stderr.on('data',c=>err+=c);child.stdout.on('data',c=>{out+=c;if(out.includes('HTTPS_LAB_READY')){clearTimeout(timer);resolve();}});
        child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',()=>{clearTimeout(timer);reject(Error('HTTPS_SERVER_EXIT '+err.trim()));});
    })};
}
async function stop(child){if(child&&child.exitCode===null){const ended=require('node:events').once(child,'exit');child.kill();await ended;}}
async function verify(m){return require('./httpsLabVerify.cjs').run({m,root,clean,start,stop});}
async function main(){
    const [mode,dir]=process.argv.slice(2);if(!['Prepare','Verify','Stop'].includes(mode)||!path.isAbsolute(dir||''))throw Error('HTTPS_LAB_ARGUMENTS');
    if(mode==='Stop'){const plan=H.readServer(path.join(dir,'server/server.json'));base.control(plan.manifest,'stop');console.log('HTTPS_POSTGRES_STOPPED');return;}
    const m=await prepare(dir);
    console.log('SERVER '+path.join(dir,'server/server.json'));console.log('CLIENT '+path.join(dir,'client/client.json'));
    if(mode==='Verify'){
        try{await verify(m);}finally{
            base.control(m,'stop');const file=path.join(dir,'https-verification.json');
            if(fs.existsSync(file)){const r=JSON.parse(fs.readFileSync(file));r.postgresStopped=!fs.existsSync(path.join(m.dataDirectory,'postmaster.pid'));fs.writeFileSync(file,JSON.stringify(r,null,2));}
        }
    }
}
if(require.main===module)main().catch(e=>{console.error('HTTPS_LAB_FAILED '+(e.code||e.message||e.name).slice(0,180));process.exitCode=1;});
module.exports={prepare,start,stop,verify,seed};
