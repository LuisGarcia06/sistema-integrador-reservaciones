// Servidor del harness, nunca importado por revisionApiApp ni por Electron main.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const assets = [
  'lab/revision.html', 'lab/revision.css', 'lab/revisionEditor.js',
  'js/api.js', 'js/auth.js', 'js/revisionLab.js', 'js/revisionConflict.js',
  'css/variables.css', 'css/base.css', 'css/components.css'
];
async function start(apiPort) {
  const root = path.resolve(__dirname, '../frontend'), calls = [];
  let dropNextWrite = false;
  const server = http.createServer((req, res) => {
    const ownHost = '127.0.0.1:' + server.address().port;
    if (req.headers.host !== ownHost || req.headers.origin && req.headers.origin !== 'http://' + ownHost) { res.writeHead(403).end(); return; }
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    // Evita el replay de Chromium ante reset de una conexión HTTP reutilizada.
    // Es una política del harness loopback; no cambia los servidores anteriores.
    res.setHeader('Connection', 'close');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    if (req.url.startsWith('/api/')) {
      const writing = !['GET', 'HEAD'].includes(req.method) && !['/api/auth/login', '/api/precondiciones'].includes(req.url);
      const drop = writing && dropNextWrite; if (drop) dropNextWrite = false;
      const call = { method: req.method, url: req.url, writing }; calls.push(call);
      // Lista de headers: jamás cookies, claves del manifiesto o datos de PG.
      const headers = { host: '127.0.0.1:' + apiPort };
      for (const name of ['content-type', 'content-length', 'authorization', 'x-ctsk-protocol', 'if-match', 'if-operational-match']) if (req.headers[name]) headers[name] = req.headers[name];
      const upstream = http.request({ host: '127.0.0.1', port: apiPort, method: req.method, path: req.url, headers, agent: false, timeout: 15000 }, reply => {
        call.status = reply.statusCode;
        if (drop) { reply.resume(); reply.on('end', () => { call.responseDroppedAfterCommit = reply.statusCode === 200; res.destroy(); }); return; }
        for (const name of ['content-type', 'etag', 'x-ctsk-protocol']) if (reply.headers[name]) res.setHeader(name, reply.headers[name]);
        res.writeHead(reply.statusCode); reply.pipe(res);
      });
      upstream.on('timeout', () => upstream.destroy()); upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      req.pipe(upstream); return;
    }
    const relative = req.url === '/' ? 'lab/revision.html' : req.url.startsWith('/frontend/') ? req.url.slice(10) : '';
    if (req.method !== 'GET' || !assets.includes(relative)) { res.writeHead(404).end(); return; }
    const type = relative.endsWith('.js') ? 'application/javascript' : relative.endsWith('.css') ? 'text/css' : 'text/html';
    res.setHeader('Content-Type', type + '; charset=utf-8'); res.end(fs.readFileSync(path.join(root, relative)));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { server, calls, origin: 'http://127.0.0.1:' + server.address().port, dropNext() { dropNextWrite = true; } };
}
module.exports = { start, assets };
