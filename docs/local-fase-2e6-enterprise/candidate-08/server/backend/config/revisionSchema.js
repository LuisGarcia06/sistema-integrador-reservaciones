const C = require('./revisionSchemaContract');
const fail = () => {throw Object.assign(Error('REVISION_SCHEMA_INVALID'),{code:'REVISION_SCHEMA_INVALID'});};
const SQL = `SELECT
 (SELECT json_agg(json_build_object('table',c.relname,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
 'notnull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated,
 'insert',has_column_privilege(current_user,c.oid,a.attnum,'INSERT'),'update',has_column_privilege(current_user,c.oid,a.attnum,'UPDATE'),
 'select',has_column_privilege(current_user,c.oid,a.attnum,'SELECT')) ORDER BY c.relname,a.attnum)
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
 WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped) AS columns,
 (SELECT json_agg(json_build_object('table',r.relname,'name',c.conname,'type',c.contype,'validated',c.convalidated,
 'deferrable',c.condeferrable,'definition',pg_get_constraintdef(c.oid)))
 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
 WHERE n.nspname='public' AND r.relname=ANY($1::text[]) AND c.contype='c' AND c.conname LIKE '%revision%') AS checks,
 (SELECT json_agg(json_build_object('table',c.relname,'owner',pg_get_userbyid(c.relowner),
 'insert',has_table_privilege(current_user,c.oid,'INSERT'),'update',has_table_privilege(current_user,c.oid,'UPDATE'),
 'delete',has_table_privilege(current_user,c.oid,'DELETE'),'truncate',has_table_privilege(current_user,c.oid,'TRUNCATE'),
 'trigger',has_table_privilege(current_user,c.oid,'TRIGGER'),'references',has_table_privilege(current_user,c.oid,'REFERENCES'),
 'kind',c.relkind,'rules',c.relhasrules,'rls',c.relrowsecurity))
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])) AS tables,
 (SELECT json_agg(json_build_object('table',c.relname,'name',t.tgname,'enabled',t.tgenabled,'type',t.tgtype,
 'arguments',t.tgnargs,'when',t.tgqual IS NOT NULL,'constraint',t.tgconstraint::text,'function',p.proname,'schema',pn.nspname,
 'columns',t.tgattr::text,'oldTable',t.tgoldtable,'newTable',t.tgnewtable))
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace
 WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND NOT t.tgisinternal) AS triggers,
 (SELECT json_agg(json_build_object('body',p.prosrc,'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,
 'language',l.lanname,'arguments',p.pronargs,'kind',p.prokind,'return',p.prorettype::regtype::text,
 'volatile',p.provolatile,'config',p.proconfig,'execute',has_function_privilege(current_user,p.oid,'EXECUTE'),
 'publicExecute',EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) x WHERE x.grantee=0 AND x.privilege_type='EXECUTE')))
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
 WHERE n.nspname='public' AND p.proname=$2) AS functions,
 has_parameter_privilege(current_user,'session_replication_role','SET') AS replication_set`;
const normalize = value => String(value).replace(/\r\n/g,'\n');
function validateSchema(row) {
    if (!row || row.replication_set !== false || row.tables?.length !== 3 || row.checks?.length !== 3 || row.triggers?.length !== 3 || row.functions?.length !== 1) fail();
    for (const [table, columns] of Object.entries(C.TABLES)) {
        const meta = row.tables.find(r=>r.table===table);
        if (!meta || meta.owner !== C.OWNER || meta.kind !== 'r' || meta.rules !== false || meta.rls !== false ||
            ['insert','update','delete','truncate','trigger','references'].some(k=>meta[k]!==false)) fail();
        const cols = row.columns?.filter(c=>c.table===table);
        if (cols?.length !== columns.length+1 || columns.some(name=>!cols.some(c=>c.name===name))) fail();
        for (const col of cols) {
            const writable = columns.slice(1).includes(col.name);
            if (col.insert !== writable || col.update !== writable || col.select !== true) fail();
        }
        const rev = cols.find(c=>c.name==='revision');
        if (!rev || rev.type !== 'bigint' || rev.notnull !== true || rev.default !== '1' || rev.identity !== '' || rev.generated !== '') fail();
        const check = row.checks.find(c=>c.table===table);
        if (!check || check.name !== `chk_${table}_revision_019` || check.type !== 'c' || !check.validated || check.deferrable ||
            check.definition.replace(/\s/g,'') !== 'CHECK((revision>0))') fail();
        const trigger = row.triggers.find(t=>t.table===table);
        if (!trigger || trigger.name !== C.TRIGGER || trigger.enabled !== 'A' || trigger.type !== 23 || trigger.arguments !== 0 || trigger.when ||
            trigger.constraint !== '0' || trigger.function !== C.FUNCTION || trigger.schema !== 'public' || trigger.columns !== '' ||
            trigger.oldTable !== null || trigger.newTable !== null) fail();
    }
    const f = row.functions[0];
    if (normalize(f.body) !== C.BODY || f.owner !== C.OWNER || f.definer !== false || f.language !== 'plpgsql' || f.arguments !== 0 || f.kind !== 'f' ||
        f.return !== 'trigger' || f.volatile !== 'v' || JSON.stringify(f.config) !== '["search_path=pg_catalog"]' || !f.execute || f.publicExecute) fail();
}
async function verifySchema(db) {
    validateSchema((await db.query(SQL,[Object.keys(C.TABLES),C.FUNCTION])).rows[0]);
    // Mismas dependencias 018 que comprueba el servicio independiente existente.
    // 019 no puede aceptar un esquema degradado a 017.
    try {
        await db.query('SELECT aviso_publicado FROM public.eventos_integracion LIMIT 0');
        await db.query('SELECT avisos_activados FROM public.integracion_sync_estado LIMIT 0');
    } catch (error) { if (error.code === '42703' || error.code === '42P01') fail(); throw error; }
}
module.exports = {SQL,validateSchema,verifySchema};
