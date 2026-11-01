const {esFechaValida}=require('../backend/validators/daily.validator');
const assets=['lab/daily.html','lab/daily.js','lab/daily.css','js/ui.js','js/api.js','js/auth.js','js/layout.js','js/revisionLab.js','js/commandLab.js','js/revisionConflict.js','js/commandPanel.js','js/dailyCommands.js','pages/login.js','pages/daily.js','css/variables.css','css/base.css','css/layout.css','css/components.css','css/pages.css','assets/branding/community-tours-sian-kaan-logo.jpg','assets/branding/community-tours-sian-kaan-logo.jpeg'];
function dated(url,part){const prefix='/api/daily/'+part+'?fecha=';return url.startsWith(prefix)&&esFechaValida(url.slice(prefix.length));}
function allowed(method,url){if(typeof url!=='string'||/[%\\#]/.test(url))return false;
  if(method==='POST')return ['/api/auth/login','/api/precondiciones'].includes(url);
  if(method==='PUT')return dated(url,'observaciones');
  if(method!=='GET')return false;
  return url==='/api/auth/sesion'||dated(url,'operativo')||dated(url,'observaciones')||url.startsWith('/api/comandos/')&&require('../backend/security/commandIntent').UUID.test(url.slice(14));
}
module.exports={assets,allowed,entry:'lab/daily.html'};
