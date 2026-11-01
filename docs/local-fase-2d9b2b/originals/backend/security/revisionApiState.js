const {TABLES}=require('../config/desktopSchema');
const revised=new Set(['reservaciones','operaciones_tour','transportes_operacion']);
async function record(db,spec){
    if(spec.id===null)return {revision:null,value:'new'};
    const table=spec.table,revision=revised.has(table)?'revision::text':'NULL::text';
    // Texto JSONB generado en PostgreSQL: conserva precisión de números/fechas.
    const state=revised.has(table)?'to_jsonb(t)::text':"(to_jsonb(t)||jsonb_build_object('_mvcc',t.xmin::text))::text";
    const row=(await db.query(`SELECT ${revision} revision,${state} value FROM public.${table} t WHERE ${spec.pk}=$1`,[spec.id])).rows[0];
    return row||{revision:null,value:'absent'};
}
async function context(db){
    const result={};
    // Contexto deliberadamente conservador de laboratorio. Incluye filas vacías,
    // catálogos, permisos, vínculos y eventos; nunca se envía su contenido al cliente.
    for(const table of TABLES.filter(t=>t!=='bitacora')){
        const row=revised.has(table)?'to_jsonb(t)':"to_jsonb(t)||jsonb_build_object('_mvcc',t.xmin::text)";
        result[table]=(await db.query(`SELECT COALESCE(jsonb_agg(v ORDER BY v::text),'[]'::jsonb)::text value FROM (SELECT ${row} v FROM public.${table} t) s`)).rows[0].value;
    }
    return result;
}
module.exports={record,context};
