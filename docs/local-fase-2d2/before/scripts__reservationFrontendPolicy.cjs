// Política cerrada del laboratorio integrado; no se acepta configuración del cliente.
const assets = ['lab/reservaciones.html','lab/reservaciones.css','lab/reservaciones.js',
  'js/ui.js','js/api.js','js/auth.js','js/layout.js','js/revisionLab.js','js/commandLab.js',
  'js/revisionConflict.js','js/commandPanel.js','js/reservationCommands.js',
  'pages/login.js','pages/reservaciones.js','css/variables.css','css/base.css','css/layout.css','css/components.css','css/pages.css',
  'assets/branding/community-tours-sian-kaan-logo.jpg'];
function allowed(method, raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/api/') || raw.includes('\\') || raw.includes('#') || raw.length > 2048) return false;
  if (method === 'POST') return ['/api/auth/login','/api/precondiciones'].includes(raw);
  if (method === 'PATCH') return /^\/api\/reservaciones\/[1-9][0-9]*$/.test(raw);
  if (method !== 'GET') return false;
  if (['/api/auth/sesion','/api/tours','/api/paises','/api/plataformas'].includes(raw)) return true;
  if (/^\/api\/reservaciones\/[1-9][0-9]*$/.test(raw)) return true;
  if (raw.startsWith('/api/comandos/') && require('../backend/security/commandIntent').UUID.test(raw.slice(14))) return true;
  const url = new URL(raw, 'http://127.0.0.1');
  if (url.pathname !== '/api/reservaciones' || url.origin !== 'http://127.0.0.1') return false;
  const names = ['page','limit','fecha','turno','id_tour','estado','id_plataforma','nombre','codigo'];
  for (const [key, value] of url.searchParams) {
    if (!names.includes(key) || url.searchParams.getAll(key).length !== 1 || value.length > 120 || /[\x00-\x1f]/.test(value)) return false;
  }
  return true;
}
module.exports = { assets, allowed, entry: 'lab/reservaciones.html' };
