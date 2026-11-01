(function(){
 'use strict';if(!['unified023-lab','enterprise026'].includes(document.documentElement.dataset.ctskProfile))return;
 const App=window.App=window.App||{};
 const scripts=['adminUi','revisionLab','auditUi','commandLab','revisionConflict','commandPanel','reservationCommands','operationCommands','transportCommands','dailyCommands','adminCommands','unifiedAssignments'];
 const load=name=>new Promise((yes,no)=>{const s=document.createElement('script');s.src='./js/'+name+'.js';s.async=false;s.onload=()=>{if(name==='adminUi')App.adminUi.protocol='ctsk-unified023-v1';yes();};s.onerror=()=>no(Error('No se pudo cargar el contrato de operación.'));document.head.append(s);});
 const css=new Promise((yes,no)=>{const link=document.createElement('link');link.rel='stylesheet';link.href='./css/unified.css';link.onload=yes;link.onerror=()=>no(Error('No se pudo cargar el estilo operativo.'));document.head.append(link);});
 App.consultationLab={readOnly:true};
 function canLeave(page){if(!App.adminCommands?.canLeave())return false;if(page==='reservaciones')return App.reservationCommands.canLeave();if(page==='operaciones')return App.operationCommands.canLeave()&&App.transportCommands.canLeave()&&App.unifiedAssignments.canLeave();if(page==='daily')return App.dailyCommands.canLeave();return true;}
 function preparePage(root){for(const id of ['admin-recovery-host','admin-command-host']){const div=document.createElement('div');div.id=id;if(id==='admin-recovery-host')root.prepend(div);else root.append(div);}App.adminCommands?.renderRecovery();}
 App.unified={active:true,protocol:'ctsk-unified023-v1',canLeave,preparePage,ready:(async()=>{await css;for(const name of scripts)await load(name);})()};
})();
