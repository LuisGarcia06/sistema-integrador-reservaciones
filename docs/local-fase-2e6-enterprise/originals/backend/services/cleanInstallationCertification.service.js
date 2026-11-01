'use strict';
// Verificador de sólo lectura. No es una autorización empresarial ni una limpieza de datos.
const path=require('node:path'),P=require('../config/standalonePolicy');
const tables=Object.freeze([...require('../config/desktopSchema').TABLES.map(n=>'public.'+n),'public.comandos_idempotentes','public.inicializacion_sistema','ctsk_sync024.admin_receipts','ctsk_sync024.booking_state','ctsk_refs025.manual_refs'].sort());
const roles=[{nombre:'Administrador',descripcion:'Usuario con permisos completos'},{nombre:'Consulta',descripcion:'Usuario con permisos de solo lectura'}];
const countries=['No especificado'],platforms=['Externa','FareHarbor','GetYourGuide','WhatsApp Business'];
const technical=new Set(['public.roles','public.paises','public.plataformas','public.integracion_sync_estado']);
const identitySql="SELECT current_database() db,current_user principal,inet_server_port() port,(SELECT system_identifier::text FROM pg_control_system()) cluster,current_setting('data_directory') directory";
async function identity(db,plan){
 const m=plan.manifest;
 if(plan.config?.APP_ENVIRONMENT!=='preproduction023-local'||!['empty','initialized'].includes(m.state)||['sian_kaan_reservaciones','sian_kaan_reservaciones_dev'].includes(m.database))throw Error('CLEAN_REHEARSAL_ONLY');
 P.validateManifest({...m,version:1,environment:'standalone-development'},m.root);P.verifyLocalCluster(m);
 const current=require('../config/preproductionPolicy').readPlan(plan.filename,m.root);if(current.digest!==plan.digest)throw Error('CLEAN_CONFIGURATION_CHANGED');
 const r=(await db.query(identitySql)).rows[0];if(r.db!==m.database||r.principal!=='ctsk_standalone_admin'||r.port!==m.pgPort||r.cluster!==m.cluster||path.resolve(r.directory)!==m.dataDirectory)throw Error('CLEAN_IDENTITY');
}
async function facts(db){
 const actual=(await db.query("SELECT schemaname||'.'||tablename name FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') AND schemaname NOT LIKE 'pg_toast%' ORDER BY 1")).rows.map(r=>r.name);
 const counts={};for(const table of tables){if(!actual.includes(table))continue;counts[table]=(await db.query('SELECT count(*)::int n FROM '+table)).rows[0].n;}
 return {tables:actual,counts,roles:(await db.query('SELECT nombre,descripcion FROM public.roles ORDER BY nombre')).rows,countries:(await db.query('SELECT nombre FROM public.paises ORDER BY nombre')).rows.map(r=>r.nombre),platforms:(await db.query('SELECT nombre FROM public.plataformas ORDER BY nombre')).rows.map(r=>r.nombre),sync:(await db.query('SELECT * FROM public.integracion_sync_estado ORDER BY provider,source')).rows};
}
function errors(f,publicationEnabled){
 const issues=[];if(JSON.stringify(f.tables)!==JSON.stringify(tables))issues.push('TABLE_INVENTORY_MISMATCH');
 for(const t of tables)if(!technical.has(t)&&f.counts[t]!==0)issues.push('NOT_EMPTY:'+t);
 if(f.counts['public.roles']!==2||JSON.stringify(f.roles)!==JSON.stringify(roles))issues.push('TECHNICAL_ROLES_MISMATCH');
 if(f.counts['public.paises']!==1||JSON.stringify(f.countries)!==JSON.stringify(countries))issues.push('TECHNICAL_COUNTRIES_MISMATCH');
 if(f.counts['public.plataformas']!==4||JSON.stringify(f.platforms)!==JSON.stringify(platforms))issues.push('TECHNICAL_PLATFORMS_MISMATCH');
 if(f.counts['public.integracion_sync_estado']!==4||f.sync.length!==4)issues.push('TECHNICAL_SYNC_INVENTORY');
 const identities=new Set();
 for(const row of f.sync){
  const key=row.provider+':'+row.source;identities.add(key);
  if(!['fareharbor','getyourguide'].includes(row.provider)||!['publicacion','automation024'].includes(row.source)||row.last_history_id!==(row.source==='publicacion'?'0':'not-applicable-024'))issues.push('SYNC_UNRECOGNIZED_INITIAL_STATE');
  for(const [field,value]of Object.entries(row)){
   if(['id_integracion_sync_estado','provider','source','last_history_id','created_at','updated_at'].includes(field))continue;
   if(field==='avisos_activados'){if(value!==publicationEnabled)issues.push('PUBLICATION_NOT_INITIAL');}
   else if(['recovery_active','automation_enabled'].includes(field)){if(value!==false)issues.push('AUTOMATION_NOT_DISABLED');}
   else if(value!==null)issues.push('SYNC_HAS_HISTORY:'+field);
  }
 }
 if(identities.size!==4)issues.push('SYNC_DUPLICATE_IDENTITY');
 return [...new Set(issues)];
}
function evaluate(f){const issues=errors(f,false);return {clean:issues.length===0,issues,technicalExceptions:{roles:2,paises:1,plataformas:4,integracion_sync_estado:4},externalCutoffs:false,externalCursors:false,enterpriseCertification:false};}
async function inspect(db,plan){await identity(db,plan);await db.query('BEGIN READ ONLY');try{const state=await facts(db);return {scope:'new-synthetic-cluster-only',database:plan.manifest.database,cluster:plan.manifest.cluster,checkedAt:new Date().toISOString(),...evaluate(state),state};}finally{await db.query('ROLLBACK');}}
async function initializeTechnicalState(db,plan){
 if(plan.manifest.state!=='empty')throw Error('CLEAN_INITIALIZATION_REQUIRES_EMPTY_BOOTSTRAP');
 await identity(db,plan);await db.query('BEGIN');try{
  await db.query('SELECT pg_advisory_xact_lock($1::int,$2::int)',require('../config/operationalTransactions').KEY);
  const state=await facts(db),initial=errors(state,true),already=errors(state,false);
  if(already.length===0){await db.query('ROLLBACK');return {changed:false};}
  if(initial.length)throw Error('CLEAN_INITIALIZATION_REFUSED');
  await db.query('UPDATE public.integracion_sync_estado SET avisos_activados=false');await db.query('COMMIT');return {changed:true,scope:'fresh-technical-configuration-only'};
 }catch(e){await db.query('ROLLBACK');throw e;}
}
module.exports={tables,roles,countries,platforms,evaluate,inspect,initializeTechnicalState};
