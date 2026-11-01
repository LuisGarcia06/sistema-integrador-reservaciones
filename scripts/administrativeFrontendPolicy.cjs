'use strict';
const assets=['lab/administracion.html','lab/administracion.js','lab/revision.css','lab/command.css','css/variables.css','css/base.css','css/layout.css','css/components.css','css/pages.css','js/ui.js','js/api.js','js/auth.js','js/layout.js','js/adminUi.js','js/revisionLab.js','js/auditUi.js','js/commandLab.js','js/revisionConflict.js','js/commandPanel.js','js/adminCommands.js','pages/login.js','pages/usuarios.js','pages/configuracion.js','pages/bitacora.js','assets/img/logo-community-tours.jpg'];
assets.splice(assets.indexOf('assets/img/logo-community-tours.jpg'),1);
assets.push('assets/branding/community-tours-sian-kaan-logo.jpg','lab/administracion.css');
module.exports={assets,allowed:require('../backend/config/administrativeFrontendPolicy').allowHttp,entry:'lab/administracion.html'};
