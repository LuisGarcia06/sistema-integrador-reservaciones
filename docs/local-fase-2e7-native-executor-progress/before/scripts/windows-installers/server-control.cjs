'use strict';
// Servicio exclusivo de opción C. Sin selección de bases ni shell propio.
const path = require('node:path');
const base = path.resolve(__dirname, '..');
const root = path.join(base, 'app');
async function run(argv = process.argv.slice(2)) {
  if (!['check', 'run'].includes(argv[0]) || argv.length !== 3) throw Error('CONTROL_ARGUMENTS');
  require('./payload.cjs').verify(base, 'server');
  const Q = require(path.join(root, 'scripts/enterprise026Provision.cjs'));
  process.env = Q.environment();
  const P = require(path.join(root, 'backend/config/enterprise026Policy.js'));
  const plan = P.readPlan(argv[1], argv[2], root);
  const current=Q.control(plan.manifest,'query');
  if (argv[0] === 'check') { console.log('SERVER026_PREFLIGHT_OK'); return; }
  let service, closing, startedHere = false, interrupted = false;
  const close = () => closing ||= (async () => {
    try { await service?.close(); }
    finally {
      // Solo el clúster que este proceso inició, incluso si falla cerrar Express.
      if (startedHere) {
        P.readPlan(argv[1], argv[2], root);
        Q.control(plan.manifest, 'stop');
      }
    }
  })();
  const interrupt = () => {
    interrupted = true;
    if (service) void close().catch(() => {
      console.error('SERVER026_STOP_REVIEW_REQUIRED'); process.exitCode = 1;
    });
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    if (current.serviceState==='stopped') {
      Q.control(plan.manifest, 'start'); startedHere = true;
    }
    service = await require(path.join(root, 'scripts/enterprise026Supervisor.cjs')).start(argv[1], argv[2]);
    if (interrupted) { await close(); return; }
    console.log('SERVER026_RUNNING_CTRL_C_TO_STOP');
    await new Promise(resolve => {
      if (service.child.exitCode !== null) resolve(); else service.child.once('exit', resolve);
    });
  } finally { await close(); }
}
if (require.main === module) run().catch(() => { console.error('SERVER026_CONTROL_REJECTED'); process.exitCode = 1; });
module.exports = { run };
