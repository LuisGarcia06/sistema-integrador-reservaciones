// Defensa adicional del proceso de laboratorio: ningún cliente de red Node.
const Module = require('node:module');
const path = require('node:path');
function instalarAislamiento() {
  const blocked = [];
  const root = path.resolve(__dirname, '../..');
  const load = Module._load;
  Module._load = function (request, parent, isMain) {
    if (/^(pg(?:\/|$)|dotenv(?:\/|$)|googleapis(?:\/|$)|@google-cloud\/)/.test(request)) throw new Error('Módulo bloqueado en DEMO: ' + request);
    if (request.startsWith('.') || path.isAbsolute(request)) {
      const file = Module._resolveFilename(request, parent);
      if (file.startsWith(path.join(root, 'backend') + path.sep)
        && ![path.join(root, 'backend/__tests__/helpers/transportesUiApi.cjs'), path.join(root, 'backend/__tests__/helpers/resumenNotificacionesSintetico.cjs')].includes(file)) throw new Error('Backend real bloqueado en DEMO.');
      if (/^(\.env(?:\..*)?|config\.env)$/i.test(path.basename(file))) throw new Error('Configuración real bloqueada.');
    }
    return load.call(this, request, parent, isMain);
  };
  function deny() { blocked.push('cliente Node bloqueado'); throw new Error('La demostración no permite conexiones salientes desde Node.'); }
  require('node:net').Socket.prototype.connect = deny;
  require('node:tls').connect = deny;
  require('node:dgram').createSocket = deny;
  const dns = require('node:dns');
  const lookupLocal = dns.lookup;
  const lookupLocalPromise = dns.promises.lookup;
  for (const key of Object.keys(dns)) if (/^(lookup|resolve|reverse)/.test(key) && typeof dns[key] === 'function') dns[key] = deny;
  for (const key of Object.keys(dns.promises)) if (typeof dns.promises[key] === 'function') dns.promises[key] = deny;
  // Node llama lookup incluso al escuchar en una IP literal. Ese caso no consulta DNS.
  dns.lookup = function (host, ...args) { if (host !== '127.0.0.1') return deny(); return lookupLocal.call(this, host, ...args); };
  dns.promises.lookup = function (host, ...args) { if (host !== '127.0.0.1') return deny(); return lookupLocalPromise.call(this, host, ...args); };
  return { blocked };
}
module.exports = { instalarAislamiento };
