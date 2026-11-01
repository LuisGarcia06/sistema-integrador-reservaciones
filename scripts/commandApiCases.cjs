const assert=require('node:assert/strict'),crypto=require('node:crypto');
const C=require('../backend/security/revisionApiContract'),P=require('../backend/config/commandApiPolicy');
async function run({request,discard,observer:db,fixtures:f,credentials,report}){
    const pass=name=>{report.checks.push(name);console.log('COMMAND_OK '+name);};
    const login=async correo=>{const r=await request('POST','/api/auth/login',{correo,password:credentials.password});assert.equal(r.status,200,JSON.stringify(r));return r.body.token;};
    const admin=await login(credentials.correo),other=await login('segundo@standalone.example.test'),consulta=await login('consulta@standalone.example.test');
    const generation=report.dataGeneration,coverage=new Map();
    const common={'X-CTSK-Protocol':P.PROTOCOL,'X-CTSK-Data-Generation':generation};
    const ask=(method,url,body,token=admin,headers={})=>request(method,url,body,token,headers);
    const recover=(key,token=admin,extra={})=>ask('GET','/api/comandos/'+key,undefined,token,{...common,...extra});
    async function preview(method,url,body={},token=admin){
        const r=await ask('POST','/api/precondiciones',{metodo:method,ruta:url,datos:body},token,common);
        assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.generacion,generation);return r.body;
    }
    async function prepare(method,url,body,token=admin){const pre=await preview(method,url,body,token),key=crypto.randomUUID();return {method,url,body,token,key,headers:{...common,'Idempotency-Key':key,'If-Match':pre.etag,'If-Operational-Match':pre.contexto}};}
    const write=(c,extra={})=>ask(c.method,c.url,c.body,c.token,{...c.headers,...extra});
    function mark(c){const s=C.command(c.method,c.url,c.body),name=s.method+' '+s.mount+s.path;coverage.set(name,{method:s.method,path:s.mount+s.path,confirmed:true,replayed:true});}
    async function checksum(includeCommands=false){
        const hash=crypto.createHash('sha256');
        for(const table of [...require('../backend/config/desktopSchema').TABLES,...(includeCommands?['comandos_idempotentes']:[])])hash.update((await db.query(`SELECT COALESCE(jsonb_agg(v ORDER BY v::text),'[]'::jsonb)::text value FROM (SELECT to_jsonb(t) v FROM public.${table} t) s`)).rows[0].value);
        return hash.digest('hex');
    }
    async function replay(c,first){
        const before=await checksum(true),r=await write(c);assert.equal(r.status,first.status,JSON.stringify(r));assert.equal(r.headers['idempotency-replayed'],'true');assert.deepEqual(r.body,first.body);assert.equal(await checksum(true),before,'REPLAY_CHANGED_DATABASE');if(r.status===200)mark(c);return r;
    }
    async function change(method,url,body,token=admin){const c=await prepare(method,url,body,token),r=await write(c);assert.equal(r.status,200,JSON.stringify(r));await replay(c,r);return {c,r};}
    const ref=(r,resource)=>{const found=r.body.resultado.referencias.find(x=>x.recurso===resource);assert.ok(found,JSON.stringify(r));return Number(found.id);};
    const auditCount=async id=>(await db.query('SELECT count(*)::int n FROM bitacora WHERE id_reservacion=$1',[id])).rows[0].n;
    async function rejected(c,status,code){const before=await checksum(),r=await write(c);assert.equal(r.status,status,JSON.stringify(r));if(code)assert.equal(r.body.resultado?.codigo||r.body.codigo,code);assert.equal(await checksum(),before,'REJECT_CHANGED_BUSINESS');return r;}
    const newBody={fecha:'2098-03-03',id_tour:f.tour,id_pais:f.country,id_plataforma:f.platform,nombre_cliente:'Alta comando sintética',pax:2,ninos:0,pickup_place:'Punto sintético',pickup_time:'07:00',turno:'Mañana',precio_total:1000,deposito:200,saldo:800,estado:'Pendiente'};
    const concurrent=await prepare('POST','/api/reservaciones',newBody),KEY=require('../backend/config/operationalTransactions').KEY;
    let pending;
    await db.query('BEGIN');
    try{
        await db.query('SELECT pg_advisory_xact_lock($1::int,$2::int)',KEY);
        pending=Promise.all([write(concurrent),write(concurrent)]);
        let waiting=0;const until=Date.now()+1000;
        while(Date.now()<until){waiting=(await db.query("SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND NOT granted AND classid=$1::oid AND objid=$2::oid",KEY)).rows[0].n;if(waiting>=2)break;await new Promise(r=>setTimeout(r,10));}
        assert.equal(waiting,2,'TWO_INDEPENDENT_HTTP_WRITERS_MUST_WAIT');
        const unknown=await recover(concurrent.key);assert.equal(unknown.status,404,JSON.stringify(unknown));assert.equal(unknown.body.estado,'desconocido');assert.equal(unknown.body.concluyente,false);
        assert.equal((await db.query('SELECT count(*)::int n FROM comandos_idempotentes')).rows[0].n,0,'NO_DURABLE_ADMISSION');
        await db.query('COMMIT');
    }catch(e){await db.query('ROLLBACK');await pending?.catch(()=>{});throw e;}
    const twins=await pending;assert.deepEqual(twins.map(r=>r.status),[200,200],JSON.stringify(twins));assert.deepEqual(twins.map(r=>r.headers['idempotency-replayed']).sort(),['false','true']);assert.deepEqual(twins[0].body,twins[1].body);mark(concurrent);
    const created=ref(twins[0],'reservaciones');assert.equal(await auditCount(created),1);assert.equal((await db.query('SELECT count(*)::int n FROM comandos_idempotentes WHERE clave=$1',[concurrent.key])).rows[0].n,1);
    report.concurrentKey=concurrent.key;
    pass('Dos altas HTTP simultáneas con dos conexiones bloqueadas: un alta, un comando, una bitácora; ausencia concurrente es desconocida');
    const allBefore=await checksum(true),wrong={...concurrent,body:{...newBody,nombre_cliente:'Otro contenido'}};
    const misuse=await write(wrong);assert.equal(misuse.status,409,JSON.stringify(misuse));assert.equal(misuse.body.codigo,'CLAVE_IDEMPOTENCIA_REUTILIZADA');assert.equal(await checksum(true),allBefore);
    const alternate=await preview(concurrent.method,concurrent.url,concurrent.body);
    assert.equal((await write(concurrent,{'If-Operational-Match':alternate.contexto})).status,409);assert.equal(await checksum(true),allBefore);
    pass('Misma clave con intención distinta se rechaza sin alterar el resultado ni los datos');
    const path='/api/reservaciones/'+created;
    const firstEdit=await change('PATCH',path,{habitacion:'Primera intención'});
    await change('PATCH',path,{habitacion:'Intención posterior'});await replay(firstEdit.c,firstEdit.r);
    assert.equal((await ask('GET',path)).body.datos.habitacion,'Intención posterior');
    pass('Replay de modificación confirmada ignora precondiciones antiguas para ejecutar; conserva la edición posterior');
    assert.equal((await recover(firstEdit.c.key,other)).status,404);assert.equal((await recover(firstEdit.c.key,consulta)).status,403);
    pass('Recuperación propia: otro administrador no obtiene el comando y Consulta no obtiene recibos de escritura');
    await change('PATCH','/api/reservaciones/'+f.reservations[0]+'/cancelar',{motivo_cancelacion:'Cancelación comando sintética'});
    assert.equal(await auditCount(f.reservations[0]),1);
    await change('PATCH','/api/reservaciones/'+f.reservations[1]+'/transporte',{id_transporte_operacion:f.records[0].transportes_operacion});
    assert.equal(await auditCount(f.reservations[1]),1);
    pass('Cancelación duplicada y asignación repetida conservan una sola auditoría por efecto');
    await change('PATCH','/api/operaciones/'+f.records[0].operaciones_tour,{hora_inicio:'08:00'});
    await change('PATCH','/api/transportes/'+f.records[0].transportes_operacion,{observaciones_operador:'Comando transporte'});
    const noOpBefore=await checksum();
    await change('PATCH','/api/operaciones/'+f.records[0].operaciones_tour,{hora_inicio:'08:00'});
    await change('PATCH','/api/transportes/'+f.records[0].transportes_operacion,{observaciones_operador:'Comando transporte'});
    assert.equal(await checksum(),noOpBefore);
    pass('Operaciones, transportes y no-op conservan revisiones y bitácora; el recibo no es un efecto de negocio');
    const high='/api/reservaciones/'+f.records[1].reservaciones;
    assert.equal((await preview('PATCH',high)).revision,'9007199254740993');await change('PATCH',high,{observaciones:'BIGINT comando'});
    assert.equal((await ask('GET',high)).body.revision,'9007199254740994');
    pass('Revisiones BIGINT mayores a 2^53 permanecen exactas como texto');
    const stale=await prepare('PATCH',path,{habitacion:'Obsoleto'});
    await change('PATCH',path,{telefono_cliente:'0000000000'});
    const staleReply=await rejected(stale,412,'PRECONDICION_OBSOLETA');await replay(stale,staleReply);
    const staleRecovery=await recover(stale.key);assert.equal(staleRecovery.body.comando.estado,'rechazado');assert.equal(staleRecovery.body.http_status_original,412);
    pass('412 deja rechazo durable propio sin efectos; consulta y replay recuperan el rechazo original');
    const context=await prepare('PATCH',path,{observaciones:'Contexto viejo'});
    await change('PATCH','/api/vehiculos/'+f.vehicles[0],{color:'Contexto cambiado'});
    const contextReply=await rejected(context,409,'CONTEXTO_OPERATIVO_CAMBIO');await replay(context,contextReply);
    pass('Contexto operativo obsoleto produce 409 durable sin duplicar efectos');
    for(const sentinel of ['SYN-FAIL-AUDIT','SYN-FAIL-COMMAND','SYN-FAIL-AFTER-RECORD']){
        const c=await prepare('PATCH',path,{habitacion:sentinel}),before=await checksum(true);
        const r=await write(c);assert.equal(r.status,500,JSON.stringify(r));assert.equal(await checksum(true),before);
        assert.equal((await recover(c.key)).body.estado,'desconocido');
    }
    pass('Fallos de bitácora, registro y después del INSERT de comando antes de COMMIT revierten juntos datos, revisión, auditoría y resultado');
    const lost=await prepare('PATCH','/api/reservaciones/'+f.reservations[6],{observaciones:'COMMIT con respuesta perdida'});
    await discard(lost.method,lost.url,lost.body,lost.token,lost.headers);
    const lostResult=await recover(lost.key);assert.equal(lostResult.status,200,JSON.stringify(lostResult));assert.equal(lostResult.body.comando.estado,'confirmado');assert.equal(await auditCount(f.reservations[6]),1);
    assert.equal((await ask('GET',lost.url)).body.datos.observaciones,'COMMIT con respuesta perdida');
    const lostFirst={status:200,body:{comando:lostResult.body.comando,resultado:lostResult.body.resultado,ids_bitacora:lostResult.body.ids_bitacora}};await replay(lost,lostFirst);
    pass('Respuesta descartada después de COMMIT: GET recupera el recibo y replay explícito no repite auditoría');
    const timeout=await prepare('PATCH',path,{habitacion:'No confirmado por espera'});
    await db.query('BEGIN');
    try{await db.query('SELECT pg_advisory_xact_lock($1::int,$2::int)',KEY);assert.equal((await write(timeout)).status,409);assert.equal((await recover(timeout.key)).body.estado,'desconocido');}
    finally{await db.query('ROLLBACK');}
    pass('Espera agotada por candado no se registra como ejecución fallida o rollback confirmado');
    const guide=await change('POST','/api/guias',{nombre:'Guía comando',estado:true});await change('PATCH','/api/guias/'+ref(guide.r,'guias'),{nombre:'Guía comando revisado'});
    const operator=await change('POST','/api/operadores',{nombre:'Operador comando',estado:true});await change('PATCH','/api/operadores/'+ref(operator.r,'operadores'),{nombre:'Operador comando revisado'});
    const tour=await change('POST','/api/tours',{nombre:'Tour comando',descripcion:'Sintético',activo:true});await change('PATCH','/api/tours/'+ref(tour.r,'tours'),{descripcion:'Sintético revisado'});
    await change('POST','/api/paises',{nombre:'País comando'});await change('POST','/api/plataformas',{nombre:'Plataforma comando'});
    const vehicle=await change('POST','/api/vehiculos',{identificador:'SYN-COMMAND-VEH',placas:null,color:null,capacidad:12,estado:true});await change('PATCH','/api/vehiculos/'+ref(vehicle.r,'vehiculos'),{color:'Verde'});
    const role=(await db.query("SELECT id_rol FROM roles WHERE nombre='Consulta'")).rows[0].id_rol;
    const secret1='Synthetic-Command-Only-12345',secret2='Synthetic-Command-Changed-12345';
    const user=await change('POST','/api/usuarios',{nombre:'Usuario comando',correo:'command@standalone.example.test',password:secret1,id_rol:role,estado:true,alcance_plataformas:'selected',platform_ids:[f.platform]});
    const userId=ref(user.r,'usuarios');await change('PATCH','/api/usuarios/'+userId,{nombre:'Usuario comando revisado'});await change('PATCH','/api/usuarios/'+userId+'/password',{password:secret2});
    await change('PUT','/api/daily/observaciones?fecha=2098-03-03',{observaciones:'Daily comando sintético'});
    const operation=await change('POST','/api/operaciones',{fecha:'2098-03-03',id_tour:f.tour,turno:'Mañana',numero_grupo:1,hora_inicio:'07:00',id_guia:null,estado:'Preparada'});
    const transport=await change('POST','/api/transportes',{id_operacion_tour:ref(operation.r,'operaciones'),id_vehiculo:null,id_operador:null,observaciones_operador:null,estado:'Preparado'});
    await change('PATCH',path+'/transporte',{id_transporte_operacion:ref(transport.r,'transportes')});await change('PATCH','/api/transportes/'+ref(transport.r,'transportes'),{id_vehiculo:ref(vehicle.r,'vehiculos')});
    await rejected(await prepare('PATCH',path+'/cancelar',{motivo_cancelacion:'Mínimo vehículo'}),400);
    await rejected(await prepare('PATCH',path,{pax:13}),400);
    pass('Catálogos, usuarios/password, Daily y altas operativas tienen replay; se conservan límites de PAX y mínimo de vehículo');
    const g='/api/eventos-integracion/'+f.events.getyourguide+'/aplicar';
    const gyg=await change('POST',g,{completar:{motivo_cancelacion:'GYG sintético comando'}});
    assert.ok(gyg.r.body.resultado.referencias.some(r=>r.recurso==='reservaciones'&&r.id===String(f.reservations[4])));
    const fh='/api/eventos-integracion/'+f.events.fareharbor;
    await change('PATCH',fh+'/revision',{accion:'approve',nota:'Decisión sintética'});
    const diff=await ask('GET',fh+'/diff');assert.equal(diff.status,200,JSON.stringify(diff));
    await change('POST',fh+'/aplicar',{motivo_cancelacion:'FH sintético comando',cancellation_fingerprint:diff.body.datos.cancellation_fingerprint});
    await change('PATCH','/api/eventos-integracion/'+f.events.archive+'/archivo',{motivo:'Archivo sintético comando'});
    for(const id of [f.reservations[4],f.reservations[5]]){assert.equal((await ask('GET','/api/reservaciones/'+id)).body.datos.estado,'Cancelada');assert.equal(await auditCount(id),1);}
    pass('Decisiones humanas sintéticas GYG y FareHarbor: aplicación y replay sin segunda cancelación ni bitácora');
    const owned=await change('PATCH','/api/reservaciones/'+f.reservations[8],{habitacion:'Comando privado'},other);
    const otherId=(await db.query("SELECT id_usuario FROM usuarios WHERE correo='segundo@standalone.example.test'")).rows[0].id_usuario;
    // El contrato existente solo permite configurar alcance a Consulta; no crear un Administrador selected artificial.
    await rejected(await prepare('PATCH','/api/usuarios/'+otherId,{alcance_plataformas:'selected',platform_ids:[f.platform]}),400);
    await change('PATCH','/api/usuarios/'+otherId,{id_rol:role,alcance_plataformas:'selected',platform_ids:[f.platform]});
    assert.equal((await recover(owned.c.key,other)).status,403);assert.equal((await write(owned.c)).status,403);
    assert.equal((await ask('GET','/api/reservaciones/'+f.reservations[8],undefined,other)).status,404);
    pass('Degradación a Consulta con alcance selected bloquea recuperación/replay y oculta la plataforma revocada');
    const contents=(await db.query("SELECT COALESCE(jsonb_agg(to_jsonb(c)),'[]'::jsonb)::text value FROM comandos_idempotentes c")).rows[0].value;
    for(const secret of [secret1,secret2,credentials.password,admin,other])assert.equal(contents.includes(secret),false,'COMMAND_TABLE_CONTAINS_SECRET');
    pass('Tabla y recibos no almacenan contraseñas, JWT ni cuerpos de intención; huellas son HMAC');
    for(const sql of ['DELETE FROM comandos_idempotentes','UPDATE comandos_idempotentes SET estado=estado','TRUNCATE comandos_idempotentes'])await assert.rejects(db.query(sql),e=>e.code==='42501');
    const firstRow=(await db.query('SELECT * FROM comandos_idempotentes LIMIT 1')).rows[0],M=require('../backend/models/comandos.model');
    await assert.rejects(db.query(M.INSERT_SQL,M.FIELDS.map(k=>k==='generacion_datos'?crypto.randomUUID():firstRow[k])),e=>e.code==='42501');
    await assert.rejects(db.query(M.INSERT_SQL,M.FIELDS.map(k=>firstRow[k])),e=>e.code==='23505');
    pass('Rol limitado no puede borrar, truncar o actualizar comandos; generación distinta y clave duplicada se rechazan en PostgreSQL');
    const fresh=await prepare('PATCH',path,{habitacion:'Formato'});
    const bad={...fresh,headers:{...fresh.headers,'If-Match':'bad-etag'}};await rejected(bad,400,'PRECONDICION_INVALIDA');
    const beforeInvalid=await checksum(true);
    assert.equal((await write(fresh,{'X-CTSK-Data-Generation':crypto.randomUUID()})).status,409);
    assert.equal((await write(fresh,{'X-CTSK-Protocol':'ctsk-revision-api-v1'})).status,400);
    assert.equal(await checksum(true),beforeInvalid);
    pass('ETag inválido conserva 400; generación y protocolo incompatibles fallan sin escrituras');
    report.writerCoverage=[];
    for(const spec of C.routes){
        const key=spec.method+' '+spec.mount+spec.path,entry=coverage.get(key);assert.ok(entry,'WRITER_NOT_EXECUTED '+key);
        let url=spec.mount+(spec.path==='/'?'':spec.path);
        if(url.includes(':id'))url=url.replace(':id',(await db.query(`SELECT ${spec.pk} id FROM public.${spec.table} ORDER BY ${spec.pk} LIMIT 1`)).rows[0].id);
        if(spec.resource==='daily')url+='?fecha=2098-03-03';
        const before=await checksum(true);
        const noKey=await ask(spec.method,url,{},admin,common);assert.equal(noKey.status,400,JSON.stringify(noKey));
        const noMatch=await ask(spec.method,url,{},admin,{...common,'Idempotency-Key':crypto.randomUUID()});assert.equal(noMatch.status,428,JSON.stringify(noMatch));
        assert.equal(await checksum(true),before);
        report.writerCoverage.push({...entry,missingKey:noKey.status,missingPreconditions:noMatch.status});
    }
    pass('25 de 25 rutas ejecutadas y repetidas: sin clave 400, sin precondiciones 428; no hay escritores desprotegidos');
    const restart=await change('PATCH','/api/reservaciones/'+f.reservations[7],{observaciones:'Confirmado antes de reinicio'});
    return {...restart.c,receipt:restart.r.body,reservation:f.reservations[7],auditCount:await auditCount(f.reservations[7])};
}
module.exports={run};
