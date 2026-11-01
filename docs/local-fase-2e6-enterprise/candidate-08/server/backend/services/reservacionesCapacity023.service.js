'use strict';
// Endurecimiento confirmado en2E.1. Sólo el perfil experimental023; el arranque habitual se conserva.
const C=require('./capacidad.service'),T=require('../config/revisionApiTransactions');
const active=()=>['unified023-lab','preproduction023-local','enterprise026'].includes(require('../config/desktopConfiguration').get()?.APP_ENVIRONMENT);
const sameBucket=(a,b)=>C.normalizarFechaResultado(a.fecha)===C.normalizarFechaResultado(b.fecha)&&Number(a.id_tour)===Number(b.id_tour)&&a.turno===b.turno;
const SUM_SQL=`SELECT COALESCE(sum(pax),0)::text total_pax FROM public.reservaciones
 WHERE id_tour=$1 AND fecha=$2::date AND turno IS NOT DISTINCT FROM $3::varchar AND estado<>$4
 AND ($5::integer IS NULL OR id_reservacion<>$5::integer)`;
async function verify(db,proposal,exclude=null){
 T.assertCommandClient(db);
 // El BEGIN exterior ya adquirió este mismo candado; adquirirlo aquí también documenta y preserva la frontera.
 await db.query('SELECT pg_advisory_xact_lock($1::int,$2::int)',require('../config/operationalTransactions').KEY);
 const row=(await db.query(SUM_SQL,[proposal.id_tour,C.normalizarFechaResultado(proposal.fecha),proposal.turno,C.ESTADO_CANCELADA,exclude])).rows[0];
 const total=BigInt(row.total_pax)+BigInt(C.obtenerPaxOperativoReservacion(proposal));
 if(total>BigInt(C.MAX_PAX_TOUR_TURNO))throw Object.assign(Error('El tour excede el máximo de 24 pasajeros activos para la fecha y turno, incluidas las reservaciones sin transporte.'),{statusCode:400,code:'CUPO_TOUR_TURNO_EXCEDIDO'});
}
async function verifyCreation(db,proposal){if(active())await verify(db,proposal);}
async function verifyEdit(db,before,proposal){
 if(!active())return;
 if(sameBucket(before,proposal)&&C.obtenerPaxOperativoReservacion(before)===C.obtenerPaxOperativoReservacion(proposal))return;
 if(C.obtenerPaxOperativoReservacion(proposal)===0)return;
 await verify(db,proposal,before.id_reservacion);
}
async function listOverbookings(db){return (await db.query(`SELECT fecha::text,id_tour,turno,sum(pax)::text pax_activos,
 count(*)::int reservaciones_activas,count(*) FILTER(WHERE id_transporte_operacion IS NULL)::int sin_transporte
 FROM public.reservaciones WHERE estado<>$1 GROUP BY fecha,id_tour,turno HAVING sum(pax)>$2
 ORDER BY fecha,id_tour,turno`,[C.ESTADO_CANCELADA,C.MAX_PAX_TOUR_TURNO])).rows;}
module.exports={active,SUM_SQL,sameBucket,verifyCreation,verifyEdit,listOverbookings};
