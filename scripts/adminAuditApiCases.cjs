'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const P=require('../backend/config/adminAuditApiPolicy'),KEY=require('../backend/config/operationalTransactions').KEY;
const MAP={tours:['tours','id_tour',['nombre','descripcion','activo']],guias:['guias','id_guia',['nombre','estado']],operadores:['operadores','id_operador',['nombre','estado']],vehiculos:['vehiculos','id_vehiculo',['identificador','placas','color','capacidad','estado']],paises:['paises','id_pais',['nombre']],plataformas:['plataformas','id_plataforma',['nombre']]};
async function run({request,observer:db,admin,fixtures:f,credentials,report,arm,events,restart}){
    const pass=name=>{report.checks.push(name);console.log('ADMIN_API_OK '+name);};
    const one=async(sql,args)=>(await db.query(sql,args)).rows[0];
    const common={'X-CTSK-Protocol':P.PROTOCOL,'X-CTSK-Data-Generation':report.dataGeneration};
    const login=async correo=>{const r=await request('POST','/api/auth/login',{correo,password:credentials.password});assert.equal(r.status,200,JSON.stringify(r));return r.body.token;};
    const actor=await login(credentials.correo),other=await login('segundo@standalone.example.test'),consulta=await login('consulta@standalone.example.test'),selected=await login('selected@standalone.example.test'),empty=await login('empty@standalone.example.test');
    const ask=(method,url,body,token=actor,headers={})=>request(method,url,body,token,headers),recover=(key,token=actor)=>ask('GET','/api/comandos/'+key,undefined,token,common);
    async function prepare(method,url,body,token=actor){const pre=await ask('POST','/api/precondiciones',{metodo:method,ruta:url,datos:body},token,common);assert.equal(pre.status,200,JSON.stringify(pre));return {method,url,body,token,key:crypto.randomUUID(),headers:{...common,'If-Match':pre.body.etag,'If-Operational-Match':pre.body.contexto}};}
    const write=c=>ask(c.method,c.url,c.body,c.token,{...c.headers,'Idempotency-Key':c.key});
    async function checksum(ledger=false){const h=crypto.createHash('sha256');for(const table of [...require('../backend/config/desktopSchema').TABLES,...(ledger?['comandos_idempotentes']:[])])h.update((await one(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text value FROM public.${table} t`)).value);return h.digest('hex');}
    async function row(resource,id){const [table,pk]=MAP[resource];return (await one(`SELECT to_jsonb(t) value FROM ${table} t WHERE ${pk}=$1`,[id]))?.value||null;}
    const snap=(resource,value)=>value?Object.fromEntries(MAP[resource][2].map(k=>[k,value[k]])):null;
    async function trace(c){
        const until=Date.now()+1500;let ledger;while(Date.now()<until){ledger=events.find(e=>e.type==='sql-proof'&&e.phase==='ledger'&&e.key===c.key);if(ledger)break;await new Promise(r=>setTimeout(r,10));}
        assert.ok(ledger,'REAL_LEDGER_TRACE_REQUIRED');const group=events.filter(e=>e.type==='sql-proof'&&e.transaction===ledger.transaction&&e.pid===ledger.pid);
        assert.ok(group.some(e=>e.phase==='business'));assert.equal(group.filter(e=>e.phase==='audit').length,1);assert.ok(group.every(e=>e.client===ledger.client));
        return {key:c.key,client:ledger.client,pid:ledger.pid,principalTransaction:ledger.transaction,phases:group.map(e=>e.phase)};
    }
    async function audited(method,url,body,token=actor){
        const resource=url.split('/')[2],id=method==='POST'?null:Number(url.split('/')[3]),before=id===null?null:await row(resource,id),c=await prepare(method,url,body,token),r=await write(c);
        assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.ids_bitacora.length,1);
        const reference=r.body.resultado.referencias.find(x=>x.recurso===resource);assert.ok(reference);const actualId=Number(reference.id),after=await row(resource,actualId),audit=await one('SELECT * FROM bitacora WHERE id_bitacora=$1',[r.body.ids_bitacora[0]]);
        assert.equal(audit.version_auditoria,3);assert.equal(audit.origen,'HUMANO');assert.equal(audit.accion,before?'MODIFICAR':'CREAR');assert.equal(audit[MAP[resource][1]],actualId);
        for(const key of ['id_usuario_afectado','id_reservacion','id_operacion_tour','id_transporte_operacion','id_daily_observacion'])assert.equal(audit[key],null);
        assert.deepEqual(audit.valores_anteriores,snap(resource,before));assert.deepEqual(audit.valores_nuevos,snap(resource,after));assert.equal(audit.motivo,Object.hasOwn(body,'motivo')?body.motivo.trim():null);
        const command=await one('SELECT * FROM comandos_idempotentes WHERE clave=$1',[c.key]);assert.equal(command.id_usuario,audit.id_usuario);assert.equal(command.generacion_datos,audit.comando_generacion);assert.equal(command.clave,audit.comando_clave);assert.deepEqual(command.ids_bitacora,[audit.id_bitacora]);assert.equal(command.estado,'confirmado');
        const user=await one('SELECT nombre FROM usuarios WHERE id_usuario=$1',[command.id_usuario]);assert.equal(audit.usuario_nombre_snapshot,user.nombre);assert.ok(audit.instante instanceof Date);
        report.transactionProofs.push(await trace(c));report.auditRecords??=[];report.auditRecords.push({id:audit.id_bitacora,resource,resourceId:actualId,action:audit.accion,actor:audit.id_usuario,name:audit.usuario_nombre_snapshot,before:audit.valores_anteriores,after:audit.valores_nuevos,motivo:audit.motivo,key:c.key});
        return {c,r,id:actualId,audit,after};
    }
    async function replay(c,r){const before=await checksum(true),again=await write(c);assert.equal(again.status,r.status,JSON.stringify(again));assert.deepEqual(again.body,r.body);assert.equal(again.headers['idempotency-replayed'],'true');assert.equal(await checksum(true),before);}
    async function rejected(c,status,code){const before=await checksum(),r=await write(c);assert.equal(r.status,status,JSON.stringify(r));if(code)assert.equal(r.body.codigo||r.body.resultado?.codigo,code);assert.deepEqual(r.body.ids_bitacora||[],[]);assert.equal(await checksum(),before);return r;}
    async function noOp(resource,id,body){const before=await one(`SELECT xmin::text xmin,to_jsonb(t) value FROM ${resource} t WHERE ${MAP[resource][1]}=$1`,[id]),hash=await checksum(),c=await prepare('PATCH','/api/'+resource+'/'+id,body),r=await write(c);assert.equal(r.status,200,JSON.stringify(r));assert.deepEqual(r.body.ids_bitacora,[]);assert.deepEqual(await one(`SELECT xmin::text xmin,to_jsonb(t) value FROM ${resource} t WHERE ${MAP[resource][1]}=$1`,[id]),before);assert.equal(await checksum(),hash);await replay(c,r);pass('No-op '+resource+': fila y xmin intactos, recibo sin auditoria y replay sin cambios');}
    const passwordState=(await one("SELECT md5(jsonb_agg(jsonb_build_object('id',id_usuario,'hash',password) ORDER BY id_usuario)::text) hash FROM usuarios")).hash;
    for(const [method,url]of [['POST','/api/usuarios'],['PATCH','/api/usuarios/1'],['PATCH','/api/usuarios/1/password'],['POST','/api/reservaciones'],['POST','/api/operaciones'],['PATCH','/api/transportes/1'],['PUT','/api/daily/observaciones?fecha=2099-01-01'],['POST','/api/eventos-integracion/1/aplicar'],['POST','/api/bitacora'],['PATCH','/api/paises/1'],['PATCH','/api/plataformas/1'],['DELETE','/api/tours/1'],['POST','/api/tours/'],['POST','/api/tours?x=1'],['POST','/api/Tours']])assert.equal((await ask(method,url,{})).status,405,url);
    for(const url of ['/','/api/usuarios','/api/bitacora','/api/operaciones/1','/api/reservaciones','/api/dashboard/resumen','/api/plataformas?x=1'])assert.equal((await ask('GET',url)).status,404,url);
    pass('Lista cerrada: diez escritores, lecturas auxiliares exactas; Usuarios, password, operativos, integraciones, UI y Bitacora bloqueados');
    const created={};
    const inputs={tours:{nombre:'Tour <b>síntético</b> 😀',descripcion:'Ruta <script>ficticia</script>',activo:true},guias:{nombre:'Guía sintético 😀'},operadores:{nombre:'Operador sintético'},vehiculos:{identificador:'SYN-ADMIN-022',placas:null,color:null,capacidad:12},paises:{nombre:'País sintético 022'},plataformas:{nombre:'Plataforma sintética 022'}};
    const assignments=(await db.query('SELECT * FROM usuario_plataformas_visibles ORDER BY id_usuario,id_plataforma')).rows;
    for(const resource of P.CATALOGS){created[resource]=await audited('POST','/api/'+resource,inputs[resource]);await replay(created[resource].c,created[resource].r);pass('POST '+resource+': alta real, FK correcta, snapshot persistido, ID auditado real, ledger y replay unico');}
    assert.deepEqual((await db.query('SELECT * FROM usuario_plataformas_visibles ORDER BY id_usuario,id_plataforma')).rows,assignments);pass('Alta de Plataforma conserva asignaciones selected sin ampliarlas');
    const edits={tours:{nombre:'Tour ajustado <em>😀</em>',descripcion:'Descripción nueva',activo:false},guias:{nombre:'Guía ajustado',estado:false},operadores:{nombre:'Operador ajustado',estado:false},vehiculos:{identificador:'SYN-ADMIN-EDIT',placas:'LAB-022',color:'Verde',capacidad:12,estado:false}};
    for(const resource of Object.keys(edits)){
        const edit=await audited('PATCH','/api/'+resource+'/'+created[resource].id,{...edits[resource],motivo:' Ajuste humano <b>confirmado</b> 😀 '});created[resource].edit=edit;
        pass('PATCH '+resource+': varios campos y un evento; motivo separado de valores comerciales');
        await noOp(resource,edit.id,edits[resource]);await noOp(resource,edit.id,{...edits[resource],motivo:'Explicacion sin cambio comercial'});
    }
    const target='/api/tours/'+created.tours.id;
    for(const reason of [undefined,null,'',' ','\u00a0','\ufeff','x'.repeat(501),'😀'.repeat(501),42,{}]){
        const body={descripcion:'Cambio requiere motivo',...(reason===undefined?{}:{motivo:reason})};const c=await prepare('PATCH',target,body);const r=await rejected(c,400);assert.equal(r.body.comando.estado,'rechazado');await replay(c,r);
    }
    pass('Motivo efectivo obligatorio, blancos/tipos/Unicode >500 rechazados durablemente sin negocio ni auditoria');
    await audited('PATCH',target,{descripcion:'Límite Unicode correcto',motivo:'😀'.repeat(500)});pass('Motivo de 500 caracteres Unicode y HTML comercial seguro persisten como datos sin incluir body HTTP');
    for(const reason of ['',null,'x'.repeat(501)])await rejected(await prepare('POST','/api/paises',{nombre:'Alta que no debe persistir',motivo:reason}),400);
    await audited('POST','/api/paises',{nombre:'Alta con motivo opcional',motivo:'Razón humana opcional'});pass('Creacion acepta motivo omitido o humano valido; rechaza motivo proporcionado invalido');
    for(const field of ['id_usuario','usuario_nombre_snapshot','valores_nuevos','instante','password','token'])await rejected(await prepare('POST','/api/tours',{nombre:'Intento ajeno', [field]:'SYNTHETIC_FORGED'}),400);
    pass('Actor, fecha, snapshot y secretos del cliente se rechazan; solo datos comerciales validados llegan al escritor');
    // El indice existente usa lower(btrim(nombre)) bajo el locale del cluster.
    // Variar ASCII y espacios comprueba su contrato sin inventar casefold Unicode.
    for(const resource of ['paises','plataformas'])await rejected(await prepare('POST','/api/'+resource,{nombre:'  '+created[resource].after.nombre.replace(/[a-z]/g,c=>c.toUpperCase())+'  '}),409);
    pass('Pais y Plataforma conservan unicidad normalizada sin auditoria de alta fallida');
    const prior=created.tours.edit;await rejected({...prior.c,body:{...prior.c.body,motivo:'Otro motivo con la misma clave'}},409,'CLAVE_IDEMPOTENCIA_REUTILIZADA');await rejected({...prior.c,body:{...prior.c.body,nombre:'Otra intencion'}},409,'CLAVE_IDEMPOTENCIA_REUTILIZADA');
    pass('Huella incluye motivo y propuesta; UUID reutilizado para otra intencion no ejecuta escritor');
    const stale=await prepare('PATCH',target,{descripcion:'Propuesta antigua',motivo:'Foto anterior'});await audited('PATCH',target,{descripcion:'Cambio entre dos fotos',motivo:'Actualizacion confirmada'});await rejected(stale,412,'PRECONDICION_OBSOLETA');pass('ETag de recurso cambiado devuelve 412 durable y ninguna auditoria adicional');
    const context=await prepare('PATCH',target,{descripcion:'Contexto antiguo',motivo:'Foto de contexto anterior'});
    const operativeBefore=(await db.query('SELECT to_jsonb(t) value FROM operaciones_tour t ORDER BY id_operacion_tour')).rows;
    const operativeContextBefore=crypto.createHash('sha256').update(JSON.stringify(await require('../backend/security/revisionApiState').context(db))).digest('hex');
    await audited('PATCH','/api/guias/'+created.guias.id,{estado:true,motivo:'Cambio de catalogo relacionado'});
    const operativeContextAfter=crypto.createHash('sha256').update(JSON.stringify(await require('../backend/security/revisionApiState').context(db))).digest('hex');
    assert.notEqual(operativeContextBefore,operativeContextAfter);assert.deepEqual((await db.query('SELECT to_jsonb(t) value FROM operaciones_tour t ORDER BY id_operacion_tour')).rows,operativeBefore);
    await rejected(context,409,'CONTEXTO_OPERATIVO_CAMBIO');report.operationalContext={before:operativeContextBefore,after:operativeContextAfter,operationalRowsUnchanged:true};pass('Cambio de catalogo invalida contexto comun operativo sin reescribir Operaciones; 409 contextual real');
    const a=await prepare('PATCH',target,{descripcion:'Administrador A',motivo:'Edicion A'}),b=await prepare('PATCH',target,{descripcion:'Administrador B',motivo:'Edicion B'},other),count=(await one('SELECT count(*)::int n FROM bitacora')).n;
    const race=await Promise.all([write(a),write(b)]);assert.deepEqual(race.map(r=>r.status).sort(),[200,412]);assert.equal((await one('SELECT count(*)::int n FROM bitacora')).n,count+1);pass('Dos Administradores concurrentes: un cambio, una auditoria y un conflicto 412');
    const concurrent=await prepare('PATCH',target,{descripcion:'Misma intención concurrente',motivo:'Una intencion humana'}),both=await Promise.all([write(concurrent),write(concurrent)]);assert.equal(both[0].status,200);assert.deepEqual(both[0].body,both[1].body);assert.equal((await one('SELECT count(*)::int n FROM bitacora WHERE comando_clave=$1',[concurrent.key])).n,1);pass('Misma intencion concurrente genera una auditoria y un ledger');
    const lost=await prepare('PATCH',target,{descripcion:'Confirmado con respuesta perdida',motivo:'Recuperar recibo'});await arm('lost');await assert.rejects(()=>write(lost));const recovered=await recover(lost.key);assert.equal(recovered.status,200);assert.equal(recovered.body.comando.estado,'confirmado');assert.equal(recovered.body.ids_bitacora.length,1);assert.equal((await row('tours',created.tours.id)).descripcion,lost.body.descripcion);pass('Respuesta perdida despues de COMMIT recupera recibo con ID autentico sin reenvio');
    await restart();assert.deepEqual((await recover(lost.key)).body,recovered.body);await replay(lost,{status:200,body:{comando:recovered.body.comando,resultado:recovered.body.resultado,ids_bitacora:recovered.body.ids_bitacora}});pass('Reinicio real del backend conserva generacion, claves, recibos e idempotencia');
    const unknown=crypto.randomUUID(),unknownHash=await checksum(true),unknownReceipt=await recover(unknown);assert.equal(unknownReceipt.status,404);assert.equal(unknownReceipt.body.concluyente,false);assert.equal(await checksum(true),unknownHash);pass('Resultado desconocido permanece no concluyente y no dispara escritor ni reintento');
    report.rollbackProofs=[];
    for(const resource of P.CATALOGS)for(const fault of ['audit','ledger','deferred']){
        const method=['paises','plataformas'].includes(resource)?'POST':'PATCH',url='/api/'+resource+(method==='PATCH'?'/'+created[resource].id:''),body=method==='POST'?{nombre:'Fallo sintetico '+resource+' '+fault,motivo:'Ensayo de rollback'}:resource==='vehiculos'?{color:'Fallo '+fault,motivo:'Ensayo de rollback'}:{nombre:'Fallo '+fault,motivo:'Ensayo de rollback'};
        const c=await prepare(method,url,body),before=await checksum(true);await arm(fault);const r=await write(c);assert.equal(r.status,500,JSON.stringify(r));const after=await checksum(true);assert.equal(after,before);assert.equal((await recover(c.key)).body.estado,'desconocido');assert.equal((await one('SELECT count(*)::int n FROM bitacora WHERE comando_clave=$1',[c.key])).n,0);assert.equal((await one('SELECT count(*)::int n FROM comandos_idempotentes WHERE clave=$1',[c.key])).n,0);
        report.rollbackProofs.push({resource,fault,method,url,key:c.key,before,after,httpStatus:r.status});pass('Rollback '+resource+' ante fallo '+fault+': negocio/auditoria/ledger intactos');
    }
    for(const fault of ['after-audit','after-ledger']){
        const c=await prepare('PATCH',target,{descripcion:'No debe persistir '+fault,motivo:'Fallo posterior'}),before=await checksum(true);await arm(fault);assert.equal((await write(c)).status,500);assert.equal(await checksum(true),before);report.rollbackProofs.push({resource:'tours',fault,key:c.key,before,after:await checksum(true)});pass('Error '+fault+' revierte tambien las filas ya insertadas');
    }
    const vehicle=created.vehiculos.id,tour=created.tours.id,guide=created.guias.id,operator=created.operadores.id;
    const related=[];
    for(const [index,pax,kids]of [[1,5,2],[2,7,3]]){
        const operation=(await admin.query("INSERT INTO operaciones_tour(fecha,id_tour,turno,numero_grupo,hora_inicio,id_guia,estado) VALUES ($1,$2,'Mañana',1,'07:00',$3,'Programada') RETURNING id_operacion_tour",['2099-08-0'+index,tour,guide])).rows[0].id_operacion_tour;
        const transport=(await admin.query("INSERT INTO transportes_operacion(id_operacion_tour,id_vehiculo,id_operador,estado) VALUES ($1,$2,$3,'Programado') RETURNING id_transporte_operacion",[operation,vehicle,operator])).rows[0].id_transporte_operacion;
        for(const [suffix,n,children,status]of [['active',pax,kids,'Programada'],['cancelled',12,4,'Cancelada']])await admin.query("INSERT INTO reservaciones(codigo,fecha,id_tour,id_pais,id_plataforma,nombre_cliente,pax,ninos,pickup_place,pickup_time,turno,precio_total,deposito,saldo,id_transporte_operacion,estado,fecha_registro,ultima_actualizacion) VALUES ($1,$2,$3,$4,$5,'Pasajero sintetico', $6,$7,'Punto sintetico','07:00','Mañana',100,0,100,$8,$9,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",['SYN-CAP-'+index+'-'+suffix,'2099-08-0'+index,tour,f.country,f.platform,n,children,transport,status]);
        related.push({operation,transport,pax,kids});
    }
    for(const capacity of [0,13,1.5,6])await rejected(await prepare('PATCH','/api/vehiculos/'+vehicle,{capacidad:capacity,motivo:'Validar capacidad real'}),400);
    await audited('PATCH','/api/vehiculos/'+vehicle,{capacidad:7,motivo:'Siete PAX incluye tres niños; canceladas excluidas'});assert.equal((await row('vehiculos',vehicle)).capacidad,7);
    pass('Vehiculo considera todas las fechas: rechaza bajar a 6 con 7 PAX; acepta 7 incluyendo niños y excluyendo canceladas de 12');
    for(const [resource,field,value]of [['tours','activo',false],['guias','estado',false],['operadores','estado',false],['vehiculos','estado',false]]){
        if((await row(resource,created[resource].id))[field]===value)await audited('PATCH','/api/'+resource+'/'+created[resource].id,{[field]:true,motivo:'Preparar estado activo sintetico'});
        await audited('PATCH','/api/'+resource+'/'+created[resource].id,{[field]:value,motivo:'Desactivar conservando relaciones historicas'});
    }
    for(const rel of related){const tr=await one('SELECT id_operacion_tour,id_vehiculo,id_operador FROM transportes_operacion WHERE id_transporte_operacion=$1',[rel.transport]);assert.equal(tr.id_vehiculo,vehicle);assert.equal(tr.id_operador,operator);const op=await one('SELECT id_tour,id_guia FROM operaciones_tour WHERE id_operacion_tour=$1',[rel.operation]);assert.equal(op.id_tour,tour);assert.equal(op.id_guia,guide);assert.equal((await one('SELECT sum(pax)::int n FROM reservaciones WHERE id_transporte_operacion=$1 AND estado<>$2',[rel.transport,'Cancelada'])).n,rel.pax);}
    pass('Desactivacion de Tour/Guia/Operador/Vehiculo conserva operaciones, transportes y pasajeros historicos sin nuevas restricciones');
    for(const token of [consulta,selected,empty]){
        for(const resource of P.CATALOGS)assert.equal((await ask('POST','/api/'+resource,inputs[resource],token,{...common,'Idempotency-Key':crypto.randomUUID(),'If-Match':'x','If-Operational-Match':'x'})).status,403);
        for(const resource of ['tours','guias','operadores','vehiculos'])assert.equal((await ask('PATCH','/api/'+resource+'/'+created[resource].id,edits[resource],token,{...common,'Idempotency-Key':crypto.randomUUID(),'If-Match':'x','If-Operational-Match':'x'})).status,403);
        assert.equal((await recover(lost.key,token)).status,403);assert.equal((await ask('POST','/api/precondiciones',{metodo:'POST',ruta:'/api/tours',datos:inputs.tours},token,common)).status,403);
    }
    for(const resource of P.CATALOGS)assert.equal((await ask('GET','/api/'+resource,undefined,consulta)).status,200);
    for(const token of [selected,empty]){
        for(const resource of ['tours','paises','plataformas'])assert.equal((await ask('GET','/api/'+resource,undefined,token)).status,200);
        for(const resource of ['guias','operadores','vehiculos'])assert.equal((await ask('GET','/api/'+resource,undefined,token)).status,403);
        assert.equal((await ask('GET',target,undefined,token)).status,403);
    }
    assert.deepEqual((await ask('GET','/api/plataformas',undefined,selected)).body.datos.map(r=>r.id_plataforma),[f.platform]);assert.deepEqual((await ask('GET','/api/plataformas',undefined,empty)).body.datos,[]);pass('Consulta all/selected/vacia conserva lecturas auxiliares y plataformas filtradas; ninguna escritura, precondicion ni recibo');
    assert.equal((await recover(lost.key,other)).status,404);pass('Segundo Administrador no obtiene recibos ajenos');
    const otherId=(await one("SELECT id_usuario FROM usuarios WHERE correo='segundo@standalone.example.test'")).id_usuario;
    for(const change of ['inactive','consulta']){
        const c=await prepare('PATCH',target,{descripcion:'Solicitud en espera',motivo:'Ensayo de revocacion'},other);let late;
        await admin.query('BEGIN');await admin.query('SELECT pg_advisory_xact_lock($1::int,$2::int)',KEY);
        try{
            late=write(c);let waiting=0;const until=Date.now()+1500;while(Date.now()<until){waiting=(await one("SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND NOT granted AND classid=$1::oid AND objid=$2::oid",KEY)).n;if(waiting)break;await new Promise(r=>setTimeout(r,10));}assert.ok(waiting,'ADVISORY_WAIT_REQUIRED');
            if(change==='inactive')await admin.query('UPDATE usuarios SET estado=false WHERE id_usuario=$1',[otherId]);else await admin.query("UPDATE usuarios SET id_rol=(SELECT id_rol FROM roles WHERE nombre='Consulta') WHERE id_usuario=$1",[otherId]);await admin.query('COMMIT');
        }catch(e){await admin.query('ROLLBACK');await late?.catch(()=>{});throw e;}
        const hash=await checksum(true),r=await late;assert.equal(r.status,403,JSON.stringify(r));assert.equal(await checksum(true),hash);assert.equal((await one('SELECT count(*)::int n FROM comandos_idempotentes WHERE clave=$1',[c.key])).n,0);assert.equal((await recover(lost.key,other)).status,403);
        await admin.query("UPDATE usuarios SET estado=true,id_rol=(SELECT id_rol FROM roles WHERE nombre='Administrador') WHERE id_usuario=$1",[otherId]);pass('Revocacion '+change+' tras esperar candado: 403 sin negocio, auditoria o ledger');
    }
    const actorId=created.tours.audit.id_usuario,oldName=created.tours.audit.usuario_nombre_snapshot;await admin.query('UPDATE usuarios SET nombre=$1 WHERE id_usuario=$2',['Actor renombrado sintetico 022',actorId]);assert.equal((await one('SELECT usuario_nombre_snapshot FROM bitacora WHERE id_bitacora=$1',[created.tours.audit.id_bitacora])).usuario_nombre_snapshot,oldName);
    const renamed=await audited('POST','/api/paises',{nombre:'Nombre historico del actor'});assert.equal(renamed.audit.usuario_nombre_snapshot,'Actor renombrado sintetico 022');pass('Nombre historico permanece; nuevas auditorias leen nombre actual autenticado dentro de la transaccion');
    for(const protocol of ['ctsk-command-api-v1','ctsk-audit-api-v1']){const c=await prepare('PATCH',target,{descripcion:'Protocolo ajeno',motivo:'Cliente incompatible'});c.headers['X-CTSK-Protocol']=protocol;await rejected(c,400);}
    pass('Protocolos 020 y 021 rechazados expresamente por el perfil administrativo');
    for(const name of ['standalonePolicy','revisionLabPolicy','revisionApiPolicy','commandApiPolicy','auditApiPolicy','auditSchemaPolicy','adminAuditSchemaPolicy'])assert.throws(()=>require('../backend/config/'+name).validateManifest(JSON.parse(require('fs').readFileSync(require('path').join(report.directory,'admin-api-manifest.json'))),require('path').resolve(__dirname,'..')));
    pass('Perfiles anteriores y el perfil solo esquema 022 rechazan manifiesto administrativo HTTP');
    assert.equal((await one("SELECT md5(jsonb_agg(jsonb_build_object('id',id_usuario,'hash',password) ORDER BY id_usuario)::text) hash FROM usuarios")).hash,passwordState);pass('Credenciales sinteticas intactas: ninguna escritura de password ni bootstrap');
    report.committedTransactionProofs=[];
    for(const entry of (await db.query('SELECT c.clave,c.ids_bitacora,c.recurso FROM comandos_idempotentes c JOIN bitacora b ON b.id_bitacora=c.ids_bitacora[1] WHERE b.version_auditoria=3')).rows){
        const proof=await trace({key:entry.clave}),controls=events.filter(e=>e.type==='savepoint-proof'&&e.transaction===proof.principalTransaction&&e.pid===proof.pid);assert.ok(controls.some(e=>e.control.startsWith('SAVEPOINT ctsk_api_nested_')));assert.ok(controls.some(e=>e.control==='RELEASE SAVEPOINT ctsk_command_work'));assert.ok(controls.every(e=>e.client===proof.client));report.committedTransactionProofs.push({...proof,resource:entry.recurso,auditId:entry.ids_bitacora[0],savepoints:controls.map(e=>e.control)});
    }
    pass('Todas las auditorias HTTP confirmadas acreditan cliente, PID, transaccion principal y savepoints comunes');
    report.writerCoverage=P.CATALOGS.flatMap(resource=>['POST',...(['paises','plataformas'].includes(resource)?[]:['PATCH'])].map(method=>({method,resource})));assert.equal(report.writerCoverage.length,10);
    report.finalCounts=await one("SELECT (SELECT count(*)::int FROM bitacora WHERE version_auditoria IS NULL) historicos,(SELECT count(*)::int FROM bitacora WHERE version_auditoria=2) operativas,(SELECT count(*)::int FROM bitacora WHERE version_auditoria=3) administrativas,(SELECT count(*)::int FROM comandos_idempotentes WHERE estado='confirmado') confirmados,(SELECT count(*)::int FROM comandos_idempotentes WHERE estado='rechazado') rechazados");
}
module.exports={run};
