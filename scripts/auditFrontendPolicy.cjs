'use strict';
const assets=[...new Set([...require('./dailyFrontendPolicy.cjs').assets,...require('./operationFrontendPolicy.cjs').assets,...require('./transportFrontendPolicy.cjs').assets])]
  .filter(file=>!/^lab\/(?:operaciones|transportes|daily)\.(?:html|js)$/.test(file));
assets.push('lab/auditoria.html','lab/auditoria.js','js/auditUi.js','pages/bitacora.js');
module.exports={assets,allowed:require('../backend/config/auditFrontendPolicy').allowHttp,entry:'lab/auditoria.html'};
