// Crea un clúster nuevo mediante las guardias existentes. Nunca lee .env.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), net = require('node:net'), assert = require('node:assert/strict');
const base = require('./standaloneDev.cjs'), P = require('../backend/config/revisionApiPolicy');
async function main() {
  const [mode, dir, ...extra] = process.argv.slice(2), launch = { ...process.env };
  if (!['Verify', 'Stop'].includes(mode) || !path.isAbsolute(dir || '') || extra.length) throw Error('FRONTEND_LAB_ARGUMENTS');
  require('../backend/config/desktopPolicy').cleanEnvironment();
  if (mode === 'Stop') { base.control(P.readPlan(path.join(dir, 'manifest.json')).manifest, 'stop'); return; }
  let m, api, driver, observer, ui;
  const report = { phase: '2C.2B.3', completed: false, syntheticOnly: true, loopbackOnly: true, physicalTwoComputerTest: false, checks: [], failures: [] };
  console.log('REVISION_FRONTEND_LAB ' + dir);
  try {
    m = await base.prepare(dir, { profile: P.ENVIRONMENT, revisionAudit: require('./revisionApiFixtures.cjs').seed });
    const plan = P.readPlan(path.join(dir, 'manifest.json'));
    require('../backend/config/standalonePolicy').verifyLocalCluster(m);
    const { Client } = require('pg'); observer = new Client({ host: '127.0.0.1', port: m.pgPort, database: m.database, user: plan.config.DB_USER, password: plan.config.DB_PASSWORD });
    await observer.connect(); await P.verify({ connect: async () => ({ query: observer.query.bind(observer), release() {} }) }, plan);
    const fixtures = JSON.parse(fs.readFileSync(path.join(dir, 'api-fixtures.json'))), credentials = JSON.parse(fs.readFileSync(path.join(dir, 'test-user.json')));
    const env = require('../backend/config/desktopPolicy').cleanEnvironment(); delete env.ELECTRON_RUN_AS_NODE;
    api = cp.spawn(process.execPath, [path.join(__dirname, 'revisionApiServerProbe.cjs'), plan.filename], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => {
      let out = '', err = ''; const timer = setTimeout(() => reject(Error('FRONTEND_API_TIMEOUT ' + err.slice(-300))), 45000);
      api.stderr.on('data', v => err += v); api.once('exit', () => { clearTimeout(timer); reject(Error('FRONTEND_API_EXIT ' + err.slice(-500))); });
      api.stdout.on('data', v => { out += v; if (out.includes('REVISION_API_PROBE_READY')) { clearTimeout(timer); resolve(); } });
    });
    ui = await require('./revisionFrontendHost.cjs').start(m.httpPort);
    const allowed = [m.pgPort, m.httpPort, new URL(ui.origin).port].map(Number), connect = net.Socket.prototype.connect;
    net.Socket.prototype.connect = function (...args) { const a = Array.isArray(args[0]) ? args[0] : args, t = a[0], h = typeof t === 'object' ? t.host : a[1], p = typeof t === 'object' ? t.port : t; if (h !== '127.0.0.1' || !allowed.includes(Number(p))) throw Error('FRONTEND_TEST_NETWORK_BLOCKED'); return connect.apply(this, args); };
    require('node:dgram').createSocket = () => { throw Error('FRONTEND_TEST_NETWORK_BLOCKED'); }; global.fetch = () => { throw Error('FRONTEND_TEST_NETWORK_BLOCKED'); };
    const extraIds = {};
    for (const [key, sql] of Object.entries({ guia: 'SELECT id_guia id FROM guias LIMIT 1', operador: 'SELECT id_operador id FROM operadores LIMIT 1', usuario: "SELECT id_usuario id FROM usuarios WHERE correo='segundo@standalone.example.test'", consultaRole: "SELECT id_rol id FROM roles WHERE nombre='Consulta'" })) extraIds[key] = (await observer.query(sql)).rows[0].id;
    Object.assign(report, { database: m.database, pgPort: m.pgPort, apiPort: m.httpPort, uiPort: Number(new URL(ui.origin).port), profile: m.environment });
    driver = cp.spawn(require('electron'), [path.join(__dirname, 'revisionFrontendDriver.cjs')], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    let driverError = ''; driver.stderr.on('data', v => driverError += v); driver.stdout.on('data', v => process.stdout.write(v));
    driver.on('message', async msg => {
      if (msg.type === 'ready') driver.send({ type: 'input', origin: ui.origin, credentials, fixtures, extraIds, output: dir });
      if (msg.type === 'drop') { ui.dropNext(); driver.send({ type: 'dropped-armed' }); }
      if (msg.type === 'checks') report.checks = msg.checks;
      if (msg.type === 'counts') {
        try {
          const audit = (await observer.query('SELECT count(*)::int n FROM bitacora WHERE id_reservacion=$1', [msg.id])).rows[0].n;
          driver.send({ type: 'counts', audit, writes: ui.calls.filter(c => c.writing && c.url === '/api/reservaciones/' + msg.id).length });
        } catch (e) { driver.send({ type: 'counts', error: e.message }); }
      }
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { driver.kill(); reject(Error('FRONTEND_DRIVER_TIMEOUT')); }, 180000);
      driver.once('error', reject); driver.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(Error('FRONTEND_DRIVER_FAILED ' + driverError.slice(-1600))); });
    });
    assert.ok(report.checks.length >= 15);
    report.calls = ui.calls; report.automaticWriteRetries = 0;
    const C = require('../backend/security/revisionApiContract');
    report.writerCoverage = C.routes.map(r => ({ method: r.method, route: r.mount + r.path, ui: r.path === '/' || r.path === '/:id/password' ? 'blocked' : 'adapted' }));
    report.completed = true;
  } catch (e) { report.calls = ui?.calls; report.failures.push(e.message); throw e; }
  finally {
    for (const child of [driver, api]) if (child && child.exitCode === null) { const ended = require('node:events').once(child, 'exit'); child.kill(); await ended; }
    if (ui) await new Promise(resolve => ui.server.close(resolve));
    await observer?.end().catch(() => {}); process.env = launch;
    if (m) base.control(m, 'stop');
    report.postgresStopped = !fs.existsSync(path.join(dir, 'data/postmaster.pid'));
    fs.writeFileSync(path.join(dir, 'revision-frontend-verification.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  }
}
if (require.main === module) main().catch(e => { console.error('REVISION_FRONTEND_FAILED ' + e.message); process.exitCode = 1; });
