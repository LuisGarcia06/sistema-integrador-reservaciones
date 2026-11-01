'use strict';
const crypto=require('node:crypto'),T=require('../../config/revisionApiTransactions'),Time=require('./activationTime');
const {error}=require('../../security/revisionTokens');
const canonical=require('../../security/revisionTokens').canonical;
const uuid=x=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x||'');
const party=raw=>Number.isInteger(raw?.customer_count)&&raw.customer_count>0&&Array.isArray(raw.customers)&&raw.customers.length===raw.customer_count;
const sha=x=>crypto.createHash('sha256').update(canonical(x)).digest('hex');
const sourceSql="SELECT * FROM public.integracion_sync_estado WHERE provider=$1 AND source='automation024'";
const actorSql="SELECT u.id_usuario,u.nombre,u.estado,u.version_credenciales::text version_credenciales,r.nombre rol FROM public.usuarios u JOIN public.roles r USING(id_rol) WHERE id_usuario=$1";
const sourceDate=x=>x instanceof Date?x.toISOString():x;
function provider(p){if(!['fareharbor','getyourguide'].includes(p))throw error(400,'PROVEEDOR_INVALIDO');return p;}
function reason(s){if(typeof s!=='string'||[...s].length>500||!s.trim())throw error(400,'MOTIVO_REQUERIDO');return s.trim();}
function create({pool,plan,instance=crypto.randomUUID(),fault=()=>{}}){
 require('../../config/integration024Policy').feature(plan,true);
 const transaction=work=>T.transaction(pool,work);
 async function source(db,p){const r=(await db.query(sourceSql,[provider(p)])).rows[0];if(!r)throw error(503,'SYNC024_NO_INSTALADO');return r;}
 async function authorize(db,auth){const actor=(await db.query(actorSql,[auth?.id])).rows[0];require('../../services/credentialAuth.service').get().assertCurrent(actor,auth);if(actor.rol!=='Administrador')throw error(403,'NO_AUTORIZADO');return actor;}
 async function job(db,p,run){const s=await source(db,p);if(!s.automation_enabled||s.run_id!==run||s.run_instance!==instance||s.authorized_epoch!==plan.manifest.authEpoch||new Date(s.run_until)<=new Date())throw error(409,'SYNC_RUN_FENCED');const a=(await db.query(actorSql,[s.authorized_user])).rows[0];if(!a?.estado||a.rol!=='Administrador'||a.version_credenciales!==s.authorized_cv)throw error(403,'SYNC_AUTHORIZATION_REVOKED');T.authorizeWrites();await db.query("UPDATE public.integracion_sync_estado SET run_until=CURRENT_TIMESTAMP+interval '30 seconds' WHERE provider=$1 AND source='automation024'",[p]);return {s,a};}
 async function audit(db,a,p,action,motivo){return require('../../services/bitacora.service').crearEntradaBitacora({idUsuario:a.id_usuario,idReservacion:null,accion:action,descripcion:p+': '+motivo},db);}
 async function alert(db,p,code){await db.query(`INSERT INTO public.eventos_integracion(provider,external_event_id,event_type,urgent,review_note,normalized_data,source_received_at)
 VALUES($1,$2,'modification',true,$3,$4,CURRENT_TIMESTAMP) ON CONFLICT(provider,external_event_id) DO NOTHING`,[p,'sync024-alert:'+code,code,{integration024:{kind:'operational_alert',code,manual_reconciliation:true}}]);}
 async function controls(auth,p,action,input,key){
  provider(p);if(!uuid(key)||!['activate','enabled'].includes(action)||!input||Object.getPrototypeOf(input)!==Object.prototype)throw error(400,'SOLICITUD_INVALIDA');
  const expected=action==='activate'?['corte_local','zona','confirmacion','motivo']:['habilitada','confirmacion','motivo'];if(Object.keys(input).sort().join()!==expected.sort().join()||input.confirmacion!==true)throw error(400,'CONFIRMACION_REQUERIDA');
  const motivo=reason(input.motivo);let cut;
  if(action==='activate'){try{cut=Time.cancun(input.corte_local,input.zona);}catch{throw error(400,'FECHA_CORTE_INVALIDA');}}
  else if(typeof input.habilitada!=='boolean')throw error(400,'SOLICITUD_INVALIDA');
  const fingerprint=sha({p,action,input,generation:plan.manifest.dataGeneration});
  return transaction(async db=>{
   const a=await authorize(db,auth);require('../../security/credentialPolicy').recent(auth);
   const prior=(await db.query('SELECT fingerprint,result FROM ctsk_sync024.admin_receipts WHERE actor=$1 AND command_id=$2',[a.id_usuario,key])).rows[0];
   if(prior){if(prior.fingerprint!==fingerprint)throw error(409,'CLAVE_IDEMPOTENCIA_REUTILIZADA');return {...prior.result,replayed:true};}
   T.authorizeWrites();const s=await source(db,p);let result,auditRow;
   if(p==='getyourguide'){await alert(db,p,'GYG_RECOVERY_UNVERIFIED');result={status:409,body:{codigo:'GYG_RECOVERY_UNVERIFIED',manual:true}};}
   else if(action==='activate'){
    if(s.first_activation_at)result={status:409,body:{codigo:'ACTIVACION_YA_ESTABLECIDA'}};
    else{await db.query(`UPDATE public.integracion_sync_estado SET first_activation_at=$2,activation_user=$3,activation_reason=$4,
     automation_enabled=true,authorized_user=$3,authorized_cv=$5,authorized_epoch=$6,attempt_result='activated',updated_at=CURRENT_TIMESTAMP WHERE provider=$1 AND source='automation024'`,[p,cut,a.id_usuario,motivo,a.version_credenciales,plan.manifest.authEpoch]);auditRow=await audit(db,a,p,'INTEGRACION_CORTE_INICIAL',motivo);result={status:200,body:{corte_utc:cut,habilitada:true,scope:'synthetic-loopback'}};}
   }else{
    if(!s.first_activation_at)result={status:409,body:{codigo:'PRIMERA_ACTIVACION_REQUERIDA'}};
    else{const changed=s.automation_enabled!==input.habilitada||input.habilitada&&(s.authorized_user!==a.id_usuario||s.authorized_cv!==a.version_credenciales||s.authorized_epoch!==plan.manifest.authEpoch);
     if(changed){await db.query(`UPDATE public.integracion_sync_estado SET automation_enabled=$2,authorized_user=$3,authorized_cv=$4,authorized_epoch=$5,
      run_id=NULL,run_instance=NULL,run_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE provider=$1 AND source='automation024'`,[p,input.habilitada,a.id_usuario,a.version_credenciales,plan.manifest.authEpoch]);auditRow=await audit(db,a,p,input.habilitada?'INTEGRACION_REANUDADA':'INTEGRACION_PAUSADA',motivo);}
     result={status:200,body:{corte_utc:sourceDate(s.first_activation_at),habilitada:input.habilitada,sin_cambios:!changed}};
    }
   }
   await db.query('INSERT INTO ctsk_sync024.admin_receipts(actor,command_id,fingerprint,result,audit_id) VALUES($1,$2,$3,$4,$5)',[a.id_usuario,key,fingerprint,result,auditRow?.id_bitacora||null]);return result;
  });
 }
 async function status(){return transaction(async db=>{const rows=(await db.query("SELECT provider,first_activation_at,automation_enabled,confirmed_through,attempt_at,attempt_result,pending_error,retry_after,pending_window,authorized_epoch FROM public.integracion_sync_estado WHERE source='automation024' ORDER BY provider")).rows;return rows.map(r=>({...r,reauthorization_required:r.automation_enabled&&r.authorized_epoch!==plan.manifest.authEpoch,scope:'synthetic-loopback',real_activation_blocked:true,receiver_recovery_available:r.provider==='fareharbor',pending_window:r.pending_window?{day:r.pending_window.day,pending:r.pending_window.ids.length-r.pending_window.done.length}:null}));});}
 async function recover(auth,key){if(!uuid(key))throw error(400,'SOLICITUD_INVALIDA');return transaction(async db=>{const a=await authorize(db,auth);const row=(await db.query('SELECT result FROM ctsk_sync024.admin_receipts WHERE actor=$1 AND command_id=$2',[a.id_usuario,key])).rows[0];if(!row)throw error(404,'COMANDO_NO_DISPONIBLE');return {...row.result,replayed:true};});}
 async function begin(p,until){provider(p);Time.instant(until);return transaction(async db=>{
  const s=await source(db,p);if(p!=='fareharbor'||!s.automation_enabled||!s.first_activation_at)return {manual:true,codigo:p==='getyourguide'?'GYG_RECOVERY_UNVERIFIED':'SYNC_DISABLED'};
  if(s.authorized_epoch!==plan.manifest.authEpoch)return {manual:true,codigo:'REAUTHORIZE_AFTER_RESTORE'};
  const a=(await db.query(actorSql,[s.authorized_user])).rows[0];if(!a?.estado||a.rol!=='Administrador'||a.version_credenciales!==s.authorized_cv)throw error(403,'SYNC_AUTHORIZATION_REVOKED');
  if(s.retry_after&&new Date(s.retry_after)>new Date())return {backoff:true};
  if(s.run_id&&s.run_instance===instance&&new Date(s.run_until)>new Date())return {busy:true};
  T.authorizeWrites();const run=crypto.randomUUID();await db.query(`UPDATE public.integracion_sync_estado SET run_id=$2,run_instance=$3,run_until=CURRENT_TIMESTAMP+interval '30 seconds',attempt_at=CURRENT_TIMESTAMP,attempt_result='running',updated_at=CURRENT_TIMESTAMP WHERE provider=$1 AND source='automation024'`,[p,run,instance]);
  const links=(await db.query('SELECT external_booking_id FROM ctsk_sync024.booking_state WHERE provider=$1 ORDER BY external_booking_id',[p])).rows.map(r=>r.external_booking_id);
  return {run,cut:sourceDate(s.first_activation_at),cursor:sourceDate(s.confirmed_through),pending:s.pending_window,until,links};
 });}
 async function window(p,run,day,through,ids){
  if(!/^\d{4}-\d\d-\d\d$/.test(day)||!Array.isArray(ids)||ids.length>5000||!ids.every(uuid)||new Set(ids).size!==ids.length)throw error(400,'WINDOW_INVALID');
  const first=Time.instant(day+'T00:00:00Z'),end=new Date(new Date(first).getTime()+86400000).toISOString(),finish=Time.instant(through);
  if(finish<=first||finish>end)throw error(400,'WINDOW_INVALID');
  return transaction(async db=>{const {s}=await job(db,p,run);if(day<sourceDate(s.first_activation_at).slice(0,10)||day>sourceDate(s.confirmed_through||s.first_activation_at).slice(0,10))throw error(409,'WINDOW_GAP');
   const previous=s.pending_window;if(previous&&previous.day!==day)throw error(409,'WINDOW_PENDING_REQUIRED');
   const retained=[...new Set([...(previous?.ids||[]),...ids.map(x=>x.toLowerCase())])];if(retained.length>5000)throw error(409,'WINDOW_LIMIT_REQUIRES_REVIEW');
   const pending={day,through:finish,ids:retained,done:previous?.done||[]};await db.query("UPDATE public.integracion_sync_estado SET pending_window=$2,run_until=CURRENT_TIMESTAMP+interval '30 seconds' WHERE provider=$1 AND source='automation024'",[p,pending]);return pending;});
 }
 async function settled(db,p,s,id){if(s.pending_window?.ids.includes(id)){const w=s.pending_window;if(!w.done.includes(id))w.done.push(id);await db.query("UPDATE public.integracion_sync_estado SET pending_window=$2,run_until=CURRENT_TIMESTAMP+interval '30 seconds' WHERE provider=$1 AND source='automation024'",[p,w]);}}
 const readReservation=async(db,id)=>(await db.query("SELECT to_jsonb(r)-'fecha_registro'-'ultima_actualizacion' snapshot FROM public.reservaciones r WHERE id_reservacion=$1",[id])).rows[0]?.snapshot;
 async function snapshot(p,run,raw,{linked=false}={}){return transaction(async db=>{
  const {s,a}=await job(db,p,run);if(p!=='fareharbor')throw error(409,'GYG_RECOVERY_UNVERIFIED');
  let normalized;try{normalized=require('../fareharbor/fareharbor.mapper').crearNormalizedDataFareHarbor(raw);}catch{normalized={booking:{uuid:null},integration024:{code:'BOOKING_INVALID'}};}
  const id=typeof normalized.booking?.uuid==='string'?normalized.booking.uuid.toLowerCase():null,identityValid=uuid(id),digest=sha(normalized);
  const baseline=identityValid?(await db.query('SELECT * FROM ctsk_sync024.booking_state WHERE provider=$1 AND external_booking_id=$2',[p,id])).rows[0]:null;
  let created,problem;
  try{created=Time.instant(normalized.booking?.created_at);}catch{problem='CREATION_TIME_UNVERIFIED';}
  if(!identityValid)problem='BOOKING_ID_UNVERIFIED';if(!party(raw))problem='PASSENGER_COUNT_UNVERIFIED';
  const old=created&&created<sourceDate(s.first_activation_at);
  if(identityValid&&!linked&&!old&&(!s.pending_window||!s.pending_window.ids.includes(id)))throw error(409,'BOOKING_NOT_IN_WINDOW');
  if(linked&&!baseline)throw error(409,'BOOKING_NOT_LINKED');
  if(!old&&created&&baseline&&created!==sourceDate(baseline.original_created_at))problem='ORIGINAL_CREATION_CHANGED';
  if(!old&&created&&!linked&&(created.slice(0,10)!==s.pending_window.day||created>s.pending_window.through))problem='CREATION_OUTSIDE_WINDOW';
  if(!problem&&baseline?.external_digest===digest){await settled(db,p,s,id);return {kind:'duplicate',settled:true};}
  const type=normalized.booking?.status==='cancelled'?'cancellation':baseline?'modification':'new_booking';
  const eventId='sync024:'+String(id||'invalid')+':'+digest+':v'+String(baseline?.revision||0);
  normalized={...normalized,integration024:{original_created_utc:created||null,kind:'snapshot'}};
  await db.query(`INSERT INTO public.eventos_integracion(provider,external_event_id,external_booking_id,event_type,normalized_data,review_note,source_received_at)
   VALUES($1,$2,$3,$4,$5,'sync024:pending',CURRENT_TIMESTAMP) ON CONFLICT(provider,external_event_id) DO NOTHING`,[p,eventId,id,type,normalized]);
  const event=(await db.query('SELECT * FROM public.eventos_integracion WHERE provider=$1 AND external_event_id=$2',[p,eventId])).rows[0];
  async function conclude(kind,code,isSettled){await db.query('UPDATE public.eventos_integracion SET review_status=$2,review_note=$3,urgent=$4,updated_at=CURRENT_TIMESTAMP WHERE id_evento_integracion=$1',[event.id_evento_integracion,isSettled?'dismissed':'pending_review',code,!isSettled]);if(isSettled)await settled(db,p,s,id);else await db.query("UPDATE public.integracion_sync_estado SET pending_error=$2,attempt_result='review' WHERE provider=$1 AND source='automation024'",[p,code]);return {kind,code,settled:isSettled,event:event.id_evento_integracion};}
  if(old)return conclude('excluded','BEFORE_INITIAL_CUTOFF',true);
  if(problem)return conclude('review',problem,false);
  if(!['booked','cancelled'].includes(normalized.booking.status))return conclude('review','BOOKING_STATUS_UNSUPPORTED',false);
  const link=(await db.query('SELECT * FROM public.reservas_integracion_link WHERE provider=$1 AND external_booking_id=$2',[p,id])).rows[0];
  if(link&&!baseline)return conclude('review','EXISTING_LINK_REQUIRES_REVIEW',false);
  if(!link&&type==='cancellation')return conclude('excluded','CANCELLED_WITHOUT_LOCAL_LINK',true);
  const before=link?await readReservation(db,link.id_reservacion):null;
  if(baseline&&canonical(before)!==canonical(baseline.internal_snapshot))return conclude('review','LOCAL_CHANGES_REQUIRE_REVIEW',false);
  const attempted=await T.attemptCommand(async()=>{
   let reservation;
   const service=require('../../services/reservaciones.service');
   if(type==='cancellation'){reservation=(await service.cancelarReservacionConDb(db,link.id_reservacion,a.id_usuario,'Cancelación externa verificada por consulta autorizada')).reservacion;}
   else{
    const prepared=await require('../fareharbor/fareharborApplication.service').construirReservacionFareHarborParaAplicacion(db,{provider:p,event_type:'new_booking',normalized_data:normalized});
    if(prepared.tipo!=='preparado')throw error(422,'EXTERNAL_MAPPING_'+prepared.tipo.toUpperCase());
    const candidate=prepared.reservationData;
    if(!(await db.query('SELECT 1 FROM public.tours WHERE id_tour=$1 AND activo',[candidate.id_tour])).rowCount)throw error(422,'TOUR_NOT_ACTIVE');
    if(!link){
     const codes=[id,normalized.booking.display_id,String(normalized.booking.display_id||'').replace(/^#/,'')].filter(Boolean).map(x=>x.toLowerCase());
     const match=await db.query(`SELECT 1 FROM public.reservaciones r WHERE lower(r.codigo)=ANY($1::text[])
      OR (r.fecha=$2 AND lower(trim(r.nombre_cliente))=lower(trim($3)) AND r.id_plataforma=$4 AND NOT EXISTS(SELECT 1 FROM public.reservas_integracion_link l WHERE l.id_reservacion=r.id_reservacion)) LIMIT 1`,[codes,candidate.fecha,candidate.nombre_cliente,candidate.id_plataforma]);
     if(match.rowCount)throw error(409,'MANUAL_BOOKING_REQUIRES_REVIEW');
     reservation=await service.crearReservacionConDb(db,candidate,a.id_usuario);
    }else{
     if(before.estado==='Cancelada')throw error(409,'LOCAL_CANCELLATION_REQUIRES_REVIEW');
     const managed=['fecha','id_tour','id_pais','id_plataforma','nombre_cliente','telefono_cliente','pax','ninos','pickup_place','pickup_time','turno','precio_total','deposito','saldo'];
     reservation=await service.actualizarReservacionParcialConDb(db,link.id_reservacion,Object.fromEntries(managed.map(k=>[k,candidate[k]])),a.id_usuario);
    }
   }
   fault('after-business');
   const assignedLink=link||(await db.query('INSERT INTO public.reservas_integracion_link(provider,external_booking_id,id_reservacion) VALUES($1,$2,$3) RETURNING *',[p,id,reservation.id_reservacion])).rows[0];
   const internal=await readReservation(db,reservation.id_reservacion);
   await db.query(`INSERT INTO ctsk_sync024.booking_state(provider,external_booking_id,link_id,original_created_at,external_digest,internal_snapshot)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(provider,external_booking_id) DO UPDATE SET external_digest=EXCLUDED.external_digest,internal_snapshot=EXCLUDED.internal_snapshot,revision=ctsk_sync024.booking_state.revision+1,updated_at=CURRENT_TIMESTAMP`,[p,id,assignedLink.id_reserva_integracion_link,created,digest,internal]);
   await db.query("UPDATE public.eventos_integracion SET review_status='applied',application_status='applied',applied_by=$2,applied_at=CURRENT_TIMESTAMP,review_note='sync024:applied',updated_at=CURRENT_TIMESTAMP WHERE id_evento_integracion=$1",[event.id_evento_integracion,a.id_usuario]);fault('after-receipt');return {id:reservation.id_reservacion};
  });
  if(attempted.error){const e=attempted.error;if(!e.statusCode||e.statusCode>=500)throw e;T.authorizeWrites();return conclude('review',e.code||'BUSINESS_RULE_REJECTED',false);}
  await settled(db,p,s,id);return {kind:'applied',settled:true,event:event.id_evento_integracion,...attempted.value};
 });}
 async function complete(p,run){return transaction(async db=>{const {s}=await job(db,p,run),w=s.pending_window;if(!w||w.ids.some(id=>!w.done.includes(id)))throw error(409,'WINDOW_NOT_COMPLETE');await db.query(`UPDATE public.integracion_sync_estado SET confirmed_through=GREATEST(COALESCE(confirmed_through,first_activation_at),$2::timestamptz),pending_window=NULL,pending_error=NULL,attempt_result='window_confirmed',run_until=CURRENT_TIMESTAMP+interval '30 seconds' WHERE provider=$1 AND source='automation024'`,[p,w.through]);return {confirmed:w.through};});}
 async function finish(p,run){return transaction(async db=>{await job(db,p,run);await db.query("UPDATE public.integracion_sync_estado SET run_id=NULL,run_until=NULL,attempt_result='complete',pending_error=NULL,retry_after=NULL WHERE provider=$1 AND source='automation024'",[p]);return {completed:true};});}
 async function fail(p,run,code,retrySeconds=0){provider(p);if(!/^[A-Z0-9_]{1,100}$/.test(code)||!Number.isInteger(retrySeconds)||retrySeconds<0||retrySeconds>86400)throw error(400,'SYNC_ERROR_INVALID');return transaction(async db=>{const s=await source(db,p);if(run&&s.run_id!==run)throw error(409,'SYNC_RUN_FENCED');T.authorizeWrites();await db.query("UPDATE public.integracion_sync_estado SET attempt_at=CURRENT_TIMESTAMP,attempt_result='error',pending_error=$2,retry_after=CURRENT_TIMESTAMP+($3::int*interval '1 second'),run_id=NULL,run_until=NULL WHERE provider=$1 AND source='automation024'",[p,code,retrySeconds]);await alert(db,p,code);return {manual:true,code};});}
 return {controls,status,recover,begin,window,snapshot,complete,finish,fail};
}
module.exports={create,sha,uuid,reason,party};
