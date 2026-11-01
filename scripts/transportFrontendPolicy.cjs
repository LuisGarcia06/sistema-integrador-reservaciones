// Ámbito explícito de Transportes: únicamente alta y edición protegidas.
const assets=['lab/transportes.html','lab/transportes.js','lab/transportes.css','js/ui.js','js/api.js','js/auth.js','js/layout.js','js/transportesUi.js','js/revisionLab.js','js/commandLab.js','js/revisionConflict.js','js/commandPanel.js','js/transportCommands.js','pages/login.js','pages/operaciones.js','css/variables.css','css/base.css','css/layout.css','css/components.css','css/pages.css','assets/branding/community-tours-sian-kaan-logo.jpg'];
function allowed(method,url){
  if(typeof url!=='string'||url.includes('%')||url.includes('\\')||url.includes('#'))return false;
  if(method==='POST')return ['/api/auth/login','/api/precondiciones','/api/transportes'].includes(url);
  if(method==='PATCH')return /^\/api\/transportes\/[1-9][0-9]*$/.test(url);
  if(method!=='GET')return false;
  return ['/api/auth/sesion','/api/tours','/api/guias','/api/vehiculos','/api/operadores'].includes(url)
    ||/^\/api\/(?:operaciones|transportes)\/[1-9][0-9]*$/.test(url)
    ||/^\/api\/transportes\?id_operacion_tour=[1-9][0-9]*$/.test(url)
    ||/^\/api\/(?:operaciones(?:\/sugeridas)?|daily\/operativo)\?fecha=\d{4}-\d{2}-\d{2}$/.test(url)
    ||url.startsWith('/api/comandos/')&&require('../backend/security/commandIntent').UUID.test(url.slice(14));
}
module.exports={assets,allowed,entry:'lab/transportes.html'};
