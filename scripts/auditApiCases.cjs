'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const P=require('../backend/config/auditApiPolicy'),KEY=require('../backend/config/operationalTransactions').KEY;
async function run({request,observer:db,admin:provision,fixtures:f,credentials,report,arm,events,restart}){
    const pass=name=>{report.checks.push(name);console.log('AUDIT_API_OK '+name);};
    const common={'X-CTSK-Protocol':P.PROTOCOL,'X-CTSK-Data-Generation':report.dataGeneration};
    const login=async correo=>{const r=await request('POST','/api/auth/login',{correo,password:credentials.password});assert.equal(r.status,200,JSON.stringify(r));return r.body.token;};
    const actor=await login(credentials.correo),other=await login('segundo@standalone.example.test'),consulta=await login('consulta@standalone.example.test'),selected=await login('selected@standalone.example.test');
    const ask=(method,url,body,token=actor,headers={})=>request(method,url,body,token,headers);
    const recover=(key,token=actor)=>ask('GET','/api/comandos/'+key,undefined,token,common);
    async function prepare(method,url,body,token=actor){const pre=await ask('POST','/api/precondiciones',{metodo:method,ruta:url,datos:body},token,common);assert.equal(pre.status,200,JSON.stringify(pre));const key=crypto.randomUUID();return {method,url,body,token,key,headers:{...common,'Idempotency-Key':key,'If-Match':pre.body.etag,'If-Operational-Match':pre.body.contexto}};}
    const write=c=>ask(c.method,c.url,c.body,c.token,c.headers);
    async function checksum(ledger=false){const h=crypto.createHash('sha256');for(const table of [...require('../backend/config/desktopSchema').TABLES,...(ledger?['comandos_idempotentes']:[])])h.update((await db.query(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text value FROM public.${table} t`)).rows[0].value);return h.digest('hex');}
    async function row(resource,id){const [table,pk]=resource==='operaciones'?['operaciones_tour','id_operacion_tour']:resource==='transportes'?['transportes_operacion','id_transporte_operacion']:['daily_observaciones','fecha'];return (await db.query(`SELECT to_jsonb(t) value FROM ${table} t WHERE ${pk}=$1`,[id])).rows[0]?.value||null;}
    const fields={operaciones:['fecha','id_tour','turno','numero_grupo','hora_inicio','id_guia','estado'],transportes:['id_operacion_tour','id_vehiculo','id_operador','observaciones_operador','estado'],daily:['fecha','observaciones']};
    const snap=(resource,value)=>value?Object.fromEntries(fields[resource].map(k=>[k,value[k]])):null;
    async function proof(c){
        const until=Date.now()+1200;let ledger;while(Date.now()<until){ledger=events.find(e=>e.type==='sql-proof'&&e.phase==='ledger'&&e.key===c.key);if(ledger)break;await new Promise(r=>setTimeout(r,10));}
        assert.ok(ledger,'REAL_LEDGER_TRACE_REQUIRED');const group=events.filter(e=>e.type==='sql-proof'&&e.transaction===ledger.transaction&&e.pid===ledger.pid);
        assert.ok(group.some(e=>e.phase==='business'));assert.ok(group.some(e=>e.phase==='audit'));
        assert.ok(group.every(e=>e.client===ledger.client&&e.pid===ledger.pid&&e.transaction===ledger.transaction));
        report.transactionProofs.push({key:c.key,client:ledger.client,pid:ledger.pid,transaction:ledger.transaction,phases:group.map(e=>e.phase)});
    }
    async function audited(method,url,body,token=actor){
        const resource=url.split('/')[2],id=resource==='daily'?url.slice(-10):method==='POST'?null:Number(url.split('/')[3]);
        const before=id===null?null:await row(resource,id),c=await prepare(method,url,body,token),r=await write(c);
        assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.ids_bitacora.length,1);
        const reference=r.body.resultado.referencias.find(x=>x.recurso===resource);assert.ok(reference);
        const actualId=resource==='daily'?reference.id:Number(reference.id),after=await row(resource,actualId);
        const audit=(await db.query('SELECT * FROM bitacora WHERE id_bitacora=$1',[r.body.ids_bitacora[0]])).rows[0];
        assert.equal(audit.version_auditoria,2);assert.equal(audit.origen,'HUMANO');assert.equal(audit.accion,before?'MODIFICAR':'CREAR');
        assert.deepEqual(audit.valores_anteriores,snap(resource,before));assert.deepEqual(audit.valores_nuevos,snap(resource,after));assert.equal(audit.motivo,Object.hasOwn(body,'motivo')?body.motivo.trim():null);
        const command=(await db.query('SELECT * FROM comandos_idempotentes WHERE clave=$1',[c.key])).rows[0];
        assert.equal(command.id_usuario,audit.id_usuario);assert.equal(command.generacion_datos,audit.comando_generacion);assert.equal(command.clave,audit.comando_clave);assert.deepEqual(command.ids_bitacora,[audit.id_bitacora]);assert.equal(command.estado,'confirmado');
        const user=(await db.query('SELECT nombre FROM usuarios WHERE id_usuario=$1',[command.id_usuario])).rows[0];assert.equal(audit.usuario_nombre_snapshot,user.nombre);assert.ok(audit.instante instanceof Date);
        await proof(c);report.auditRecords??=[];report.auditRecords.push({id:audit.id_bitacora,resource,resourceId:actualId,action:audit.accion,actor:audit.id_usuario,name:audit.usuario_nombre_snapshot,before:audit.valores_anteriores,after:audit.valores_nuevos,motivo:audit.motivo,key:c.key});
        return {c,r,id:actualId,audit};
    }
    async function replay(c,r){const before=await checksum(true),again=await write(c);assert.equal(again.status,r.status,JSON.stringify(again));assert.deepEqual(again.body,r.body);assert.equal(again.headers['idempotency-replayed'],'true');assert.equal(await checksum(true),before);}
    async function rejected(c,status,code){const before=await checksum(),r=await write(c);assert.equal(r.status,status,JSON.stringify(r));if(code)assert.equal(r.body.codigo||r.body.resultado?.codigo,code);assert.deepEqual(r.body.ids_bitacora||[],[]);assert.equal(await checksum(),before);return r;}
    async function noOp(method,url,body){const resource=url.split('/')[2],id=resource==='daily'?url.slice(-10):Number(url.split('/')[3]),before=await row(resource,id),hash=await checksum();const c=await prepare(method,url,body),r=await write(c);assert.equal(r.status,200,JSON.stringify(r));assert.deepEqual(r.body.ids_bitacora,[]);assert.deepEqual(await row(resource,id),before);assert.equal(await checksum(),hash);await replay(c,r);return {c,r};}
    const newOp=(fecha,grupo=1)=>({fecha,id_tour:f.tour,turno:'Mañana',numero_grupo:grupo,hora_inicio:'07:00'});
    for(const [method,url]of [['POST','/api/reservaciones'],['PATCH','/api/usuarios/1'],['POST','/api/tours'],['POST','/api/eventos-integracion/1/aplicar'],['POST','/api/bitacora'],['GET','/api/bitacora']]){const r=await ask(method,url,method==='GET'?undefined:{});assert.equal(r.status,method==='GET'?404:405);}
    pass('Solo cinco escritores: Reservaciones, Usuarios, Catalogos, Integraciones y escritura/visualizacion Bitacora bloqueados');
    const op=await audited('POST','/api/operaciones',newOp('2099-04-01'));await replay(op.c,op.r);
    pass('POST Operaciones real: un alta, auditoria autentica, comando y replay sin duplicacion; mismo camino de preparar sugerencia');
    const guide=(await db.query('SELECT id_guia FROM guias ORDER BY id_guia LIMIT 1')).rows[0].id_guia;
    const edit=await audited('PATCH','/api/operaciones/'+op.id,{fecha:'2099-04-02',id_tour:f.auditTour,turno:'Tarde',numero_grupo:2,hora_inicio:'08:00',id_guia:guide,estado:'Preparada',motivo:' Ajuste humano de planificacion '});
    pass('PATCH Operaciones multicolumna: una auditoria con antes/despues persistidos y motivo separado');
    await noOp('PATCH','/api/operaciones/'+op.id,{hora_inicio:'08:00'});await noOp('PATCH','/api/operaciones/'+op.id,{motivo:'Solo una explicacion sin cambio'});
    pass('Operaciones identicas y motivo solo no escriben ni incrementan revision');
    for(const reason of [undefined,null,'','  ','\u00a0','\ufeff','x'.repeat(501),{},[],false,42]){
        const body={hora_inicio:'09:00',...(reason===undefined?{}:{motivo:reason})};await rejected(await prepare('PATCH','/api/operaciones/'+op.id,body),400);
    }
    pass('Motivos ausentes, NULL, blancos Unicode, largos y tipos incorrectos rechazados sin efectos');
    const unicode=await audited('PATCH','/api/operaciones/'+op.id,{hora_inicio:'08:15',motivo:'😀'.repeat(500)});await replay(unicode.c,unicode.r);
    pass('Motivo de 500 caracteres Unicode aceptado y preservado');
    const beforeMisuse=await checksum(true),misuse=await write({...unicode.c,body:{...unicode.c.body,motivo:'Otra intencion'}});assert.equal(misuse.status,409);assert.equal(misuse.body.codigo,'CLAVE_IDEMPOTENCIA_REUTILIZADA');assert.equal(await checksum(true),beforeMisuse);
    pass('Misma clave con motivo alterado produce conflicto sin modificar recibo ni auditoria');
    for(const extra of [{id_usuario:999},{instante:'2000-01-01'},{valores_anteriores:{}},{valores_nuevos:{}},{usuario_nombre_snapshot:'Inventado'},{comando_clave:crypto.randomUUID()},{origen:'SISTEMA'}])await rejected(await prepare('PATCH','/api/operaciones/'+op.id,{hora_inicio:'09:00',motivo:'Prueba',...extra}),400);
    pass('Actor, instante, snapshots, nombre, origen y referencia de comando inventados por cliente rechazados');
    const otherEdit=await audited('PATCH','/api/operaciones/'+op.id,{hora_inicio:'08:30',motivo:'Segundo administrador'},other);assert.notEqual(otherEdit.audit.id_usuario,edit.audit.id_usuario);
    const storedName=otherEdit.audit.usuario_nombre_snapshot;
    await provision.query("UPDATE usuarios SET nombre='Administrador renombrado sintetico' WHERE id_usuario=$1",[otherEdit.audit.id_usuario]);
    assert.equal((await db.query('SELECT usuario_nombre_snapshot FROM bitacora WHERE id_bitacora=$1',[otherEdit.audit.id_bitacora])).rows[0].usuario_nombre_snapshot,storedName);
    pass('Responsable autenticado y nombre historico preservados ante cambio posterior del usuario');
    const parent=await audited('POST','/api/operaciones',newOp('2099-04-03'));
    const transport=await audited('POST','/api/transportes',{id_operacion_tour:parent.id,estado:'Preparado',motivo:'Preparacion humana'});await replay(transport.c,transport.r);
    pass('POST Transportes real produce una auditoria CREAR y recibo compatible 021');
    const operator=(await db.query('SELECT id_operador FROM operadores ORDER BY id_operador LIMIT 1')).rows[0].id_operador;
    await audited('PATCH','/api/transportes/'+transport.id,{id_operador:operator,observaciones_operador:' Nota operativa ',estado:'Activa',motivo:'Asignacion humana de operador'});
    pass('PATCH Transportes registra operador, estado y observaciones como campos distintos del motivo');
    await rejected(await prepare('PATCH','/api/transportes/'+transport.id,{id_vehiculo:f.vehicles[0],motivo:'Vehiculo sin minimo'}),400);
    pass('Restriccion original de minimo de pasajeros conserva rechazo sin auditoria falsa');
    await audited('PATCH','/api/transportes/'+f.records[0].transportes_operacion,{id_vehiculo:f.vehicles[0],id_operador:operator,motivo:'Asignacion con pasajeros suficientes'});
    pass('Cambio real de vehiculo conserva capacidad y registra instantaneas validas');
    const destination=await audited('POST','/api/operaciones',newOp('2099-04-04'));
    await audited('PATCH','/api/transportes/'+transport.id,{id_operacion_tour:destination.id,observaciones_operador:null,motivo:'Relacion operativa autorizada'});
    pass('Cambio de relacion operativa existente conserva validaciones y audita una sola fila');
    await noOp('PATCH','/api/transportes/'+transport.id,{id_operacion_tour:destination.id});await noOp('PATCH','/api/transportes/'+transport.id,{motivo:'Sin cambios'});
    pass('Transportes sin efecto conservan revision y omiten auditoria');
    await rejected(await prepare('PATCH','/api/transportes/'+transport.id,{estado:'Otro'}),400);
    pass('Motivo obligatorio de Transporte validado en servicio real');
    const dailyPath='/api/daily/observaciones?fecha=2099-05-01';assert.equal(await row('daily','2099-05-01'),null);
    const empty=await audited('PUT',dailyPath,{observaciones:''});await replay(empty.c,empty.r);
    pass('Daily inexistente mas texto vacio crea fila y auditoria CREAR');
    await noOp('PUT',dailyPath,{observaciones:' \n '});
    pass('Daily vacio existente mas texto normalizado identico no actualiza timestamp ni genera auditoria');
    await rejected(await prepare('PUT',dailyPath,{observaciones:'Cambio sin motivo'}),400);
    const note=await audited('PUT',dailyPath,{observaciones:' Nota diaria ',motivo:' Correccion humana '});await replay(note.c,note.r);
    await audited('PUT',dailyPath,{observaciones:'',motivo:'Retirar nota incorrecta'});
    pass('Daily modifica y limpia texto con motivo obligatorio y snapshots verdaderos');
    const target='/api/operaciones/'+op.id;
    const a=await prepare('PATCH',target,{hora_inicio:'10:00',motivo:'Sesion A'}),b=await prepare('PATCH',target,{hora_inicio:'11:00',motivo:'Sesion B'},other);
    const auditBefore=(await db.query('SELECT count(*)::int n FROM bitacora')).rows[0].n;
    const race=await Promise.all([write(a),write(b)]);assert.deepEqual(race.map(r=>r.status).sort(),[200,412]);assert.equal((await db.query('SELECT count(*)::int n FROM bitacora')).rows[0].n,auditBefore+1);
    pass('Dos administradores concurrentes: un COMMIT, un 412 y una auditoria');
    const stale=await prepare('PATCH',target,{hora_inicio:'12:00',motivo:'Contexto anterior'});
    await audited('PUT',dailyPath,{observaciones:'Contexto actualizado',motivo:'Cambio de contexto'});
    const staleReply=await rejected(stale,409,'CONTEXTO_OPERATIVO_CAMBIO');await replay(stale,staleReply);
    pass('409 de contexto obsoleto deja rechazo durable sin auditoria de exito');
    const concurrent=await prepare('PATCH',target,{hora_inicio:'12:30',motivo:'Intencion duplicada'});let pending;
    await provision.query('BEGIN');await provision.query('SELECT pg_advisory_xact_lock($1::int,$2::int)',KEY);
    try{
        pending=Promise.all([write(concurrent),write(concurrent)]);
        let waiting=0;const until=Date.now()+1200;while(Date.now()<until){waiting=(await db.query("SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND NOT granted AND classid=$1::oid AND objid=$2::oid",KEY)).rows[0].n;if(waiting>=2)break;await new Promise(r=>setTimeout(r,10));}
        assert.equal(waiting,2);const unknown=await recover(concurrent.key);assert.equal(unknown.status,404);assert.equal(unknown.body.concluyente,false);assert.equal(unknown.body.estado,'desconocido');await provision.query('COMMIT');
    }catch(e){await provision.query('ROLLBACK');await pending?.catch(()=>{});throw e;}
    const twins=await pending;assert.deepEqual(twins.map(r=>r.status),[200,200]);assert.deepEqual(twins.map(r=>r.headers['idempotency-replayed']).sort(),['false','true']);assert.deepEqual(twins[0].body,twins[1].body);
    const first=twins[0];await replay(concurrent,first);assert.equal((await db.query('SELECT count(*)::int n FROM bitacora WHERE comando_clave=$1',[concurrent.key])).rows[0].n,1);
    pass('Dos HTTP de la misma intencion: desconocido concurrente no es rollback; un negocio, auditoria y comando');
    const lost=await prepare('PATCH',target,{hora_inicio:'13:00',motivo:'Respuesta perdida'});await arm('lost');await assert.rejects(()=>write(lost));
    const recovered=await recover(lost.key);assert.equal(recovered.status,200);assert.equal(recovered.body.comando.estado,'confirmado');assert.equal(recovered.body.ids_bitacora.length,1);assert.equal((await row('operaciones',op.id)).hora_inicio,'13:00:00');
    pass('Respuesta destruida despues de COMMIT recupera auditoria y resultado persistidos');
    await restart();const afterRestart=await recover(lost.key);assert.deepEqual(afterRestart.body,recovered.body);await replay(lost,{status:200,body:{comando:recovered.body.comando,resultado:recovered.body.resultado,ids_bitacora:recovered.body.ids_bitacora}});
    pass('Reinicio del backend conserva recibo y replay no reejecuta escritor');
    report.rollbackProofs=[];
    const faults=[...['audit','after-audit','ledger','after-ledger','deferred'].map(fault=>({fault,method:'PATCH',url:target,body:{hora_inicio:'14:00',motivo:'Fallo controlado '+fault}})),
        {fault:'audit',method:'PATCH',url:'/api/transportes/'+transport.id,body:{observaciones_operador:'No debe persistir',motivo:'Fallo Transporte'}},
        {fault:'deferred',method:'PUT',url:dailyPath,body:{observaciones:'No debe persistir',motivo:'Fallo Daily'}}];
    for(const {fault,method,url,body} of faults){
        const c=await prepare(method,url,body),before=await checksum(true);await arm(fault);const r=await write(c);assert.equal(r.status,500,JSON.stringify(r));const after=await checksum(true);assert.equal(after,before);assert.equal((await recover(c.key)).body.estado,'desconocido');
        assert.equal((await db.query('SELECT count(*)::int n FROM bitacora WHERE comando_clave=$1',[c.key])).rows[0].n,0);assert.equal((await db.query('SELECT count(*)::int n FROM comandos_idempotentes WHERE clave=$1',[c.key])).rows[0].n,0);
        report.rollbackProofs.push({fault,method,url,key:c.key,before,after,httpStatus:r.status});pass('Fallo privado '+fault+' '+url+' revierte filas, revisiones, auditoria y ledger');
    }
    for(const token of [consulta,selected]){
        for(const [method,url,body]of [['POST','/api/operaciones',newOp('2099-06-01')],['PATCH',target,{hora_inicio:'15:00',motivo:'No autorizado'}],['POST','/api/transportes',{id_operacion_tour:parent.id,estado:'Activa'}],['PATCH','/api/transportes/'+transport.id,{estado:'Otro',motivo:'No autorizado'}],['PUT',dailyPath,{observaciones:'No autorizado',motivo:'No autorizado'}]]){
            const r=await ask(method,url,body,token,{...common,'Idempotency-Key':crypto.randomUUID(),'If-Match':'x','If-Operational-Match':'x'});assert.equal(r.status,403,JSON.stringify(r));
        }
        assert.equal((await recover(lost.key,token)).status,403);
    }
    assert.equal((await ask('GET',target,undefined,selected)).status,403);
    pass('Consulta all y selected no escriben ni recuperan recibos; alcance de lectura original conservado');
    assert.equal((await recover(lost.key,other)).status,404);
    pass('Otro administrador no obtiene recibos de intenciones ajenas');
    const otherId=otherEdit.audit.id_usuario;
    for(const change of ['inactive','consulta']){
        const c=await prepare('PATCH',target,{hora_inicio:'15:30',motivo:'Solicitud en espera'},other);
        await provision.query('BEGIN');await provision.query('SELECT pg_advisory_xact_lock($1::int,$2::int)',KEY);let late;
        try{
            late=write(c);let waiting=0;const until=Date.now()+1200;while(Date.now()<until){waiting=(await db.query("SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND NOT granted AND classid=$1::oid AND objid=$2::oid",KEY)).rows[0].n;if(waiting)break;await new Promise(r=>setTimeout(r,10));}assert.ok(waiting);
            if(change==='inactive')await provision.query('UPDATE usuarios SET estado=false WHERE id_usuario=$1',[otherId]);
            else await provision.query("UPDATE usuarios SET id_rol=(SELECT id_rol FROM roles WHERE nombre='Consulta') WHERE id_usuario=$1",[otherId]);
            await provision.query('COMMIT');
        }catch(e){await provision.query('ROLLBACK');await late?.catch(()=>{});throw e;}
        const hash=await checksum(true),reply=await late;assert.equal(reply.status,403,JSON.stringify(reply));assert.equal(await checksum(true),hash);assert.equal((await recover(otherEdit.c.key,other)).status,403);
        assert.equal((await db.query('SELECT count(*)::int n FROM comandos_idempotentes WHERE clave=$1',[c.key])).rows[0].n,0);
        await provision.query("UPDATE usuarios SET estado=true,id_rol=(SELECT id_rol FROM roles WHERE nombre='Administrador') WHERE id_usuario=$1",[otherId]);
        pass('Revocacion '+change+' durante espera: respuesta tardia 403 sin efectos ni acceso al recibo historico');
    }
    await rejected({...await prepare('PATCH',target,{hora_inicio:'16:00',motivo:'Cliente incompatible'}),headers:{...common,'X-CTSK-Protocol':'ctsk-command-api-v1','Idempotency-Key':crypto.randomUUID(),'If-Match':'x','If-Operational-Match':'x'}},400);
    pass('Protocolo anterior rechazado por el nuevo perfil antes de escribir');
    for(const name of ['standalonePolicy','revisionLabPolicy','revisionApiPolicy','commandApiPolicy','auditSchemaPolicy'])assert.throws(()=>require('../backend/config/'+name).validateManifest(JSON.parse(require('fs').readFileSync(require('path').join(report.directory,'manifest.json'))),require('path').resolve(__dirname,'..')));
    pass('Perfiles anteriores y audit-schema-lab rechazan el manifiesto de escritura 021');
    report.committedTransactionProofs=[];
    const committed=(await db.query("SELECT clave,ids_bitacora,recurso FROM comandos_idempotentes WHERE estado='confirmado' AND cardinality(ids_bitacora)=1 ORDER BY fecha_registro,clave")).rows;
    for(const entry of committed){
        const ledger=events.find(e=>e.type==='sql-proof'&&e.phase==='ledger'&&e.key===entry.clave);assert.ok(ledger);
        const group=events.filter(e=>e.type==='sql-proof'&&e.transaction===ledger.transaction&&e.pid===ledger.pid);
        assert.ok(group.some(e=>e.phase==='business'));assert.equal(group.filter(e=>e.phase==='audit').length,1);assert.ok(group.every(e=>e.client===ledger.client));
        const controls=events.filter(e=>e.type==='savepoint-proof'&&e.transaction===ledger.transaction&&e.pid===ledger.pid);
        assert.ok(controls.some(e=>e.control.startsWith('SAVEPOINT ctsk_api_nested_')));assert.ok(controls.some(e=>e.control==='RELEASE SAVEPOINT ctsk_command_work'));assert.ok(controls.every(e=>e.client===ledger.client));
        report.committedTransactionProofs.push({key:entry.clave,resource:entry.recurso,auditId:entry.ids_bitacora[0],client:ledger.client,pid:ledger.pid,principalTransaction:ledger.transaction,phases:group.map(e=>e.phase),savepoints:controls.map(e=>e.control)});
    }
    pass('Todas las auditorias confirmadas acreditan mismo cliente real, PID, transaccion principal y savepoints sin comparar xmin');
    report.finalCounts=(await db.query('SELECT (SELECT count(*)::int FROM bitacora WHERE version_auditoria=2) auditorias,(SELECT count(*)::int FROM comandos_idempotentes WHERE estado=\'confirmado\') confirmados,(SELECT count(*)::int FROM comandos_idempotentes WHERE estado=\'rechazado\') rechazados')).rows[0];
}
module.exports={run};
