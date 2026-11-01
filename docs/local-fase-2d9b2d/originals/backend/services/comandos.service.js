const C=require('../security/revisionApiContract'),I=require('../security/commandIntent'),M=require('../models/comandos.model');
const tx=require('../config/revisionApiTransactions'),{error}=require('../security/revisionTokens');
const P=require('../config/commandApiPolicy');
const numeric=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0&&value<=2147483647;
function metadata(spec,representation,reply){
    const initial=representation?.datos||representation||{},result=reply?.body?.datos||{};
    const platforms=[initial.id_plataforma,result.id_plataforma,spec.body.id_plataforma].filter(numeric);
    const references=[];
    if(spec.id!==null)references.push({recurso:spec.resource,id:spec.id});
    else if(numeric(result[spec.pk]))references.push({recurso:spec.resource,id:String(result[spec.pk])});
    // Solo referencias de negocio reconocidas; nunca guardar datos libres o secretos.
    for(const resource of ['reservaciones','operaciones','transportes']){
        const pk=C.resources[resource][1];
        for(const value of [initial[pk],result[pk]])if(numeric(value))references.push({recurso:resource,id:String(value)});
    }
    return {plataformas:[...new Set(platforms)],referencias:references.filter((r,i,a)=>a.findIndex(v=>v.recurso===r.recurso&&v.id===r.id)===i)};
}
function receipt(row,replayed=false){
    return {status:row.http_status,headers:{'Idempotency-Replayed':replayed?'true':'false','Location':'/api/comandos/'+row.clave},body:{
        comando:{clave:row.clave,generacion:row.generacion_datos,estado:row.estado},
        resultado:row.resultado,ids_bitacora:row.ids_bitacora
    }};
}
function create({pool,plan,invoke,snapshot,verify,command=C.command,protocol=P.PROTOCOL,auditing=false}){
    const generation=plan.manifest.dataGeneration;
    const userAudit=plan.config?.APP_ENVIRONMENT==='user-audit-api-lab';
    function scopeMetadata(spec,representation,reply){
        const scope=metadata(spec,representation,reply);
        if(userAudit&&spec.resource==='usuarios'){
            const before=representation?.datos||representation||{},after=reply?.body?.datos||{};
            scope.plataformas=[...new Set([...scope.plataformas,...[before.platform_ids,after.platform_ids,spec.body.platform_ids]
                .flatMap(ids=>Array.isArray(ids)?ids:[]).filter(numeric)])].sort((a,b)=>a-b);
        }
        return scope;
    }
    async function linkedScope(db,spec,scope){
        if(spec.resource==='eventos-integracion'&&spec.id!==null){
            const rows=(await db.query(`SELECT r.id_reservacion,r.id_plataforma FROM public.eventos_integracion e
                JOIN public.reservas_integracion_link l ON l.provider=e.provider AND l.external_booking_id=e.external_booking_id
                JOIN public.reservaciones r ON r.id_reservacion=l.id_reservacion WHERE e.id_evento_integracion=$1`,[spec.id])).rows;
            for(const r of rows){
                if(!scope.referencias.some(v=>v.recurso==='reservaciones'&&v.id===String(r.id_reservacion)))scope.referencias.push({recurso:'reservaciones',id:String(r.id_reservacion)});
                if(!scope.plataformas.includes(r.id_plataforma))scope.plataformas.push(r.id_plataforma);
            }
        }
        return scope;
    }
    async function authorize(db,req,scope){
        const actor=(await db.query(`SELECT u.id_usuario,u.estado,u.alcance_plataformas,${auditing?'u.nombre,':''}r.nombre rol FROM public.usuarios u JOIN public.roles r ON r.id_rol=u.id_rol WHERE u.id_usuario=$1`,[req.usuario.id_usuario])).rows[0];
        if(!actor||!actor.estado||actor.rol!=='Administrador')throw error(403,'NO_AUTORIZADO');
        // El rol del JWT o del middleware anterior no sustituye esta lectura bajo el límite transaccional.
        req.usuario={...req.usuario,rol:actor.rol};
        // Solo el contrato nuevo aplica el alcance efectivo Admin all ya vigente
        // en las lecturas. Conserva modo/filas almacenados y nunca alcanza Consulta.
        if(scope&&!userAudit&&actor.alcance_plataformas!=='all'){
            const visible=(await db.query('SELECT id_plataforma FROM public.usuario_plataformas_visibles WHERE id_usuario=$1',[actor.id_usuario])).rows.map(r=>r.id_plataforma);
            if(scope.plataformas.some(id=>!visible.includes(id)))throw error(404,'COMANDO_NO_DISPONIBLE');
        }
        for(const ref of scope?.referencias||[]){
            if(!C.resources[ref.recurso])throw error(404,'COMANDO_NO_DISPONIBLE');
            const url=ref.recurso==='daily'?'/api/daily/observaciones?fecha='+ref.id:['paises','plataformas'].includes(ref.recurso)?'/api/'+ref.recurso:'/api/'+ref.recurso+'/'+ref.id;
            const view=await invoke('GET',url,{},req.headers);
            if(view.status!==200)throw error(view.status===403?403:404,'COMANDO_NO_DISPONIBLE');
        }
        return actor;
    }
    async function execute(req){
        const key=I.identity(req,generation,protocol),spec=command(req.method,req.originalUrl,req.body);
        const fingerprint=I.fingerprint(plan.commandKey,generation,req.usuario.id_usuario,spec,req.headers);
        return tx.transaction(pool,async db=>{
            await authorize(db,req);
            const prior=await M.find(db,generation,req.usuario.id_usuario,key);
            if(prior){
                await authorize(db,req,prior.alcance);
                if(!I.equal(fingerprint,prior.huella))throw error(409,'CLAVE_IDEMPOTENCIA_REUTILIZADA');
                // Nunca calcular una foto/precondición nueva ni llamar al escritor en un replay.
                return receipt(prior,true);
            }
            let original;
            const attempted=await tx.attemptCommand(async()=>{
                original=await snapshot(db,spec,req);verify(req,original);
                const actor=await authorize(db,req,await linkedScope(db,spec,scopeMetadata(spec,original.representation)));
                tx.authorizeWrites();
                if(auditing)tx.establishAudit({actor,generation,key,spec});
                const reply=await invoke(req.method,spec.url,spec.body,req.headers);
                if(reply.status<200||reply.status>=300)throw {reply};
                return reply;
            });
            let status=200,code='COMANDO_CONFIRMADO',scope=await linkedScope(db,spec,scopeMetadata(spec,original?.representation,attempted.value));
            if(attempted.error){
                const e=attempted.error;status=e.reply?.status||e.statusCode||500;
                // Fallos técnicos/permiso no se afirman como rechazo durable. Todo se revierte.
                if(status<400||status>=500||[401,403].includes(status)||e.operationalLab)throw e;
                code=/^[A-Z_]{1,80}$/.test(e.code||'')?e.code:'NEGOCIO_RECHAZADO';
            }
            const row={generacion_datos:generation,id_usuario:req.usuario.id_usuario,clave:key,version:1,metodo:spec.method,ruta:spec.url,recurso:spec.resource,
                id_recurso:spec.id??scope.referencias.find(r=>r.recurso===spec.resource)?.id??null,huella:fingerprint,estado:status===200?'confirmado':'rechazado',http_status:status,
                resultado:{codigo:code,recurso:spec.resource,referencias:scope.referencias},alcance:scope,ids_bitacora:[]};
            row.ids_bitacora=await tx.recordCommand(row);
            return receipt(row);
        });
    }
    async function recover(req,key){
        if(!I.UUID.test(key||''))throw error(400,'CLAVE_IDEMPOTENCIA_INVALIDA');
        if(req.headers['x-ctsk-data-generation']!==generation)throw error(409,'GENERACION_INCOMPATIBLE');
        if(req.headers['x-ctsk-protocol']!==protocol)throw error(400,'CLIENTE_INCOMPATIBLE');
        return tx.readCommand(pool,async db=>{
            await authorize(db,req);
            const row=await M.find(db,generation,req.usuario.id_usuario,key);
            if(!row)return {status:404,body:{estado:'desconocido',codigo:'COMANDO_NO_DISPONIBLE',concluyente:false}};
            await authorize(db,req,row.alcance);
            return {status:200,body:{...receipt(row,true).body,http_status_original:row.http_status}};
        });
    }
    return {execute,recover};
}
module.exports={create,metadata,receipt};
