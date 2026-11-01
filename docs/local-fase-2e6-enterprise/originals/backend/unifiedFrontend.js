'use strict';
const fs=require('node:fs'),path=require('node:path');
const ASSETS=Object.freeze(['index.html','css/variables.css','css/base.css','css/layout.css','css/components.css','css/pages.css','css/notificaciones.css','css/centroAvisos.css','css/unified.css',
 'js/integrationActivation.js','js/ui.js','js/api.js','js/auth.js','js/notificaciones.js','js/layout.js','js/transportesUi.js','js/centroAvisos.js','js/router.js','js/app.js','js/unifiedActivation.js','js/unifiedAssignments.js',
 'js/adminUi.js','js/revisionLab.js','js/auditUi.js','js/commandLab.js','js/revisionConflict.js','js/commandPanel.js','js/reservationCommands.js','js/operationCommands.js','js/transportCommands.js','js/dailyCommands.js','js/adminCommands.js',
 'pages/login.js','pages/dashboard.js','pages/reservaciones.js','pages/operaciones.js','pages/daily.js','pages/historial.js','pages/bitacora.js','pages/usuarios.js','pages/configuracion.js','pages/integraciones.js',
 'assets/branding/community-tours-sian-kaan-logo.jpg','assets/branding/community-tours-sian-kaan-logo.jpeg']);
function install(app,plan){
 if(plan.manifest.activation!=='electron-original')throw Error('UNIFIED_FRONTEND_GATE_REQUIRED');
 const root=path.join(plan.manifest.root,'frontend'),origin='http://127.0.0.1:'+plan.manifest.httpPort;
 app.use((req,res,next)=>{if(!req.originalUrl.startsWith('/app'))return next();
  if(req.headers.host!=='127.0.0.1:'+plan.manifest.httpPort||req.headers.origin&&req.headers.origin!==origin)return res.status(403).end();
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  const sync024=!!plan.manifest.integration024;
  const file=req.originalUrl==='/app/'||req.originalUrl==='/app/index.html'?'index.html':req.originalUrl.startsWith('/app/')?req.originalUrl.slice(5):'';
  if(!['GET','HEAD'].includes(req.method)||!ASSETS.includes(file)||file==='js/integrationActivation.js'&&!sync024)return res.status(404).end();
  if(file==='index.html'){const html=fs.readFileSync(path.join(root,file),'utf8');if(!html.includes('<html lang="es">'))throw Error('UNIFIED_ORIGINAL_INDEX_CHANGED');const content=html.replace('<html lang="es">','<html lang="es" data-ctsk-profile="unified023-lab"'+(sync024?' data-sync024="synthetic"':'')+(plan.manifest.manualReferences025?' data-refs025="synthetic"':'')+'>');return res.type('html').send(sync024?content.replace('</body>','<script src="./js/integrationActivation.js"></script></body>'):content);}
  return res.sendFile(path.join(root,file));
 });
}
module.exports={install,ASSETS};
