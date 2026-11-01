'use strict';
// Casos de persistencia SQL sinteticos. No autentican ni invocan servicios administrativos.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const S=require('../backend/config/adminAuditSchema'),C=require('../backend/config/adminAuditSchemaContract');
const ADMIN_REFS=['id_usuario_afectado','id_tour','id_guia','id_operador','id_vehiculo','id_pais','id_plataforma'];
const MAP={usuarios:['usuarios','id_usuario','id_usuario_afectado'],tours:['tours','id_tour','id_tour'],guias:['guias','id_guia','id_guia'],operadores:['operadores','id_operador','id_operador'],vehiculos:['vehiculos','id_vehiculo','id_vehiculo'],paises:['paises','id_pais','id_pais'],plataformas:['plataformas','id_plataforma','id_plataforma']};
async function run({admin,runtime:db,plan,fixtures:f,actor,preserved,report}){
    const pass=name=>{report.checks.push(name);console.log('ADMIN_022_OK '+name);};let serial=0;
    const gen=plan.manifest.dataGeneration,one=async(sql,args)=>(await db.query(sql,args)).rows[0];
    async function checksum(){const h=crypto.createHash('sha256');for(const table of [...require('../backend/config/desktopSchema').TABLES,'comandos_idempotentes'])h.update((await one(`SELECT COALESCE(jsonb_agg(v ORDER BY v::text),'[]'::jsonb)::text value FROM (SELECT to_jsonb(t) v FROM public.${table} t) s`)).value);return h.digest('hex');}
    async function snapshot(resource,id){
        const [table,pk]=MAP[resource];
        const fields={usuarios:'nombre,correo,id_rol,estado,alcance_plataformas,ARRAY(SELECT id_plataforma FROM usuario_plataformas_visibles WHERE id_usuario=t.id_usuario ORDER BY id_plataforma) platform_ids',tours:'nombre,descripcion,activo',guias:'nombre,estado',operadores:'nombre,estado',vehiculos:'identificador,placas,color,capacidad,estado',paises:'nombre',plataformas:'nombre'};
        return (await one(`SELECT to_jsonb(v) value FROM (SELECT ${fields[resource]} FROM public.${table} t WHERE ${pk}=$1) v`,[id])).value;
    }
    async function create(resource){
        const n=++serial;const definitions={
            usuarios:["INSERT INTO usuarios(id_rol,nombre,correo,password,estado,alcance_plataformas) SELECT id_rol,$1,$2,password,true,'selected' FROM usuarios WHERE id_usuario=$3 RETURNING id_usuario",['Usuario sintetico '+n,'audit-'+n+'@schema.example.test',actor]],
            tours:['INSERT INTO tours(nombre,descripcion,activo) VALUES ($1,$2,true) RETURNING id_tour',['Tour sintetico '+n,'Solo persistencia 022']],
            guias:['INSERT INTO guias(nombre,estado) VALUES ($1,true) RETURNING id_guia',['Guia sintetico '+n]],
            operadores:['INSERT INTO operadores(nombre,estado) VALUES ($1,true) RETURNING id_operador',['Operador sintetico '+n]],
            vehiculos:['INSERT INTO vehiculos(identificador,placas,color,capacidad,estado) VALUES ($1,NULL,NULL,12,true) RETURNING id_vehiculo',['SYN-022-'+n]],
            paises:['INSERT INTO paises(nombre) VALUES ($1) RETURNING id_pais',['Pais sintetico '+n]],
            plataformas:['INSERT INTO plataformas(nombre) VALUES ($1) RETURNING id_plataforma',['Plataforma sintetica '+n]]};
        const [sql,values]=definitions[resource],id=(await one(sql,values))[MAP[resource][1]];return {resource,id,key:crypto.randomUUID(),generation:gen,user:actor,action:'CREAR',name:'Administrador sintetico 022',reason:null,before:null,after:await snapshot(resource,id)};
    }
    async function audit(v){
        const row={id_usuario:v.user,id_reservacion:null,accion:v.action,descripcion:v.action==='CAMBIAR_PASSWORD'?'Cambio de contraseña':'Evento administrativo sintetico',fecha:new Date(),version_auditoria:3,origen:'HUMANO',instante:new Date(),usuario_nombre_snapshot:v.name,[MAP[v.resource][2]]:v.id,valores_anteriores:v.before===null?null:JSON.stringify(v.before),valores_nuevos:v.after===null?null:JSON.stringify(v.after),motivo:v.reason,comando_generacion:v.generation,comando_clave:v.key,...v.extra};
        const names=Object.keys(row);return (await one(`INSERT INTO bitacora (${names.join(',')}) VALUES (${names.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING id_bitacora`,Object.values(row))).id_bitacora;
    }
    async function ledger(v,id,extra={}){
        const method=v.action==='CREAR'?'POST':'PATCH',route='/api/'+v.resource+(method==='POST'?'':'/'+v.id)+(v.action==='CAMBIAR_PASSWORD'?'/password':'');
        const row={generacion_datos:v.generation,id_usuario:v.user,clave:v.key,version:1,metodo:method,ruta:route,recurso:v.resource,id_recurso:String(v.id),huella:'a'.repeat(64),estado:'confirmado',http_status:200,resultado:{codigo:'SQL_SINTETICO',referencias:[{recurso:v.resource,id:String(v.id)}]},alcance:{plataformas:[],referencias:[]},ids_bitacora:[id],...extra},M=require('../backend/models/comandos.model');
        await db.query(M.INSERT_SQL,M.FIELDS.map(k=>row[k]));
    }
    async function proof(v,id,business=true){
        const [table,pk]=MAP[v.resource],point=await one(`SELECT pg_backend_pid() pid,pg_current_xact_id()::text transaction,(SELECT xmin::text FROM ${table} WHERE ${pk}=$1) negocio,(SELECT xmin::text FROM bitacora WHERE id_bitacora=$2) auditoria,(SELECT xmin::text FROM comandos_idempotentes WHERE generacion_datos=$3 AND id_usuario=$4 AND clave=$5) comando`,[v.id,id,gen,v.user,v.key]);
        assert.equal(point.auditoria,point.comando);if(business)assert.equal(point.negocio,point.auditoria);assert.equal(point.transaction,point.auditoria);
        report.transactionProofs??=[];report.transactionProofs.push({resource:v.resource,id:v.id,auditId:id,key:v.key,businessWritten:business,...point});
    }
    async function rejected(name,work,codes=['23514'],deferred=false){
        const before=await checksum();await db.query('BEGIN');let error,stage='statement';try{await work();stage='commit';await db.query('COMMIT');}catch(e){error=e;await db.query('ROLLBACK');}
        assert.ok(error,'EXPECTED_REJECTION '+name);assert.ok(codes.includes(error.code),name+': '+error.code+' '+error.message);if(deferred)assert.equal(stage,'commit',name);
        const after=await checksum();assert.equal(after,before,name+' rollback');report.rollbacks??=[];report.rollbacks.push({name,code:error.code,stage,before,after});pass(name);
    }
    const legacy=(await db.query(`SELECT to_jsonb(b)-$1::text[] fila FROM bitacora b ORDER BY id_bitacora`,[ADMIN_REFS])).rows;
    assert.deepEqual(legacy,preserved);pass('Historicos y formato 2 conservan IDs, filas y valores exactos al ampliar 022');
    await db.query("INSERT INTO bitacora(id_usuario,id_reservacion,accion,descripcion,fecha) VALUES ($1,$2,'MODIFICAR',NULL,CURRENT_TIMESTAMP)",[actor,f.records[0].reservaciones]);pass('Runtime mantiene INSERT historico sin version y descripcion NULL');
    const operationId=f.records[0].operaciones_tour;
    const operationBefore=(await one('SELECT to_jsonb(v) value FROM (SELECT fecha,id_tour,turno,numero_grupo,hora_inicio,id_guia,estado FROM operaciones_tour WHERE id_operacion_tour=$1) v',[operationId])).value;
    const operationAfter={...operationBefore,estado:'Compatible 022'},operationKey=crypto.randomUUID();
    await db.query('BEGIN');await db.query('UPDATE operaciones_tour SET estado=$1 WHERE id_operacion_tour=$2',[operationAfter.estado,operationId]);
    const operationAudit=(await one("INSERT INTO bitacora(id_usuario,id_reservacion,accion,descripcion,fecha,version_auditoria,origen,instante,usuario_nombre_snapshot,id_operacion_tour,valores_anteriores,valores_nuevos,motivo,comando_generacion,comando_clave) VALUES ($1,NULL,'MODIFICAR','Operacion sintetica compatible',CURRENT_TIMESTAMP,2,'HUMANO',CURRENT_TIMESTAMP,'Actor sintetico 021',$2,$3::jsonb,$4::jsonb,'Verificacion humana de compatibilidad',$5,$6) RETURNING id_bitacora",[actor,operationId,JSON.stringify(operationBefore),JSON.stringify(operationAfter),gen,operationKey])).id_bitacora;
    await ledger({resource:'operaciones',id:operationId,key:operationKey,generation:gen,user:actor,action:'MODIFICAR'},operationAudit);await db.query('COMMIT');
    pass('Formato 2 sigue insertando y verificando su comando operativo despues de 022');
    await rejected('Formato 2 con referencia administrativa prohibida',()=>db.query("INSERT INTO bitacora(id_usuario,id_reservacion,accion,descripcion,fecha,version_auditoria,origen,instante,usuario_nombre_snapshot,id_operacion_tour,id_tour,valores_anteriores,valores_nuevos,motivo,comando_generacion,comando_clave) VALUES ($1,NULL,'MODIFICAR','Mezcla invalida',CURRENT_TIMESTAMP,2,'HUMANO',CURRENT_TIMESTAMP,'Actor sintetico',$2,$3,$4::jsonb,$5::jsonb,'Motivo sintetico',$6,$7)",[actor,operationId,f.tour,JSON.stringify(operationBefore),JSON.stringify(operationAfter),gen,crypto.randomUUID()]));
    const accepted={};for(const resource of Object.keys(MAP)){
        await db.query('BEGIN');const v=await create(resource),id=await audit(v);await ledger(v,id);await proof(v,id);await db.query('COMMIT');accepted[resource]={...v,auditId:id};
        pass('CREAR '+resource+': FK real, snapshot permitido, auditoria antes del comando y transaccion comun');
    }
    for(const resource of ['usuarios','tours','guias','operadores','vehiculos']){
        const v={...accepted[resource],key:crypto.randomUUID(),action:'MODIFICAR',before:await snapshot(resource,accepted[resource].id),reason:'Ajuste humano sintetico'};
        const field=resource==='vehiculos'?'color':'nombre';await db.query('BEGIN');await db.query(`UPDATE ${MAP[resource][0]} SET ${field}=$1 WHERE ${MAP[resource][1]}=$2`,[resource==='vehiculos'?'Azul':'Nombre ajustado 022',v.id]);v.after=await snapshot(resource,v.id);
        const id=await audit(v);await ledger(v,id);await proof(v,id);await db.query('COMMIT');pass('MODIFICAR '+resource+': diferencia material, motivo y negocio/auditoria/ledger atomicos');
    }
    const target=accepted.usuarios.id;assert.notEqual(actor,target);
    const passwordsBefore=(await one("SELECT md5(jsonb_agg(jsonb_build_object('id',id_usuario,'valor',password) ORDER BY id_usuario)::text) value FROM usuarios")).value;
    const pwd={...accepted.usuarios,key:crypto.randomUUID(),action:'CAMBIAR_PASSWORD',before:null,after:null,reason:'Restablecimiento solicitado por responsable sintetico'};
    await db.query('BEGIN');const passwordAudit=await audit(pwd);await ledger(pwd,passwordAudit);await proof(pwd,passwordAudit,false);await db.query('COMMIT');
    const stored=await one('SELECT * FROM bitacora WHERE id_bitacora=$1',[passwordAudit]);assert.equal(stored.valores_anteriores,null);assert.equal(stored.valores_nuevos,null);assert.equal(stored.id_usuario,actor);assert.equal(stored.id_usuario_afectado,target);
    assert.equal((await one("SELECT md5(jsonb_agg(jsonb_build_object('id',id_usuario,'valor',password) ORDER BY id_usuario)::text) value FROM usuarios")).value,passwordsBefore);
    report.passwordEvent={auditId:passwordAudit,actor,target,key:pwd.key,snapshotsNull:true,passwordsUnchanged:true};pass('CAMBIAR_PASSWORD solo metadatos: responsable distinto del afectado, sin cambiar ninguna credencial');
    const originalName=stored.usuario_nombre_snapshot;await admin.query('UPDATE usuarios SET nombre=$1 WHERE id_usuario=$2',['Actor renombrado sintetico',actor]);assert.equal((await one('SELECT usuario_nombre_snapshot FROM bitacora WHERE id_bitacora=$1',[passwordAudit])).usuario_nombre_snapshot,originalName);pass('Nombre historico del actor conservado tras renombrar usuario ficticio');
    const defaults=(resource='tours')=>({...accepted[resource],key:crypto.randomUUID()});
    for(const resource of Object.keys(MAP))await rejected('FK inexistente '+resource,()=>audit({...defaults(resource),id:2147483647}),['23503']);
    await rejected('Actor inexistente',()=>audit({...defaults(),user:2147483647}),['23503']);
    for(const field of ADMIN_REFS.filter(fld=>fld!=='id_tour'))await rejected('Recurso multiple '+field,()=>audit({...defaults(),extra:{[field]:field==='id_usuario_afectado'?target:accepted[Object.keys(MAP).find(k=>MAP[k][2]===field)].id}}));
    await rejected('Recurso administrativo ausente',()=>audit({...defaults(),extra:{id_tour:null}}));
    for(const field of ['id_reservacion','id_operacion_tour','id_transporte_operacion','id_daily_observacion']){
        const id=field==='id_reservacion'?f.records[0].reservaciones:field==='id_operacion_tour'?f.records[0].operaciones_tour:field==='id_transporte_operacion'?f.records[0].transportes_operacion:1;
        await rejected('Formato 3 no admite referencia operativa '+field,()=>audit({...defaults(),extra:{[field]:id}}),['23514','23503']);
    }
    for(const version of [null,2,4])await rejected('Auditoria administrativa no puede reinterpretarse como version '+version,()=>audit({...defaults(),extra:{version_auditoria:version}}));
    for(const [field,value]of [['origen',null],['origen','SISTEMA'],['instante',null],['usuario_nombre_snapshot','\u00a0'],['usuario_nombre_snapshot','x'.repeat(101)],['descripcion',' '],['comando_generacion',null],['comando_clave',null]])await rejected('Metadato invalido '+field,()=>audit({...defaults(),extra:{[field]:value}}));
    for(const resource of Object.keys(MAP)){
        for(const action of ['ELIMINAR','CANCELAR','DESACTIVAR',...(['paises','plataformas'].includes(resource)?['MODIFICAR']:[]),...(resource!=='usuarios'?['CAMBIAR_PASSWORD']:[])])await rejected('Accion '+action+' prohibida en '+resource,()=>audit({...defaults(resource),action,reason:'Prueba sintetica'}));
    }
    const invalidUsers=[{},[],null,'texto', {...accepted.usuarios.after,password:'SYNTHETIC_SENTINEL'}, {...accepted.usuarios.after,hash:'SYNTHETIC_SENTINEL'}, {...accepted.usuarios.after,token:'SYNTHETIC_SENTINEL'}, {...accepted.usuarios.after,id_rol:'1'}, {...accepted.usuarios.after,id_rol:0}, {...accepted.usuarios.after,id_rol:2147483648}, {...accepted.usuarios.after,estado:'true'}, {...accepted.usuarios.after,alcance_plataformas:'otro'}, {...accepted.usuarios.after,nombre:'\ufeff'}, {...accepted.usuarios.after,nombre:'x'.repeat(101)}, {...accepted.usuarios.after,correo:'incorrecto'}, {...accepted.usuarios.after,correo:'a'.repeat(101)+'@a.test'}, ...[null,{},[2,1],[1,1],['1'],[0],[1.5],[2147483648],[-1],[{}]].map(platform_ids=>({...accepted.usuarios.after,platform_ids})), {...accepted.usuarios.after,alcance_plataformas:'all',platform_ids:[1]}];
    for(const [i,after]of invalidUsers.entries())await rejected('Snapshot Usuario invalido '+i,()=>audit({...defaults('usuarios'),after}));
    for(const resource of Object.keys(MAP)){
        const sample=accepted[resource].after,first=Object.keys(sample)[0],{[first]:omitted,...missing}=sample;
        for(const [label,after]of [['campo faltante',missing],['campo extra',{...sample,authorization:'SYNTHETIC_SENTINEL'}],['HTTP body',{body:sample,headers:{}}],['JSON null',null]])await rejected('Snapshot '+resource+' '+label,()=>audit({...defaults(resource),after}));
    }
    for(const [resource,field,value]of [['tours','activo',1],['tours','descripcion',null],['tours','nombre','x'.repeat(151)],['guias','estado',null],['guias','nombre','x'.repeat(121)],['operadores','nombre',''],['operadores','estado',{}],['vehiculos','identificador','x'.repeat(51)],['vehiculos','placas','x'.repeat(21)],['vehiculos','color',[]],['vehiculos','capacidad','12'],['vehiculos','capacidad',0],['vehiculos','capacidad',13],['vehiculos','capacidad',1.5],['paises','nombre','x'.repeat(151)],['plataformas','nombre','x'.repeat(51)]])await rejected('Tipo/rango '+resource+'.'+field+' '+JSON.stringify(value),()=>audit({...defaults(resource),after:{...accepted[resource].after,[field]:value}}));
    for(const reason of [null,'',' ','\u00a0','\ufeff','x'.repeat(501),'😀'.repeat(501)])await rejected('Motivo obligatorio invalido '+JSON.stringify(reason).slice(0,75),()=>audit({...defaults(),action:'MODIFICAR',reason,before:{...accepted.tours.after,nombre:'Anterior'}}));
    await rejected('MODIFICAR sin cambio material',()=>audit({...defaults(),action:'MODIFICAR',reason:'Sin cambio',before:accepted.tours.after}));
    await rejected('CREAR con snapshot anterior',()=>audit({...defaults(),before:accepted.tours.after}));
    for(const reason of ['', '  ', 'x'.repeat(501)])await rejected('Motivo opcional proporcionado invalido '+reason.length,()=>audit({...defaults(),reason}));
    for(const extra of [{valores_anteriores:JSON.stringify(accepted.usuarios.after)},{valores_nuevos:'{}'},{valores_nuevos:'null'},{valores_nuevos:JSON.stringify({password:'SYNTHETIC_SENTINEL'})},{descripcion:'Password de longitud 12'},{descripcion:null}])await rejected('Password rechaza snapshots o descripcion sensible '+JSON.stringify(Object.keys(extra)),()=>audit({...pwd,key:crypto.randomUUID(),extra}));
    await rejected('Password exige motivo',()=>audit({...pwd,key:crypto.randomUUID(),reason:null}));
    for(const patch of [{ruta:'/api/usuarios/'+target},{metodo:'POST',ruta:'/api/usuarios'},{recurso:'tours',ruta:'/api/tours/'+target}])await rejected('Password exige metodo/ruta/recurso propios '+JSON.stringify(patch),async()=>{const v={...pwd,key:crypto.randomUUID()},id=await audit(v);await ledger(v,id,patch);},['23514'],true);
    const boundary={...defaults(),reason:'😀'.repeat(500)};await db.query('BEGIN');const bid=await audit(boundary);await ledger(boundary,bid);await db.query('COMMIT');pass('Motivo opcional acepta 500 puntos Unicode, incluidos emojis');
    const canonicalUser={...accepted.usuarios.after,platform_ids:[1,2,2147483647]};assert.equal((await one('SELECT public.ctsk_admin_snapshot_valido_022($1,$2::jsonb) ok',['usuarios',JSON.stringify(canonicalUser)])).ok,true);pass('Snapshot de usuario valida IDs positivos, distintos y ordenados hasta INT32');
    async function deferred(name,patch={},auditPatch={}){await rejected(name,async()=>{const v={...defaults(),...auditPatch};await db.query('UPDATE tours SET descripcion=$1 WHERE id_tour=$2',['Debe revertirse',v.id]);const id=await audit(v);if(patch!==null)await ledger(v,id,patch);},['23503','23514'],true);}
    const actor2=(await one("SELECT id_usuario FROM usuarios WHERE correo='consulta@standalone.example.test'")).id_usuario;
    await deferred('COMMIT sin ledger revierte negocio y auditoria',null);
    for(const [name,patch]of [['comando rechazado',{estado:'rechazado',http_status:409}],['actor distinto',{id_usuario:actor2}],['clave distinta',{clave:crypto.randomUUID()}],['recurso incorrecto',{recurso:'usuarios'}],['ID recurso incorrecto',{id_recurso:'2147483647'}],['ID auditoria ausente',{ids_bitacora:[]}],['ID auditoria falso',{ids_bitacora:[2147483647]}],['recibo con IDs extra',{ids_bitacora:[1,2]}],['metodo incorrecto',{metodo:'PATCH'}],['ruta incorrecta',{ruta:'/api/usuarios'}],['ruta con query',{ruta:'/api/tours?extra=1'}],['ruta con slash',{ruta:'/api/tours/'}]])await deferred('Fallo diferido '+name,patch);
    await deferred('Fallo diferido generacion de auditoria distinta',{generacion_datos:gen},{generation:crypto.randomUUID()});
    await rejected('Error inmediato ledger revierte negocio y auditoria',async()=>{const v=defaults();await db.query('UPDATE tours SET descripcion=$1 WHERE id_tour=$2',['Debe revertirse ledger',v.id]);const id=await audit(v);await ledger(v,id,{generacion_datos:crypto.randomUUID()});},['42501']);
    for(const resource of ['usuarios','guias','operadores','vehiculos'])await rejected('Rollback diferido de negocio '+resource+(resource==='usuarios'?' y asignaciones':''),async()=>{
        const v={...defaults(resource),action:'MODIFICAR',reason:'Comprobacion humana sintetica',before:await snapshot(resource,accepted[resource].id)};
        if(resource==='vehiculos')await db.query('UPDATE vehiculos SET capacidad=1,color=$1 WHERE id_vehiculo=$2',['Cambio a revertir',v.id]);
        else await db.query(`UPDATE ${MAP[resource][0]} SET nombre=$1 WHERE ${MAP[resource][1]}=$2`,['Cambio a revertir',v.id]);
        if(resource==='usuarios'){
            await db.query('DELETE FROM usuario_plataformas_visibles WHERE id_usuario=$1',[v.id]);
            await db.query('INSERT INTO usuario_plataformas_visibles(id_usuario,id_plataforma) VALUES ($1,$2)',[v.id,f.platform]);
        }
        v.after=await snapshot(resource,v.id);const id=await audit(v);await ledger(v,id,{ids_bitacora:[]});
    },['23514'],true);
    for(const resource of ['usuarios','paises','plataformas'])await rejected('Fallo diferido revierte alta sintetica '+resource,async()=>{const v=await create(resource),id=await audit(v);await ledger(v,id,{ids_bitacora:[]});},['23514'],true);
    await rejected('Una intencion administrativa no puede duplicar auditoria',async()=>{const v=defaults();await audit(v);await audit(v);},['23505']);
    await rejected('Intencion confirmada no admite segunda auditoria',()=>audit(accepted.tours),['23505']);
    await rejected('Ledger confirmado conserva PK de intencion',()=>ledger(accepted.tours,accepted.tours.auditId),['23505']);
    await rejected('Recibo administrativo no puede inventar una auditoria ausente',()=>ledger(defaults(),2147483647),['23503'],true);
    await rejected('Recibo administrativo no puede usar una auditoria de otro comando',()=>ledger(defaults(),accepted.tours.auditId),['23503'],true);
    await rejected('Recibo administrativo no puede apuntar a formato operativo',()=>ledger(defaults(),operationAudit),['23503'],true);
    await rejected('Rechazo administrativo no puede declarar auditoria de exito',()=>ledger(defaults(),accepted.tours.auditId,{estado:'rechazado',http_status:409}),['23514'],true);
    for(const status of ['confirmado','rechazado']){
        const v={...defaults(),action:'MODIFICAR'},before=await snapshot('tours',v.id),count=(await one('SELECT count(*)::int n FROM bitacora')).n;
        await db.query('BEGIN');await ledger(v,null,{estado:status,http_status:status==='confirmado'?200:409,ids_bitacora:[]});await db.query('COMMIT');assert.deepEqual(await snapshot('tours',v.id),before);assert.equal((await one('SELECT count(*)::int n FROM bitacora')).n,count);pass('Ledger '+status+' con IDs vacios conserva no-op/rechazo sin inventar auditoria');
    }
    for(const sql of ['UPDATE bitacora SET motivo=motivo','DELETE FROM bitacora','TRUNCATE bitacora','ALTER TABLE bitacora ADD COLUMN intruso text','ALTER TABLE bitacora DISABLE TRIGGER ALL','ALTER TABLE bitacora DROP CONSTRAINT chk_bitacora_formato_022','DROP FUNCTION public.ctsk_admin_comando_auditoria_022() CASCADE','ALTER ROLE ctsk_standalone_runtime SUPERUSER','UPDATE comandos_idempotentes SET ids_bitacora=ARRAY[]::integer[]','DELETE FROM comandos_idempotentes','TRUNCATE comandos_idempotentes'])await rejected('Runtime denegado '+sql,()=>db.query(sql),['42501']);
    const privilegeBefore=await S.inspect(db);await db.query('GRANT ALL ON bitacora TO PUBLIC');assert.deepEqual(await S.inspect(db),privilegeBefore);pass('Runtime sin grant option no puede conceder privilegios a PUBLIC: ACL efectiva intacta');
    for(const sql of ['UPDATE bitacora SET descripcion=descripcion','DELETE FROM bitacora','TRUNCATE bitacora']){await admin.query('BEGIN');await admin.query('SET LOCAL ROLE ctsk_standalone_owner');await assert.rejects(()=>admin.query(sql),e=>e.code==='42501');await admin.query('ROLLBACK');pass('Owner tambien sujeto a inmutabilidad: '+sql);}
    for(const sql of ["SET session_replication_role='replica'",'CREATE FUNCTION public.intruso_022() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$','SET ROLE ctsk_standalone_owner'])await rejected('Runtime no puede evadir protecciones '+sql,()=>db.query(sql),['42501']);
    for(const sql of ['ALTER TABLE bitacora DISABLE TRIGGER ctsk_admin_audit_command_022','ALTER TABLE bitacora ENABLE TRIGGER ctsk_audit_command_021','ALTER TABLE bitacora DROP CONSTRAINT fk_bitacora_usuario_afectado_022','ALTER TABLE bitacora DROP CONSTRAINT chk_bitacora_formato_022','DROP INDEX uq_bitacora_comando_022','GRANT UPDATE ON bitacora TO ctsk_standalone_runtime','GRANT SELECT ON bitacora TO PUBLIC','GRANT INSERT(id_tour) ON bitacora TO PUBLIC','GRANT EXECUTE ON FUNCTION ctsk_admin_snapshot_valido_022(text,jsonb) TO PUBLIC','ALTER TABLE bitacora ADD COLUMN alterada text',"CREATE OR REPLACE FUNCTION public.ctsk_admin_comando_auditoria_022() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$",'ALTER FUNCTION ctsk_admin_snapshot_valido_022(text,jsonb) SECURITY DEFINER','GRANT CREATE ON SCHEMA public TO ctsk_standalone_runtime']){
        await admin.query('BEGIN');await admin.query(sql);await admin.query('SET LOCAL ROLE ctsk_standalone_runtime');try{await assert.rejects(()=>S.verifySchema(admin),e=>e.code==='ADMIN_AUDIT_SCHEMA_INVALID');}finally{await admin.query('ROLLBACK');}await S.verifySchema(db);pass('Verificador rechaza alteracion: '+sql);
    }
    for(const sql of ['ALTER TABLE comandos_idempotentes DISABLE TRIGGER ctsk_admin_ledger_audit_022','ALTER TABLE comandos_idempotentes DISABLE TRIGGER ctsk_command_guard_020','ALTER TABLE bitacora DISABLE TRIGGER ctsk_audit_immutable_021','ALTER TABLE bitacora DISABLE TRIGGER ctsk_audit_truncate_021','ALTER TABLE bitacora ALTER COLUMN id_tour TYPE bigint','GRANT ctsk_standalone_owner TO ctsk_standalone_runtime']){
        await admin.query('BEGIN');await admin.query(sql);await admin.query('SET LOCAL ROLE ctsk_standalone_runtime');try{await assert.rejects(()=>S.verifySchema(admin),e=>e.code==='ADMIN_AUDIT_SCHEMA_INVALID');}finally{await admin.query('ROLLBACK');}await S.verifySchema(db);pass('Verificador rechaza proteccion/fk/rol alterado: '+sql);
    }
    await assert.rejects(()=>require('../backend/config/auditSchema').verifySchema(db),e=>e.code==='AUDIT_SCHEMA_INVALID');
    await assert.rejects(()=>require('../backend/config/commandSchema').verifySchema(db,gen),e=>e.code==='COMMAND_SCHEMA_INVALID');
    await S.verifyLedger(db,gen);await require('../backend/config/revisionSchema').verifySchema(db);pass('020/021 estrictos rechazan extension; base ledger020 y revisiones019 conservan protecciones');
    for(const name of ['standalonePolicy','revisionLabPolicy','revisionApiPolicy','commandApiPolicy','auditSchemaPolicy','auditApiPolicy'])assert.throws(()=>require('../backend/config/'+name).validateManifest(plan.manifest,plan.manifest.root));pass('Todos los perfiles anteriores rechazan manifiesto 022');
    // El verificador completo 020 tambien rechaza el esquema ajeno, aun con su manifiesto predecesor valido.
    const predecessor=require('../backend/config/commandApiPolicy').readPlan(require('node:path').join(plan.manifest.directory,'manifest.json'));
    await assert.rejects(()=>require('../backend/config/commandApiPolicy').verify({connect:async()=>({query:db.query.bind(db),release(){}})},predecessor),e=>e.code==='CONFIG_CHANGED'||e.code==='COMMAND_SCHEMA_INVALID'||e.code==='AUDIT_SCHEMA_INVALID');
    pass('Contrato completo del perfil020 no admite una base extendida a022');
    const fs=require('node:fs'),path=require('node:path'),policy=require('../backend/config/adminAuditSchemaPolicy');
    for(const [file,mutate]of [['admin-audit-manifest.json',s=>JSON.stringify({...JSON.parse(s),code:'0'.repeat(64)})],['admin-audit-runtime.env',s=>s.replace('DB_SCHEMA_VERSION=022','DB_SCHEMA_VERSION=021')]]){
        const full=path.join(plan.manifest.directory,file),bytes=fs.readFileSync(full);
        try{fs.writeFileSync(full,mutate(bytes.toString('utf8')));assert.throws(()=>policy.readPlan(plan.filename),e=>['CONFIG_CHANGED','ADMIN_AUDIT_LAB_CONFIG'].includes(e.code));}
        finally{fs.writeFileSync(full,bytes);}assert.equal(policy.readPlan(plan.filename).digest,plan.digest);pass('Plan privado alterado rechazado antes de conectar: '+file);
    }
    await assert.rejects(()=>fetch('https://example.invalid'),e=>e.code==='STANDALONE_NETWORK_BLOCKED');assert.throws(()=>require('node:dgram').createSocket('udp4'),e=>e.code==='STANDALONE_NETWORK_BLOCKED');assert.throws(()=>require('node:net').connect({host:'127.0.0.1',port:5432}),e=>e.code==='STANDALONE_NETWORK_BLOCKED');pass('Fetch/UDP y PostgreSQL ajenos bloqueados antes de conectar');
    report.accepted=Object.fromEntries(Object.entries(accepted).map(([resource,v])=>[resource,{id:v.id,auditId:v.auditId,key:v.key}]));report.counts=await one("SELECT (SELECT count(*)::int FROM bitacora WHERE version_auditoria IS NULL) historicos,(SELECT count(*)::int FROM bitacora WHERE version_auditoria=2) operativas,(SELECT count(*)::int FROM bitacora WHERE version_auditoria=3) administrativas,(SELECT count(*)::int FROM comandos_idempotentes) comandos");
}
module.exports={run,ADMIN_REFS,MAP};
