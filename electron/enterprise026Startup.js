'use strict';
// Mensajes públicos cerrados: nunca mostrar argumentos, secretos o stderr.
const MESSAGES = Object.freeze({
  PUBLIC_DESCRIPTOR_REQUIRED: 'Faltan los argumentos de configuración del cliente. Abre el acceso directo preparado para esta instalación.',
  CLIENT_CONFIGURATION_REQUIRED: 'Este cliente aún no tiene descriptor firmado y autoridad externa. La configuración debe completarse antes de conectar con el servidor.',
  CONFIG_MISSING: 'Falta un archivo privado de configuración. No se inició PostgreSQL ni se creó configuración automáticamente.',
  CONFIG_ACL: 'No se pudieron acreditar los permisos privados de la configuración. El inicio permanece bloqueado.',
  CLIENT026_PATH: 'La ruta de configuración no cumple el contrato de instalación.',
  CLIENT026_DESCRIPTOR: 'El descriptor no corresponde a una instalación válida de este cliente.',
  ENROLLMENT_AUTHORITY: 'La autoridad sintética no es válida o ha caducado.',
  ENROLLMENT_REJECTED: 'No se pudo validar la inscripción firmada.',
  RELEASE_INTEGRITY: 'Los archivos del cliente no coinciden con su inventario.',
  CLIENT026_IDENTITY: 'El servidor no presentó la identidad HTTPS esperada.',
  CLIENT026_DESCRIPTOR_CHANGED: 'La configuración cambió durante la conexión.',
  ECONNREFUSED: 'El servidor configurado no está disponible. Este cliente no inicia PostgreSQL automáticamente.',
  UNSAFE_FLAGS: 'El inicio contiene opciones incompatibles con las protecciones del cliente.',
  ENV_CONFLICT: 'Hay variables de entorno incompatibles con esta instalación.',
  CLIENT_RENDERER_GONE: 'La interfaz de Electron se interrumpió. Se necesita revisar el diagnóstico de la VM.',
  CLIENT_PAGE_LOAD_FAILED: 'Electron no pudo cargar la interfaz desde el servidor verificado.',
  START_FAILED: 'El cliente no pudo completar el arranque. Se conserva el bloqueo de seguridad.'
});
function errorInfo(error) {
  const candidate = error?.code || error?.message;
  const code = Object.hasOwn(MESSAGES, candidate) ? candidate : 'START_FAILED';
  const pending = ['PUBLIC_DESCRIPTOR_REQUIRED', 'CLIENT_CONFIGURATION_REQUIRED', 'CONFIG_MISSING'].includes(code);
  return { code, pending, message: MESSAGES[code] };
}
function configuration(argv, env, fs) {
  if (argv.some(a => /^--(?:no-sandbox|ignore-certificate-errors|disable-web-security|remote-debugging|inspect|js-flags)/.test(a))) throw Error('UNSAFE_FLAGS');
  for (const key of Object.keys(env)) if (/^(DB_|PG|APP_|NODE_OPTIONS$|NODE_PATH$|NODE_EXTRA_CA_CERTS$|FAREHARBOR_|GETYOURGUIDE_|GYG_|JWT_|HTTP_PROXY$|HTTPS_PROXY$|ALL_PROXY$)/i.test(key)) throw Error('ENV_CONFLICT');
  const descriptors = argv.filter(a => a.startsWith('--ctsk-descriptor='));
  const trusts = argv.filter(a => a.startsWith('--ctsk-trust='));
  if (descriptors.length !== 1 || trusts.length !== 1) throw Error('PUBLIC_DESCRIPTOR_REQUIRED');
  const filename = descriptors[0].slice('--ctsk-descriptor='.length), trustFile = trusts[0].slice('--ctsk-trust='.length);
  if (!filename || !trustFile) throw Error('PUBLIC_DESCRIPTOR_REQUIRED');
  for (const file of [filename, trustFile]) {
    try { if (!fs.statSync(file).isFile()) throw Error('CLIENT026_PATH'); }
    catch (error) { if (error.code === 'ENOENT') throw Error('CLIENT_CONFIGURATION_REQUIRED'); throw error; }
  }
  // La presencia no acredita ACL, inventario, inscripción ni TLS: readClient sigue obligatorio.
  return { filename, trustFile };
}
async function showFailure(error, { dialog, app, log = console.error }) {
  const info = errorInfo(error);
  log('CLIENT026_REJECTED ' + info.code);
  try {
    await dialog.showMessageBox({ type: info.pending ? 'info' : 'error', title: 'Community Tours — ' + (info.pending ? 'Configuración pendiente' : 'Inicio bloqueado'),
      message: info.message, detail: 'Código: ' + info.code + '\nEnsayo sintético; instalación no aprobada.', buttons: ['Cerrar'], defaultId: 0, cancelId: 0, noLink: true });
  } finally { app.quit(); }
  return info;
}
module.exports = { configuration, errorInfo, showFailure };
