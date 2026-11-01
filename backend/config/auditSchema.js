'use strict';
const crypto=require('node:crypto'),C=require('./auditSchemaContract');
const SQL=`SELECT
 (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
 'notnull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid),
 'select',has_column_privilege(current_user,a.attrelid,a.attnum,'SELECT'),
 'insert',has_column_privilege(current_user,a.attrelid,a.attnum,'INSERT'),
 'update',has_column_privilege(current_user,a.attrelid,a.attnum,'UPDATE')) ORDER BY a.attnum)
 FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE a.attrelid='public.bitacora'::regclass AND a.attnum>0 AND NOT a.attisdropped) columns,
 (SELECT jsonb_agg(jsonb_build_object('name',conname,'type',contype,'definition',pg_get_constraintdef(oid),
 'validated',convalidated,'deferrable',condeferrable,'deferred',condeferred) ORDER BY conname)
 FROM pg_constraint WHERE conrelid='public.bitacora'::regclass) constraints,
 (SELECT jsonb_agg(jsonb_build_object('name',c.relname,'definition',pg_get_indexdef(i.indexrelid),
 'valid',i.indisvalid,'ready',i.indisready) ORDER BY c.relname)
 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid='public.bitacora'::regclass) indexes,
 (SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),
 'enabled',t.tgenabled,'deferrable',t.tgdeferrable,'deferred',t.tginitdeferred,'function',p.proname,
 'schema',n.nspname) ORDER BY t.tgname)
 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE t.tgrelid='public.bitacora'::regclass AND NOT t.tgisinternal) triggers,
 (SELECT jsonb_agg(jsonb_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid),
 'owner',pg_get_userbyid(p.proowner),'execute',has_function_privilege(current_user,p.oid,'EXECUTE'),
 'public',EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0),
 'acl',(SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
 'type',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee=0,pg_get_userbyid(a.grantee),a.privilege_type)
 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a)) ORDER BY p.proname)
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname LIKE 'ctsk%021') functions,
 (SELECT jsonb_build_object('owner',pg_get_userbyid(c.relowner),'kind',c.relkind,'rules',c.relhasrules,'rls',c.relrowsecurity,
 'select',has_table_privilege(current_user,c.oid,'SELECT'),'insert',has_table_privilege(current_user,c.oid,'INSERT'),
 'update',has_table_privilege(current_user,c.oid,'UPDATE'),'delete',has_table_privilege(current_user,c.oid,'DELETE'),
 'truncate',has_table_privilege(current_user,c.oid,'TRUNCATE'),'trigger',has_table_privilege(current_user,c.oid,'TRIGGER'),
 'references',has_table_privilege(current_user,c.oid,'REFERENCES'),
 'acl',(SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
 'type',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee=0,pg_get_userbyid(a.grantee),a.privilege_type)
 FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a),
 'column_acl',(SELECT jsonb_agg(jsonb_build_object('column',at.attname,'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
 'type',a.privilege_type,'grantable',a.is_grantable) ORDER BY at.attnum,a.grantee=0,pg_get_userbyid(a.grantee),a.privilege_type)
 FROM pg_attribute at,LATERAL aclexplode(at.attacl) a WHERE at.attrelid=c.oid))
 FROM pg_class c WHERE c.oid='public.bitacora'::regclass) privileges`;
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return typeof value==='string'?value.replace(/\r\n/g,'\n'):value;}
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function validate(row){if(digest(row)!==C.CATALOG_SHA)throw Object.assign(Error('AUDIT_SCHEMA_INVALID'),{code:'AUDIT_SCHEMA_INVALID'});}
async function inspect(db){return (await db.query(SQL)).rows[0];}
async function verifySchema(db){validate(await inspect(db));}
module.exports={SQL,canonical,digest,validate,inspect,verifySchema};
