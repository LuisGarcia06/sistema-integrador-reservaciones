'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),C=require('./integration024Contract');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function feature(plan,required=false){const f=plan.manifest.integration024;if(!f&&!required)return false;if(!f||plan.config.APP_ENVIRONMENT!=='preproduction023-local'||Object.keys(f).sort().join()!=='migration,purpose'||f.purpose!==C.PURPOSE||f.migration!==C.SHA)throw Error('SYNC024_PROFILE_REQUIRED');if(sha(fs.readFileSync(path.join(plan.manifest.root,C.FILE),'utf8').replace(/\r\n/g,'\n'))!==C.SHA)throw Error('SYNC024_SOURCE_CHANGED');return true;}
const columns={first_activation_at:'timestamp with time zone',activation_user:'integer',activation_reason:'text',automation_enabled:'boolean',authorized_user:'integer',authorized_cv:'bigint',authorized_epoch:'uuid',confirmed_through:'timestamp with time zone',attempt_at:'timestamp with time zone',attempt_result:'text',pending_error:'text',retry_after:'timestamp with time zone',run_id:'uuid',run_instance:'uuid',run_until:'timestamp with time zone',pending_window:'jsonb'};
async function verify(db,plan){
 feature(plan,true);
 const fields=(await db.query("SELECT a.attname name,format_type(a.atttypid,a.atttypmod) type FROM pg_attribute a WHERE a.attrelid='public.integracion_sync_estado'::regclass AND a.attnum>0 AND NOT a.attisdropped")).rows;
 if(Object.entries(columns).some(([name,type])=>!fields.some(f=>f.name===name&&f.type===type)))throw Error('SYNC024_SCHEMA_INVALID');
 const tables=(await db.query("SELECT c.relname,pg_get_userbyid(c.relowner) owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='ctsk_sync024' AND c.relkind='r' ORDER BY c.relname")).rows;
 if(JSON.stringify(tables)!==JSON.stringify([{relname:'admin_receipts',owner:'ctsk_standalone_owner'},{relname:'booking_state',owner:'ctsk_standalone_owner'}]))throw Error('SYNC024_SCHEMA_INVALID');
 const functions=(await db.query("SELECT p.proname,p.prosrc,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='ctsk_sync024' ORDER BY p.proname")).rows;
 const sql=fs.readFileSync(path.join(plan.manifest.root,C.FILE),'utf8').replace(/\r\n/g,'\n'),bodies={protect_cutoff:sql.split('$cut024$')[1],immutable_receipt:sql.split('$receipt024$')[1]};
 if(functions.length!==2||functions.some(f=>f.prosrc!==bodies[f.proname]||f.prosecdef||f.owner!=='ctsk_standalone_owner'||JSON.stringify(f.proconfig)!=='["search_path=pg_catalog"]'))throw Error('SYNC024_FUNCTION_INVALID');
 const grants=(await db.query("SELECT has_schema_privilege(current_user,'ctsk_sync024','CREATE') create_schema,has_table_privilege(current_user,'ctsk_sync024.admin_receipts','UPDATE') update_receipt,has_table_privilege(current_user,'ctsk_sync024.admin_receipts','DELETE') delete_receipt,has_table_privilege(current_user,'ctsk_sync024.admin_receipts','INSERT') insert_receipt,has_table_privilege(current_user,'ctsk_sync024.booking_state','UPDATE') update_state")).rows[0];
 if(grants.create_schema||grants.update_receipt||grants.delete_receipt||!grants.insert_receipt||!grants.update_state)throw Error('SYNC024_PRIVILEGES_INVALID');
 const triggers=(await db.query("SELECT tgname,tgenabled FROM pg_trigger WHERE NOT tgisinternal AND tgname=ANY($1::text[]) ORDER BY tgname",[['protect_first_activation_024','immutable_receipt_024','immutable_receipt_truncate_024']])).rows;
 if(triggers.length!==3||triggers.some(t=>t.tgenabled==='D')||triggers.find(t=>t.tgname==='protect_first_activation_024')?.tgenabled!=='A')throw Error('SYNC024_TRIGGER_INVALID');
}
function allowHttp(method,url){if(typeof url!=='string'||url.includes('?'))return false;if(['GET','HEAD'].includes(method))return url==='/api/sincronizacion/estado'||/^\/api\/sincronizacion\/comandos\/[a-f0-9-]{36}$/.test(url);return method==='POST'&&/^\/api\/sincronizacion\/(fareharbor|getyourguide)\/(activar|estado)$/.test(url);}
module.exports={feature,verify,allowHttp,C};
