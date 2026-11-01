'use strict';
// Verificador puro: nunca importa pool, HTTP, Electron o servicios de negocio.
const prior=require('./auditSchema'),C=require('./adminAuditSchemaContract');
const SQL=prior.SQL.replace("p.proname LIKE 'ctsk%021'",()=>"p.proname ~ '^ctsk.*_02[12]$'");
const EXTRA=`SELECT current_setting('session_replication_role') replication_role,
    has_schema_privilege(current_user,'public','CREATE') schema_create,
    has_database_privilege(current_user,current_database(),'CREATE') database_create,
    has_database_privilege(current_user,current_database(),'TEMP') database_temp,
    (SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
        'type',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee=0,pg_get_userbyid(a.grantee),a.privilege_type)
     FROM pg_namespace n,LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='public') schema_acl,
    (SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled,
        'deferrable',t.tgdeferrable,'deferred',t.tginitdeferred,'function',p.proname,'schema',n.nspname) ORDER BY t.tgname)
     FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE t.tgrelid='public.comandos_idempotentes'::regclass AND NOT t.tgisinternal) ledger_triggers`;
async function inspect(db){
    return {...(await db.query(SQL)).rows[0],environment:(await db.query(EXTRA)).rows[0],role:(await db.query(require('./desktopPostgres').ROLE_SQL)).rows[0]};
}
function validate(row){
    if(!row||!Array.isArray(row.functions)||prior.digest(row.functions)!==C.FUNCTIONS_SHA||prior.digest(row)!==C.CATALOG_SHA)
        throw Object.assign(Error('ADMIN_AUDIT_SCHEMA_INVALID'),{code:'ADMIN_AUDIT_SCHEMA_INVALID'});
}
async function verifySchema(db){validate(await inspect(db));}
async function verifyLedger(db,generation){
    const ledger=require('./commandSchema'),{row,extra}=await ledger.inspect(db);
    const extended=row.triggers?.filter(t=>t.name==='ctsk_admin_ledger_audit_022');
    if(extended?.length!==1)throw Object.assign(Error('ADMIN_AUDIT_SCHEMA_INVALID'),{code:'ADMIN_AUDIT_SCHEMA_INVALID'});
    // Proyeccion optativa 022. El contrato viejo NO acepta esta base; su unica
    // diferencia autorizada se verifica completa en el digest de ledger_triggers.
    ledger.validate({...row,triggers:row.triggers.filter(t=>t.name!=='ctsk_admin_ledger_audit_022')},extra,generation);
}
module.exports={SQL,EXTRA,canonical:prior.canonical,digest:prior.digest,inspect,validate,verifySchema,verifyLedger};
