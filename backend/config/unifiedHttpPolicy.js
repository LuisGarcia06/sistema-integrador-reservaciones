'use strict';
// Matriz cerrada del perfil conjunto. No monta sincronizadores ni webhooks.
const C=require('../security/revisionApiContract'),{error}=require('../security/revisionTokens');
const WRITERS=Object.freeze(C.routes.filter(r=>r.resource!=='eventos-integracion'));
const ADMIN_RESOURCES=Object.freeze(['usuarios','tours','guias','operadores','vehiculos','paises','plataformas']);
const AUDIT_RESOURCES=Object.freeze(['operaciones','transportes','daily',...ADMIN_RESOURCES]);
function command(method,url,body){
 const allowed=WRITERS.some(r=>r.method===method&&r.pattern.test(url.split('?')[0]));
 if(!allowed||url.includes('?')&&!(method==='PUT'&&/^\/api\/daily\/observaciones\?fecha=\d{4}-\d\d-\d\d$/.test(url)))throw error(405,'ESCRITURA_NO_HABILITADA');
 if(method==='PUT'&&!require('../validators/daily.validator').esFechaValida(url.slice(-10)))throw error(400,'SOLICITUD_INVALIDA');
 return C.command(method,url,body);
}
const id=s=>/^[1-9][0-9]{0,9}$/.test(s||'')&&Number(s)<=2147483647;
const READS=Object.freeze([
 ['/api/auth/sesion',[]],['/api/usuarios',[]],['/api/usuarios/roles',[]],['/api/tours',[]],['/api/paises',[]],['/api/plataformas',[]],
 ['/api/guias',['estado']],['/api/operadores',['estado']],['/api/vehiculos',['estado']],
 ['/api/dashboard/resumen',['fecha']],['/api/reservaciones',['page','limit','include_resumen_tours','fecha','fecha_desde','fecha_hasta','id_tour','turno','estado','id_plataforma','codigo','nombre']],
 ['/api/operaciones',['fecha']],['/api/operaciones/sugeridas',['fecha']],['/api/transportes',['id_operacion_tour','fecha']],
 ['/api/daily',['fecha']],['/api/daily/operativo',['fecha']],['/api/daily/observaciones',['fecha']],['/api/bitacora',['fecha_desde','fecha_hasta']],
 ['/api/eventos-integracion/resumen',[]],['/api/eventos-integracion/centro',['tab','provider','event_type','review_status','archived','urgent','sort','q','from','to','date','page','limit']]
]);
function allowHttp(method,url){
 if(typeof url!=='string'||!url.startsWith('/api/')||url.length>2048||/[\\#\x00-\x1f]/.test(url)||/%(?![0-9a-f]{2})/i.test(url))return false;
 const u=new URL(url,'http://127.0.0.1'),p=u.pathname,keys=[...u.searchParams.keys()];if(p!==url.split('?')[0]||p.includes('%')||new Set(keys).size!==keys.length||[...u.searchParams.values()].some(v=>v.length>500||/[\x00-\x1f]/.test(v)))return false;
 if(method==='POST'&&['/api/auth/login','/api/precondiciones'].includes(url))return true;
 if(['GET','HEAD'].includes(method)){
  const entry=READS.find(r=>r[0]===p);if(entry)return keys.every(k=>entry[1].includes(k));
  const detail=/^\/api\/(reservaciones|operaciones|transportes|usuarios|tours|guias|operadores|vehiculos)\/([1-9][0-9]*)$/.exec(p);if(detail)return id(detail[2])&&!keys.length;
  const event=/^\/api\/eventos-integracion\/([1-9][0-9]*)(?:\/diff)?$/.exec(p);if(event)return id(event[1])&&!keys.length;
  const history=/^\/api\/eventos-integracion\/centro\/([1-9][0-9]*)\/historial$/.exec(p);if(history)return id(history[1])&&keys.every(k=>['page','limit'].includes(k));
  return /^\/api\/comandos\/[a-f0-9-]{36}$/.test(p)&&require('../security/commandIntent').UUID.test(p.slice(14))&&!keys.length;
 }
 try{command(method,url,{});return true;}catch{return false;}
}
module.exports={WRITERS,ADMIN_RESOURCES,AUDIT_RESOURCES,READS,command,allowHttp};
