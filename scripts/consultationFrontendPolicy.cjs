// Lecturas exactas de las pantallas originales, sin permisos nuevos ni escritores.
const assets=['lab/consultas.html','lab/consultas.js','lab/consultas.css','js/ui.js','js/api.js','js/auth.js','js/layout.js','js/notificaciones.js','js/centroAvisos.js','js/transportesUi.js','js/router.js','js/app.js','pages/login.js','pages/dashboard.js','pages/historial.js','pages/bitacora.js','css/variables.css','css/base.css','css/layout.css','css/components.css','css/pages.css','css/notificaciones.css','css/centroAvisos.css','assets/branding/community-tours-sian-kaan-logo.jpg'];
const reservations=require('../backend/validators/reservaciones.validator'),audit=require('../backend/validators/bitacora.validator'),dates=require('../backend/validators/daily.validator');
const id=value=>/^[1-9][0-9]*$/.test(value||'')&&Number(value)<=2147483647;
function allowed(method,url){
  if(typeof url!=='string'||!url.startsWith('/api/')||/[\\#\r\n]/.test(url)||/%(?![a-fA-F0-9]{2})/.test(url))return false;
  let parsed;try{parsed=new URL(url,'http://127.0.0.1');}catch{return false;}
  const p=parsed.pathname,q=parsed.searchParams,keys=[...q.keys()],values=Object.fromEntries(q);if(p!==url.split('?')[0]||p.includes('%')||new Set(keys).size!==keys.length)return false;
  if(method==='POST')return url==='/api/auth/login';
  if(method!=='GET')return false;
  if(['/api/auth/sesion','/api/tours','/api/plataformas','/api/eventos-integracion/resumen'].includes(p))return !keys.length;
  if(p==='/api/bitacora')return audit.validarFiltrosBitacora(values).errores.length===0;
  if(p==='/api/reservaciones')return keys.every(k=>['page','limit','include_resumen_tours','fecha_desde','fecha_hasta','id_tour','turno','estado','id_plataforma','codigo','nombre'].includes(k))
    &&id(values.page)&&['25','50','100'].includes(values.limit)&&values.include_resumen_tours==='1'&&dates.esFechaValida(values.fecha_hasta)&&reservations.validarFiltrosReservaciones(values).errores.length===0;
  if(p==='/api/dashboard/resumen')return keys.length===1&&dates.esFechaValida(values.fecha);
  if(p==='/api/eventos-integracion/centro'){
    const enums={tab:['prioritarios','pendientes','historico'],provider:['fareharbor','getyourguide'],event_type:['new_booking','modification','cancellation'],review_status:['pending_review','approved','dismissed'],archived:['active','archived','all'],urgent:['true','false'],sort:['newest','oldest','service']};
    return keys.every(k=>[...Object.keys(enums),'q','from','to','date','page','limit'].includes(k))
      &&Object.entries(enums).every(([k,options])=>values[k]===undefined||options.includes(values[k]))
      &&['from','to','date'].every(k=>values[k]===undefined||dates.esFechaValida(values[k]))
      &&(!values.from||!values.to||values.from<=values.to)
      &&(values.page===undefined||id(values.page)&&Number(values.page)<=1000000)
      &&(values.limit===undefined||['25','50','100'].includes(values.limit))&&(values.q===undefined||values.q.length<=120);
  }
  const history=/^\/api\/eventos-integracion\/centro\/([1-9][0-9]*)\/historial$/.exec(p);if(history)return id(history[1])&&keys.length===2&&id(values.page)&&values.limit==='25';
  const detail=/^\/api\/eventos-integracion\/([1-9][0-9]*)(?:\/diff)?$/.exec(p);return Boolean(detail&&id(detail[1])&&!keys.length);
}
module.exports={assets,allowed,entry:'lab/consultas.html'};
