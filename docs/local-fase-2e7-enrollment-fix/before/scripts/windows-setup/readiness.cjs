'use strict';
// Primera comprobación de solo lectura: no procesos, PowerShell, PostgreSQL o red.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const P = require('./policy.cjs'), I = require('./integrity.cjs'), H = require('./payload.cjs');
function inspect(root) {
  const release = os.release();
  if (process.platform !== 'win32' || process.arch !== 'x64' || !/^10\.0\.\d+$/.test(release) || Number(release.split('.')[2]) < 22000) P.fail('VM_WINDOWS11_REQUIRED');
  const env = P.environment(process.env), helper = I.verify(root);
  if (helper.scope !== P.SCOPE) P.fail('INTEGRITY');
  if (!env.LOCALAPPDATA) P.fail('LOCAL_PATH_REQUIRED');
  const loc = P.locations(fs.realpathSync(env.LOCALAPPDATA));
  const reference = JSON.parse(fs.readFileSync(path.join(__dirname, 'candidate-reference.json')));
  for (const side of ['server', 'client']) {
    const digest = I.sha(fs.readFileSync(path.join(loc[side], 'distribution-inventory.json')));
    if (digest !== reference[side]?.inventorySha256) P.fail('INTEGRITY');
    try { if (H.verify(loc[side], side).release !== P.RELEASE) P.fail('INTEGRITY'); }
    catch { P.fail('INTEGRITY'); }
  }
  return { verified: false, readOnly: true, scope: P.SCOPE, productionAuthorized: false,
    checks: [{ code: 'WINDOWS11_X64', status: 'passed' }, { code: 'HELPER_AND_PAYLOAD_INTEGRITY', status: 'passed' },
      { code: 'VIRTUALBOX_IDENTITY', status: 'pending' }, { code: 'NATIVE_ACL_AND_IDENTITY', status: 'pending' },
      { code: 'POSTGRES_PREREQUISITES', status: 'pending' }],
    blocker: 'NATIVE_SECURITY_REQUIRED', provisioningAllowed: false };
}
module.exports = { inspect };
