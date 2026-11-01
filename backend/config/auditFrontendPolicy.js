'use strict';
// Extensión optativa del lector HTTP 021. Conserva intacta auditApiPolicy.
const P = require('./auditApiPolicy');
const {esFechaValida} = require('../validators/daily.validator');
const UUID = require('../security/commandIntent').UUID;
function id(value) { return /^[1-9][0-9]{0,9}$/.test(value) && Number(value) <= 2147483647; }
function allowHttp(method, url) {
    if (typeof url !== 'string' || /[%\\#]/.test(url)) return false;
    if (!['GET','HEAD'].includes(method)) return P.allowHttp(method,url);
    if (['/api/auth/sesion','/api/tours','/api/guias','/api/vehiculos','/api/operadores'].includes(url)) return true;
    if (url.startsWith('/api/comandos/')) return UUID.test(url.slice(14));
    const detail = /^\/api\/(operaciones|transportes)\/(.+)$/.exec(url);
    if (detail && id(detail[2])) return true;
    const dated = /^\/api\/(?:operaciones(?:\/sugeridas)?|daily\/(?:operativo|observaciones))\?fecha=(.+)$/.exec(url);
    if (dated) return esFechaValida(dated[1]);
    const transport = /^\/api\/transportes\?id_operacion_tour=(.+)$/.exec(url);
    if (transport) return id(transport[1]);
    if (url === '/api/bitacora') return true;
    if (!url.startsWith('/api/bitacora?')) return false;
    const query = new URL(url,'http://127.0.0.1').searchParams, seen = new Set();
    for (const [key,value] of query) {
        if (!['fecha_desde','fecha_hasta'].includes(key) || seen.has(key) || !esFechaValida(value)) return false;
        seen.add(key);
    }
    return seen.size > 0;
}
module.exports = {allowHttp};
