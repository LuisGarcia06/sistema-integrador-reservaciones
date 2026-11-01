'use strict';
const {error,canonical}=require('../security/revisionTokens');
function normalize(input){
 if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).some(k=>!['provider','valor','tipo','motivo','confirmacion'].includes(k))||input.confirmacion!==true)throw error(400,'REFERENCIA_CONFIRMACION_REQUERIDA');
 if(!['fareharbor','getyourguide'].includes(input.provider)||!['code','uuid'].includes(input.tipo)||typeof input.valor!=='string')throw error(400,'REFERENCIA_INVALIDA');
 const value=input.valor.trim().normalize('NFC');if(value.length>100||/[\u0000-\u001f\u007f]/u.test(value))throw error(400,'REFERENCIA_INVALIDA');
 if(value&&input.tipo==='uuid'&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))throw error(400,'UUID_EXTERNO_INVALIDO');
 const key=input.tipo==='uuid'?value.toLowerCase():value;
 return {provider:input.provider,reference:value,reference_key:key,kind:input.tipo,motivo:typeof input.motivo==='string'?input.motivo.trim():''};
}
const current=async(db,id)=>(await db.query('SELECT * FROM ctsk_refs025.manual_refs WHERE reservation_id=$1 AND active',[id])).rows[0]||null;
const context=async db=>(await db.query("SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY id),'[]'::jsonb) value FROM ctsk_refs025.manual_refs r")).rows[0].value;
async function apply(db,id,input,actor){
 require('../config/revisionApiTransactions').assertCommandClient(db);
 const before=await current(db,id),reservation=(await db.query('SELECT id_plataforma FROM public.reservaciones WHERE id_reservacion=$1',[id])).rows[0];
 if(!reservation)throw error(404,'RESERVACION_NO_ENCONTRADA');
 if(input===undefined){if(before&&before.platform_id!==reservation.id_plataforma)throw error(409,'REFERENCIA_PLATAFORMA_REQUIERE_CORRECCION');return false;}
 const n=normalize(input),platform=(await db.query('SELECT nombre FROM public.plataformas WHERE id_plataforma=$1',[reservation.id_plataforma])).rows[0];
 const name=platform?.nombre.normalize('NFKC').toLowerCase().replace(/[^a-z]/g,'');if(name!==n.provider)throw error(409,'REFERENCIA_PLATAFORMA_INCOMPATIBLE');
 if(before&&before.platform_id===reservation.id_plataforma&&before.provider===n.provider&&before.reference_key===n.reference_key&&before.kind===n.kind||!before&&!n.reference)return false;
 if(before&&(!n.motivo||n.motivo.length>500))throw error(400,'MOTIVO_CORRECCION_REQUERIDO');
 const links=(await db.query('SELECT * FROM public.reservas_integracion_link WHERE id_reservacion=$1 OR (provider=$2 AND external_booking_id=$3)',[id,n.provider,n.reference_key])).rows;
 if(links.length)throw error(409,'REFERENCIA_VINCULO_CONFIRMADO_REQUIERE_REVISION');
 if(n.reference&&(await db.query('SELECT 1 FROM ctsk_refs025.manual_refs WHERE active AND provider=$1 AND reference_key=$2 AND reservation_id<>$3',[n.provider,n.reference_key,id])).rowCount)throw error(409,'REFERENCIA_DUPLICADA');
 if(before)await db.query('UPDATE ctsk_refs025.manual_refs SET active=false,retired_by=$2,retired_at=CURRENT_TIMESTAMP WHERE id=$1',[before.id,actor]);
 if(n.reference)await db.query('INSERT INTO ctsk_refs025.manual_refs(reservation_id,platform_id,provider,reference,reference_key,kind,actor,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,reservation.id_plataforma,n.provider,n.reference,n.reference_key,n.kind,actor,n.motivo||'Declaración manual inicial']);
 await require('./bitacora.service').crearEntradaBitacora({idUsuario:actor,idReservacion:id,accion:'REFERENCIA_EXTERNA_MANUAL',descripcion:canonical({antes:before?{provider:before.provider,valor:before.reference,tipo:before.kind}:null,despues:n.reference?{provider:n.provider,valor:n.reference,tipo:n.kind}:null,motivo:n.motivo||'Declaración manual inicial',verificacion:'declared'})},db);return true;
}
async function collision(db,provider,values){const keys=[...new Set(values.filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim().normalize('NFC').toLowerCase()))];return !!keys.length&&(await db.query('SELECT 1 FROM ctsk_refs025.manual_refs WHERE provider=$1 AND lower(reference_key)=ANY($2::text[]) LIMIT 1',[provider,keys])).rowCount>0;}
module.exports={normalize,current,context,apply,collision};
