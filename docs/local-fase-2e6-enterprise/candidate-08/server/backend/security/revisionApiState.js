const {TABLES}=require('../config/desktopSchema');
const revised=new Set(['reservaciones','operaciones_tour','transportes_operacion']);
const publicUser=`jsonb_build_object('id_usuario',t.id_usuario,'nombre',t.nombre,'correo',t.correo,
    'id_rol',t.id_rol,'estado',t.estado,'alcance_plataformas',t.alcance_plataformas,
    'platform_ids',ARRAY(SELECT p.id_plataforma FROM public.usuario_plataformas_visibles p WHERE p.id_usuario=t.id_usuario ORDER BY p.id_plataforma),
    '_mvcc',t.xmin::text)`;
async function record(db,spec,{publicUsers=false,credentialVersion=false}={}){
    if(spec.id===null)return {revision:null,value:'new'};
    const table=spec.table,revision=revised.has(table)?'revision::text':'NULL::text';
    // Texto JSONB generado en PostgreSQL: conserva precisión de números/fechas.
    const state=publicUsers&&table==='usuarios'?`(${publicUser}${credentialVersion?"||jsonb_build_object('cv',t.version_credenciales::text)":''})::text`:revised.has(table)?'to_jsonb(t)::text':"(to_jsonb(t)||jsonb_build_object('_mvcc',t.xmin::text))::text";
    const row=(await db.query(`SELECT ${revision} revision,${state} value FROM public.${table} t WHERE ${spec.pk}=$1`,[spec.id])).rows[0];
    return row||{revision:null,value:'absent'};
}
async function context(db,{publicUsers=false,credentialVersion=false}={}){
    const result={};
    // Contexto deliberadamente conservador de laboratorio. Incluye filas vacías,
    // catálogos, permisos, vínculos y eventos; nunca se envía su contenido al cliente.
    for(const table of TABLES.filter(t=>t!=='bitacora')){
        const row=publicUsers&&table==='usuarios'?`(${publicUser}${credentialVersion?"||jsonb_build_object('cv',t.version_credenciales::text)":''})`:revised.has(table)?'to_jsonb(t)':"to_jsonb(t)||jsonb_build_object('_mvcc',t.xmin::text)";
        result[table]=(await db.query(`SELECT COALESCE(jsonb_agg(v ORDER BY v::text),'[]'::jsonb)::text value FROM (SELECT ${row} v FROM public.${table} t) s`)).rows[0].value;
    }
    return result;
}
module.exports={record,context};
