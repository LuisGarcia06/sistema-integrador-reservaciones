'use strict';
const old=require('./adminAuditSchema'),C=require('./credentialSchemaContract');
const SQL=`SELECT
 (SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'nullable',NOT a.attnotnull,'identity',a.attidentity,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY c.relname,a.attnum)
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
 LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
 WHERE n.nspname='public' AND c.relname IN ('usuarios','inicializacion_sistema') AND a.attnum>0 AND NOT a.attisdropped) columns,
 (SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',k.conname,'type',k.contype,'validated',k.convalidated,'definition',pg_get_constraintdef(k.oid)) ORDER BY c.relname,k.conname)
 FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('usuarios','inicializacion_sistema')) constraints,
 (SELECT jsonb_agg(jsonb_build_object('table',t.relname,'name',c.relname,'definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready,'unique',i.indisunique) ORDER BY t.relname,c.relname)
 FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname IN ('usuarios','inicializacion_sistema')) indexes,
 (SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) ORDER BY c.relname,t.tgname)
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('usuarios','inicializacion_sistema') AND NOT t.tgisinternal) triggers,
 (SELECT jsonb_agg(jsonb_build_object('table',c.relname,'owner',pg_get_userbyid(c.relowner),'acl',COALESCE((SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee=0,pg_get_userbyid(a.grantee),a.privilege_type)
 FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a),'[]'::jsonb)) ORDER BY c.relname)
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('usuarios','inicializacion_sistema')) tables_acl,
 (SELECT jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'grantee',grantee,'privilege',privilege_type,'grantable',is_grantable) ORDER BY table_name,column_name,grantee,privilege_type)
 FROM information_schema.column_privileges WHERE table_schema='public' AND table_name IN ('usuarios','inicializacion_sistema')) columns_acl,
 (SELECT jsonb_agg(jsonb_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,'config',p.proconfig,
 'acl',COALESCE((SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee=0,pg_get_userbyid(a.grantee),a.privilege_type)
 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a),'[]'::jsonb)) ORDER BY p.proname)
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'ctsk%023') functions,
 (SELECT jsonb_build_object('collate',datcollate,'ctype',datctype,'encoding',pg_encoding_to_char(encoding)) FROM pg_database WHERE datname=current_database()) locale`;
async function inspect(db){return (await db.query(SQL)).rows[0];}
function validate(row){if(!row||old.digest(row)!==C.CATALOG_SHA)throw Object.assign(Error('CREDENTIAL_SCHEMA_INVALID'),{code:'CREDENTIAL_SCHEMA_INVALID'});}
async function verify(db,generation){
    const base=require('./desktopSchema'),row=(await db.query(base.SCHEMA_SQL)).rows[0];
    if(JSON.stringify([...row.tables].sort())!==JSON.stringify([...base.TABLES,'comandos_idempotentes','inicializacion_sistema'].sort()))throw Error('CREDENTIAL_SCHEMA_INVALID');
    base.validateSchema({...row,tables:row.tables.filter(t=>!['comandos_idempotentes','inicializacion_sistema'].includes(t))});
    await require('./revisionSchema').verifySchema(db);await old.verifyLedger(db,generation);await old.verifySchema(db);validate(await inspect(db));
}
module.exports={SQL,inspect,validate,verify,digest:old.digest};
