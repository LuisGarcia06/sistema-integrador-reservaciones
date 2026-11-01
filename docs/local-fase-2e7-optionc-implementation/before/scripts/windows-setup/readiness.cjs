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
  const result = { verified: false, readOnly: true, scope: P.SCOPE, productionAuthorized: false,
    checks: [{ code: 'WINDOWS11_X64', status: 'passed' }, { code: 'HELPER_AND_PAYLOAD_INTEGRITY', status: 'passed' },
      { code: 'VIRTUALBOX_IDENTITY', status: 'pending' }, { code: 'NATIVE_ACL_AND_IDENTITY', status: 'pending' },
      { code: 'POSTGRES_PREREQUISITES', status: 'pending' }],
    blocker: 'NATIVE_SECURITY_REQUIRED', provisioningAllowed: false };
  const reader=path.join(root,'native/SetupIdentityAcl.exe');
  if(fs.existsSync(reader)){
    try{
      const N=require('./native-readiness.cjs'),native=N.inspect(reader,loc,env);
      result.clientConfiguration=N.configurationStatus(native);
      result.checks[2].status='passed';result.checks[3].status='passed';
      result.nativeReadCompleted=true;result.firstTokenVerified=false;result.containmentVerified=false;
      result.blocker='NATIVE_PROVISIONING_REQUIRED';
      const c=result.clientConfiguration;
      result.summary='Identidad de VM y ACL leídas sin PowerShell. Carpeta del cliente: '+c.directory+'. Descriptor: '+c.descriptor+'. Autoridad: '+c.authority+'. La carpeta corresponde a la etapa 2; los archivos firmados a la etapa 6, después de T0 y bootstrap. No se generó configuración. Pendientes primer token, contención y servicio exclusivo.';
    }catch(error){result.nativeReadCompleted=false;result.blocker='NATIVE_READ_FAILED';result.summary='La lectura nativa de identidad o permisos fue rechazada. No se crearon carpetas ni descriptores. Código: '+(error.nativeCode||'NATIVE_READ_FAILED')+'.';}
  }
  return result;
}
module.exports = { inspect };
