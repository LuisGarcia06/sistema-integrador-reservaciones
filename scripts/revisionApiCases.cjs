const assert=require('node:assert/strict');
async function run({request,discard,observer:db,fixtures:f,credentials,report}){
    const P=require('../backend/config/revisionApiPolicy').PROTOCOL;
    const pass=name=>{report.checks.push(name);console.log('API_OK '+name);};
    const login=async correo=>{const r=await request('POST','/api/auth/login',{correo,password:credentials.password});assert.equal(r.status,200,JSON.stringify(r));return r.body.token;};
    const admin=await login(credentials.correo),other=await login('segundo@standalone.example.test'),consulta=await login('consulta@standalone.example.test');
    const ask=(method,url,body,token=admin,headers={})=>request(method,url,body,token,headers);
    async function preview(url,body,token=admin,method='PATCH'){
        const r=await ask('POST','/api/precondiciones',{metodo:method,ruta:url,datos:body},token,{'X-CTSK-Protocol':P});assert.equal(r.status,200,JSON.stringify(r));return r.body;
    }
    const write=(url,body,pre,token=admin,method='PATCH',extra={})=>ask(method,url,body,token,{'X-CTSK-Protocol':P,'If-Match':pre.etag,'If-Operational-Match':pre.contexto,...extra});
    const change=async(url,body,token=admin,method='PATCH')=>{const pre=await preview(url,body,token,method);return write(url,body,pre,token,method);};
    async function checksum(){
        const hash=require('node:crypto').createHash('sha256');
        for(const table of require('../backend/config/desktopSchema').TABLES)hash.update((await db.query(`SELECT COALESCE(jsonb_agg(v ORDER BY v::text),'[]'::jsonb)::text value FROM (SELECT to_jsonb(t) v FROM public.${table} t) s`)).rows[0].value);
        return hash.digest('hex');
    }
    async function reject(work,status,code){const before=await checksum(),r=await work();assert.equal(r.status,status,JSON.stringify(r));if(code)assert.equal(r.body.codigo,code);assert.equal(await checksum(),before,'REJECTED_COMMAND_CHANGED_DATABASE');return r;}
    const path='/api/reservaciones/'+f.records[0].reservaciones;
    const ra=await preview(path,{habitacion:'A'}),rb=await preview(path,{habitacion:'B'},other);
    assert.equal((await write(path,{habitacion:'A'},ra)).status,200);
    await reject(()=>write(path,{habitacion:'B'},rb,other),412,'PRECONDICION_OBSOLETA');pass('two administrators: same field first commits, second 412; no data/revision/audit change');
    const originalForm=await preview(path,{});assert.equal((await write(path,{habitacion:'Edición sobre foto original'},originalForm)).status,200);
    pass('existing-record baseline allows editing values without refreshing original record/context preconditions');
    const a=await preview(path,{habitacion:'Diferente'}),b=await preview(path,{observaciones:'Otra sesión'},other);
    assert.equal((await write(path,{habitacion:'Diferente'},a)).status,200);
    await reject(()=>write(path,{observaciones:'Otra sesión'},b,other),412);pass('different fields from same revision conservatively conflict');
    await reject(()=>ask('PATCH',path,{habitacion:'X'}),428,'PRECONDICION_REQUERIDA');
    const valid=await preview(path,{habitacion:'X'});
    for(const invalid of ['*','W/'+valid.etag,valid.etag+','+valid.etag,'"unknown"',valid.etag.slice(0,-5)+'0000"'])await reject(()=>write(path,{habitacion:'X'},{...valid,etag:invalid}),400,'PRECONDICION_INVALIDA');
    await reject(()=>write(path,{habitacion:'X'},valid,admin,'PATCH',{'If-Operational-Match':undefined}),428);
    pass('428 missing record/context; 400 weak, wildcard, list, malformed and forged ETags');
    const noOp=await preview(path,{habitacion:'Diferente'}),beforeNoop=await checksum();assert.equal((await write(path,{habitacion:'Diferente'},noOp)).status,200);assert.equal(await checksum(),beforeNoop);
    assert.equal((await change(path,{habitacion:'Nuevo'})).status,200);
    await reject(()=>write(path,{habitacion:'Diferente'},noOp),412);pass('current no-op keeps revision/audit; stale no-op rejected');
    const aba=await preview(path,{habitacion:'Nuevo'});assert.equal((await change(path,{habitacion:'Intermedio'})).status,200);assert.equal((await change(path,{habitacion:'Nuevo'})).status,200);
    await reject(()=>write(path,{habitacion:'Nuevo'},aba),412);pass('A to B to A does not revive an old ETag');
    const cancelPath=path+'/cancelar',cancel=await preview(cancelPath,{motivo_cancelacion:'Prueba sintética'});
    assert.equal((await change(path,{telefono_cliente:'0000000000'})).status,200);
    await reject(()=>write(cancelPath,{motivo_cancelacion:'Prueba sintética'},cancel),412);pass('stale cancellation rejected');
    const assign='/api/reservaciones/'+f.reservations[0]+'/transporte',da={id_transporte_operacion:f.records[0].transportes_operacion},dbody={id_transporte_operacion:f.records[1].transportes_operacion};
    const pa=await preview(assign,da),pb=await preview(assign,dbody,other);
    const simultaneous=await Promise.all([write(assign,da,pa),write(assign,dbody,pb,other)]);assert.deepEqual(simultaneous.map(x=>x.status).sort(),[200,412]);pass('simultaneous transport assignments serialize; exactly one accepted');
    const context=await preview('/api/reservaciones/'+f.reservations[1],{pax:3});
    assert.equal((await change('/api/vehiculos/'+f.vehicles[0],{capacidad:11})).status,200);
    await reject(()=>write('/api/reservaciones/'+f.reservations[1],{pax:3},context),409,'CONTEXTO_OPERATIVO_CAMBIO');pass('vehicle/capacity context changes detected even when target reservation is unchanged');
    const empty='/api/operaciones/'+f.records[1].operaciones_tour,emptyPre=await preview(empty,{hora_inicio:'08:00'});
    assert.equal((await change('/api/reservaciones/'+f.reservations[2]+'/transporte',{id_transporte_operacion:f.records[1].transportes_operacion})).status,200);
    await reject(()=>write(empty,{hora_inicio:'08:00'},emptyPre),409);pass('empty-group membership change invalidates operational context');
    const high='/api/reservaciones/'+f.records[1].reservaciones,highPre=await preview(high,{observaciones:'BIGINT sintético'});
    assert.equal(highPre.revision,'9007199254740993');assert.equal((await write(high,{observaciones:'BIGINT sintético'},highPre)).status,200);
    assert.equal((await ask('GET',high)).body.revision,'9007199254740994');pass('BIGINT greater than 2^53 stays exact decimal string through HTTP');
    const failBody={habitacion:'SYN-FAIL-AUDIT'},fail=await preview(path,failBody);
    await reject(()=>write(path,failBody,fail),500);pass('HTTP audit failure rolls back data, revision and audit; no successful reply before commit');
    await reject(()=>write(path,{habitacion:'X'},valid,admin,'PATCH',{'X-CTSK-Protocol':'old-client'}),412);
    const fresh=await preview(path,{habitacion:'X'});await reject(()=>write(path,{habitacion:'X'},fresh,admin,'PATCH',{'X-CTSK-Protocol':'old-client'}),400,'CLIENTE_INCOMPATIBLE');
    await reject(()=>ask('PATCH',path,{habitacion:'X'},consulta,{'If-Match':fresh.etag,'If-Operational-Match':fresh.contexto,'X-CTSK-Protocol':P}),403);
    assert.equal((await ask('GET','/api/reservaciones/'+f.reservations[8],undefined,consulta)).status,404);
    assert.equal((await ask('GET',path,undefined,consulta)).status,200);pass('incompatible clients rejected; Consulta cannot write and selected platform scope preserved');
    for(const url of ['/api/webhooks/fareharbor','/api/integraciones/getyourguide','/api/whatsapp'])assert.equal((await ask('POST',url,{})).status,503);
    await reject(()=>ask('DELETE',path,{}),405);pass('receivers/integration controls blocked; unknown writers fail closed');
    const gpath='/api/eventos-integracion/'+f.events.getyourguide+'/aplicar',gbody={completar:{motivo_cancelacion:'Cancelación sintética aprobada'}},gp=await preview(gpath,gbody,admin,'POST');
    assert.equal((await change('/api/reservaciones/'+f.reservations[4],{habitacion:'Edición local sintética'})).status,200);
    await reject(()=>write(gpath,gbody,gp,admin,'POST'),409,'CONTEXTO_OPERATIVO_CAMBIO');
    const gr=await change(gpath,gbody,admin,'POST');assert.equal(gr.status,200,JSON.stringify(gr));
    pass('GYG manual decision binds reviewed reservation/event state; fresh approved synthetic event applies');
    const fh='/api/eventos-integracion/'+f.events.fareharbor;
    const review=await preview(fh+'/revision',{accion:'approve',nota:'Aprobación sintética'}),staleApply=await preview(fh+'/aplicar',{motivo_cancelacion:'Sintético',cancellation_fingerprint:'0'.repeat(64)},admin,'POST');
    assert.equal((await write(fh+'/revision',{accion:'approve',nota:'Aprobación sintética'},review)).status,200);
    await reject(()=>write(fh+'/aplicar',{motivo_cancelacion:'Sintético',cancellation_fingerprint:'0'.repeat(64)},staleApply,admin,'POST'),412);
    const diff=await ask('GET',fh+'/diff');assert.equal(diff.status,200,JSON.stringify(diff));
    const fhBody={motivo_cancelacion:'Cancelación sintética aprobada',cancellation_fingerprint:diff.body.datos.cancellation_fingerprint};
    const oldFh=await preview(fh+'/aplicar',fhBody,admin,'POST');
    assert.equal((await change('/api/reservaciones/'+f.reservations[5],{habitacion:'Cambio FH sintético'})).status,200);
    await reject(()=>write(fh+'/aplicar',fhBody,oldFh,admin,'POST'),409);
    const newDiff=await ask('GET',fh+'/diff');const newFhBody={...fhBody,cancellation_fingerprint:newDiff.body.datos.cancellation_fingerprint};
    const fhResult=await change(fh+'/aplicar',newFhBody,admin,'POST');assert.equal(fhResult.status,200,JSON.stringify(fhResult));
    pass('FareHarbor manual approval, event state and fingerprint preserved under preconditions');
    // Creaciones y otros escritores también necesitan un ancla específica de comando.
    const createBody={fecha:'2098-02-02',id_tour:f.tour,turno:'Mañana',numero_grupo:1,hora_inicio:'07:00',id_guia:null,estado:'Preparada'};
    const cp=await preview('/api/operaciones',createBody,admin,'POST'),createdOperation=await write('/api/operaciones',createBody,cp,admin,'POST');assert.equal(createdOperation.status,200);
    await reject(()=>write('/api/operaciones',createBody,cp,admin,'POST'),409);pass('creation uses command-specific preconditions; repeated submission is not silently repeated');
    const getters=await ask('GET',path),same=await ask('GET',path);assert.equal(getters.headers.etag,same.headers.etag);assert.equal((await ask('GET','/api/reservaciones')).headers.etag,undefined);
    pass('stable strong resource ETags; collection responses cannot substitute an entity precondition');
    const tr='/api/transportes/'+f.records[0].transportes_operacion,ta=await preview(tr,{observaciones_operador:'A'}),tb=await preview(tr,{observaciones_operador:'B'},other);
    assert.equal((await write(tr,{observaciones_operador:'A'},ta)).status,200);await reject(()=>write(tr,{observaciones_operador:'B'},tb,other),412);
    const oa=await preview(empty,{hora_inicio:'09:00'}),ob=await preview(empty,{hora_inicio:'10:00'},other);assert.equal((await write(empty,{hora_inicio:'09:00'},oa)).status,200);await reject(()=>write(empty,{hora_inicio:'10:00'},ob,other),412);pass('transport and operation record conflicts return 412');
    // Barrera controlada: el cliente debe esperar ANTES de consultar dependencias.
    const barrierPath='/api/reservaciones/'+f.reservations[6],barrierBody={observaciones:'Barrera sintética'},barrierPre=await preview(barrierPath,barrierBody),KEY=require('../backend/config/operationalTransactions').KEY;
    let pending;
    await db.query('BEGIN');
    try{
        await db.query('SELECT pg_advisory_xact_lock($1::int,$2::int)',KEY);
        await db.query('UPDATE vehiculos SET color=$1 WHERE id_vehiculo=$2',['Cambio bajo candado',f.vehicles[0]]);
        pending=write(barrierPath,barrierBody,barrierPre);
        const until=Date.now()+1500;let waiting=false;
        while(Date.now()<until){if((await db.query("SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND NOT granted AND classid=$1::oid AND objid=$2::oid",KEY)).rows[0].n>0){waiting=true;break;}await new Promise(r=>setTimeout(r,10));}
        assert.equal(waiting,true,'HTTP_COMMAND_DID_NOT_WAIT_FOR_OPERATIONAL_LOCK');
        await db.query('COMMIT');
    }catch(e){await db.query('ROLLBACK');await pending?.catch(()=>{});throw e;}
    const heldState=await checksum(),blocked=await pending;assert.equal(blocked.status,409,JSON.stringify(blocked));assert.equal(blocked.body.codigo,'CONTEXTO_OPERATIVO_CAMBIO');assert.equal(await checksum(),heldState);
    pass('controlled PostgreSQL barrier proves context verification occurs after common transaction lock');
    const lostBody={observaciones:'Respuesta descartada sintética'},lostPre=await preview(barrierPath,lostBody);
    assert.equal((await discard('PATCH',barrierPath,lostBody,admin,{'X-CTSK-Protocol':P,'If-Match':lostPre.etag,'If-Operational-Match':lostPre.contexto})).responseDiscarded,true);
    const recovered=await ask('GET',barrierPath);assert.equal(recovered.body.datos.observaciones,lostBody.observaciones);
    assert.equal((await db.query("SELECT count(*)::int n FROM bitacora WHERE id_reservacion=$1",[f.reservations[6]])).rows[0].n,1);
    pass('response discarded after COMMIT reconciled by GET and one audit entry; no automatic resend');
    async function created(resource,body){const r=await change('/api/'+resource,body,admin,'POST');assert.equal(r.status,200,JSON.stringify(r));return r.body.datos;}
    const guide=await created('guias',{nombre:'Guía HTTP sintético',estado:true});assert.equal((await change('/api/guias/'+guide.id_guia,{nombre:'Guía HTTP revisado'})).status,200);
    const operator=await created('operadores',{nombre:'Operador HTTP sintético',estado:true});assert.equal((await change('/api/operadores/'+operator.id_operador,{nombre:'Operador HTTP revisado'})).status,200);
    const tour=await created('tours',{nombre:'Tour HTTP sintético',descripcion:'Solo laboratorio',activo:true});assert.equal((await change('/api/tours/'+tour.id_tour,{descripcion:'Revisado'})).status,200);
    await created('paises',{nombre:'País HTTP sintético'});await created('plataformas',{nombre:'Plataforma HTTP sintética'});
    const vehicle=await created('vehiculos',{identificador:'SYN-HTTP-VEHICLE',placas:null,color:null,capacidad:12,estado:true});assert.equal((await change('/api/vehiculos/'+vehicle.id_vehiculo,{color:'Sintético'})).status,200);
    const role=(await db.query("SELECT id_rol FROM roles WHERE nombre='Consulta'")).rows[0].id_rol;
    const user=await created('usuarios',{nombre:'Usuario HTTP sintético',correo:'http@standalone.example.test',password:'Synthetic-HTTP-Only-12345',id_rol:role,estado:true,alcance_plataformas:'selected',platform_ids:[f.platform]});
    assert.equal((await change('/api/usuarios/'+user.id_usuario,{nombre:'Usuario HTTP revisado'})).status,200);assert.equal((await change('/api/usuarios/'+user.id_usuario+'/password',{password:'Synthetic-HTTP-Changed-12345'})).status,200);
    assert.equal((await change('/api/daily/observaciones?fecha=2098-02-02',{observaciones:'Daily sintético'},admin,'PUT')).status,200);
    const newOp=createdOperation.body.datos.id_operacion_tour;
    const transport=await created('transportes',{id_operacion_tour:newOp,id_vehiculo:null,id_operador:null,observaciones_operador:null,estado:'Preparado'});
    const reservation=await created('reservaciones',{fecha:'2098-02-02',id_tour:f.tour,id_pais:f.country,id_plataforma:f.platform,nombre_cliente:'Alta HTTP sintética',pax:2,ninos:0,pickup_place:'Punto sintético',pickup_time:'07:00',turno:'Mañana',precio_total:1000,deposito:200,saldo:800,estado:'Pendiente'});
    assert.equal((await change('/api/reservaciones/'+reservation.id_reservacion+'/transporte',{id_transporte_operacion:transport.id_transporte_operacion})).status,200);
    assert.equal((await change('/api/transportes/'+transport.id_transporte_operacion,{id_vehiculo:vehicle.id_vehiculo})).status,200);
    const minPath='/api/reservaciones/'+reservation.id_reservacion+'/cancelar',minBody={motivo_cancelacion:'Mínimo sintético'},minPre=await preview(minPath,minBody);await reject(()=>write(minPath,minBody,minPre),400);
    const limitPath='/api/reservaciones/'+f.reservations[0],limitBody={pax:13},limitPre=await preview(limitPath,limitBody);await reject(()=>write(limitPath,limitBody,limitPre),400);
    const freshCancel='/api/reservaciones/'+f.reservations[3]+'/cancelar';assert.equal((await change(freshCancel,{motivo_cancelacion:'Cancelación HTTP sintética'})).status,200);
    assert.equal((await change('/api/eventos-integracion/'+f.events.archive+'/archivo',{motivo:'Archivo sintético de prueba'})).status,200);
    pass('complementary writers execute with preconditions: catalogs, users/password, Daily, creations, archive and fresh cancellation');
    pass('business limits preserved: 12 PAX and vehicle minimum reject without changes');
    const noOpState=await checksum();assert.equal((await change(empty,{hora_inicio:'09:00'})).status,200);assert.equal((await change(tr,{observaciones_operador:'A'})).status,200);assert.equal(await checksum(),noOpState);
    pass('operation and transport no-ops with current preconditions preserve revisions and every table');
    const contextAbaPath='/api/reservaciones/'+f.reservations[7],contextAbaBody={observaciones:'Contexto ABA'},contextAbaPre=await preview(contextAbaPath,contextAbaBody);
    assert.equal((await change('/api/vehiculos/'+f.vehicles[0],{color:'Color intermedio'})).status,200);assert.equal((await change('/api/vehiculos/'+f.vehicles[0],{color:'Cambio bajo candado'})).status,200);
    await reject(()=>write(contextAbaPath,contextAbaBody,contextAbaPre),409);pass('dependency A to B to A remains stale using private MVCC state in disposable generation');
    report.writerCoverage=[];
    for(const spec of require('../backend/security/revisionApiContract').routes){
        let url=spec.mount+(spec.path==='/'?'':spec.path);
        if(url.includes(':id')){const id=(await db.query(`SELECT ${spec.pk} id FROM public.${spec.table} ORDER BY ${spec.pk} LIMIT 1`)).rows[0].id;url=url.replace(':id',id);}
        if(spec.resource==='daily')url+='?fecha=2098-02-02';
        await reject(()=>ask(spec.method,url,{}),428,'PRECONDICION_REQUERIDA');report.writerCoverage.push({method:spec.method,path:spec.mount+spec.path,withoutPrecondition:428});
    }
    pass('all 25 mounted mutation routes reject missing If-Match with 428 and leave every table unchanged');
    report.httpWritesRetriedAutomatically=false;
}
module.exports={run};
