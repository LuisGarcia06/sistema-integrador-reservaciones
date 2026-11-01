'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),C=require('./manualReferences025Contract');
function feature(plan){const p=plan.manifest.manualReferences025;if(!p)return false;if(plan.config.APP_ENVIRONMENT!=='preproduction023-local'||Object.keys(p).sort().join()!=='migration,purpose'||p.purpose!==C.PURPOSE||p.migration!==C.SHA)throw Error('REFERENCES025_PROFILE');if(crypto.createHash('sha256').update(fs.readFileSync(path.join(plan.manifest.root,C.FILE),'utf8').replace(/\r\n/g,'\n')).digest('hex')!==C.SHA)throw Error('REFERENCES025_CODE');return true;}
async function verify(db,plan){
 if(!feature(plan))return;
 const tables=(await db.query("SELECT c.relname,pg_get_userbyid(c.relowner) owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='ctsk_refs025' AND c.relkind='r'")).rows;
 if(tables.length!==1||tables[0].relname!=='manual_refs'||tables[0].owner!=='ctsk_standalone_owner')throw Error('REFERENCES025_TABLE');
 const fields=(await db.query("SELECT attname,format_type(atttypid,atttypmod) type FROM pg_attribute WHERE attrelid='ctsk_refs025.manual_refs'::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum")).rows;
 const names=['id','reservation_id','platform_id','provider','reference','reference_key','kind','verification','actor','associated_at','active','retired_by','retired_at','reason'],types=['bigint','integer','integer','text','character varying(100)','character varying(100)','text','text','integer','timestamp with time zone','boolean','integer','timestamp with time zone','text'];
 if(JSON.stringify(fields)!==JSON.stringify(names.map((attname,i)=>({attname,type:types[i]}))))throw Error('REFERENCES025_COLUMNS');
 const f=(await db.query("SELECT p.prosrc,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='ctsk_refs025'")).rows,body=fs.readFileSync(path.join(plan.manifest.root,C.FILE),'utf8').replace(/\r\n/g,'\n').split('$refs025$')[1];
 if(f.length!==1||f[0].prosrc!==body||f[0].prosecdef||f[0].owner!=='ctsk_standalone_owner'||JSON.stringify(f[0].proconfig)!=='["search_path=pg_catalog"]')throw Error('REFERENCES025_FUNCTION');
 const triggers=(await db.query("SELECT tgname,tgenabled FROM pg_trigger WHERE tgrelid='ctsk_refs025.manual_refs'::regclass AND NOT tgisinternal ORDER BY tgname")).rows;
 if(JSON.stringify(triggers)!==JSON.stringify(['protect_reference_history_025','protect_reference_truncate_025'].map(tgname=>({tgname,tgenabled:'A'}))))throw Error('REFERENCES025_TRIGGERS');
 const indexes=(await db.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='ctsk_refs025' ORDER BY indexname")).rows;
 if(indexes.length!==3||!indexes.some(x=>x.indexname==='manual_ref_identity_025'&&x.indexdef.includes('UNIQUE')&&x.indexdef.includes('(provider, reference_key) WHERE active'))||!indexes.some(x=>x.indexname==='manual_ref_reservation_025'&&x.indexdef.includes('UNIQUE')&&x.indexdef.includes('(reservation_id) WHERE active')))throw Error('REFERENCES025_UNIQUENESS');
 const grants=(await db.query("SELECT has_table_privilege(current_user,'ctsk_refs025.manual_refs','INSERT') i,has_table_privilege(current_user,'ctsk_refs025.manual_refs','DELETE') d,has_table_privilege(current_user,'ctsk_refs025.manual_refs','TRUNCATE') t,has_column_privilege(current_user,'ctsk_refs025.manual_refs','reference','UPDATE') u,has_column_privilege(current_user,'ctsk_refs025.manual_refs','active','UPDATE') a,has_schema_privilege(current_user,'ctsk_refs025','CREATE') c")).rows[0];
 if(!grants.i||grants.d||grants.t||grants.u||!grants.a||grants.c)throw Error('REFERENCES025_PRIVILEGES');
}
module.exports={feature,verify,C};
