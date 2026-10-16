// Barrera exclusiva del proceso de prueba; no simula respuestas ni APIs internas.
const allowed=value=>['127.0.0.1','localhost','::1'].includes(String(value).replace(/^\[|\]$/g,''));
function host(args){const a=args[0];if(typeof a==='string'||a instanceof URL)return new URL(a).hostname;return (a&& (a.hostname||a.host))||'localhost';}
for(const name of ['node:http','node:https']){const m=require(name),request=m.request;m.request=function(...args){if(!allowed(host(args)))throw Error('E2E bloquea red externa');return request.apply(this,args);};m.get=function(...args){const r=m.request(...args);r.end();return r;};}
const fetch=global.fetch;global.fetch=function(url,...args){if(!allowed(new URL(url).hostname))throw Error('E2E bloquea fetch externo');return fetch(url,...args);};
