(function(){
  'use strict';const App=window.App;
  App.consultationLab=Object.freeze({readOnly:true});
  App.revisionLab={guard(url,options){const method=(options.method||'GET').toUpperCase();if(['GET','HEAD'].includes(method)||method==='POST'&&url==='/api/auth/login')return;throw Object.assign(Error('Este laboratorio solo permite consultas y autenticación.'),{kind:'blocked',status:0});}};
  document.addEventListener('DOMContentLoaded',()=>{
    const sidebar=document.getElementById('sidebar');const restrict=()=>sidebar.querySelectorAll('[data-route-id]').forEach(link=>{if(!['dashboard','historial','bitacora'].includes(link.dataset.routeId))link.remove();});
    new MutationObserver(restrict).observe(sidebar,{childList:true,subtree:true});restrict();
  });
})();
