'use strict';
// Solo SQL sintetico del esquema: NO valida escritores de servicios reales.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const S=require('../backend/config/auditSchema'),A=require('../backend/config/auditSchemaPolicy');
async function run({admin,runtime:db,plan,fixtures:f,actor,historic,report}){
    const check=(message)=>{report.checks.push(message);console.log('PASS '+message);};
    const gen=plan.manifest.dataGeneration,op=f.records[0].operaciones_tour,tr=f.records[0].transportes_operacion;
    const actor2=(await admin.query("SELECT id_usuario FROM usuarios WHERE correo='consulta@standalone.example.test'")).rows[0].id_usuario;
    const day=(await admin.query("INSERT INTO daily_observaciones(fecha,observaciones) VALUES ('2098-01-01','Daily sintetico') RETURNING id_daily_observacion")).rows[0].id_daily_observacion;
    const operation={fecha:'2098-01-01',id_tour:f.tour,turno:'Mañana',numero_grupo:1,hora_inicio:'07:00:00',id_guia:null,estado:'Preparada'};
    const transport={id_operacion_tour:op,id_vehiculo:null,id_operador:null,observaciones_operador:null,estado:'Preparado'};
    const daily={fecha:'2098-01-01',observaciones:'Daily sintetico'};
    const defaults=(resource='operaciones')=>({resource,id:resource==='operaciones'?op:resource==='transportes'?tr:day,key:crypto.randomUUID(),generation:gen,user:actor,action:'CREAR',origin:'HUMANO',name:'Administrador sintetico 021',reason:null,before:null,after:structuredClone(resource==='operaciones'?operation:resource==='transportes'?transport:daily)});
    async function audit(v){
        const references={operaciones:'id_operacion_tour',transportes:'id_transporte_operacion',daily:'id_daily_observacion'};
        const row={id_usuario:v.user,id_reservacion:v.reservation??null,accion:v.action,descripcion:'Evento sintetico 021',fecha:new Date(),version_auditoria:v.version??2,origen:v.origin,instante:new Date(),usuario_nombre_snapshot:v.name,[references[v.resource]]:v.id,valores_anteriores:v.before===null?null:JSON.stringify(v.before),valores_nuevos:JSON.stringify(v.after),motivo:v.reason,comando_generacion:v.generation,comando_clave:v.key,...v.extra};
        const names=Object.keys(row);return (await db.query(`INSERT INTO bitacora (${names.join(',')}) VALUES (${names.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING id_bitacora`,Object.values(row))).rows[0].id_bitacora;
    }
    async function command(v,id,patch={}){
        const resource=v.resource,identifier=resource==='daily'?v.after.fecha:String(v.id);
        const method=resource==='daily'?'PUT':v.action==='CREAR'?'POST':'PATCH';
        const route=resource==='daily'?'/api/daily/observaciones?fecha='+identifier:'/api/'+resource+(method==='POST'?'':'/'+identifier);
        const row={generacion_datos:v.generation,id_usuario:v.user,clave:v.key,version:1,metodo:method,ruta:route,recurso:resource,id_recurso:identifier,huella:'a'.repeat(64),estado:'confirmado',http_status:200,resultado:{codigo:'SINTETICO',referencias:[{recurso:resource,id:identifier}]},alcance:{plataformas:[],referencias:[]},ids_bitacora:[id],...patch};
        const M=require('../backend/models/comandos.model');await db.query(M.INSERT_SQL,M.FIELDS.map(k=>row[k]));
    }
    async function rejected(name,work,codes=['23514'],deferred=false){
        const summarySQL=`SELECT (SELECT count(*)::int FROM bitacora) audit,(SELECT count(*)::int FROM comandos_idempotentes) ledger,
            (SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id_operacion_tour)::text,'[]')) FROM operaciones_tour t) operaciones,
            (SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id_transporte_operacion)::text,'[]')) FROM transportes_operacion t) transportes,
            (SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id_daily_observacion)::text,'[]')) FROM daily_observaciones t) daily`;
        const baseline=(await db.query(summarySQL)).rows[0];
        await db.query('BEGIN');let caught,stage='statement';
        try{await work();stage='commit';await db.query('COMMIT');}
        catch(e){caught=e;await db.query('ROLLBACK');}
        if(!caught)throw Error('EXPECTED_REJECTION: '+name);
        assert.ok(codes.includes(caught.code),name+': '+caught.code+' '+caught.message);
        if(deferred)assert.equal(stage,'commit',name+' must fail at COMMIT');
        const after=(await db.query(summarySQL)).rows[0];
        assert.deepEqual(after,baseline,name+' must roll back all effects');
        report.rollbacks??=[];report.rollbacks.push({name,code:caught.code,stage,before:baseline,after});check(name);
    }
    const actual=(await db.query("SELECT to_jsonb(b)-ARRAY['version_auditoria','origen','instante','usuario_nombre_snapshot','id_operacion_tour','id_transporte_operacion','id_daily_observacion','valores_anteriores','valores_nuevos','motivo','comando_generacion','comando_clave'] fila FROM bitacora b ORDER BY id_bitacora")).rows;
    assert.deepEqual(actual,historic);check('Historicos conservados integramente incluidos NULL y acciones de integracion');
    await db.query("INSERT INTO bitacora(id_usuario,id_reservacion,accion,descripcion,fecha) VALUES ($1,$2,'MODIFICAR','Insercion historica compatible',CURRENT_TIMESTAMP)",[actor,f.records[0].reservaciones]);
    check('Runtime conserva INSERT historico de Reservaciones y lectura');
    const accepted=[];
    async function transactionProof(resource,resourceId,auditId,key){
        const [table,pk]=resource==='operaciones'?['operaciones_tour','id_operacion_tour']:resource==='transportes'?['transportes_operacion','id_transporte_operacion']:['daily_observaciones','id_daily_observacion'];
        const row=(await db.query(`SELECT (SELECT xmin::text FROM ${table} WHERE ${pk}=$1) negocio,(SELECT xmin::text FROM bitacora WHERE id_bitacora=$2) auditoria,(SELECT xmin::text FROM comandos_idempotentes WHERE generacion_datos=$3 AND id_usuario=$4 AND clave=$5) comando`,[resourceId,auditId,gen,actor,key])).rows[0];
        assert.ok(row.negocio);assert.equal(row.negocio,row.auditoria);assert.equal(row.auditoria,row.comando);
        report.transactionProofs??=[];report.transactionProofs.push({resource,resourceId,auditId,...row});
    }
    for(const resource of ['operaciones','transportes','daily']){
        const v=defaults(resource);
        let transportParent;
        if(resource==='transportes')transportParent=(await admin.query("INSERT INTO operaciones_tour(fecha,id_tour,hora_inicio,turno,numero_grupo,estado) VALUES ('2099-02-01',$1,'07:00','Mañana',1,'Preparada') RETURNING id_operacion_tour",[f.tour])).rows[0].id_operacion_tour;
        await db.query('BEGIN');
        if(resource==='operaciones'){
            v.id=(await db.query("INSERT INTO operaciones_tour(fecha,id_tour,hora_inicio,turno,numero_grupo,estado) VALUES ('2099-01-01',$1,'07:00','Mañana',1,'Preparada') RETURNING id_operacion_tour",[f.tour])).rows[0].id_operacion_tour;v.after.fecha='2099-01-01';
        }else if(resource==='transportes'){
            v.id=(await db.query("INSERT INTO transportes_operacion(id_operacion_tour,estado) VALUES ($1,'Preparado') RETURNING id_transporte_operacion",[transportParent])).rows[0].id_transporte_operacion;v.after.id_operacion_tour=transportParent;
        }else{
            v.id=(await db.query("INSERT INTO daily_observaciones(fecha,observaciones) VALUES ('2099-03-01','Daily sintetico') RETURNING id_daily_observacion")).rows[0].id_daily_observacion;v.after.fecha='2099-03-01';
        }
        const id=await audit(v);await command(v,id);await transactionProof(resource,v.id,id,v.key);await db.query('COMMIT');accepted.push({resource,id,key:v.key});
        check('Referencia valida '+resource+' con auditoria ANTES del ledger y motivo opcional');
    }
    const modified=defaults();modified.action='MODIFICAR';modified.before={...operation};modified.after.estado='Ajustada';modified.reason='Ajuste humano sintetico';
    await db.query('BEGIN');await db.query("UPDATE operaciones_tour SET estado='Ajustada' WHERE id_operacion_tour=$1",[op]);const mid=await audit(modified);await command(modified,mid);await transactionProof('operaciones',op,mid,modified.key);await db.query('COMMIT');
    check('Modificacion efectiva con instantaneas distintas y motivo humano');
    for(const resource of ['transportes','daily']){
        const v=defaults(resource);v.action='MODIFICAR';v.reason='Correccion humana sintetica';v.before=structuredClone(v.after);
        await db.query('BEGIN');
        if(resource==='transportes'){
            v.after.observaciones_operador='Nueva nota sintetica';await db.query('UPDATE transportes_operacion SET observaciones_operador=$1 WHERE id_transporte_operacion=$2',[v.after.observaciones_operador,v.id]);
        }else{
            v.after.observaciones='';await db.query("UPDATE daily_observaciones SET observaciones='',ultima_actualizacion=CURRENT_TIMESTAMP WHERE id_daily_observacion=$1",[v.id]);
        }
        const id=await audit(v);await command(v,id);await transactionProof(resource,v.id,id,v.key);await db.query('COMMIT');
        check('Modificacion real '+resource+' y auditoria y ledger comparten transaccion');
    }
    const reasonBoundary=defaults('daily');reasonBoundary.reason='😀'.repeat(500);await db.query('BEGIN');const rid=await audit(reasonBoundary);await command(reasonBoundary,rid);await db.query('COMMIT');
    check('Motivo opcional de alta acepta limite de 500 caracteres Unicode');
    for(const resource of ['operaciones','transportes','daily'])await rejected('FK inexistente '+resource,()=>audit({...defaults(resource),id:2147483647}),['23503']);
    await rejected('Dos referencias de recurso incompatibles',()=>audit({...defaults(),extra:{id_transporte_operacion:tr}}));
    await rejected('Referencia de reservacion no admitida en formato nuevo',()=>audit({...defaults(),reservation:f.records[0].reservaciones}));
    for(const [field,value]of [['action','CANCELAR'],['origin','SISTEMA'],['origin',null],['name','   '],['version',3]])await rejected('Valor invalido '+field+' '+String(value),()=>audit({...defaults(),[field]:value}));
    await rejected('Formato historico no puede contener campos nuevos',()=>audit({...defaults(),extra:{version_auditoria:null}}));
    const invalidSnapshots=[['objeto vacio',{}],['array',[]],['escalar','texto'],['JSON null',null],['clave faltante',(({estado,...rest})=>rest)(operation)],['clave JWT',{...operation,jwt:'SYNTHETIC_NOT_A_TOKEN'}],['ID texto',{...operation,id_tour:String(f.tour)}],['ID enorme',{...operation,id_tour:2147483648}],['fecha imposible',{...operation,fecha:'2098-02-30'}],['turno invalido',{...operation,turno:'Noche'}],['grupo invalido',{...operation,numero_grupo:3}],['hora invalida',{...operation,hora_inicio:'25:00:00'}],['guia objeto',{...operation,id_guia:{id:1}}],['estado nulo',{...operation,estado:null}]];
    for(const [label,value]of invalidSnapshots)await rejected('Snapshot invalido '+label,()=>audit({...defaults(),after:value}));
    await rejected('Snapshot transporte no permite password',()=>audit({...defaults('transportes'),after:{...transport,password:'SYNTHETIC'}}));
    await rejected('Snapshot Daily no permite token',()=>audit({...defaults('daily'),after:{...daily,token:'SYNTHETIC'}}));
    await rejected('Snapshot Daily requiere observaciones texto',()=>audit({...defaults('daily'),after:{...daily,observaciones:null}}));
    await rejected('Snapshot transporte requiere notas texto o null',()=>audit({...defaults('transportes'),after:{...transport,observaciones_operador:[]}}));
    for(const reason of [null,'','   ','x'.repeat(501),'\u00a0','\ufeff','\u2000','\t\u202f\n'])await rejected('Motivo obligatorio invalido '+JSON.stringify(reason),()=>audit({...defaults(),action:'MODIFICAR',before:{...operation,estado:'Anterior'},reason}));
    await rejected('Modificacion sin cambio real',()=>audit({...defaults(),action:'MODIFICAR',before:operation,reason:'No cambia'}));
    await rejected('Creacion no admite snapshot previo',()=>audit({...defaults(),before:operation}));
    await rejected('Modificacion requiere snapshot previo valido',()=>audit({...defaults(),action:'MODIFICAR',before:{},reason:'Prueba'}));
    await rejected('Usuario inexistente',()=>audit({...defaults(),user:2147483647}),['23503']);
    async function deferredCase(name,patch={},modifyAudit={}){await rejected(name,async()=>{
        await db.query("UPDATE operaciones_tour SET estado='Cambio a revertir' WHERE id_operacion_tour=$1",[op]);
        const v={...defaults(),...modifyAudit};const id=await audit(v);if(patch!==null)await command(v,id,patch);
    },['23503','23514'],true);}
    await deferredCase('COMMIT sin comando revierte negocio y auditoria',null);
    await deferredCase('COMMIT comando rechazado revierte conjunto',{estado:'rechazado',http_status:409});
    await deferredCase('COMMIT usuario de comando distinto revierte conjunto',{id_usuario:actor2});
    await deferredCase('COMMIT clave de comando distinta revierte conjunto',{clave:crypto.randomUUID()});
    await deferredCase('COMMIT recurso incorrecto revierte conjunto',{recurso:'reservaciones'});
    await deferredCase('COMMIT identificador incorrecto revierte conjunto',{id_recurso:'2147483647'});
    await deferredCase('COMMIT recibo sin auditoria revierte conjunto',{ids_bitacora:[]});
    await deferredCase('COMMIT recibo con ID incorrecto revierte conjunto',{ids_bitacora:[2147483647]});
    await deferredCase('COMMIT recibo con IDs adicionales revierte conjunto',{ids_bitacora:[1,2]});
    await deferredCase('COMMIT metodo incorrecto revierte conjunto',{metodo:'PATCH'});
    await deferredCase('COMMIT ruta incorrecta revierte conjunto',{ruta:'/api/transportes'});
    await deferredCase('COMMIT generacion de auditoria distinta revierte conjunto',{generacion_datos:gen}, {generation:crypto.randomUUID()});
    for(const resource of ['transportes','daily'])await rejected('Fallo diferido revierte datos completos de '+resource,async()=>{
        const v=defaults(resource);v.action='MODIFICAR';v.reason='Cambio sintetico que debe revertirse';v.before=structuredClone(v.after);
        if(resource==='transportes'){
            v.before.observaciones_operador='Nueva nota sintetica';v.after.observaciones_operador='No debe persistir';
            await db.query('UPDATE transportes_operacion SET observaciones_operador=$1 WHERE id_transporte_operacion=$2',[v.after.observaciones_operador,v.id]);
        }else{
            v.before.observaciones='';v.after.observaciones='No debe persistir';
            await db.query('UPDATE daily_observaciones SET observaciones=$1,ultima_actualizacion=CURRENT_TIMESTAMP WHERE id_daily_observacion=$2',[v.after.observaciones,v.id]);
        }
        const id=await audit(v);await command(v,id,{ids_bitacora:[]});
    },['23514'],true);
    await rejected('Fallo de ledger revierte cambio de negocio y auditoria previa',async()=>{
        const v=defaults();await db.query("UPDATE operaciones_tour SET estado='No debe persistir' WHERE id_operacion_tour=$1",[op]);
        const id=await audit(v);await command(v,id,{generacion_datos:crypto.randomUUID()});
    },['42501']);
    await rejected('020 rechaza generacion incorrecta del ledger sin debilitar guardia',async()=>{const v={...defaults(),generation:crypto.randomUUID()};await command(v,123);},['42501']);
    await rejected('Daily fecha de recurso y snapshot deben coincidir',async()=>{const v={...defaults('daily'),after:{...daily,fecha:'2098-01-02'}};const id=await audit(v);await command(v,id);},['23514'],true);
    await rejected('Una intencion no puede duplicar auditoria',async()=>{const v=defaults();await audit(v);await audit(v);},['23505']);
    await rejected('Repeticion de intencion confirmada no crea otra auditoria',()=>audit({...defaults(),key:accepted[0].key}),['23505']);
    for(const sql of ['UPDATE bitacora SET descripcion=descripcion','DELETE FROM bitacora','TRUNCATE bitacora','ALTER TABLE bitacora ADD COLUMN intruso text','ALTER TABLE bitacora DISABLE TRIGGER ALL','DROP FUNCTION public.ctsk_comando_auditoria_021() CASCADE','CREATE OR REPLACE FUNCTION public.ctsk_comando_auditoria_021() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$'])await rejected('Runtime denegado '+sql,()=>db.query(sql),['42501']);
    await rejected('Comandos 020 siguen inmutables',()=>db.query('UPDATE comandos_idempotentes SET ids_bitacora=ARRAY[]::integer[]'),['42501']);
    for(const sql of ["UPDATE bitacora SET descripcion='Alterada'","DELETE FROM bitacora","TRUNCATE bitacora"]){await admin.query('BEGIN');await admin.query('SET LOCAL ROLE ctsk_standalone_owner');await assert.rejects(()=>admin.query(sql),e=>e.code==='42501');await admin.query('ROLLBACK');check('Trigger protege incluso owner: '+sql);}
    for(const sql of ['ALTER TABLE bitacora DISABLE TRIGGER ctsk_audit_command_021','ALTER TABLE bitacora DROP CONSTRAINT chk_bitacora_formato_021','DROP INDEX idx_bitacora_fecha_021','GRANT UPDATE ON bitacora TO ctsk_standalone_runtime','GRANT SELECT ON bitacora TO PUBLIC','GRANT EXECUTE ON FUNCTION ctsk_snapshot_valido_021(text,jsonb) TO PUBLIC','ALTER TABLE bitacora ADD COLUMN alterada text',"CREATE OR REPLACE FUNCTION public.ctsk_comando_auditoria_021() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$"]){
        await admin.query('BEGIN');await admin.query(sql);await admin.query('SET LOCAL ROLE ctsk_standalone_runtime');
        try{await assert.rejects(()=>S.verifySchema(admin),e=>e.code==='AUDIT_SCHEMA_INVALID');}finally{await admin.query('ROLLBACK');}
        await S.verifySchema(db);check('Verificador rechaza esquema alterado: '+sql);
    }
    for(const file of ['standalonePolicy','revisionLabPolicy','revisionApiPolicy','commandApiPolicy'])assert.throws(()=>require('../backend/config/'+file).validateManifest(plan.manifest,plan.manifest.root));
    check('Todos los lectores de perfiles anteriores rechazan manifiesto 021');
    await require('../backend/config/commandSchema').verifySchema(db,gen);await require('../backend/config/revisionSchema').verifySchema(db);
    check('Verificadores 019 y ledger 020 conservan su estructura y privilegios exactos');
    await assert.rejects(()=>fetch('https://example.invalid'),e=>e.code==='STANDALONE_NETWORK_BLOCKED');
    assert.throws(()=>require('node:dgram').createSocket('udp4'),e=>e.code==='STANDALONE_NETWORK_BLOCKED');
    assert.throws(()=>require('node:net').connect({host:'127.0.0.1',port:5432}),e=>e.code==='STANDALONE_NETWORK_BLOCKED');
    check('Red ajena, PostgreSQL 5432, fetch y UDP bloqueados antes de conectar');
    report.accepted=accepted;report.finalCounts=(await db.query('SELECT (SELECT count(*)::int FROM bitacora) auditorias,(SELECT count(*)::int FROM comandos_idempotentes) comandos')).rows[0];
}
module.exports={run};
