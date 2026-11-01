'use strict';
function guard({ platform = process.platform, arch = process.arch, release = require('node:os').release(), argv = process.argv, env = process.env } = {}) {
  if (platform !== 'win32' || arch !== 'x64' || typeof release !== 'string' || !/^10\.0\.\d+$/.test(release) || Number(release.split('.')[2]) < 22000) throw Error('PREVIEW_WINDOWS11_REQUIRED');
  if (!argv.includes('--ctsk-synthetic-preview')) throw Error('PREVIEW_EXPLICIT_OPT_IN_REQUIRED');
  if (argv.some(a => /^--(?:no-sandbox|ignore-certificate-errors|disable-web-security|remote-debugging|inspect|js-flags)/.test(a))) throw Error('PREVIEW_UNSAFE_FLAGS');
  for (const key of Object.keys(env)) if (/^(DB_|PG|APP_|JWT_|NODE_OPTIONS$|NODE_PATH$|NODE_EXTRA_CA_CERTS$|ELECTRON_RUN_AS_NODE$|GYG_|FAREHARBOR_|GETYOURGUIDE_|GOOGLE_|WHATSAPP_)/i.test(key)) throw Error('PREVIEW_ENV_CONFLICT');
  return Object.freeze({ scope: 'synthetic-acceptance-only', productionAuthorized: false, database: 'none', backend: 'in-memory-simulator' });
}
module.exports = { guard };
