(function () {
  'use strict';
  const App=window.App, routes=['operaciones','daily','bitacora'];let rendered='',version=-1;
  function render(target) {
    const authenticated=App.auth.estaAutenticado();
    let route=typeof target==='string'?target:location.hash.slice(2);
    if(!authenticated)route='login';else if(!routes.includes(route))route='operaciones';
    if(authenticated&&version===App.auth.obtenerVersionSesion()&&rendered&&rendered!==route){
      if(!App.operationCommands.canLeave()||!App.transportCommands.canLeave()||!App.dailyCommands.canRead('')){location.replace('#/'+rendered);return;}
    }
    if(location.hash!=='#/'+route)location.replace('#/'+route);
    const root=document.getElementById('page-root'),next=App.auth.obtenerVersionSesion();
    if(rendered===route&&version===next&&root.childElementCount)return;
    if(rendered&&App.pages[rendered])App.pages[rendered].resetSession?.();
    rendered=route;version=next;App.layout.setShellMode(authenticated?'authenticated':'guest');
    document.querySelectorAll('#sidebar a').forEach(link=>{if(!routes.includes(link.dataset.routeId))link.remove();});
    const page=App.pages[route];
    if(authenticated)App.layout.setPageHeader(page);
    if(authenticated&&!App.auth.puedeAccederPagina(route)){root.innerHTML=App.ui.emptyState('Acceso no disponible','Tu rol o alcance no permite consultar esta página.');return;}
    root.innerHTML=page.render();page.afterRender?.();App.layout.updateActiveNavigation(route);
  }
  App.router={navigate:render};window.addEventListener('hashchange',()=>render());window.addEventListener('permisosactualizados',()=>render());document.addEventListener('DOMContentLoaded',()=>render());
})();
